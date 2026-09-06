import { describe, expect, it } from "vitest";

import {
  createVerificationSnapshot,
  evaluateStoredGeneratedFactualClaims,
  evaluateVerificationGenerationGate,
  validateGeneratedFactualClaimDrafts,
  type GeneratedFactualClaimDraft,
  type GeneratedFactualClaimInventoryItem,
  type VerificationClaimSpec,
  type VerificationNormalizedValue,
  type VerificationSourceAssessment,
} from "../../../../core/approval";
import { createContentOpportunityVerificationPlan } from "../../../../core/content";
import type { ContentDocument } from "../../../../core/content";

const moneyClaim: VerificationClaimSpec = Object.freeze({
  claimId: "claim-money",
  field: "supportAmount",
  kind: "money",
  statement: "현재 지원 금액은 월 50만원이다.",
  rawValue: "월 50만원",
  qualifiers: Object.freeze({ subject: "지원 금액", basis: "monthly" }),
  temporalRequirement: Object.freeze({ mode: "current" as const }),
  required: true,
});

const eligibilityClaim: VerificationClaimSpec = Object.freeze({
  claimId: "claim-eligibility",
  field: "eligibility",
  kind: "eligibility",
  statement: "신청 대상은 서울특별시에 거주하는 만 19세 이상 주민이다.",
  rawValue: "서울특별시에 거주하는 만 19세 이상 주민",
  qualifiers: Object.freeze({ subject: "신청 대상", scope: "서울특별시" }),
  temporalRequirement: Object.freeze({ mode: "current" as const }),
  required: true,
});

const plan = createContentOpportunityVerificationPlan([
  moneyClaim,
  eligibilityClaim,
]);

const moneyValue: VerificationNormalizedValue = Object.freeze({
  kind: "money" as const,
  value: Object.freeze({
    amount: 500_000,
    currency: "KRW",
    basis: "monthly" as const,
  }),
});

const eligibilityValue: VerificationNormalizedValue = Object.freeze({
  kind: "eligibility" as const,
  value: Object.freeze({
    predicate: Object.freeze({
      all: Object.freeze([
        Object.freeze({ field: "age", operator: "gte", value: 19 }),
        Object.freeze({ field: "residence", operator: "eq", value: "서울특별시" }),
      ]),
    }),
  }),
});

function assessments(
  claim: VerificationClaimSpec,
  normalizedValue: VerificationNormalizedValue,
): readonly VerificationSourceAssessment[] {
  return Object.freeze(["primary", "official-a", "official-b"].map((sourceId, index) => Object.freeze({
    sourceId: `${claim.claimId}-${sourceId}`,
    institutionGroupId: `${claim.claimId}-institution-${index}`,
    canonicalUrl: `https://${claim.claimId}-${sourceId}.example/claim`,
    role: index === 0 ? "primaryOfficial" as const : "officialCorroborating" as const,
    authoritative: true,
    supports: true,
    normalizedValue,
    freshnessStatus: "fresh" as const,
    fresh: true,
    diagnostics: Object.freeze([`claim:${claim.claimId}`]),
  })));
}

const moneyAssessments = assessments(moneyClaim, moneyValue);
const eligibilityAssessments = assessments(eligibilityClaim, eligibilityValue);
const snapshot = createVerificationSnapshot({
  plan,
  assessments: Object.freeze([...moneyAssessments, ...eligibilityAssessments]),
  results: [
    {
      claimId: moneyClaim.claimId,
      normalizedValue: moneyValue,
      sourceAssessments: moneyAssessments,
      unresolvedConflict: false,
      freshnessPassed: true,
      diagnostics: [],
    },
    {
      claimId: eligibilityClaim.claimId,
      normalizedValue: eligibilityValue,
      sourceAssessments: eligibilityAssessments,
      unresolvedConflict: false,
      freshnessPassed: true,
      diagnostics: [],
    },
  ],
});
const gate = evaluateVerificationGenerationGate({ plan, snapshot });

const document: ContentDocument = Object.freeze({
  id: "content-1",
  title: "지원 제도 확인 방법",
  blocks: Object.freeze([
    Object.freeze({
      id: "money",
      type: "paragraph" as const,
      text: "현재 지원 금액은 월 50만원입니다.",
    }),
    Object.freeze({
      id: "eligibility",
      type: "paragraph" as const,
      text: "신청 대상은 서울특별시에 거주하는 만 19세 이상 주민입니다.",
    }),
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
    wordCount: 12,
  }),
});

function draft(
  claim: VerificationClaimSpec,
  surfaceText: string,
  normalizedValue: VerificationNormalizedValue,
): GeneratedFactualClaimDraft {
  return Object.freeze({
    claimId: claim.claimId,
    surfaceText,
    kind: claim.kind,
    normalizedValueJson: JSON.stringify(normalizedValue),
    qualifiers: Object.freeze({
      subject: claim.qualifiers.subject ?? "",
      scope: claim.qualifiers.scope ?? "",
      basis: claim.qualifiers.basis ?? "",
      note: claim.qualifiers.note ?? "",
    }),
    temporalRequirementJson: JSON.stringify(claim.temporalRequirement ?? null),
  });
}

const validDrafts = Object.freeze([
  draft(moneyClaim, "현재 지원 금액은 월 50만원입니다.", moneyValue),
  draft(
    eligibilityClaim,
    "신청 대상은 서울특별시에 거주하는 만 19세 이상 주민입니다.",
    eligibilityValue,
  ),
]);

describe("Generated factual Claim semantic contract", () => {
  it("accepts manuscript anchors whose Claim IDs and canonical semantics match the verified Snapshot", () => {
    expect(gate.ready).toBe(true);

    const result = validateGeneratedFactualClaimDrafts({
      document,
      plan,
      snapshot,
      gate,
      drafts: validDrafts,
    });

    expect(result.passed).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.claims.map((claim) => claim.claimId)).toEqual([
      moneyClaim.claimId,
      eligibilityClaim.claimId,
    ]);
    expect(result.claims[0]?.normalizedValue).toEqual(moneyValue);
    expect(result.claims[1]?.normalizedValue).toEqual(eligibilityValue);
  });

  it("rejects a proposition-changing money basis even when the visible amount is unchanged", () => {
    const annualValue: VerificationNormalizedValue = Object.freeze({
      kind: "money" as const,
      value: Object.freeze({
        amount: 500_000,
        currency: "KRW",
        basis: "annual" as const,
      }),
    });
    const result = validateGeneratedFactualClaimDrafts({
      document,
      plan,
      snapshot,
      gate,
      drafts: Object.freeze([
        draft(moneyClaim, "현재 지원 금액은 월 50만원입니다.", annualValue),
        validDrafts[1]!,
      ]),
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain("normalized value");
    expect(result.reasons.join(" ")).toContain(moneyClaim.claimId);
  });

  it("warns without blocking when one verified non-scalar Claim is omitted from the Generation semantic list", () => {
    // D-045: 이 재계산은 "현재 본문에서 찾은 검증 토큰이 구조화 목록에
    // 포함되는가"를 본다. evaluateStoredGeneratedFactualClaims 로 재평가할 때는
    // 검토 편집이 anchor 위치·표현을 살짝 바꿨을 뿐인 경우와 구별할 수 없어
    // (2026-09-04 실측: 청약저축 소득공제 원고), 차단 사유가 아니라 경고로
    // 남긴다. Generation이 실제로 값을 빠뜨렸는지는 값 자체가 verified Snapshot과
    // 일치하는지를 보는 위쪽 per-draft 검사가 계속 차단한다.
    const result = validateGeneratedFactualClaimDrafts({
      document,
      plan,
      snapshot,
      gate,
      drafts: Object.freeze([validDrafts[0]!]),
    });

    expect(result.passed).toBe(true);
    expect(result.warnings.join(" ")).toContain(eligibilityClaim.claimId);
  });

  it("rechecks persisted semantic anchors against the current manuscript revision", () => {
    const initial = validateGeneratedFactualClaimDrafts({
      document,
      plan,
      snapshot,
      gate,
      drafts: validDrafts,
    });
    expect(initial.passed).toBe(true);

    const edited: ContentDocument = Object.freeze({
      ...document,
      blocks: Object.freeze(document.blocks.map((block) =>
        block.id === "eligibility" && block.type === "paragraph"
          ? Object.freeze({ ...block, text: "신청 대상은 부산광역시에 거주하는 만 19세 이상 주민입니다." })
          : block)),
    });
    const result = evaluateStoredGeneratedFactualClaims({
      document: edited,
      plan,
      snapshot,
      gate,
      claims: initial.claims,
    });

    expect(result.passed).toBe(false);
    expect(result.reasons.join(" ")).toContain(eligibilityClaim.claimId);
    expect(result.reasons.join(" ")).toContain("verbatim anchor");
  });

  describe("factual inventory withdrawal", () => {
    const eligibilitySurface = "신청 대상은 서울특별시에 거주하는 만 19세 이상 주민입니다.";

    function withInventory(
      base: ContentDocument,
      items: readonly GeneratedFactualClaimInventoryItem[],
    ): ContentDocument {
      return Object.freeze({
        ...base,
        metadata: Object.freeze({
          ...base.metadata!,
          generatedFactualClaimInventory: Object.freeze({
            schemaVersion: 1 as const,
            items: Object.freeze(items),
            retainedClaimIds: Object.freeze(items
              .filter((item) => item.disposition === "retained")
              .map((item) => item.claimId)),
            removedClaimCount: items.filter((item) => item.disposition === "removed").length,
          }),
        }),
      });
    }

    function removedItem(
      claimId: string,
      surfaceText: string,
    ): GeneratedFactualClaimInventoryItem {
      return Object.freeze({
        claimId,
        origin: "generation" as const,
        risk: "verify" as const,
        surfaceText,
        statement: surfaceText,
        kind: "eligibility" as const,
        normalizedValueJson: "{}",
        qualifiers: Object.freeze({}),
        locations: Object.freeze([]),
        disposition: "removed" as const,
        evidenceStatus: "unsupported" as const,
        diagnosticCode: "verify_source_not_cited_by_generation",
      });
    }

    const stored = validateGeneratedFactualClaimDrafts({
      document,
      plan,
      snapshot,
      gate,
      drafts: validDrafts,
    }).claims;

    const withoutEligibility: ContentDocument = Object.freeze({
      ...document,
      blocks: Object.freeze(document.blocks.filter((block) => block.id !== "eligibility")),
    });

    it("does not block on a Claim the factual inventory withdrew from the manuscript", () => {
      const result = evaluateStoredGeneratedFactualClaims({
        document: withInventory(withoutEligibility, [
          removedItem(eligibilityClaim.claimId, eligibilitySurface),
        ]),
        plan,
        snapshot,
        gate,
        claims: stored,
      });

      expect(result.passed).toBe(true);
      expect(result.reasons).toEqual([]);
      expect(result.claims.map((claim) => claim.claimId)).toEqual([moneyClaim.claimId]);
    });

    it("still blocks a verified Claim whose anchor was edited away without any inventory withdrawal", () => {
      const edited: ContentDocument = Object.freeze({
        ...document,
        blocks: Object.freeze(document.blocks.map((block) =>
          block.id === "eligibility" && block.type === "paragraph"
            ? Object.freeze({ ...block, text: "신청 대상은 부산광역시에 거주하는 만 19세 이상 주민입니다." })
            : block)),
      });
      const result = evaluateStoredGeneratedFactualClaims({
        document: withInventory(edited, [
          Object.freeze({
            ...removedItem(moneyClaim.claimId, "현재 지원 금액은 월 50만원입니다."),
            kind: "money" as const,
            risk: "critical" as const,
            disposition: "retained" as const,
            evidenceStatus: "critical_verified" as const,
          }),
        ]),
        plan,
        snapshot,
        gate,
        claims: stored,
      });

      expect(result.passed).toBe(false);
      expect(result.reasons.join(" ")).toContain(eligibilityClaim.claimId);
      expect(result.reasons.join(" ")).toContain("verbatim anchor");
    });

    it("grants no withdrawal exemption while the recorded surface is still published", () => {
      const edited: ContentDocument = Object.freeze({
        ...document,
        blocks: Object.freeze(document.blocks.map((block) =>
          block.id === "eligibility" && block.type === "paragraph"
            ? Object.freeze({ ...block, text: "신청 대상은 부산광역시에 거주하는 만 19세 이상 주민입니다." })
            : block)),
      });
      const result = evaluateStoredGeneratedFactualClaims({
        document: withInventory(edited, [
          removedItem(eligibilityClaim.claimId, "현재 지원 금액은 월 50만원입니다."),
        ]),
        plan,
        snapshot,
        gate,
        claims: stored,
      });

      expect(result.passed).toBe(false);
      expect(result.reasons.join(" ")).toContain(eligibilityClaim.claimId);
    });
  });
});
