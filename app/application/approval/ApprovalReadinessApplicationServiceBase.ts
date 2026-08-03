import {
  canonicalizeApprovalEvidenceUrl,
  evaluateApprovalPreparationText,
  evaluateApprovalReadiness,
  normalizeApprovalSourceDocument,
  normalizeContentPurpose,
  verifyApprovalEvidence,
  type ApprovalEvidenceVerificationResult,
  type ApprovalPolicyProfileId,
  type ApprovalSourcePage,
  type SiteApprovalReadinessFetch,
  type SiteApprovalReadinessSnapshot,
  SiteApprovalReadinessAdapterRegistry,
} from "../../../core/approval";
import { editorialRevisionId, isStandardQualityApproved, type QualityReport } from "../../../core/quality";
import type { PlatformConnection } from "../../../core/connections";
import { canonicalDocumentText, contentBlockOwnership, type ContentDocument } from "../../../core/content";
import { tistorySiteReadinessAdapter } from "../../../apps/tistory/approval/TistorySiteReadinessAudit";
import { wordpressSiteReadinessAdapter } from "../../../apps/wordpress/approval/WordPressSiteReadinessAudit";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { InternalLinkCatalogEvaluationService } from "../publishing/InternalLinkCatalogEvaluationService";
import { contentOwnedIdentityContamination } from "../publishing/ContentOwnedIdentityPolicy";
import type { ApprovalAwareContent } from "./ApprovalContentPolicy";
import { approvalReadinessExecutionIdentity } from "./ApprovalReadinessExecutionIdentity";
import { resolveOfficialEvidenceSourceFallback } from "./OfficialEvidenceSourceResolver";

export { approvalReadinessExecutionIdentity } from "./ApprovalReadinessExecutionIdentity";

export type ApprovalReadinessExecutionResult = Readonly<{
  data: UserData;
  document: ContentDocument;
  quality: QualityReport;
  evidence: ApprovalEvidenceVerificationResult;
  siteReadiness: SiteApprovalReadinessSnapshot;
}>;

export type ApprovalReadinessFetch = SiteApprovalReadinessFetch;

const inFlightApprovalReadinessExecutions = new Map<string, Promise<ApprovalReadinessExecutionResult>>();

export function executeApprovalReadinessOnce(
  key: string,
  task: () => Promise<ApprovalReadinessExecutionResult>,
): Promise<ApprovalReadinessExecutionResult> {
  const current = inFlightApprovalReadinessExecutions.get(key);
  if (current) return current;
  const execution = task().finally(() => {
    if (inFlightApprovalReadinessExecutions.get(key) === execution) {
      inFlightApprovalReadinessExecutions.delete(key);
    }
  });
  inFlightApprovalReadinessExecutions.set(key, execution);
  return execution;
}

/**
 * Runs the deterministic approval checks that can be observed now.
 *
 * This service does not add an AI call. It evaluates the current public-post
 * catalog, verifies official source pages, compares canonical facts with those
 * pages, delegates the selected public site audit to its registered platform
 * Adapter, persists the resulting snapshots, and updates only the independent
 * approval-readiness aggregate on the existing Standard Quality report.
 */
export class ApprovalReadinessApplicationService {
  constructor(
    private readonly fetcher: ApprovalReadinessFetch = fetch,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly siteAdapters: SiteApprovalReadinessAdapterRegistry = defaultSiteReadinessAdapters(),
    private readonly internalLinks = new InternalLinkCatalogEvaluationService(),
  ) {}

  async execute(input: Readonly<{
    data: UserData;
    contentId: string;
    connection?: PlatformConnection;
    selectedTarget?: boolean;
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
    if (!input.data.workspace) throw new Error("승인 준비 검사 대상 작업공간을 찾을 수 없습니다.");
    const identityContamination = contentOwnedIdentityContamination(input.data, project, content);
    if (identityContamination.length) {
      throw new Error(
        `기존 기획 또는 원고에 검색 주제가 아닌 프로젝트명·브랜드명이 포함되어 승인 준비 검사를 차단했습니다: ${identityContamination.join(", ")}. 새 콘텐츠에서 기획을 다시 실행해 주세요.`,
      );
    }
    const editorialRevision = editorialRevisionId(content.document);
    if (!content.quality
      || !isStandardQualityApproved(content.quality)
      || content.quality.reviewedRevisionId !== editorialRevision) {
      throw new Error("현재 편집 원고의 Standard Quality가 유효할 때만 승인 준비 검사를 실행할 수 있습니다.");
    }
    const executionIdentity = approvalReadinessExecutionIdentity(content, input.connection?.id);
    const storedResult = storedApprovalReadinessResult(input.data, content, executionIdentity.key);
    if (storedResult) return storedResult;

    const checkedAt = this.now();
    const documentWithInternalLinks = await this.internalLinks.evaluate({
      workspaceId: input.data.workspace.id,
      projectId: project.id,
      content,
      document: content.document,
      connection: input.connection,
      selectedTarget: input.selectedTarget === true,
      refresh: true,
    });
    const candidateUrls = documentWithInternalLinks.metadata?.approvalEvidence?.sources
      .map((source) => canonicalizeApprovalEvidenceUrl(source.url))
      .filter(Boolean) ?? [];
    const uniqueCandidateUrls = [...new Set(candidateUrls)];
    const sourcePages = await fetchApprovalSourcePages(uniqueCandidateUrls, this.fetcher);
    const evidence = verifyApprovalEvidence(
      documentWithInternalLinks,
      aware.approvalProfileId as ApprovalPolicyProfileId,
      sourcePages,
      checkedAt,
    );
    const provisionalEvidence = evidence.pack;

    const siteReadiness = await resolveSiteReadiness({
      connection: input.connection,
      checkedAt,
      expectedTerms: siteIdentityTerms(input.data, project),
      fetcher: this.fetcher,
      adapters: this.siteAdapters,
    });

    const documentWithSnapshots: ContentDocument = {
      ...documentWithInternalLinks,
      metadata: {
        ...documentWithInternalLinks.metadata!,
        updatedAt: checkedAt,
        approvalEvidence: provisionalEvidence,
        siteApprovalReadiness: siteReadiness,
      },
    };
    const projection = provisionalEvidence.status === "verified" && provisionalEvidence.reviewedAt
      ? upsertVerifiedSourceSection(documentWithSnapshots, provisionalEvidence)
      : Object.freeze({
          document: removeGeneratedSourceSection(documentWithSnapshots),
          presentationStatus: "not_projected" as const,
          presentationReasons: Object.freeze([]),
        });
    const stableEvidence = Object.freeze({
      ...provisionalEvidence,
      reviewedRevisionId: editorialRevision,
      presentationStatus: projection.presentationStatus,
      ...(projection.presentationReasons.length ? { presentationReasons: projection.presentationReasons } : {}),
    });
    const nextDocument: ContentDocument = {
      ...projection.document,
      metadata: {
        ...projection.document.metadata!,
        approvalEvidence: stableEvidence,
        approvalReadinessExecution: Object.freeze({
          version: "1.0",
          key: executionIdentity.key,
          editorialRevisionId: executionIdentity.editorialRevisionId,
          publishingContextKey: executionIdentity.publishingContextKey,
          evidenceFingerprint: executionIdentity.evidenceFingerprint,
          status: "completed",
          checkedAt,
        }),
      },
    };

    const policyIssues = nextDocument.metadata?.approvalPolicy
      ? evaluateApprovalPreparationText(
          canonicalDocumentText(nextDocument),
          nextDocument.metadata.approvalPolicy,
          {
            sourceUrls: stableEvidence.sources
              .filter((source) => source.provenance !== "search_candidate")
              .map((source) => source.canonicalUrl ?? source.url),
            reviewedAt: stableEvidence.reviewedAt,
          },
        )
      : Object.freeze([]);
    const approvalReadiness = evaluateApprovalReadiness(nextDocument, policyIssues, true);
    const quality = Object.freeze({
      ...content.quality,
      approvalReadiness,
    }) as QualityReport;

    const nextContent: UserContent = {
      ...content,
      document: nextDocument,
      quality,
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

function storedApprovalReadinessResult(
  data: UserData,
  content: UserContent,
  executionKey: string,
): ApprovalReadinessExecutionResult | undefined {
  const document = content.document;
  const quality = content.quality;
  const execution = document?.metadata?.approvalReadinessExecution;
  const pack = document?.metadata?.approvalEvidence;
  const siteReadiness = document?.metadata?.siteApprovalReadiness;
  if (!document || !quality || !execution || execution.key !== executionKey || !pack || !siteReadiness) return undefined;
  return Object.freeze({
    data,
    document,
    quality,
    evidence: Object.freeze({
      pack,
      verifiedSourceCount: pack.sources.filter((source) => source.claimVerificationStatus === "verified" || source.verified).length,
      rejectedSourceCount: pack.sources.filter((source) => !source.verified && source.verificationStatus !== "excluded").length,
      reasons: Object.freeze([]),
    }),
    siteReadiness,
  });
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
    pages.push(page);
  }

  return Object.freeze(pages);
}

async function fetchApprovalSourcePage(
  requestedUrl: string,
  fetcher: ApprovalReadinessFetch,
  timeoutMs = 12_000,
): Promise<ApprovalSourcePage> {
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
        headers: sourceRequestHeaders("text/html,application/xhtml+xml,text/plain,text/csv,text/xml,application/json,application/xml,application/pdf;q=0.9,*/*;q=0.5"),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const finalUrl = response.url || requestedUrl;
      const body = await readBoundedResponseBody(response, sourceResponseMaxBytes);
      const extraction = normalizeApprovalSourceDocument({
        requestedUrl,
        finalUrl,
        status: response.status,
        contentType,
        bytes: body.bytes,
        tooLarge: body.tooLarge,
      });
      const page: ApprovalSourcePage = Object.freeze({
        requestedUrl,
        finalUrl,
        status: response.status,
        contentType,
        title: extraction.title,
        publisher: extraction.publisher,
        text: extraction.text,
        documentFormat: extraction.format,
        extractionStatus: extraction.extractionStatus,
        ...(extraction.extractionReason ? { extractionReason: extraction.extractionReason } : {}),
        contentLength: body.contentLength,
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

async function readBoundedResponseBody(
  response: Response,
  maximumBytes: number,
): Promise<Readonly<{ bytes: Uint8Array; contentLength: number; tooLarge: boolean }>> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // The response body may already be locked or closed.
    }
    return Object.freeze({ bytes: new Uint8Array(), contentLength: declaredLength, tooLarge: true });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maximumBytes
      ? Object.freeze({ bytes: bytes.slice(0, maximumBytes), contentLength: bytes.byteLength, tooLarge: true })
      : Object.freeze({ bytes, contentLength: bytes.byteLength, tooLarge: false });
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      if (total + value.byteLength > maximumBytes) {
        const remaining = Math.max(0, maximumBytes - total);
        if (remaining) chunks.push(value.slice(0, remaining));
        total += value.byteLength;
        await reader.cancel();
        return Object.freeze({
          bytes: combineChunks(chunks, Math.min(maximumBytes, chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))),
          contentLength: Math.max(total, declaredLength || 0),
          tooLarge: true,
        });
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The stream may already be released.
    }
  }

  return Object.freeze({
    bytes: combineChunks(chunks, total),
    contentLength: Math.max(total, declaredLength || 0),
    tooLarge: false,
  });
}

function combineChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
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
  let publisher = requestedUrl;
  try {
    publisher = new URL(requestedUrl).hostname;
  } catch {
    // Keep the original malformed value as the diagnostic publisher.
  }
  return Object.freeze({
    requestedUrl,
    finalUrl: requestedUrl,
    status: 0,
    contentType: "",
    title: "",
    publisher,
    text: "",
    fetchError,
    documentFormat: "unknown",
    extractionStatus: "unavailable",
    extractionReason: fetchError,
    contentLength: 0,
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
): Readonly<{
  document: ContentDocument;
  presentationStatus: "ready" | "conflict";
  presentationReasons: readonly string[];
}> {
  const reviewedAt = pack!.reviewedAt!;
  const date = reviewedAt.slice(0, 10);
  const verifiedSources = pack!.sources.filter((source) =>
    source.verified
    && source.claimVerificationStatus !== "failed"
    && source.provenance !== "search_candidate");
  const clean = removeGeneratedSourceSection(document);
  if (hasEditorialSourceSection(clean)) {
    return Object.freeze({
      document: clean,
      presentationStatus: "conflict",
      presentationReasons: Object.freeze([
        "사용자 또는 AI 편집 원고가 소유한 출처 섹션이 있어 시스템 출처 projection을 추가하지 않았습니다. 공개 HTML의 단일 출처 섹션과 canonical Evidence의 링크를 대조하세요.",
      ]),
    });
  }
  return Object.freeze({
    document: {
      ...clean,
      blocks: Object.freeze([
      ...clean.blocks,
      Object.freeze({ id: "approval-sources-heading", type: "heading" as const, ownership: "system_source_projection" as const, level: 2 as const, text: "공식 출처와 검토 기준" }),
      ...verifiedSources.map((source, index) => Object.freeze({
        id: `approval-source-link-${index + 1}`,
        type: "button" as const,
        ownership: "system_source_projection" as const,
        purpose: "source" as const,
        label: source.publisher && source.publisher !== source.title
          ? `${source.title} · ${source.publisher}`
          : source.title,
        targetUrl: source.canonicalUrl ?? source.url,
        target: "_blank" as const,
      })),
      Object.freeze({
        id: "approval-review-date",
        type: "paragraph" as const,
        ownership: "system_source_projection" as const,
        text: `출처 확인일: ${date} · Claim 최종 검토일: ${date}${pack!.informationAsOf ? ` · 정보 기준일: ${pack!.informationAsOf}` : ""}`,
      }),
      ]),
    },
    presentationStatus: "ready",
    presentationReasons: Object.freeze([]),
  });
}

function removeGeneratedSourceSection(document: ContentDocument): ContentDocument {
  const blocks = document.blocks.filter((block) =>
    contentBlockOwnership(block) !== "system_source_projection");
  return blocks.length === document.blocks.length
    ? document
    : { ...document, blocks: Object.freeze(blocks) };
}

function hasEditorialSourceSection(document: ContentDocument): boolean {
  return document.blocks.some((block) => {
    if (contentBlockOwnership(block) === "system_source_projection") return false;
    if (block.type === "button" && block.purpose === "source") return true;
    return block.type === "heading"
      && /^(?:공식\s*(?:확인처|출처|확인\s*자료)|출처|참고\s*자료)(?:\s|$|와|및|·)/u.test(block.text.trim());
  });
}

function siteIdentityTerms(
  data: UserData,
  project: UserData["projects"][number],
): readonly string[] {
  const brandName = project.brandId
    ? data.brands.find((brand) => brand.id === project.brandId && brand.workspaceId === project.workspaceId)?.name
    : undefined;
  const identity = brandName?.trim() || project.name.trim();
  return Object.freeze(identity ? [identity] : []);
}

const sourceFetchMaxAttempts = 3;
const sourceFetchMaxDelayMs = 2_000;
const sourceResponseMaxBytes = 1_500_000;
