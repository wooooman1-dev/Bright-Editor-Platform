import {
  canonicalizeApprovalEvidenceUrl,
  isCriticalVerificationClaim,
  officialSourceAllowed,
  type ApprovalPolicySnapshot,
  type GeneratedFactualClaimDecision,
  type GeneratedFactualClaimInventoryDraft,
  type SiteApprovalReadinessFetch,
} from "../approval";
import type { ConfirmedContentOpportunity } from "../content";
import type { AIWebSource } from "./AIProvider";
import { fetchPreflightPage } from "./ApprovalSourcePreflight";

/**
 * Best-effort VERIFY validation performed after the existing Generation call.
 * It makes no provider call: URLs must originate from the same response's web
 * search diagnostics and are then fetched and checked deterministically.
 */
export async function evaluateGeneratedFactualClaimDecisions(input: Readonly<{
  drafts: readonly GeneratedFactualClaimInventoryDraft[];
  opportunity: ConfirmedContentOpportunity;
  snapshot: ApprovalPolicySnapshot;
  webSources: readonly AIWebSource[];
  verifiedCriticalClaimIds: readonly string[];
  fetcher?: SiteApprovalReadinessFetch;
}>): Promise<readonly GeneratedFactualClaimDecision[]> {
  const verifiedCriticalClaimIds = new Set(input.verifiedCriticalClaimIds);
  const plannedVerifyClaimIds = new Set(input.opportunity.verificationPlan?.claims
    .filter((claim) => claim.risk === "verify")
    .map((claim) => claim.claimId) ?? []);
  /**
   * Criticality belongs to the stored Verification Plan, never to the risk label
   * the Generation response chose. A CRITICAL Claim that the response filed as
   * VERIFY used to fall into this best-effort path and was then withdrawn for
   * `verify_source_not_cited_by_generation`, because explicit Source Preflight
   * verified it before Generation and its official URL is not a citation of the
   * Generation call. That deleted a sentence the server had already verified and
   * left the persisted VerificationSnapshot pointing at text no longer present.
   */
  const plannedCriticalClaimIds = new Set(input.opportunity.verificationPlan?.claims
    .filter(isCriticalVerificationClaim)
    .map((claim) => claim.claimId) ?? []);
  const responseSources = new Map(input.webSources.map((source) => [
    canonicalizeApprovalEvidenceUrl(source.url),
    source,
  ]));
  const pages = new Map<string, Awaited<ReturnType<typeof fetchPreflightPage>>>();
  const fetcher = input.fetcher ?? fetch;
  const decisions: GeneratedFactualClaimDecision[] = [];

  for (const draft of input.drafts) {
    const linkedClaimId = draft.planningClaimId.trim() || draft.claimId.trim();
    if (draft.risk === "critical" || plannedCriticalClaimIds.has(linkedClaimId)) {
      decisions.push(Object.freeze(verifiedCriticalClaimIds.has(linkedClaimId)
        ? {
            retained: true,
            evidenceStatus: "critical_verified" as const,
            risk: "critical" as const,
          }
        : {
            retained: false,
            evidenceStatus: "unsupported" as const,
            diagnosticCode: "unplanned_generated_critical",
            risk: "critical" as const,
          }));
      continue;
    }

    const planningClaimId = draft.planningClaimId.trim();
    if ((draft.origin === "planning" && !planningClaimId)
      || (planningClaimId && !plannedVerifyClaimIds.has(planningClaimId))) {
      decisions.push(unsupported("verify_planning_claim_link_invalid"));
      continue;
    }

    const url = canonicalizeApprovalEvidenceUrl(draft.evidenceUrl);
    const responseSource = responseSources.get(url);
    if (!url || !responseSource || responseSource.provenance !== "citation") {
      decisions.push(unsupported("verify_source_not_cited_by_generation"));
      continue;
    }
    if (!draft.evidenceExcerpt.trim()) {
      decisions.push(unsupported("verify_evidence_excerpt_missing"));
      continue;
    }

    let page = pages.get(url);
    if (!page) {
      page = await fetchPreflightPage(url, fetcher);
      pages.set(url, page);
    }
    if (page.fetchError || page.status < 200 || page.status >= 400 || page.extractionStatus !== "extracted") {
      decisions.push(unsupported("verify_source_unreachable"));
      continue;
    }
    if (!officialSourceAllowed(input.snapshot.profileId, page)) {
      decisions.push(unsupported("verify_source_unofficial"));
      continue;
    }
    /**
     * 페이지 내용이 Claim 을 뒷받침하는지는 판정하지 않는다 (D-045).
     *
     * 여기 있던 두 검사는 인용문이 페이지 본문에 그대로 있는지와, 페이지가 Claim 을
     * 의미상 뒷받침하는지를 봤다. 통과하지 못한 문장은 문단째 원고에서 삭제된다.
     * 2026-08-19 밝은재테크 실측: 출처가 law.go.kr 조문 페이지이고 인용문까지
     * 저장돼 있던 주택임대차보호법 제3조의2 우선변제권 문단이 여기서 걸려 사라졌고,
     * 그 결과가 정보 완성도 85점이었다.
     *
     * 남는 판정은 D-045 가 정한 셋이다. 생성이 인용한 URL 인가, 인용 범위 안의
     * 공식 도메인인가, 그 주소가 실제로 열리는가.
     */
    decisions.push(Object.freeze({
      retained: true,
      evidenceStatus: "verify_verified" as const,
    }));
  }
  return Object.freeze(decisions);
}

function unsupported(diagnosticCode: string): GeneratedFactualClaimDecision {
  return Object.freeze({
    retained: false,
    evidenceStatus: "unsupported" as const,
    diagnosticCode,
  });
}

