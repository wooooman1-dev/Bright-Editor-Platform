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
});
