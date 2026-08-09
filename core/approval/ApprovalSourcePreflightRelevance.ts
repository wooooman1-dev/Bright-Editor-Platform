import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import type { ApprovalSourcePage } from "./ApprovalEvidenceVerification";
import type { ContentOpportunityCandidate } from "../content";

export type ApprovalSourceRelevanceResult = Readonly<{
  status: "passed" | "rejected";
  diagnosticCode?: "source_topic_relevance_unverified";
  matchedSignals: readonly string[];
}>;

export function evaluateApprovalSourceRelevance(input: Readonly<{
  profileId: ApprovalPolicyProfileId;
  opportunity: ContentOpportunityCandidate;
  page: ApprovalSourcePage;
  additionalScope?: readonly string[];
  minimumClaimCoverage?: number;
}>): ApprovalSourceRelevanceResult {
  const scopeTokens = meaningfulTokens([
    input.opportunity.selectedTopic,
    input.opportunity.primaryKeyword,
    ...input.opportunity.secondaryKeywords,
    ...input.opportunity.expectedCoverage,
    ...(input.additionalScope ?? []),
  ].join(" "));
  if (!scopeTokens.length) {
    return Object.freeze({
      status: "rejected",
      diagnosticCode: "source_topic_relevance_unverified",
      matchedSignals: Object.freeze([]),
    });
  }

  const pageText = [
    input.page.title,
    input.page.publisher,
    input.page.text,
  ].join(" ");
  const pageTokens = meaningfulTokens(pageText);
  const claimScopeTokens = meaningfulTokens((input.additionalScope ?? []).join(" "));
  const topicMatches = scopeTokens
    .filter((token) => tokenMatchesPage(token, pageTokens, pageText))
    .map((token) => `topic:${token}`);
  const claimMatches = claimScopeTokens
    .filter((token) => tokenMatchesPage(token, pageTokens, pageText))
    .map((token) => `claim:${token}`);
  const uniqueClaimTokens = new Set(claimScopeTokens);
  const uniqueClaimMatchCount = new Set(claimMatches.map((match) => match.slice("claim:".length))).size;
  const claimCoveragePassed = uniqueClaimTokens.size > 0
    && uniqueClaimMatchCount >= 2
    && uniqueClaimMatchCount / uniqueClaimTokens.size >= (input.minimumClaimCoverage ?? 0.5);
  const claimTopicOverlap = claimScopeTokens.some((token) => scopeTokens.includes(token));
  const relevant = input.minimumClaimCoverage !== undefined
    ? claimCoveragePassed
    : topicMatches.length > 0 || (claimMatches.length > 0 && claimTopicOverlap);
  if (!relevant) {
    return Object.freeze({
      status: "rejected",
      diagnosticCode: "source_topic_relevance_unverified",
      matchedSignals: Object.freeze([]),
    });
  }
  return Object.freeze({
    status: "passed",
    matchedSignals: Object.freeze([...topicMatches, ...claimMatches]),
  });
}

function tokenMatchesPage(token: string, pageTokens: readonly string[], pageText: string): boolean {
  const normalized = compact(token);
  const page = compact(pageText);
  if (normalized.length >= 2 && page.includes(normalized)) return true;
  if (normalized.length >= 5 && normalized.endsWith("권") && page.includes(normalized.slice(0, -1))) return true;
  return pageTokens.some((candidate) => compact(candidate) === normalized);
}

function compact(value: string): string {
  return value.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function meaningfulTokens(value: string): readonly string[] {
  const tokens = value.normalize("NFKC").toLocaleLowerCase("ko-KR")
    .match(/[0-9a-z가-힣]{2,}/gu) ?? [];
  const stopWords = new Set([
    "방법", "기준", "확인", "관리", "정보", "공식", "내용", "관련", "안내",
    "대상", "필요", "점검", "순서", "정리", "자료", "페이지", "사이트",
    "product", "terms", "page", "official", "information", "guide",
  ]);
  return Object.freeze([...new Set(tokens.filter((token) => !stopWords.has(token)))].slice(0, 80));
}
