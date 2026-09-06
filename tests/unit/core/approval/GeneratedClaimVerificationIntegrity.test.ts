import { describe, expect, it } from "vitest";

import {
  applyGeneratedFactualClaimInventory,
  assertGeneratedClaimVerificationIntegrity,
  createGeneratedClaimVerificationRecord,
  createVerificationSnapshot,
  evaluateGeneratedClaimVerificationIntegrity,
  evaluateVerificationGenerationGate,
  validateGeneratedFactualClaimDrafts,
  type GeneratedFactualClaim,
  type VerificationClaimSpec,
  type VerificationSourceAssessment,
} from "../../../../core/approval";
import {
  createContentOpportunityVerificationPlan,
  type ContentDocument,
} from "../../../../core/content";
import { editorialRevisionId } from "../../../../core/quality";

const claim: VerificationClaimSpec = Object.freeze({
  claimId: "claim-amount",
  field: "amount",
  kind: "money",
  statement: "현재 지원 금액은 50만원이다.",
  rawValue: "50만원",
  qualifiers: Object.freeze({}),
  temporalRequirement: Object.freeze({ mode: "current" as const }),
  required: true,
});
const plan = createContentOpportunityVerificationPlan([claim]);
const normalizedValue = Object.freeze({
  kind: "money" as const,
  value: Object.freeze({ amount: 500_000, currency: "KRW", basis: "total" as const }),
});

function assessment(
  sourceId: string,
  role: VerificationSourceAssessment["role"],
): VerificationSourceAssessment {
  return Object.freeze({
    sourceId,
    institutionGroupId: `institution-${sourceId}`,
    canonicalUrl: `https://${sourceId}.example/claim`,
    role,
    authoritative: true,
    supports: true,
    normalizedValue,
    freshnessStatus: "fresh" as const,
    fresh: true,
    diagnostics: Object.freeze([`claim:${claim.claimId}`]),
  });
}

const assessments = Object.freeze([
  assessment("primary", "primaryOfficial"),
  assessment("official-a", "officialCorroborating"),
  assessment("official-b", "officialCorroborating"),
]);
const snapshot = createVerificationSnapshot({
  plan,
  assessments,
  results: [{
    claimId: claim.claimId,
    normalizedValue,
    sourceAssessments: assessments,
    unresolvedConflict: false,
    freshnessPassed: true,
    diagnostics: [],
  }],
});

function baseDocument(text: string): ContentDocument {
  return Object.freeze({
    id: "content-1",
    title: "지원 금액 확인 방법",
    blocks: Object.freeze([
      Object.freeze({ id: "p1", type: "paragraph" as const, text }),
    ]),
    metadata: Object.freeze({
      buttonCount: 0,
      createdAt: "2026-08-08T00:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "ai",
      updatedAt: "2026-08-08T00:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 5,
    }),
  });
}

function verifiedDocument(): ContentDocument {
  const document = baseDocument("현재 지원 금액은 50만원입니다.");
  const generatedClaimVerification = createGeneratedClaimVerificationRecord({
    document,
    plan,
    snapshot,
    boundEditorialRevisionId: editorialRevisionId(document),
  });
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata!,
      generatedClaimVerification,
    }),
  });
}

describe("Generated Claim verification publishing integrity", () => {
  it("passes when the current manuscript still matches the verified Claim", () => {
    const document = verifiedDocument();
    const result = evaluateGeneratedClaimVerificationIntegrity({
      document,
      plan,
      currentRevisionId: editorialRevisionId(document),
    });

    expect(result.passed).toBe(true);
    expect(result.unverifiedDetectedCount).toBe(0);
    expect(result.verifiedClaimIds).toContain(claim.claimId);
  });

  // D-045: 값이 바뀐 것은 막지 않고 알린다. 경고 문장이 바뀐 값과 위치를 담는다.
  it("warns without blocking when the current manuscript changes to an unverified high-risk value", () => {
    const current = verifiedDocument();
    const changed = Object.freeze({
      ...current,
      blocks: Object.freeze([
        Object.freeze({ id: "p1", type: "paragraph" as const, text: "현재 지원 금액은 70만원입니다." }),
      ]),
    });
    const result = evaluateGeneratedClaimVerificationIntegrity({
      document: changed,
      plan,
      currentRevisionId: editorialRevisionId(changed),
    });

    expect(result.passed).toBe(true);
    expect(result.unverifiedDetectedCount).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes("70만원"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("block:p1"))).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(() => assertGeneratedClaimVerificationIntegrity({
      document: changed,
      plan,
      currentRevisionId: editorialRevisionId(changed),
    })).not.toThrow();
  });

  /**
   * Regression: one revision used to carry two Claim structures that disagreed.
   * The factual inventory withdrew a Claim and deleted its sentence, while the
   * persisted VerificationSnapshot — computed before the inventory ran — still
   * demanded a verbatim anchor for the same Claim ID, so approval readiness was
   * blocked for a sentence the pipeline itself had removed.
   */
  describe("factual inventory withdrawal inside the same revision", () => {
    const surface = "현재 지원 금액은 50만원입니다.";

    function semanticClaims(document: ContentDocument): readonly GeneratedFactualClaim[] {
      const gate = evaluateVerificationGenerationGate({ plan, snapshot });
      const validation = validateGeneratedFactualClaimDrafts({
        document,
        plan,
        snapshot,
        gate,
        drafts: [{
          claimId: claim.claimId,
          surfaceText: surface,
          kind: claim.kind,
          normalizedValueJson: JSON.stringify(normalizedValue),
          qualifiers: { subject: "", scope: "", basis: "", note: "" },
          temporalRequirementJson: JSON.stringify(claim.temporalRequirement ?? null),
        }],
      });
      expect(validation.passed).toBe(true);
      return validation.claims;
    }

    function recorded(
      document: ContentDocument,
      claims: readonly GeneratedFactualClaim[],
    ): ContentDocument {
      return Object.freeze({
        ...document,
        metadata: Object.freeze({
          ...document.metadata!,
          generatedClaimVerification: createGeneratedClaimVerificationRecord({
            document,
            plan,
            snapshot,
            boundEditorialRevisionId: editorialRevisionId(document),
            semanticClaims: claims,
          }),
        }),
      });
    }

    it("does not block a verified Claim the inventory reported as unsupported", () => {
      const generated = baseDocument(surface);
      const claims = semanticClaims(generated);
      const withdrawn = applyGeneratedFactualClaimInventory({
        document: generated,
        drafts: [{
          claimId: claim.claimId,
          planningClaimId: "",
          origin: "generation",
          risk: "verify",
          surfaceText: surface,
          statement: claim.statement,
          kind: claim.kind,
          normalizedValueJson: JSON.stringify(normalizedValue),
          qualifiers: { subject: "", scope: "", basis: "", note: "" },
          temporalRequirementJson: JSON.stringify(claim.temporalRequirement ?? null),
          evidenceUrl: "https://primary.example/claim",
          evidenceExcerpt: "",
        }],
        decisions: [{
          retained: false,
          evidenceStatus: "unsupported",
          diagnosticCode: "verify_source_not_cited_by_generation",
        }],
        fallbackTitle: generated.title,
      }).document;
      // D-039: the inventory records the decision; the manuscript is untouched,
      // so the Claim anchor it binds against is still where it was.
      expect(withdrawn.blocks).toHaveLength(1);
      expect(JSON.stringify(withdrawn.blocks)).toContain(surface);

      const document = recorded(withdrawn, claims);
      const result = evaluateGeneratedClaimVerificationIntegrity({
        document,
        plan,
        currentRevisionId: editorialRevisionId(document),
      });

      expect(result.reasons).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it("still blocks a verified Claim whose anchor disappeared without a withdrawal", () => {
      const generated = baseDocument(surface);
      const claims = semanticClaims(generated);
      const edited = Object.freeze({
        ...generated,
        blocks: Object.freeze([
          Object.freeze({ id: "p1", type: "paragraph" as const, text: "지원 금액은 신청 시점에 확인하세요." }),
        ]),
      });
      const document = recorded(edited, claims);
      const result = evaluateGeneratedClaimVerificationIntegrity({
        document,
        plan,
        currentRevisionId: editorialRevisionId(document),
      });

      expect(result.passed).toBe(false);
      expect(result.reasons.join(" ")).toContain("verbatim anchor");
    });
  });

  it("blocks an explicit plan when the canonical manuscript has no persisted Snapshot", () => {
    const document = baseDocument("현재 지원 금액은 50만원입니다.");
    const result = evaluateGeneratedClaimVerificationIntegrity({
      document,
      plan,
      currentRevisionId: editorialRevisionId(document),
    });

    expect(result.passed).toBe(false);
    expect(result.reasons).toContain("검증 Claim Snapshot이 현재 canonical 원고에 저장되어 있지 않습니다.");
  });
});
