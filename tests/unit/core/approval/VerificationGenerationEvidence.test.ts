import { describe, expect, it } from "vitest";
import {
  createVerificationGenerationClaimSources,
  groupVerificationGenerationClaimEvidence,
} from "../../../../core/approval/VerificationGenerationEvidence";
import type {
  VerificationClaimResult,
  VerificationClaimSpec,
  VerificationSnapshot,
  VerificationSourceAssessment,
} from "../../../../core/approval/VerificationClaim";

const url = "https://www.gov.kr/verification-generation-evidence";

const monthly: VerificationClaimSpec = Object.freeze({
  claimId: "support-monthly",
  field: "지원 금액",
  kind: "money",
  statement: "월 지원 금액은 50만원이다.",
  rawValue: "월 50만원",
  qualifiers: Object.freeze({ basis: "monthly" }),
  temporalRequirement: Object.freeze({ mode: "current" as const }),
  required: true,
});

const annual: VerificationClaimSpec = Object.freeze({
  claimId: "support-annual",
  field: "지원 금액",
  kind: "money",
  statement: "연 지원 한도는 600만원이다.",
  rawValue: "연 600만원",
  qualifiers: Object.freeze({ basis: "annual" }),
  temporalRequirement: Object.freeze({ mode: "current" as const }),
  required: true,
});

function assessment(
  claimId: string,
  amount: number,
  basis: "monthly" | "annual",
): VerificationSourceAssessment {
  return Object.freeze({
    sourceId: "gov-primary",
    institutionGroupId: "gov",
    canonicalUrl: url,
    role: "primaryOfficial",
    authoritative: true,
    supports: true,
    normalizedValue: Object.freeze({
      kind: "money" as const,
      value: Object.freeze({ amount, currency: "KRW", basis }),
    }),
    freshnessStatus: "fresh",
    fresh: true,
    diagnostics: Object.freeze([`claim:${claimId}`]),
  });
}

function result(
  claimId: string,
  amount: number,
  basis: "monthly" | "annual",
): VerificationClaimResult {
  const source = assessment(claimId, amount, basis);
  return Object.freeze({
    claimId,
    status: "verified",
    normalizedValue: source.normalizedValue,
    sourceAssessments: Object.freeze([source]),
    independentInstitutionCount: 1,
    authoritativeInstitutionCount: 1,
    primarySourceFound: true,
    unresolvedConflict: false,
    freshnessPassed: true,
    diagnostics: Object.freeze([]),
  });
}

const snapshot: VerificationSnapshot = Object.freeze({
  verificationMode: "explicit",
  claimDefinitionFingerprint: "fixture-plan",
  sourceSnapshotFingerprint: "fixture-source",
  results: Object.freeze([
    result(monthly.claimId, 500_000, "monthly"),
    result(annual.claimId, 6_000_000, "annual"),
  ]),
  overallStatus: "verified",
  createdAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  verificationSnapshotFingerprint: "fixture-snapshot",
});

describe("Verification Generation evidence", () => {
  it("keeps same-field Claims separate by claimId and canonical semantics", () => {
    const sourceGroups = createVerificationGenerationClaimSources({
      claims: [monthly, annual],
      snapshot,
      sources: [{
        requestedUrl: url,
        finalUrl: url,
        evidenceExcerpt: "지원 금액 안내",
        pageText: "월 지원 금액은 50만원이며 연 지원 한도는 600만원입니다.",
        role: "primaryOfficial",
        authoritative: true,
        claims: Object.freeze([
          Object.freeze({
            claimId: monthly.claimId,
            value: "월 50만원",
            evidenceExcerpt: "월 지원 금액은 50만원입니다.",
          }),
          Object.freeze({
            claimId: annual.claimId,
            value: "연 600만원",
            evidenceExcerpt: "연 지원 한도는 600만원입니다.",
          }),
        ]),
      }],
    });

    expect(sourceGroups).toHaveLength(1);
    expect(sourceGroups[0]?.claims.map((claim) => claim.claimId)).toEqual([
      "support-monthly",
      "support-annual",
    ]);

    const grouped = groupVerificationGenerationClaimEvidence(
      sourceGroups.flatMap((source) => source.claims),
    );
    expect(grouped).toHaveLength(2);
    expect(grouped.find((claim) => claim.claimId === monthly.claimId)?.normalizedValue)
      .toMatchObject({ kind: "money", value: { amount: 500_000, basis: "monthly" } });
    expect(grouped.find((claim) => claim.claimId === annual.claimId)?.normalizedValue)
      .toMatchObject({ kind: "money", value: { amount: 6_000_000, basis: "annual" } });
  });
  /**
   * 판정은 생성에 넘길 값을 거르지 않는다. 2026-08-26 실측: 선택약정 요금
   * 할인율 Claim 은 status insufficient 로 값이 생성에 도달하지 못했고,
   * 원고는 할인율 숫자 없이 발행 가능 상태가 됐다. 페이지를 실제로 열어
   * 뽑아낸 값이면 판정과 무관하게 넘긴다.
   */
  it("hands an insufficient Claim's value to Generation when the page actually carried it", () => {
    const insufficientSnapshot: VerificationSnapshot = Object.freeze({
      ...snapshot,
      results: Object.freeze([Object.freeze({
        ...result(monthly.claimId, 500_000, "monthly"),
        status: "insufficient" as const,
        normalizedValue: undefined,
        freshnessPassed: false,
        diagnostics: Object.freeze(["freshness_unknown"]),
        sourceAssessments: Object.freeze([Object.freeze({
          ...assessment(monthly.claimId, 500_000, "monthly"),
          supports: false,
          fresh: false,
          freshnessStatus: "unknown" as const,
          diagnostics: Object.freeze([`claim:${monthly.claimId}`, "freshness_unknown"]),
        })]),
      })]),
      overallStatus: "insufficient" as const,
    });

    const sourceGroups = createVerificationGenerationClaimSources({
      claims: [monthly],
      snapshot: insufficientSnapshot,
      sources: [{
        requestedUrl: url,
        finalUrl: url,
        evidenceExcerpt: "지원 금액 안내",
        pageText: "월 지원 금액은 50만원입니다.",
        role: "primaryOfficial",
        authoritative: true,
        claims: Object.freeze([Object.freeze({
          claimId: monthly.claimId,
          value: "월 50만원",
          evidenceExcerpt: "월 지원 금액은 50만원입니다.",
        })]),
      }],
    });

    expect(sourceGroups[0]?.claims[0]?.normalizedValue)
      .toMatchObject({ kind: "money", value: { amount: 500_000 } });
  });

  /**
   * 걷지 않은 관문: 인용한 발췌가 그 페이지에 없었으면 값도 넘기지 않는다.
   * 지어낸 인용을 막는 장치이지 내용 대조가 아니다.
   */
  it("still withholds a value whose excerpt was never found on the page", () => {
    const anchorFailed: VerificationSnapshot = Object.freeze({
      ...snapshot,
      results: Object.freeze([Object.freeze({
        ...result(monthly.claimId, 500_000, "monthly"),
        status: "insufficient" as const,
        sourceAssessments: Object.freeze([Object.freeze({
          ...assessment(monthly.claimId, 500_000, "monthly"),
          supports: false,
          diagnostics: Object.freeze([`claim:${monthly.claimId}`, "evidence_anchor_unverified"]),
        })]),
      })]),
      overallStatus: "insufficient" as const,
    });

    const sourceGroups = createVerificationGenerationClaimSources({
      claims: [monthly],
      snapshot: anchorFailed,
      sources: [{
        requestedUrl: url,
        finalUrl: url,
        evidenceExcerpt: "지원 금액 안내",
        pageText: "이 페이지에는 금액이 없습니다.",
        role: "primaryOfficial",
        authoritative: true,
        claims: Object.freeze([Object.freeze({
          claimId: monthly.claimId,
          value: "월 50만원",
          evidenceExcerpt: "월 지원 금액은 50만원입니다.",
        })]),
      }],
    });

    expect(sourceGroups).toHaveLength(0);
  });
});
