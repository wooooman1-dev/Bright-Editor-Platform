import {
  canonicalizeApprovalEvidenceUrl,
  evaluateApprovalSourceRelevance,
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
    if (!containsNormalized(page.text, draft.evidenceExcerpt, 12)) {
      decisions.push(unsupported("verify_evidence_anchor_unverified"));
      continue;
    }
    const relevance = evaluateApprovalSourceRelevance({
      profileId: input.snapshot.profileId,
      opportunity: input.opportunity,
      page,
      additionalScope: [draft.statement, draft.surfaceText, draft.evidenceExcerpt],
      minimumClaimCoverage: 0.35,
    });
    if (relevance.status !== "passed" || !claimMeaningMatchesEvidence(draft, draft.evidenceExcerpt)) {
      decisions.push(unsupported("verify_claim_relevance_unverified"));
      continue;
    }
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

function claimMeaningMatchesEvidence(
  draft: GeneratedFactualClaimInventoryDraft,
  evidenceExcerpt: string,
): boolean {
  const claimTokens = meaningfulTokens(`${draft.statement} ${draft.surfaceText}`);
  const evidenceTokens = new Set(meaningfulTokens(evidenceExcerpt));
  if (!claimTokens.length) return false;
  const matches = claimTokens.filter((token) => evidenceTokens.has(token));
  return matches.length >= Math.min(2, claimTokens.length)
    && matches.length / claimTokens.length >= 0.35;
}

function meaningfulTokens(value: string): string[] {
  const stop = new Set([
    "관련", "경우", "사실", "설명", "수있다", "있습니다", "합니다", "대한",
    "따라", "통해", "일반", "확인", "정보", "내용", "해당",
  ]);
  return [...new Set(value.normalize("NFKC").toLocaleLowerCase("ko-KR")
    .match(/[0-9a-z가-힣]{2,}/gu) ?? [])].filter((token) => !stop.has(token));
}

function containsNormalized(haystack: string, needle: string, minimumLength: number): boolean {
  const target = normalizeComparable(needle);
  return target.length >= minimumLength && normalizeComparable(haystack).includes(target);
}

function normalizeComparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]+/gu, "");
}
