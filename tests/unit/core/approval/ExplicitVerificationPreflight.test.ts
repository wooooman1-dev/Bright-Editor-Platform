import { describe, expect, it } from "vitest";
import { createContentOpportunityVerificationPlan } from "../../../../core/content";
import { assessmentsFromExplicitDiscovery, createVerificationSnapshot, emptyVerificationSnapshot, evaluateVerificationClaim, type VerificationClaimSpec, type VerificationSourceAssessment } from "../../../../core/approval";

const claim: VerificationClaimSpec = { claimId: "claim-a", field: "amount", kind: "money", statement: "amount", qualifiers: {}, required: true };
const money = (amount: number) => ({ kind: "money" as const, value: { amount, currency: "KRW", basis: "total" as const } });
const source = (id: string, role: VerificationSourceAssessment["role"], authoritative: boolean, amount = 100): VerificationSourceAssessment => ({ sourceId: id, institutionGroupId: id, role, authoritative, supports: true, normalizedValue: money(amount), freshnessStatus: "fresh", fresh: true, diagnostics: [] });

describe("explicit verification snapshot", () => {
  it("keeps an empty explicit plan distinct and makes no source assessments", () => {
    const plan = createContentOpportunityVerificationPlan([]);
    const snapshot = emptyVerificationSnapshot(plan, () => "2026-01-01T00:00:00.000Z");
    expect(snapshot.verificationMode).toBe("explicit");
    expect(snapshot.overallStatus).toBe("not_required");
    expect(snapshot.claimDefinitionFingerprint).toBe(plan.fingerprint);
    expect(snapshot.sourceSnapshotFingerprint).toBe(emptyVerificationSnapshot(plan, () => "2027-01-01T00:00:00.000Z").sourceSnapshotFingerprint);
  });

  it("counts institutions rather than URLs and verifies three independent sources", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const sameInstitutionPdf = { ...source("a-pdf", "officialCorroborating", true), institutionGroupId: "a" };
    const evidence = [source("a", "primaryOfficial", true), sameInstitutionPdf, source("b", "officialCorroborating", true), source("c", "independentCorroborating", false)];
    const snapshot = createVerificationSnapshot({ plan, assessments: evidence, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: evidence, unresolvedConflict: false, freshnessPassed: true, diagnostics: [] }], now: () => "2026-01-01T00:00:00.000Z" });
    expect(snapshot.results[0]).toMatchObject({ status: "verified", independentInstitutionCount: 3, authoritativeInstitutionCount: 2, primarySourceFound: true });
  });

  it("does not count unsupported assessments and freezes nested data", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const assessments = [source("a", "primaryOfficial", true), { ...source("b", "officialCorroborating", true), supports: false }];
    const snapshot = createVerificationSnapshot({ plan, assessments, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: assessments, unresolvedConflict: false, freshnessPassed: true, diagnostics: [] }] });
    expect(snapshot.results[0].independentInstitutionCount).toBe(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.results)).toBe(true);
    expect(Object.isFrozen(snapshot.results[0].sourceAssessments)).toBe(true);
  });

  it("verifies only at the trusted assessment boundary when all high-risk requirements are fresh", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const assessments = [source("a", "primaryOfficial", true), source("b", "officialCorroborating", true), source("c", "independentCorroborating", false)];
    const snapshot = createVerificationSnapshot({ plan, assessments, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: assessments, unresolvedConflict: false, freshnessPassed: true, diagnostics: [] }] });
    expect(snapshot.results[0]).toMatchObject({ status: "verified", independentInstitutionCount: 3, authoritativeInstitutionCount: 2 });
  });

  it("keeps unknown primary, mixed freshness, and all-unknown evidence insufficient", () => {
    const plan = createContentOpportunityVerificationPlan([claim]);
    const fresh = source("fresh", "officialCorroborating", true);
    const unknown = { ...source("unknown", "primaryOfficial", true), fresh: false, freshnessStatus: "unknown" as const };
    const stale = { ...source("stale", "independentCorroborating", false), fresh: false, freshnessStatus: "stale" as const };
    const mixed = createVerificationSnapshot({ plan, assessments: [fresh, unknown, stale], results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: [fresh, unknown, stale], unresolvedConflict: false, freshnessPassed: true, diagnostics: ["freshness_unknown"] }] });
    expect(mixed.results[0]).toMatchObject({ status: "insufficient", independentInstitutionCount: 1, primarySourceFound: false });
    const unknowns = ["a", "b", "c"].map((id, index) => ({ ...source(id, index === 0 ? "primaryOfficial" : "officialCorroborating", true), fresh: false, freshnessStatus: "unknown" as const }));
    const allUnknown = createVerificationSnapshot({ plan, assessments: unknowns, results: [{ claimId: claim.claimId, normalizedValue: money(100), sourceAssessments: unknowns, unresolvedConflict: false, freshnessPassed: false, diagnostics: ["freshness_unknown"] }] });
    expect(allUnknown.results[0]).toMatchObject({ status: "insufficient", independentInstitutionCount: 0, authoritativeInstitutionCount: 0 });
  });

  it("normalizes every Planning Claim kind conservatively and compares semantic raw values", () => {
    const claims: readonly VerificationClaimSpec[] = [
      { claimId: "money", field: "지원 금액", kind: "money", statement: "지원 금액은 총 50만원이다.", rawValue: "50만원", qualifiers: {}, required: true },
      { claimId: "ratio", field: "금리", kind: "ratio", statement: "적용 금리는 3%이다.", rawValue: "3%", qualifiers: {}, required: true },
      { claimId: "date", field: "신청 시작일", kind: "date", statement: "신청 시작일은 2026년 8월 1일이다.", rawValue: "2026-08-01", qualifiers: {}, required: true },
      { claimId: "date-range", field: "신청 기간", kind: "dateRange", statement: "신청 기간은 2026년 8월이다.", rawValue: "2026-08-01~2026-08-31", qualifiers: {}, required: true },
      { claimId: "duration", field: "처리 기간", kind: "duration", statement: "처리 기간은 최대 3개월이다.", rawValue: "최대 3개월", qualifiers: {}, required: true },
      { claimId: "location", field: "대상 지역", kind: "location", statement: "대상 지역은 서울특별시다.", rawValue: "서울특별시", qualifiers: {}, required: true },
      { claimId: "eligibility", field: "신청 연령", kind: "eligibility", statement: "신청 연령은 만 19세 이상이다.", rawValue: "만 19세 이상", qualifiers: {}, required: true },
      { claimId: "legal", field: "법적 근거", kind: "legal", statement: "예금자보호법 제32조를 확인한다.", rawValue: "예금자보호법 제32조", qualifiers: {}, required: true },
      { claimId: "general", field: "확인 원칙", kind: "general", statement: "가입 전에 공식 기준을 다시 확인한다.", rawValue: "공식 기준 재확인", qualifiers: {}, required: false },
    ];
    const discoveredValues: Readonly<Record<string, string>> = {
      money: "500,000원",
      ratio: "3퍼센트",
      date: "2026년 8월 1일",
      "date-range": "2026년 8월 1일부터 2026년 8월 31일까지",
      duration: "3개월 이하",
      location: "서울특별시",
      eligibility: "만 19세 이상",
      legal: "예금자보호법 제 32 조",
      general: "공식 기준 재확인",
    };
    const discoveredClaims = claims.map((item) => {
      const value = discoveredValues[item.claimId]!;
      const evidenceExcerpt = `${item.field}: ${value}. ${item.statement}`;
      return { claimId: item.claimId, value, evidenceExcerpt };
    });
    const pageText = discoveredClaims.map((item) => item.evidenceExcerpt).join(" ");
    const assessments = assessmentsFromExplicitDiscovery({
      claims,
      sources: [{
        requestedUrl: "https://www.gov.kr/verification-kinds",
        pageText,
        evidenceExcerpt: pageText,
        claims: discoveredClaims,
        role: "primaryOfficial",
        authoritative: true,
        fresh: true,
      }],
    });

    expect(assessments).toHaveLength(claims.length);
    expect(assessments.every((item) => item.supports)).toBe(true);
    expect(assessments.map((item) => item.normalizedValue?.kind)).toEqual([
      "money", "ratio", "date", "dateRange", "duration", "location", "eligibility", "legal", "general",
    ]);
    expect(assessments.find((item) => item.diagnostics.includes("claim:money"))?.normalizedValue).toMatchObject({
      kind: "money",
      value: { amount: 500_000, currency: "KRW", basis: "total" },
    });
    expect(assessments.find((item) => item.diagnostics.includes("claim:date"))?.normalizedValue).toMatchObject({
      kind: "date",
      value: { value: "2026-08-01", precision: "day", role: "applicationStart" },
    });
    expect(assessments.find((item) => item.diagnostics.includes("claim:date-range"))?.normalizedValue).toMatchObject({
      kind: "dateRange",
      value: { start: "2026-08-01", end: "2026-08-31", inclusive: true },
    });
    expect(assessments.find((item) => item.diagnostics.includes("claim:duration"))?.normalizedValue).toMatchObject({
      kind: "duration",
      value: { value: 3, unit: "month", comparator: "upTo" },
    });
    expect(assessments.find((item) => item.diagnostics.includes("claim:legal"))?.normalizedValue).toMatchObject({
      kind: "legal",
      value: { lawName: "예금자보호법", article: "제32조", sourceClass: "statute" },
    });
  });

  it("preserves a numeric-free fee applicability money Claim as a semantic value", () => {
    const feeClaim: VerificationClaimSpec = {
      claimId: "card-installment-fee",
      field: "신용카드 할부 수수료",
      kind: "money",
      statement: "신용카드 할부 거래에는 카드사가 정한 할부 수수료가 적용될 수 있다.",
      rawValue: "수수료 부과 가능성",
      qualifiers: {
        subject: "신용카드 할부 거래",
        scope: "수수료 부과 가능성",
      },
      temporalRequirement: { mode: "current" },
      required: true,
      risk: "critical",
    };
    const excerpt = "신용카드 할부 거래에는 할부 수수료가 적용될 수 있으며, 거래 조건에 따라 달라질 수 있습니다.";
    const [assessment] = assessmentsFromExplicitDiscovery({
      claims: [feeClaim],
      sources: [{
        requestedUrl: "https://law.go.kr/card-installment-fee",
        pageText: excerpt,
        evidenceExcerpt: excerpt,
        claims: [{ claimId: feeClaim.claimId, value: "할부 수수료가 적용될 수 있으며", evidenceExcerpt: excerpt }],
        role: "primaryOfficial",
        authoritative: true,
        observedAt: "2026-08-15T00:00:00.000Z",
      }],
    });

    expect(assessment).toMatchObject({
      supports: true,
      normalizedValue: {
        kind: "money",
        value: {
          semantic: "feeApplicability",
          applicability: "mayApply",
          basis: "total",
        },
      },
    });
    expect(assessment?.diagnostics).not.toContain("claim_normalization_failed");
    expect(assessment?.diagnostics).not.toContain("claim_raw_value_mismatch");
  });

  it("verifies the persisted failure-shaped legal Claims from their separate authoritative excerpts", () => {
    const claims: readonly VerificationClaimSpec[] = [
      {
        claimId: "verification-claim-fixed-date",
        field: "확정일자 법적 적용",
        kind: "legal",
        statement: "확정일자의 법적 효과는 주택임대차 관련 법령이 정한 요건과 사실관계에 따라 판단된다.",
        qualifiers: { subject: "주택 임대차계약의 확정일자", scope: "대한민국 법령 적용 범위", basis: "현행 주택임대차 관련 법령" },
        temporalRequirement: { mode: "current" },
        required: true,
        risk: "critical",
      },
      {
        claimId: "verification-claim-reporting",
        field: "임대차 신고 적용 여부",
        kind: "legal",
        statement: "주택 임대차계약의 신고 의무 적용 여부는 현행 법령이 정한 계약과 지역 등의 요건에 따라 달라진다.",
        qualifiers: { subject: "주택 임대차계약", scope: "대한민국 법령 적용 범위", basis: "현행 주택 임대차 신고 관련 법령" },
        temporalRequirement: { mode: "current" },
        required: true,
        risk: "critical",
      },
    ];
    const fixedDateExcerpt = "제3조의2(보증금의 회수) ② 대항요건과 임대차계약증서상의 확정일자를 갖춘 임차인은 후순위권리자보다 우선하여 보증금을 변제받을 권리가 있다.";
    const reportingExcerpt = "제6조의2(주택 임대차 계약의 신고) ① 임대차계약당사자는 대통령령으로 정하는 금액을 초과하는 임대차 계약을 체결한 경우 신고하여야 한다. ② 주택 임대차 계약의 신고는 대통령령으로 정하는 지역에 적용한다.";
    const assessments = assessmentsFromExplicitDiscovery({
      claims,
      sources: [
        {
          requestedUrl: "https://law.go.kr/fixed-date",
          title: "주택임대차보호법 제3조의2",
          pageText: fixedDateExcerpt,
          evidenceExcerpt: fixedDateExcerpt,
          claims: [{ claimId: claims[0]!.claimId, value: claims[0]!.statement, evidenceExcerpt: fixedDateExcerpt }],
          role: "primaryOfficial",
          authoritative: true,
          observedAt: "2026-08-09T00:00:00.000Z",
        },
        {
          requestedUrl: "https://law.go.kr/reporting",
          title: "부동산 거래신고 등에 관한 법률 제6조의2",
          pageText: reportingExcerpt,
          evidenceExcerpt: reportingExcerpt,
          claims: [{ claimId: claims[1]!.claimId, value: claims[1]!.statement, evidenceExcerpt: reportingExcerpt }],
          role: "primaryOfficial",
          authoritative: true,
          observedAt: "2026-08-09T00:00:00.000Z",
        },
      ],
    });

    expect(assessments).toHaveLength(2);
    for (const spec of claims) {
      const claimAssessments = assessments.filter((assessment) => assessment.diagnostics.includes(`claim:${spec.claimId}`));
      const normalizedValue = claimAssessments[0]?.normalizedValue;
      expect(claimAssessments).toHaveLength(1);
      expect(claimAssessments[0]).toMatchObject({ supports: true, authoritative: true, role: "primaryOfficial", freshnessStatus: "fresh" });
      expect(evaluateVerificationClaim(spec, {
        claimId: spec.claimId,
        normalizedValue,
        sourceAssessments: claimAssessments,
        unresolvedConflict: false,
        freshnessPassed: true,
        diagnostics: [],
      }).status).toBe("verified");
    }
  });
});
