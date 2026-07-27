import {
  canonicalizeApprovalEvidenceUrl,
  normalizeContentPurpose,
  verifyApprovalEvidence,
  type ApprovalEvidenceVerificationResult,
  type ApprovalPolicyProfileId,
  type ApprovalSourcePage,
  type SiteApprovalReadinessSnapshot,
} from "../../../core/approval";
import {
  contentRevisionId,
  isStandardQualityApproved,
  QualityEngine,
  type QualityReport,
} from "../../../core/quality";
import type { PlatformConnection } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import { auditTistorySiteReadiness } from "../../../apps/tistory/approval/TistorySiteReadinessAudit";
import { resolveProjectStrategy, type UserContent, type UserData } from "../../user-flow/user-data";
import type { ApprovalAwareContent } from "./ApprovalContentPolicy";

export type ApprovalReadinessExecutionResult = Readonly<{
  data: UserData;
  document: ContentDocument;
  quality: QualityReport;
  evidence: ApprovalEvidenceVerificationResult;
  siteReadiness: SiteApprovalReadinessSnapshot;
}>;

export type ApprovalReadinessFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Runs the deterministic approval checks that can be observed now.
 *
 * This service does not add an AI call. It verifies official source pages,
 * compares canonical facts with those pages, audits the public Tistory site,
 * persists the resulting snapshots, and recomputes the current Quality report.
 */
export class ApprovalReadinessApplicationService {
  constructor(
    private readonly fetcher: ApprovalReadinessFetch = fetch,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async execute(input: Readonly<{
    data: UserData;
    contentId: string;
    connection?: PlatformConnection;
  }>): Promise<ApprovalReadinessExecutionResult> {
    const content = input.data.contents.find((item) => item.id === input.contentId);
    if (!content?.document) throw new Error("승인 준비 검사를 실행할 canonical 원고가 없습니다.");

    const aware = content as ApprovalAwareContent;
    if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval") {
      throw new Error("애드센스 승인 준비 콘텐츠에서만 승인 준비 검사를 실행할 수 있습니다.");
    }
    if (!aware.approvalProfileId) throw new Error("승인 준비 정책 프로필이 없습니다.");

    const project = input.data.projects.find((item) => item.id === content.projectId && item.workspaceId === content.workspaceId);
    if (!project) throw new Error("승인 준비 검사 대상 Project를 찾을 수 없습니다.");

    const checkedAt = this.now();
    const candidateUrls = content.document.metadata?.approvalEvidence?.sources
      .map((source) => canonicalizeApprovalEvidenceUrl(source.url))
      .filter(Boolean) ?? [];
    const uniqueCandidateUrls = [...new Set(candidateUrls)];
    const sourcePages = await Promise.all(
      uniqueCandidateUrls.map((url) => fetchApprovalSourcePage(url, this.fetcher)),
    );
    const evidence = verifyApprovalEvidence(
      content.document,
      aware.approvalProfileId as ApprovalPolicyProfileId,
      sourcePages.filter((page): page is ApprovalSourcePage => Boolean(page)),
      checkedAt,
    );
    const stableEvidence = evidence.pack;

    const siteReadiness = await resolveSiteReadiness({
      connection: input.connection,
      checkedAt,
      expectedTerms: siteIdentityTerms(input.data, project, content),
      fetcher: this.fetcher,
    });

    const documentWithSnapshots: ContentDocument = {
      ...content.document,
      metadata: {
        ...content.document.metadata!,
        updatedAt: checkedAt,
        approvalEvidence: stableEvidence,
        siteApprovalReadiness: siteReadiness,
      },
    };
    const nextDocument = stableEvidence.status === "verified" && stableEvidence.reviewedAt
      ? upsertVerifiedSourceSection(documentWithSnapshots, stableEvidence)
      : removeGeneratedSourceSection(documentWithSnapshots);

    const revisionId = contentRevisionId(nextDocument);
    const quality = new QualityEngine().review(nextDocument, {
      contentType: content.contentType,
      platform: content.platform ?? "tistory",
      primaryKeyword: content.primaryKeyword,
      searchIntent: content.searchIntent,
      categoryName: content.publishingPreparation?.tistory?.platformCategoryName ?? undefined,
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
}>): Promise<SiteApprovalReadinessSnapshot> {
  if (!input.connection) return unavailableSiteSnapshot(input.checkedAt, "발행 계정이 선택되지 않아 공개 사이트를 검사하지 못했습니다.");
  if (input.connection.platform !== "tistory") {
    return unavailableSiteSnapshot(input.checkedAt, "현재 구현에서는 Tistory 공개 사이트 검사를 지원합니다. WordPress 검사는 플랫폼 Adapter 단계에서 추가해야 합니다.");
  }
  const blogUrl = typeof input.connection.publicMetadata.blogUrl === "string"
    ? input.connection.publicMetadata.blogUrl.trim()
    : "";
  if (!blogUrl) return unavailableSiteSnapshot(input.checkedAt, "Tistory 공개 블로그 주소가 연결 정보에 없습니다.");

  return auditTistorySiteReadiness({
    blogUrl,
    checkedAt: input.checkedAt,
    expectedTerms: input.expectedTerms,
    fetcher: input.fetcher,
  });
}

function unavailableSiteSnapshot(checkedAt: string, message: string): SiteApprovalReadinessSnapshot {
  return Object.freeze({
    version: "1.0",
    status: "needs_review",
    checkedAt,
    checks: Object.freeze([Object.freeze({ key: "public_site", passed: false, message })]),
  });
}

async function fetchApprovalSourcePage(
  requestedUrl: string,
  fetcher: ApprovalReadinessFetch,
  timeoutMs = 12_000,
): Promise<ApprovalSourcePage | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(requestedUrl, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/pdf",
        "User-Agent": "BrightStudioEvidenceVerifier/1.0",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const html = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType)
      ? (await response.text()).slice(0, 1_500_000)
      : "";
    const finalUrl = response.url || requestedUrl;
    return Object.freeze({
      requestedUrl,
      finalUrl,
      status: response.status,
      contentType,
      title: extractFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
      publisher: extractPublisher(html, finalUrl),
      text: htmlToText(html),
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
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

const generatedSourceBlockIds = new Set([
  "approval-sources-heading",
  "approval-sources-summary",
  "approval-review-date",
]);
