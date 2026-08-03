import {
  approvalOfficialDomains,
  canonicalizeApprovalEvidenceUrl,
  evaluateApprovalSourceUrlSafety,
  normalizeApprovalSourceDocument,
  officialSourceAllowed,
  type ApprovalPolicySnapshot,
  type ApprovalSourcePage,
  type SiteApprovalReadinessFetch,
} from "../approval";
import type { ConfirmedContentOpportunity } from "../content";
import type { AIProvider, AIResponse, AIWebSource } from "./AIProvider";

export const approvalSourcePreflightTask = "approval-source-preflight";

export type ApprovalSourcePreflightResult = Readonly<{
  sources: readonly AIWebSource[];
  diagnostics?: AIResponse["diagnostics"];
}>;

export class ApprovalSourcePreflightError extends Error {
  readonly code = "APPROVAL_SOURCE_NOT_READY";

  constructor(message: string) {
    super(message);
    this.name = "ApprovalSourcePreflightError";
  }
}

export async function runApprovalSourcePreflight(input: Readonly<{
  provider: AIProvider;
  snapshot: ApprovalPolicySnapshot;
  opportunity: ConfirmedContentOpportunity;
  platform: string;
  contentType: string;
  fetcher?: SiteApprovalReadinessFetch;
}>): Promise<ApprovalSourcePreflightResult> {
  const response = await input.provider.generate({
    instruction: approvalSourceDiscoveryInstruction(input.snapshot, input.opportunity),
    metadata: {
      task: approvalSourcePreflightTask,
      approvalPurpose: input.snapshot.contentPurpose,
      approvalProfileId: input.snapshot.profileId,
      approvalPolicyVersion: input.snapshot.policyVersion,
      platform: input.platform,
      contentType: input.contentType,
    },
  });

  const discovered = parseDiscoveredSources(response.content);
  const observedUrls = new Set((response.diagnostics?.webSources ?? [])
    .map((source) => canonicalizeApprovalEvidenceUrl(source.url)));
  const eligible = discovered.filter((source) => observedUrls.has(source.url));
  if (!eligible.length) {
    throw new ApprovalSourcePreflightError(
      "공식 출처 사전검증을 중단했습니다. 웹 검색 도구가 실제로 확인한 직접 출처 URL이 없습니다.",
    );
  }

  const fetcher = input.fetcher ?? fetch;
  const pages = await fetchPreflightPages(eligible.map((source) => source.url), fetcher);
  const pageByRequestedUrl = new Map(pages.map((page) => [
    canonicalizeApprovalEvidenceUrl(page.requestedUrl),
    page,
  ]));
  const rejected: string[] = [];
  const sources: AIWebSource[] = [];

  for (const source of eligible) {
    const page = pageByRequestedUrl.get(source.url);
    const rejection = page
      ? preflightPageRejection(input.snapshot, page, source.evidenceExcerpt)
      : "출처 응답을 확인하지 못했습니다.";
    if (rejection) {
      rejected.push(`${source.url}: ${rejection}`);
      continue;
    }
    const finalUrl = canonicalizeApprovalEvidenceUrl(page!.finalUrl || source.url);
    sources.push(Object.freeze({
      url: finalUrl,
      title: page!.title.trim() || source.title || sourcePublisher(finalUrl),
      excerpt: normalizeExcerpt(source.evidenceExcerpt),
      provenance: "citation" as const,
    }));
  }

  const uniqueSources = [...new Map(sources.map((source) => [source.url, source])).values()];
  if (!uniqueSources.length) {
    const detail = rejected.slice(0, 4).join(" | ");
    throw new ApprovalSourcePreflightError(
      `사용 가능한 공식 출처를 확보하지 못해 원고 생성을 시작하지 않았습니다.${detail ? ` ${detail}` : ""}`,
    );
  }

  return Object.freeze({
    sources: Object.freeze(uniqueSources),
    ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
  });
}

export function withApprovalSourcePreflightInstruction(
  instruction: string,
  sources: readonly AIWebSource[],
): string {
  if (!sources.length) return instruction;
  const evidence = sources.map((source, index) => [
    `${index + 1}. ${source.title?.trim() || sourcePublisher(source.url)}`,
    `URL: ${source.url}`,
    `Verified extracted evidence: ${source.excerpt ?? ""}`,
  ].join("\n")).join("\n\n");
  return `${instruction}\n\nApproval source preflight bundle (mandatory, server-verified before Generation):
${evidence}
- The attached bundle is the complete factual source boundary for this manuscript.
- Do not use web search during Generation and do not add, replace, or invent another source URL.
- Write external facts only when supported by the verified extracted evidence above.
- When the bundle does not support a precise amount, date, threshold, eligibility rule, statistic, quotation, artwork fact, or legal requirement, omit that assertion rather than guessing.
- Do not create a reader-visible source section. Bright Studio projects verified sources after deterministic Claim review.`;
}

function approvalSourceDiscoveryInstruction(
  snapshot: ApprovalPolicySnapshot,
  opportunity: ConfirmedContentOpportunity,
): string {
  const domains = approvalOfficialDomains(snapshot.profileId);
  const plannedScope = {
    selectedTopic: opportunity.selectedTopic,
    primaryKeyword: opportunity.primaryKeyword,
    secondaryKeywords: opportunity.secondaryKeywords,
    searchIntent: opportunity.searchIntent,
    audience: opportunity.audience,
    readerProblem: opportunity.readerProblem,
    expectedCoverage: opportunity.expectedCoverage,
    requiredContentElements: opportunity.qualityTarget.requiredContentElements,
    coreQuestions: opportunity.qualityTarget.coreQuestions,
    decisionCriteria: opportunity.qualityTarget.decisionCriteria,
    warningsOrExceptions: opportunity.qualityTarget.warningsOrExceptions,
    scopeBoundaries: opportunity.qualityTarget.scopeBoundaries,
  };
  return `Perform source discovery only. Do not write, outline, or draft the article.
Find 1-6 direct official primary-source pages that can support the factual parts of this confirmed Content Opportunity.
Content Opportunity: ${JSON.stringify(plannedScope)}
Approval profile: ${snapshot.profileDisplayName}. Content domain: ${snapshot.contentDomain}.
${domains?.length ? `Allowed official domains: ${domains.join(", ")}.` : "Use only a clearly identifiable official museum, archive, government, public institution, or rights-holder page accepted by the active profile."}
Rules:
- Open or inspect each proposed page during this call.
- Return a direct detail, guidance, law, notice, application, collection, or institutional record page; never return a search-result page, navigation page, copied article, community post, or secondary blog.
- Every URL must be HTTPS and must appear in the web-search sources from this same response.
- evidenceExcerpt must be one short factual passage from that exact page, sufficient to prove the page is relevant to the planned topic. Do not invent or combine text from another page.
- If no usable official page exists, return {"sources":[]}.
Return JSON only as {"sources":[{"url":"https://...","title":"...","evidenceExcerpt":"..."}]}.`;
}

type DiscoveredSource = Readonly<{
  url: string;
  title: string;
  evidenceExcerpt: string;
}>;

function parseDiscoveredSources(raw: string): readonly DiscoveredSource[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    throw new ApprovalSourcePreflightError("공식 출처 탐색 응답을 구조화된 JSON으로 해석하지 못했습니다.");
  }
  const values = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).sources
    : undefined;
  if (!Array.isArray(values)) {
    throw new ApprovalSourcePreflightError("공식 출처 탐색 응답에 sources 배열이 없습니다.");
  }

  const sources = new Map<string, DiscoveredSource>();
  for (const item of values.slice(0, maximumPreflightSources)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = item as Record<string, unknown>;
    const rawUrl = typeof value.url === "string" ? value.url.trim() : "";
    const excerpt = typeof value.evidenceExcerpt === "string"
      ? normalizeExcerpt(value.evidenceExcerpt)
      : "";
    const safety = evaluateApprovalSourceUrlSafety(rawUrl);
    if (!safety.safe || !safety.normalizedUrl || excerpt.length < minimumEvidenceExcerptLength) continue;
    const url = canonicalizeApprovalEvidenceUrl(safety.normalizedUrl);
    sources.set(url, Object.freeze({
      url,
      title: typeof value.title === "string" ? value.title.trim().slice(0, 500) : "",
      evidenceExcerpt: excerpt,
    }));
  }
  return Object.freeze([...sources.values()]);
}

async function fetchPreflightPages(
  urls: readonly string[],
  fetcher: SiteApprovalReadinessFetch,
): Promise<readonly ApprovalSourcePage[]> {
  const pages: ApprovalSourcePage[] = [];
  for (const url of urls) pages.push(await fetchPreflightPage(url, fetcher));
  return Object.freeze(pages);
}

async function fetchPreflightPage(
  requestedUrl: string,
  fetcher: SiteApprovalReadinessFetch,
): Promise<ApprovalSourcePage> {
  const initial = evaluateApprovalSourceUrlSafety(requestedUrl);
  if (!initial.safe || !initial.normalizedUrl) {
    return failedPage(requestedUrl, initial.reason ?? "안전한 공개 HTTPS URL이 아닙니다.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sourcePreflightTimeoutMs);
  try {
    const fetched = await fetchWithSafeRedirects(initial.normalizedUrl, fetcher, controller.signal);
    const contentType = fetched.response.headers.get("content-type") ?? "";
    const body = await readBoundedBody(fetched.response, sourcePreflightMaximumBytes);
    const extracted = normalizeApprovalSourceDocument({
      requestedUrl,
      finalUrl: fetched.finalUrl,
      status: fetched.response.status,
      contentType,
      bytes: body.bytes,
      tooLarge: body.tooLarge,
    });
    return Object.freeze({
      requestedUrl,
      finalUrl: fetched.finalUrl,
      status: fetched.response.status,
      contentType,
      title: extracted.title,
      publisher: extracted.publisher,
      text: extracted.text,
      documentFormat: extracted.format,
      extractionStatus: extracted.extractionStatus,
      ...(extracted.extractionReason ? { extractionReason: extracted.extractionReason } : {}),
      contentLength: body.contentLength,
    });
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "AbortError"
      ? `요청 시간이 ${sourcePreflightTimeoutMs}ms를 초과했습니다.`
      : error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return failedPage(requestedUrl, reason);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithSafeRedirects(
  requestedUrl: string,
  fetcher: SiteApprovalReadinessFetch,
  signal: AbortSignal,
): Promise<Readonly<{ response: Response; finalUrl: string }>> {
  let currentUrl = requestedUrl;
  for (let redirectCount = 0; redirectCount <= sourcePreflightMaximumRedirects; redirectCount += 1) {
    const safety = evaluateApprovalSourceUrlSafety(currentUrl);
    if (!safety.safe || !safety.normalizedUrl) {
      throw new Error(safety.reason ?? "리다이렉트 URL 안전성 검사에 실패했습니다.");
    }
    currentUrl = safety.normalizedUrl;
    const response = await fetcher(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,text/csv,text/xml,application/json,application/xml,application/pdf;q=0.9,*/*;q=0.5",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "User-Agent": "BrightStudioApprovalSourcePreflight/1.0",
      },
    });
    if (!redirectStatus(response.status)) {
      return Object.freeze({ response, finalUrl: response.url || currentUrl });
    }
    const location = response.headers.get("location");
    if (!location) return Object.freeze({ response, finalUrl: response.url || currentUrl });
    try {
      await response.body?.cancel();
    } catch {
      // Redirect response bodies may already be closed.
    }
    if (redirectCount === sourcePreflightMaximumRedirects) {
      throw new Error(`출처 리다이렉트가 ${sourcePreflightMaximumRedirects}회를 초과했습니다.`);
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error("출처 리다이렉트 검사를 완료하지 못했습니다.");
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Readonly<{ bytes: Uint8Array; contentLength: number; tooLarge: boolean }>> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // The response body may already be closed.
    }
    return Object.freeze({ bytes: new Uint8Array(), contentLength: declaredLength, tooLarge: true });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > maximumBytes
    ? Object.freeze({ bytes: bytes.slice(0, maximumBytes), contentLength: bytes.byteLength, tooLarge: true })
    : Object.freeze({ bytes, contentLength: bytes.byteLength, tooLarge: false });
}

function preflightPageRejection(
  snapshot: ApprovalPolicySnapshot,
  page: ApprovalSourcePage,
  evidenceExcerpt: string,
): string | undefined {
  if (page.fetchError) return `페이지 요청 실패: ${page.fetchError}`;
  if (page.status < 200 || page.status >= 400) return `정상 HTTP 응답이 아닙니다 (${page.status}).`;
  if (page.extractionStatus !== "extracted") {
    return page.extractionReason || `본문 추출 상태가 ${page.extractionStatus ?? "unknown"}입니다.`;
  }
  if (page.text.trim().length < minimumExtractedPageLength) return "추출된 본문이 사실 확인에 사용하기에는 너무 짧습니다.";
  if (!officialSourceAllowed(snapshot.profileId, page)) return "활성 승인 프로필의 공식 출처로 확인되지 않았습니다.";
  if (!evidenceExcerptMatches(page.text, evidenceExcerpt)) return "제시된 근거 문구를 실제 페이지 본문에서 확인하지 못했습니다.";
  return undefined;
}

function evidenceExcerptMatches(pageText: string, excerpt: string): boolean {
  const page = normalizeComparableText(pageText);
  const candidate = normalizeComparableText(excerpt);
  if (candidate.length < minimumEvidenceExcerptLength) return false;
  if (page.includes(candidate)) return true;

  const tokens = [...new Set(candidate.split(" ").filter((token) => token.length >= 2))];
  if (tokens.length < 3) return false;
  const matched = tokens.filter((token) => page.includes(token)).length;
  return matched >= Math.max(3, Math.ceil(tokens.length * 0.7));
}

function normalizeComparableText(value: string): string {
  return value.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeExcerpt(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maximumEvidenceExcerptLength);
}

function failedPage(requestedUrl: string, fetchError: string): ApprovalSourcePage {
  return Object.freeze({
    requestedUrl,
    finalUrl: requestedUrl,
    status: 0,
    contentType: "",
    title: "",
    publisher: sourcePublisher(requestedUrl),
    text: "",
    fetchError,
    documentFormat: "unknown",
    extractionStatus: "unavailable",
    extractionReason: fetchError,
    contentLength: 0,
  });
}

function sourcePublisher(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./iu, "");
  } catch {
    return "공식 출처";
  }
}

function stripFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
}

function redirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

const maximumPreflightSources = 6;
const minimumEvidenceExcerptLength = 20;
const maximumEvidenceExcerptLength = 1_200;
const minimumExtractedPageLength = 200;
const sourcePreflightTimeoutMs = 12_000;
const sourcePreflightMaximumBytes = 1_500_000;
const sourcePreflightMaximumRedirects = 5;
