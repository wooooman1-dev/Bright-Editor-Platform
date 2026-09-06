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
  /**
   * A page that never names the subject is not a source for it, however many
   * scope words it happens to share. The scope pool draws on expectedCoverage
   * and secondary keywords, so ordinary words such as 서비스, 신청 or 생활 sit in
   * it, and one match was enough to pass. A 정부24 mobile portal shell was
   * accepted as relevant for 휴면예금 조회 방법 on that basis: its server-extracted
   * text is 4,054 characters of navigation menu containing neither 휴면예금 nor
   * 본인 확인, and because discovery submits one candidate at a time it then
   * failed the anchor and took the whole article down with it.
   *
   * The subject is the primaryKeyword. Matching is substring-based over
   * punctuation-stripped text, so 휴면 예금 still matches 휴면예금, and generic
   * task modifiers are already stop-worded out of the token set.
   *
   * It applies only to a page written in the keyword's script. An official
   * source may legitimately be in another language — the art profile verifies
   * Korean topics against English museum records — and a Korean subject term
   * cannot be expected in an English page. A keyword that reduces to nothing
   * meaningful leaves this test silent rather than blocking.
   */
  const subjectTokens = meaningfulTokens(input.opportunity.primaryKeyword)
    .filter((token) => /[가-힣]/u.test(token));
  const subjectRequired = subjectTokens.length > 0 && /[가-힣]/u.test(pageText);
  const subjectPresent = !subjectRequired
    || subjectTokens.some((token) => tokenMatchesPage(token, pageTokens, pageText));
  const relevant = subjectPresent && (input.minimumClaimCoverage !== undefined
    ? claimCoveragePassed
    : topicMatches.length > 0 || (claimMatches.length > 0 && claimTopicOverlap));
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
  /**
   * These are search task modifiers and portal furniture, not subjects. They
   * are the same vocabulary planning already treats as generic, and leaving
   * some of them in let a 정부24 navigation menu count as relevant to
   * 휴면예금 조회 방법 because the menu happens to say 조회 and 신청.
   */
  const stopWords = new Set([
    "방법", "기준", "확인", "관리", "정보", "공식", "내용", "관련", "안내",
    "대상", "필요", "점검", "순서", "정리", "자료", "페이지", "사이트",
    "조회", "신청", "신고", "발급", "계산", "설정", "비교", "조건", "절차",
    "서비스", "이용", "추천", "가이드", "목록",
    "product", "terms", "page", "official", "information", "guide",
  ]);
  return Object.freeze([...new Set(tokens.filter((token) => !stopWords.has(token)))].slice(0, 80));
}
