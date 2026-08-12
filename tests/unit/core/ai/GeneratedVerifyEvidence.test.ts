import { describe, expect, it, vi } from "vitest";

import { evaluateGeneratedFactualClaimDecisions } from "../../../../core/ai/GeneratedVerifyEvidence";
import { resolveApprovalPolicySnapshot, type GeneratedFactualClaimInventoryDraft, type VerificationClaimSpec } from "../../../../core/approval";
import {
  confirmContentOpportunity,
  createContentOpportunityCandidate,
  createContentOpportunityVerificationPlan,
} from "../../../../core/content";

const statement = "취소 처리와 카드사 청구 반영은 서로 다른 단계일 수 있습니다.";
const excerpt = "카드 결제 취소 처리와 카드사 청구 반영은 서로 다른 단계일 수 있습니다.";
const url = "https://www.fss.or.kr/card/cancel";

const criticalClaim: VerificationClaimSpec = Object.freeze({
  claimId: "claim-critical",
  field: "cancelWindow",
  kind: "general",
  statement: "카드 결제 취소는 카드사 청구 반영 전 단계에서 확인해야 한다.",
  rawValue: "취소 처리와 청구 반영",
  qualifiers: Object.freeze({ subject: "카드 결제 취소" }),
  required: true,
});

function opportunity(claims: readonly VerificationClaimSpec[] = []) {
  return confirmContentOpportunity(createContentOpportunityCandidate({
    ...(claims.length
      ? { verificationPlan: createContentOpportunityVerificationPlan(claims) }
      : {}),
    sourceRequest: "카드 명세서 확인 방법",
    selectionMode: "userSpecified",
    selectedTopic: "카드 명세서 취소 처리와 청구 반영 확인 방법",
    primaryKeyword: "카드 명세서 확인 방법",
    secondaryKeywords: ["카드 결제 취소"],
    searchIntent: "카드 결제 취소와 청구 반영 상태 확인",
    audience: "카드 이용자",
    contentType: "article",
    contentAngle: "확인 순서",
    readerProblem: "취소 뒤 청구 상태를 판단하기 어려움",
    expectedCoverage: ["취소 처리", "청구 반영"],
    selectionRationale: "실용 정보",
    opportunityEvidence: [], confidence: 0.8, cautions: [], projectId: "p",
  }), { workspaceId: "w", projectId: "p", contentId: "c", confirmedAt: "2026-08-09T00:00:00.000Z" });
}

function draft(): GeneratedFactualClaimInventoryDraft {
  return {
    claimId: "claim-verify", planningClaimId: "", origin: "generation", risk: "verify",
    surfaceText: statement, statement, kind: "general", normalizedValueJson: "{}",
    qualifiers: { subject: "카드 결제 취소", scope: "", basis: "", note: "" },
    temporalRequirementJson: "null", evidenceUrl: url, evidenceExcerpt: excerpt,
  };
}

describe("Generated VERIFY deterministic Evidence", () => {
  it("verifies a same-response official citation without another provider call", async () => {
    const fetcher = vi.fn(async () => new Response(`<html><head><title>카드 결제 취소 안내</title></head><body><main><p>${excerpt}</p><p>카드 명세서에서 취소 처리와 청구 반영 상태를 확인하십시오.</p></main></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }));
    const decisions = await evaluateGeneratedFactualClaimDecisions({
      drafts: [draft()], opportunity: opportunity(),
      snapshot: resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
      webSources: [{ url, title: "카드 결제 취소 안내", excerpt, provenance: "citation" }],
      verifiedCriticalClaimIds: [], fetcher,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decisions).toEqual([{ retained: true, evidenceStatus: "verify_verified" }]);
  });

  it("marks an uncited VERIFY unsupported without fetching or blocking the article", async () => {
    const fetcher = vi.fn();
    const decisions = await evaluateGeneratedFactualClaimDecisions({
      drafts: [draft()], opportunity: opportunity(),
      snapshot: resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
      webSources: [], verifiedCriticalClaimIds: [], fetcher,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(decisions).toEqual([{ retained: false, evidenceStatus: "unsupported", diagnosticCode: "verify_source_not_cited_by_generation" }]);
  });

  it("resolves a Plan CRITICAL Claim through the Gate even when the response filed it as VERIFY", async () => {
    const fetcher = vi.fn();
    const decisions = await evaluateGeneratedFactualClaimDecisions({
      drafts: [{ ...draft(), claimId: criticalClaim.claimId, risk: "verify" }],
      opportunity: opportunity([criticalClaim]),
      snapshot: resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
      webSources: [], verifiedCriticalClaimIds: [criticalClaim.claimId], fetcher,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(decisions).toEqual([{ retained: true, evidenceStatus: "critical_verified", risk: "critical" }]);
  });

  it("withdraws a Plan CRITICAL Claim the Gate did not verify, whatever risk the response declared", async () => {
    const decisions = await evaluateGeneratedFactualClaimDecisions({
      drafts: [{ ...draft(), claimId: criticalClaim.claimId, risk: "verify" }],
      opportunity: opportunity([criticalClaim]),
      snapshot: resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
      webSources: [], verifiedCriticalClaimIds: [], fetcher: vi.fn(),
    });
    expect(decisions).toEqual([{
      retained: false, evidenceStatus: "unsupported",
      diagnosticCode: "unplanned_generated_critical", risk: "critical",
    }]);
  });
});
