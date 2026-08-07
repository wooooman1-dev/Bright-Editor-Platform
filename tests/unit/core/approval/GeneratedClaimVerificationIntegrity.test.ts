import { describe, expect, it } from "vitest";

import {
  assertGeneratedClaimVerificationIntegrity,
  createGeneratedClaimVerificationRecord,
  createVerificationSnapshot,
  evaluateGeneratedClaimVerificationIntegrity,
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

  it("blocks when the current manuscript changes to an unverified high-risk value", () => {
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

    expect(result.passed).toBe(false);
    expect(result.unverifiedDetectedCount).toBeGreaterThan(0);
    expect(result.reasons.some((reason) => reason.includes("70만원"))).toBe(true);
    expect(() => assertGeneratedClaimVerificationIntegrity({
      document: changed,
      plan,
      currentRevisionId: editorialRevisionId(changed),
    })).toThrow("Publishing blocked: generated Claim verification failed");
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
