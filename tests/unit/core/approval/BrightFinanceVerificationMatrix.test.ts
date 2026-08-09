import { describe, expect, it } from "vitest";

import {
  assessmentsFromExplicitDiscovery,
  createVerificationSnapshot,
  evaluateVerificationGenerationGate,
  type ExplicitDiscoveredClaim,
  type VerificationClaimSpec,
} from "../../../../core/approval";
import { createContentOpportunityVerificationPlan } from "../../../../core/content";

const OBSERVED_AT = "2026-08-08T00:00:00.000Z";
const ACTIVE_PERIOD = "적용 기간은 2026-01-01부터 2026-12-31까지입니다.";

const institutions = Object.freeze([
  Object.freeze({
    requestedUrl: "https://www.gov.kr/bright-finance-fixture",
    role: "primaryOfficial" as const,
    authoritative: true,
  }),
  Object.freeze({
    requestedUrl: "https://law.go.kr/bright-finance-fixture",
    role: "officialCorroborating" as const,
    authoritative: true,
  }),
  Object.freeze({
    requestedUrl: "https://www.nts.go.kr/bright-finance-fixture",
    role: "independentCorroborating" as const,
    authoritative: false,
  }),
]);

type FinanceScenario = Readonly<{
  name: string;
  claims: readonly VerificationClaimSpec[];
  values: Readonly<Record<string, string>>;
  excerpts: Readonly<Record<string, string>>;
}>;

const scenarios: readonly FinanceScenario[] = Object.freeze([
  Object.freeze({
    name: "지원금 — 금액·자격·신청기간·대상지역",
    claims: Object.freeze([
      currentClaim("support-money", "지원 금액", "money", "지원 금액은 월 50만원이다.", "월 50만원"),
      currentClaim("support-eligibility", "신청 연령", "eligibility", "신청 연령은 만 19세 이상이다.", "만 19세 이상"),
      periodClaim("support-period", "신청 기간", "dateRange", "신청 기간은 2026년 8월이다.", "2026-08-01~2026-08-31", "2026-08-01", "2026-08-31"),
      currentClaim("support-location", "대상 지역", "location", "대상 지역은 서울특별시다.", "서울특별시"),
    ]),
    values: Object.freeze({
      "support-money": "500,000원",
      "support-eligibility": "만 19세 이상",
      "support-period": "2026년 8월 1일부터 2026년 8월 31일까지",
      "support-location": "서울특별시",
    }),
    excerpts: Object.freeze({
      "support-money": `월 지원 금액 500,000원의 ${ACTIVE_PERIOD}`,
      "support-eligibility": `신청 연령 만 19세 이상의 ${ACTIVE_PERIOD}`,
      "support-period": "신청 기준 기간은 2026년 8월 1일부터 2026년 8월 31일까지입니다.",
      "support-location": `대상 지역 서울특별시의 ${ACTIVE_PERIOD}`,
    }),
  }),
  Object.freeze({
    name: "예금·적금 — 금리·예치기간·확인원칙",
    claims: Object.freeze([
      currentClaim("savings-rate", "적용 금리", "ratio", "적용 금리는 연 3%다.", "3%"),
      currentClaim("savings-duration", "예치 기간", "duration", "예치 기간은 최대 12개월이다.", "최대 12개월"),
      Object.freeze({
        claimId: "savings-general",
        field: "확인 원칙",
        kind: "general" as const,
        statement: "가입 전 공식 상품 조건을 다시 확인한다.",
        rawValue: "공식 상품 조건 재확인",
        qualifiers: Object.freeze({}),
        temporalRequirement: Object.freeze({ mode: "notRequired" as const }),
        required: false,
      }),
    ]),
    values: Object.freeze({
      "savings-rate": "3퍼센트",
      "savings-duration": "12개월 이하",
      "savings-general": "공식 상품 조건 재확인",
    }),
    excerpts: Object.freeze({
      "savings-rate": `적용 금리 3퍼센트의 ${ACTIVE_PERIOD}`,
      "savings-duration": `예치 기간 12개월 이하의 ${ACTIVE_PERIOD}`,
      "savings-general": "공식 상품 조건 재확인 안내입니다.",
    }),
  }),
  Object.freeze({
    name: "세금·공제 — 비율·기준일·법적근거",
    claims: Object.freeze([
      currentClaim("tax-ratio", "공제율", "ratio", "공제율은 15%다.", "15%"),
      asOfClaim("tax-date", "기준일", "date", "기준일은 2026년 8월 8일이다.", "2026-08-08", "2026-08-08"),
      currentClaim("tax-legal", "법적 근거", "legal", "검증용세법 제10조를 확인한다.", "검증용세법 제10조"),
    ]),
    values: Object.freeze({
      "tax-ratio": "15퍼센트",
      "tax-date": "2026년 8월 8일",
      "tax-legal": "검증용세법 제 10 조",
    }),
    excerpts: Object.freeze({
      "tax-ratio": `공제율 15퍼센트의 ${ACTIVE_PERIOD}`,
      "tax-date": "2026-08-08 기준 기준일은 2026년 8월 8일입니다.",
      "tax-legal": `검증용세법 제 10 조의 ${ACTIVE_PERIOD}`,
    }),
  }),
  Object.freeze({
    name: "대출 — 한도·비율·기간",
    claims: Object.freeze([
      currentClaim("loan-money", "대출 한도", "money", "대출 한도는 최대 1억원이다.", "최대 1억원"),
      currentClaim("loan-ratio", "한도 비율", "ratio", "한도 비율은 최대 70%다.", "최대 70%"),
      currentClaim("loan-duration", "상환 기간", "duration", "상환 기간은 최대 10년이다.", "최대 10년"),
    ]),
    values: Object.freeze({
      "loan-money": "1억원 이하",
      "loan-ratio": "70퍼센트 이하",
      "loan-duration": "10년 이하",
    }),
    excerpts: Object.freeze({
      "loan-money": `대출 한도 1억원 이하의 ${ACTIVE_PERIOD}`,
      "loan-ratio": `한도 비율 70퍼센트 이하의 ${ACTIVE_PERIOD}`,
      "loan-duration": `상환 기간 10년 이하의 ${ACTIVE_PERIOD}`,
    }),
  }),
]);

describe("Bright Finance explicit verification matrix", () => {
  for (const scenario of scenarios) {
    it(`verifies the complete source/snapshot/generation-gate shape for ${scenario.name}`, () => {
      const plan = createContentOpportunityVerificationPlan(scenario.claims);
      const sources = institutions.map((institution) => {
        const claims = scenario.claims.map((claim): ExplicitDiscoveredClaim => Object.freeze({
          claimId: claim.claimId,
          value: scenario.values[claim.claimId]!,
          evidenceExcerpt: scenario.excerpts[claim.claimId]!,
        }));
        return Object.freeze({
          ...institution,
          pageText: claims.map((claim) => claim.evidenceExcerpt).join(" "),
          evidenceExcerpt: claims.map((claim) => claim.evidenceExcerpt).join(" "),
          observedAt: OBSERVED_AT,
          claims: Object.freeze(claims),
        });
      });

      const assessments = assessmentsFromExplicitDiscovery({
        claims: scenario.claims,
        sources,
        now: () => OBSERVED_AT,
      });

      expect(assessments).toHaveLength(scenario.claims.length * institutions.length);
      expect(assessments.every((assessment) => assessment.supports)).toBe(true);
      expect(assessments.every((assessment) => assessment.normalizedValue)).toBe(true);

      const results = scenario.claims.map((claim) => {
        const claimAssessments = assessments.filter((assessment) =>
          assessment.diagnostics.includes(`claim:${claim.claimId}`));
        const normalizedValue = claimAssessments.find((assessment) => assessment.normalizedValue)?.normalizedValue;
        expect(normalizedValue).toBeDefined();
        return Object.freeze({
          claimId: claim.claimId,
          normalizedValue: normalizedValue!,
          sourceAssessments: Object.freeze(claimAssessments),
          unresolvedConflict: false,
          freshnessPassed: claimAssessments.every((assessment) => assessment.fresh),
          diagnostics: Object.freeze([]),
        });
      });

      const snapshot = createVerificationSnapshot({
        plan,
        assessments,
        results,
        now: () => OBSERVED_AT,
      });
      const gate = evaluateVerificationGenerationGate({ plan, snapshot });

      expect(snapshot.overallStatus).toBe("verified");
      expect(gate.ready).toBe(true);
      expect(gate.blockingClaimIds).toEqual([]);
      expect(new Set(gate.verifiedClaimIds)).toEqual(
        new Set(scenario.claims.filter((claim) => claim.required).map((claim) => claim.claimId)),
      );
      for (const claim of scenario.claims.filter((item) => item.required)) {
        const result = snapshot.results.find((item) => item.claimId === claim.claimId);
        expect(result?.status).toBe("verified");
        if (isHighRiskKind(claim.kind)) {
          expect(result).toMatchObject({
            independentInstitutionCount: 3,
            authoritativeInstitutionCount: 2,
            primarySourceFound: true,
          });
        }
      }
    });
  }

  it("fails closed when one required finance Claim changes to an unsupported source value", () => {
    const scenario = scenarios[0]!;
    const sources = institutions.map((institution, sourceIndex) => {
      const claims = scenario.claims.map((claim): ExplicitDiscoveredClaim => {
        const changed = sourceIndex === 0 && claim.claimId === "support-money";
        const value = changed ? "700,000원" : scenario.values[claim.claimId]!;
        const evidenceExcerpt = changed
          ? `월 지원 금액 700,000원의 ${ACTIVE_PERIOD}`
          : scenario.excerpts[claim.claimId]!;
        return Object.freeze({ claimId: claim.claimId, value, evidenceExcerpt });
      });
      return Object.freeze({
        ...institution,
        pageText: claims.map((claim) => claim.evidenceExcerpt).join(" "),
        evidenceExcerpt: claims.map((claim) => claim.evidenceExcerpt).join(" "),
        observedAt: OBSERVED_AT,
        claims: Object.freeze(claims),
      });
    });

    const assessments = assessmentsFromExplicitDiscovery({
      claims: scenario.claims,
      sources,
      now: () => OBSERVED_AT,
    });
    const changedPrimary = assessments.find((assessment) =>
      assessment.role === "primaryOfficial"
      && assessment.diagnostics.includes("claim:support-money"));

    expect(changedPrimary?.supports).toBe(false);
    expect(changedPrimary?.diagnostics).toContain("claim_raw_value_mismatch");
  });

  it("does not equate a monthly planned amount with an explicitly annual source amount", () => {
    const monthly = currentClaim(
      "monthly-support",
      "지원 금액",
      "money",
      "지원 금액은 월 50만원이다.",
      "월 50만원",
    );
    const evidenceExcerpt = `연 지원 금액 500,000원의 ${ACTIVE_PERIOD}`;
    const [assessment] = assessmentsFromExplicitDiscovery({
      claims: [monthly],
      sources: [{
        requestedUrl: "https://www.gov.kr/money-basis-fixture",
        role: "primaryOfficial",
        authoritative: true,
        pageText: evidenceExcerpt,
        evidenceExcerpt,
        observedAt: OBSERVED_AT,
        claims: [{ claimId: monthly.claimId, value: "연 500,000원", evidenceExcerpt }],
      }],
      now: () => OBSERVED_AT,
    });

    expect(assessment?.supports).toBe(false);
    expect(assessment?.diagnostics).toContain("claim_raw_value_mismatch");
  });
});

function currentClaim(
  claimId: string,
  field: string,
  kind: VerificationClaimSpec["kind"],
  statement: string,
  rawValue: string,
): VerificationClaimSpec {
  return Object.freeze({
    claimId,
    field,
    kind,
    statement,
    rawValue,
    qualifiers: Object.freeze({}),
    temporalRequirement: Object.freeze({ mode: "current" as const }),
    required: true,
  });
}

function asOfClaim(
  claimId: string,
  field: string,
  kind: VerificationClaimSpec["kind"],
  statement: string,
  rawValue: string,
  date: string,
): VerificationClaimSpec {
  return Object.freeze({
    claimId,
    field,
    kind,
    statement,
    rawValue,
    qualifiers: Object.freeze({}),
    temporalRequirement: Object.freeze({ mode: "asOf" as const, date }),
    required: true,
  });
}

function periodClaim(
  claimId: string,
  field: string,
  kind: VerificationClaimSpec["kind"],
  statement: string,
  rawValue: string,
  start: string,
  end: string,
): VerificationClaimSpec {
  return Object.freeze({
    claimId,
    field,
    kind,
    statement,
    rawValue,
    qualifiers: Object.freeze({}),
    temporalRequirement: Object.freeze({ mode: "period" as const, start, end }),
    required: true,
  });
}

function isHighRiskKind(kind: VerificationClaimSpec["kind"]): boolean {
  return ["money", "ratio", "date", "dateRange", "location", "eligibility", "legal"].includes(kind);
}
