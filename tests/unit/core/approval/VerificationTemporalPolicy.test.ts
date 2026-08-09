import { describe, expect, it } from "vitest";
import {
  deriveVerificationTemporalEvidence,
  evaluateVerificationTemporalEvidence,
} from "../../../../core/approval/VerificationTemporalPolicy";

describe("VerificationTemporalPolicy", () => {
  it("verifies a current Claim only when the Claim excerpt owns an active effective period", () => {
    const excerpt = "지원 금액 50만원의 적용 기간은 2026-01-01부터 2026-12-31까지입니다.";
    const result = evaluateVerificationTemporalEvidence({
      claimKind: "money",
      requirement: { mode: "current" },
      claimEvidenceExcerpt: excerpt,
      pageText: `공식 안내 ${excerpt}`,
      claimValue: "50만원",
      observedAt: "2026-08-07T10:00:00.000Z",
    });
    expect(result).toMatchObject({ freshnessStatus: "fresh", fresh: true, effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" });
    expect(result.temporalEvidence?.kind).toBe("effectivePeriod");
  });

  it("does not infer temporal ownership from a nearby date outside the verified Claim excerpt", () => {
    const claimExcerpt = "지원 금액은 50만원입니다.";
    const pageText = `공식 사업 안내. 적용 기간은 2026-01-01부터 2026-12-31까지입니다. ${claimExcerpt} 신청 전 세부 조건을 확인하세요.`;
    const result = evaluateVerificationTemporalEvidence({
      claimKind: "money",
      requirement: { mode: "current" },
      claimEvidenceExcerpt: claimExcerpt,
      pageText,
      claimValue: "50만원",
      observedAt: "2026-08-07T00:00:00.000Z",
    });
    expect(result.freshnessStatus).toBe("unknown");
    expect(result.diagnostics).toContain("temporal_evidence_missing");
  });

  it("never treats an effective end date as fresh without a server observation time", () => {
    const excerpt = "지원 금액 50만원은 2026-12-31까지 적용됩니다.";
    const result = evaluateVerificationTemporalEvidence({
      claimKind: "money",
      requirement: { mode: "current" }, evidence: { kind: "validThrough", evidenceExcerpt: excerpt, end: "2026-12-31" }, pageText: excerpt, claimValue: "50만원",
    });
    expect(result.freshnessStatus).toBe("unknown");
    expect(result.fresh).toBe(false);
    expect(result.diagnostics).toContain("temporal_observation_missing");
  });

  it("marks an expired current Claim stale", () => {
    const excerpt = "지원 금액 50만원은 2026-06-30까지 적용됩니다.";
    const result = evaluateVerificationTemporalEvidence({
      claimKind: "money",
      requirement: { mode: "current" }, claimEvidenceExcerpt: excerpt, pageText: excerpt, claimValue: "50만원", observedAt: "2026-08-07T00:00:00.000Z",
    });
    expect(result.freshnessStatus).toBe("stale");
    expect(result.fresh).toBe(false);
    expect(result.diagnostics).toContain("claim_stale");
  });

  it("does not use an unrelated page date as Claim temporal evidence", () => {
    const claimExcerpt = "지원 금액은 50만원입니다.";
    const result = evaluateVerificationTemporalEvidence({
      claimKind: "money",
      requirement: { mode: "current" }, claimEvidenceExcerpt: claimExcerpt, pageText: `최종 수정일 2026-08-07. ${claimExcerpt}`, claimValue: "50만원", observedAt: "2026-08-07T00:00:00.000Z",
    });
    expect(result.freshnessStatus).toBe("unknown");
    expect(result.diagnostics).toContain("temporal_evidence_missing");
  });

  it("verifies an as-of Claim when the same Claim excerpt owns the reference date", () => {
    const excerpt = "2023-12-31 기준 지원 금액은 50만원입니다.";
    const result = evaluateVerificationTemporalEvidence({
      claimKind: "money",
      requirement: { mode: "asOf", date: "2023-12-31" }, claimEvidenceExcerpt: excerpt, pageText: excerpt, claimValue: "50만원",
    });
    expect(result.freshnessStatus).toBe("fresh");
    expect(result.temporalEvidence).toMatchObject({ kind: "referenceDate", date: "2023-12-31" });
  });

  it("verifies a historical period Claim without requiring the document to be newly published", () => {
    const excerpt = "통계 기준 기간 2023-01-01부터 2023-12-31까지 지원 금액은 50만원이었습니다.";
    const result = evaluateVerificationTemporalEvidence({
      claimKind: "money",
      requirement: { mode: "period", start: "2023-01-01", end: "2023-12-31" }, claimEvidenceExcerpt: excerpt, pageText: excerpt, claimValue: "50만원",
    });
    expect(result.freshnessStatus).toBe("fresh");
    expect(result.temporalEvidence).toMatchObject({ kind: "referencePeriod", start: "2023-01-01", end: "2023-12-31" });
  });

  it("requires recognized temporal ownership markers before deriving evidence", () => {
    const excerpt = "50만원 안내 2026-01-01 2026-12-31";
    expect(deriveVerificationTemporalEvidence({ requirement: { mode: "current" }, evidenceExcerpt: excerpt, claimValue: "50만원" })).toBeUndefined();
  });

  it("accepts explicit notRequired for any Claim whose Planning contract says time validity is irrelevant", () => {
    const general = evaluateVerificationTemporalEvidence({ claimKind: "general", requirement: { mode: "notRequired" }, pageText: "정적 사실", claimValue: "정적 사실" });
    expect(general).toMatchObject({ freshnessStatus: "fresh", fresh: true });
    expect(general.diagnostics).toContain("freshness_not_required");

    const money = evaluateVerificationTemporalEvidence({ claimKind: "money", requirement: { mode: "notRequired" }, pageText: "50만원", claimValue: "50만원" });
    expect(money).toMatchObject({ freshnessStatus: "fresh", fresh: true });
    expect(money.diagnostics).toContain("freshness_not_required");
  });
});
