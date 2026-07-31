import {
  canonicalizeApprovalEvidenceUrl,
  normalizeContentPurpose,
  verifyApprovalEvidence,
  type ApprovalEvidenceVerificationResult,
  type ApprovalPolicyProfileId,
  type ApprovalSourcePage,
  type SiteApprovalReadinessFetch,
  type SiteApprovalReadinessSnapshot,
  SiteApprovalReadinessAdapterRegistry,
} from "../../../core/approval";
import {
  contentRevisionId,
  isStandardQualityApproved,
  QualityEngine,
  type QualityReport,
} from "../../../core/quality";
import type { PlatformConnection } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import { tistorySiteReadinessAdapter } from "../../../apps/tistory/approval/TistorySiteReadinessAudit";
import { wordpressSiteReadinessAdapter } from "../../../apps/wordpress/approval/WordPressSiteReadinessAudit";
import { resolveProjectStrategy, type UserContent, type UserData } from "../../user-flow/user-data";
import { publishingCategoryNames } from "../publishing/InternalLinkCatalogPolicy";
import type { ApprovalAwareContent } from "./ApprovalContentPolicy";
import { resolveOfficialEvidenceSourceFallback } from "./OfficialEvidenceSourceResolver";

export type ApprovalReadinessExecutionResult = Readonly<{
  data: UserData;
  document: ContentDocument;
  quality: QualityReport;
  evidence: ApprovalEvidenceVerificationResult;
  siteReadiness: SiteApprovalReadinessSnapshot;
}>;

export type ApprovalReadinessFetch = SiteApprovalReadinessFetch;

/**
 * Runs the deterministic approval checks that can be observed now.
 *
 * This service does not add an AI call. It verifies official source pages,
 * compares canonical facts with those pages, delegates the selected public
 * site audit to its registered platform Adapter,
 * persists the resulting snapshots, and recomputes the current Quality report.
 */
export class ApprovalReadinessApplicationService {
  constructor(
    private readonly fetcher: ApprovalReadinessFetch = fetch,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly siteAdapters: SiteApprovalReadinessAdapterRegistry = defaultSiteReadinessAdapters(),
  ) {}

  async execute(input: Readonly<{
    data: UserData;
    contentId: string;
    connection?: PlatformConnection;
  }>): Promise<ApprovalReadinessExecutionResult> {
    const content = input.data.contents.find((item) => item.id === input.contentId);
    if (!content?.document) throw new Error("승인 준비 검사를 실행할 기준 원고가 없습니다.");

    const aware = content as ApprovalAwareContent;
    if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval") {
      throw new Error("애드센스 승인 준비 콘텐츠에서만 승인 준비 검사를 실행할 수 있습니다.");
    }
    if (!aware.approvalProfileId) throw new Error("승인 준비 정책 프로필이 없습니다.");

    const project = input.data.projects.find((item) => item.id === content.projectId && item.workspaceId === content.workspaceId);
    if (!project) throw new Error("승인 준비 검사 대상 프로젝트를 찾을 수 없습니다.");

    const checkedAt = this.now();
    const candidateUrls = content.document.metadata?.approvalEvidence?.sources
      .map((source) => canonicalizeApprovalEvidenceUrl(source.url))
      .filter(Boolean) ?? [];
    const uniqueCandidateUrls = [...new Set(candidateUrls)];
    const sourcePages = await fetchApprovalSourcePages(uniqueCandidateUrls, this.fetcher);
    const evidence = verifyApprovalEvidence(
      content.document,
      aware.approvalProfileId as ApprovalPolicyProfileId,
      sourcePages,
      checkedAt,
    );
    const provisionalEvidence = evidence.pack;

    const siteReadiness = await resolveSiteReadiness({
      connection: input.connection,
      checkedAt,
      expectedTerms: siteIdentityTerms(input.data, project, content),
      fetcher: this.fetcher,
      adapters: this.siteAdapters,
    });

    const documentWithSnapshots: ContentDocument = {
      ...content.document,
      metadata: {
        ...content.document.metadata!,
        updatedAt: checkedAt,
        approvalEvidence: provisionalEvidence,
        siteApprovalReadiness: siteReadiness,
      },
    };
    const documentWithSourceSection = provisionalEvidence.status === "verified" && provisionalEvidence.reviewedAt
      ? upsertVerifiedSourceSection(documentWithSnapshots, provisionalEvidence)
      : removeGeneratedSourceSection(documentWithSnapshots);
    const revisionId = contentRevisionId(documentWithSourceSection);
    const stableEvidence = Object.freeze({
      ...provisionalEvidence,
      reviewedRevisionId: revisionId,
    });
    const nextDocument: ContentDocument = {
      ...documentWithSourceSection,
      metadata: {
        ...documentWithSourceSection.metadata!,
        approvalEvidence: stableEvidence,
      },
    };

    const categoryNames = publishingCategoryNames(content);
    const quality = new QualityEngine().review(nextDocument, {
      contentType: content.contentType,
      platform: content.platform
        ?? input.connection?.platform
        ?? resolveProjectStrategy(project).defaultPlatform,
      primaryKeyword: content.primaryKeyword,
      searchIntent: content.searchIntent,
      categoryName: categoryNames.length ? categoryNames.join(", ") : undefined,
      availableInternalLinkCandidates: nextDocument.metadata?.availableRelatedContentCandidates,
      internalLinkCatalogStatus: nextDocument.metadata?.internalLinkCatalogStatus,
      qualityTarget: content.qualityTarget ?? content.opportunity?.qualityTarget ?? nextDocument.metadata?.qualityTarget,
      opportunity: content.opportunity,
      revisionId,
      reviewedAt: checkedAt,
    });

    const nextContent: UserContent = {
      ...content,
      document: nextDocument,
      quality,
      status: isStandardQualityApproved(quality) ? "ready" : "in_review",
      updatedAt: checkedAt,
    };
    const nextData: UserData = {
      ...input.data,
      contents: input.data.contents.map((item) => item.id === content.id ? nextContent : item),
      qualityReports: [
        ...(input.data.qualityReports ?? []).filter((item) => item.contentId !== content.id),
        { contentId: content.id, report: quality },
      ],
    };

    return Object.freeze({
      data: nextData,
      document: nextDocument,
      quality,
      evidence: Object.freeze({ ...evidence, pack: stableEvidence }),
      siteReadiness,
    });
  }
}

async function resolveSiteReadiness(input: Readonly<{
  connection?: PlatformConnection;
  checkedAt: string;
  expectedTerms: readonly string[];
  fetcher: ApprovalReadinessFetch;
  adapters: SiteApprovalReadinessAdapterRegistry;
}>): Promise<SiteApprovalReadinessSnapshot> {
  if (!input.connection) return unavailableSiteSnapshot(input.checkedAt, "발행 계정이 선택되지 않아 공개 사이트를 검사하지 못했습니다.");
  const adapter = input.adapters.get(input.connection.platform);
  if (!adapter) return unavailableSiteSnapshot(input.checkedAt, `${input.connection.platform} 사이트 승인 준비 검사 모듈이 등록되지 않았습니다.`);
  return adapter.audit({
    connection: input.connection,
    checkedAt: input.checkedAt,
    expectedTerms: input.expectedTerms,
    fetcher: input.fetcher,
  });
}

function defaultSiteReadinessAdapters(): SiteApprovalReadinessAdapterRegistry {
  return new SiteApprovalReadinessAdapterRegistry([
    tistorySiteReadinessAdapter,
    wordpressSiteReadinessAdapter,
  ]);
}

function unavailableSiteSnapshot(checkedAt: string, message: string): SiteApprovalReadinessSnapshot {
  return Object.freeze({
    version: "1.0",
    status: "needs_review",
    checkedAt,
    checks: Object.freeze([Object.freeze({ key: "public_site", passed: false, message })]),
  });
}

async function fetchApprovalSourcePages(
  requestedUrls: readonly string[],
  fetcher: ApprovalReadinessFetch,
): Promise<readonly ApprovalSourcePage[]> {
  const pages: ApprovalSourcePage[] = [];

  // Official institutions commonly rate-limit or challenge simultaneous requests.
  // Fetch candidates sequentially so one readiness check cannot create a burst.
  for (const requestedUrl of requestedUrls) {
    const page = await fetchApprovalSourcePage(requestedUrl, fetcher);
    if (page) pages.push(page);
  }

  return Object.freeze(pages);
}

async function fetchApprovalSourcePage(
  requestedUrl: string,
  fetcher: ApprovalReadinessFetch,
  timeoutMs = 12_000,
): Promise<ApprovalSourcePage | undefined> {
  let lastError: string | undefined;
  for (let attempt = 0; attempt < sourceFetchMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let retryDelay: number | undefined;

    try {
      const response = await fetcher(requestedUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: sourceRequestHeaders("text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8"),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const html = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType)
        ? (await response.text()).slice(0, 1_500_000)
        : "";
      const finalUrl = response.url || requestedUrl;
      const page = Object.freeze({
        requestedUrl,
        finalUrl,
        status: response.status,
        contentType,
        title: extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
        publisher: extractPublisher(html, finalUrl),
        text: htmlToText(html),
      });

      if (!retryableSourceStatus(response.status) || attempt === sourceFetchMaxAttempts - 1) {
        if (sourcePageRequiresOfficialFallback(page)) {
          const fallback = await fetchOfficialSourceFallback(requestedUrl, fetcher, timeoutMs);
          if (fallback) return fallback;
        }
        return page;
      }
      retryDelay = sourceRetryDelayMs(response.headers.get("retry-after"), attempt);
    } catch (error) {
      lastError = sourceFetchErrorMessage(error, timeoutMs);
      if (attempt === sourceFetchMaxAttempts - 1) {
        const fallback = await fetchOfficialSourceFallback(requestedUrl, fetcher, timeoutMs);
        return fallback ?? sourceFailurePage(requestedUrl, lastError);
      }
      retryDelay = sourceRetryDelayMs(undefined, attempt);
    } finally {
      clearTimeout(timeout);
    }

    await delay(retryDelay ?? 0);
  }

  const fallback = await fetchOfficialSourceFallback(requestedUrl, fetcher, timeoutMs);
  return fallback ?? sourceFailurePage(requestedUrl, lastError ?? "알 수 없는 네트워크 오류");
}

async function fetchOfficialSourceFallback(
  requestedUrl: string,
  fetcher: ApprovalReadinessFetch,
  timeoutMs: number,
): Promise<ApprovalSourcePage | undefined> {
  const fallback = resolveOfficialEvidenceSourceFallback(requestedUrl);
  if (!fallback) return undefined;

  for (let attempt = 0; attempt < sourceFetchMaxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let retryDelay: number | undefined;

    try {
      const response = await fetcher(fallback.requestUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: sourceRequestHeaders(fallback.accept),
      });
      if (response.ok) return fallback.normalize(response, requestedUrl);
      if (!retryableSourceStatus(response.status) || attempt === sourceFetchMaxAttempts - 1) return undefined;
      retryDelay = sourceRetryDelayMs(response.headers.get("retry-after"), attempt);
    } catch {
      if (attempt === sourceFetchMaxAttempts - 1) return undefined;
      retryDelay = sourceRetryDelayMs(undefined, attempt);
    } finally {
      clearTimeout(timeout);
    }

    await delay(retryDelay ?? 0);
  }

  return undefined;
}

function sourceFailurePage(
  requestedUrl: string,
  fetchError: string,
): ApprovalSourcePage {
  return Object.freeze({
    requestedUrl,
    finalUrl: requestedUrl,
    status: 0,
    contentType: "",
    title: "",
    publisher: extractPublisher("", requestedUrl),
    text: "",
    fetchError,
  });
}

function sourceFetchErrorMessage(error: unknown, timeoutMs: number): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return `요청 시간이 ${timeoutMs}ms를 초과했습니다.`;
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function sourceRequestHeaders(accept: string): HeadersInit {
  return {
    Accept: accept,
    "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    "Cache-Control": "no-cache",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BrightStudioEvidenceVerifier/1.2",
  };
}

function sourcePageRequiresOfficialFallback(page: ApprovalSourcePage): boolean {
  if (page.status >= 400) return true;
  return /(?:just a moment|security checkpoint|attention required|access denied|temporarily blocked)/i.test(page.title);
}

function retryableSourceStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function sourceRetryDelayMs(retryAfter: string | null | undefined, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, sourceFetchMaxDelayMs);
    }
    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) {
      return Math.min(Math.max(0, retryAt - Date.now()), sourceFetchMaxDelayMs);
    }
  }
  return Math.min(500 * (2 ** attempt), sourceFetchMaxDelayMs);
}

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function upsertVerifiedSourceSection(
  document: ContentDocument,
  pack: NonNullable<ContentDocument["metadata"]>["approvalEvidence"],
): ContentDocument {
  const reviewedAt = pack!.reviewedAt!;
  const date = reviewedAt.slice(0, 10);
  const sources = pack!.sources
    .filter((source) => source.verified)
    .map((source) => `${source.title} (${source.url})`)
    .join(" · ");
  const blocks = document.blocks.filter((block) => !generatedSourceBlockIds.has(block.id));
  return {
    ...document,
    blocks: Object.freeze([
      ...blocks,
      Object.freeze({ id: "approval-sources-heading", type: "heading" as const, level: 2 as const, text: "공식 출처와 검토 기준" }),
      Object.freeze({ id: "approval-sources-summary", type: "paragraph" as const, text: `주요 출처: ${sources}` }),
      Object.freeze({ id: "approval-review-date", type: "paragraph" as const, text: `정보 기준일: ${date} · 최종 검토일: ${date}` }),
    ]),
  };
}

function removeGeneratedSourceSection(document: ContentDocument): ContentDocument {
  const blocks = document.blocks.filter((block) => !generatedSourceBlockIds.has(block.id));
  return blocks.length === document.blocks.length ? document : { ...document, blocks: Object.freeze(blocks) };
}

function siteIdentityTerms(
  data: UserData,
  project: UserData["projects"][number],
  content: UserContent,
): readonly string[] {
  const strategy = resolveProjectStrategy(project);
  const brandName = project.brandId
    ? data.brands.find((brand) => brand.id === project.brandId && brand.workspaceId === project.workspaceId)?.name
    : undefined;
  const values = [project.name, brandName, strategy.primaryTopic, content.document?.metadata?.approvalPolicy?.siteIdentity]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const tokens = values.flatMap((value) => [value, ...value.split(/[\s·|,/]+/g)])
    .map((value) => value.trim())
    .filter((value) => value.length >= 2 && value.length <= 40);
  return Object.freeze([...new Set(tokens)]);
}

function extractPublisher(html: string, fallbackUrl: string): string {
  const siteName = extractFirst(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/i)
    || extractFirst(html, /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (siteName) return siteName;
  try {
    return new URL(fallbackUrl).hostname;
  } catch {
    return fallbackUrl;
  }
}

function extractFirst(html: string, pattern: RegExp): string {
  return decodeEntities(pattern.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "");
}

function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

const sourceFetchMaxAttempts = 3;
const sourceFetchMaxDelayMs = 2_000;

const generatedSourceBlockIds = new Set([
  "approval-sources-heading",
  "approval-sources-summary",
  "approval-review-date",
]);
