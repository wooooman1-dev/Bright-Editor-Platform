import {
  approvalReadinessInspectionVersion,
  approvalSourceReviewPresentationText,
  canonicalizeApprovalEvidenceUrl,
  createNotRequiredApprovalEvidencePack,
  deriveApprovalReadinessReport,
  normalizeContentPurpose,
  resolveApprovalEvidenceRequirement,
  verifyApprovalEvidence,
  type ApprovalEvidencePack,
  type ApprovalEvidenceVerificationResult,
  type ApprovalPolicyProfileId,
  type SiteApprovalReadinessFetch,
  type SiteApprovalReadinessSnapshot,
  SiteApprovalReadinessAdapterRegistry,
} from "../../../core/approval";
import {
  editorialRevisionId,
  isStandardQualityApproved,
  standardQualityBlockingReasons,
  type QualityReport,
} from "../../../core/quality";
import type { PlatformConnection } from "../../../core/connections";
import { contentBlockOwnership, type ContentDocument } from "../../../core/content";
import { tistorySiteReadinessAdapter } from "../../../apps/tistory/approval/TistorySiteReadinessAudit";
import { wordpressSiteReadinessAdapter } from "../../../apps/wordpress/approval/WordPressSiteReadinessAudit";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { InternalLinkCatalogEvaluationService } from "../publishing/InternalLinkCatalogEvaluationService";
import { contentOwnedIdentityContamination } from "../publishing/ContentOwnedIdentityPolicy";
import type { ApprovalAwareContent } from "./ApprovalContentPolicy";
import { approvalReadinessExecutionIdentity } from "./ApprovalReadinessExecutionIdentity";
import { fetchApprovalSourcePages } from "./ApprovalSourceFetchService";

export { approvalReadinessExecutionIdentity } from "./ApprovalReadinessExecutionIdentity";

export type ApprovalReadinessExecutionResult = Readonly<{
  data: UserData;
  document: ContentDocument;
  quality: QualityReport;
  evidence: ApprovalEvidenceVerificationResult;
  siteReadiness: SiteApprovalReadinessSnapshot;
  /**
   * False when the run deliberately performed no inspection — currently only
   * the "Standard Quality has not been approved yet" path. Callers must not
   * record a completed inspection identity for such a result.
   */
  inspectionPerformed: boolean;
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
    forceRefresh?: boolean;
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
    if (!content.quality) {
      throw new Error("승인 준비 검사를 실행하려면 먼저 원고 품질 검토를 실행해야 합니다.");
    }
    /**
     * Standard Quality gates the expensive stages, not the user's view of the
     * other five states. Source fetches, a public site audit and a catalog
     * refresh would be wasted on a manuscript that is about to be rewritten, so
     * they are skipped — but the five checks are reported as `not_evaluated`
     * with that reason instead of throwing, which used to leave the previous
     * run's stale verdict on screen with no way to clear it.
     */
    // Evidence, public-site readiness, and the public-post catalog are
    // independent inspections. They run for the current editorial revision
    // even when Standard Quality is blocked. Standard Quality remains an
    // aggregate input and still prevents applicationReady.
    const executionIdentity = approvalReadinessExecutionIdentity(content, input.connection?.id);
    const evidenceRequirement = resolveApprovalEvidenceRequirement(content.opportunity);
    const evidenceApplicable = evidenceRequirement !== "not_required";

    /**
     * A matching execution identity means the expensive stages would produce
     * the same artefacts, so they are reused. The aggregate itself is never
     * reused: it is a pure function of those artefacts and costs nothing to
     * recompute, and returning the stored copy meant every rule fix silently
     * failed to reach articles that had already been inspected.
     */
    const cached = storedApprovalReadinessSnapshots(content, executionIdentity.key);
    if (cached && input.forceRefresh !== true) {
      return finalizeApprovalReadinessResult({
        data: input.data,
        content,
        document: cached.document,
        evidence: cached.evidence,
        siteReadiness: cached.siteReadiness,
        updatedAt: content.updatedAt,
      });
    }

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
    const candidateUrls = evidenceApplicable ? documentWithInternalLinks.metadata?.approvalEvidence?.sources
      .map((source) => canonicalizeApprovalEvidenceUrl(source.url))
      .filter(Boolean) ?? [] : [];
    const uniqueCandidateUrls = [...new Set(candidateUrls)];
    const sourcePages = await fetchApprovalSourcePages(uniqueCandidateUrls, this.fetcher);
    const evidence: ApprovalEvidenceVerificationResult = evidenceApplicable
      ? verifyApprovalEvidence(
          documentWithInternalLinks,
          aware.approvalProfileId as ApprovalPolicyProfileId,
          sourcePages,
          checkedAt,
        )
      : Object.freeze({
          pack: createNotRequiredApprovalEvidencePack(),
          verifiedSourceCount: 0,
          rejectedSourceCount: 0,
          reasons: Object.freeze([]),
        });
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
          version: approvalReadinessInspectionVersion,
          key: executionIdentity.key,
          editorialRevisionId: executionIdentity.editorialRevisionId,
          publishingContextKey: executionIdentity.publishingContextKey,
          evidenceFingerprint: executionIdentity.evidenceFingerprint,
          status: "completed",
          checkedAt,
        }),
      },
    };

    return finalizeApprovalReadinessResult({
      data: input.data,
      content,
      document: nextDocument,
      evidence: Object.freeze({ ...evidence, pack: stableEvidence }),
      siteReadiness,
      updatedAt: checkedAt,
    });
  }
}

/**
 * Builds the returned result from the inspection artefacts.
 *
 * Both the freshly inspected path and the cached path end here, so the stored
 * aggregate is always the aggregate today's rules produce for those artefacts,
 * and both persisted copies of it are written from the same object.
 */
function finalizeApprovalReadinessResult(input: Readonly<{
  data: UserData;
  content: UserContent;
  document: ContentDocument;
  evidence: ApprovalEvidenceVerificationResult;
  siteReadiness: SiteApprovalReadinessSnapshot;
  updatedAt: string;
}>): ApprovalReadinessExecutionResult {
  const approvalReadiness = deriveApprovalReadinessReport({
    document: input.document,
    ...(input.content.opportunity ? { opportunity: input.content.opportunity } : {}),
    standardQualityApproved: input.content.quality !== undefined
      && isStandardQualityApproved(input.content.quality),
    supersededQualityReview: input.content.quality?.reviewedRevisionId !== undefined
      && input.content.quality.reviewedRevisionId !== editorialRevisionId(input.document),
    standardQualityBlockingReasons: standardQualityBlockingReasons(input.content.quality),
  });
  const quality = Object.freeze({
    ...input.content.quality,
    ...(approvalReadiness ? { approvalReadiness } : {}),
  }) as QualityReport;

  return Object.freeze({
    data: withApprovalReadinessQuality(input.data, input.content, input.document, quality, input.updatedAt),
    document: input.document,
    quality,
    evidence: input.evidence,
    siteReadiness: input.siteReadiness,
    inspectionPerformed: true,
  });
}

/**
 * Result for a manuscript whose Standard Quality is not currently approved.
 *
 * Nothing is inspected and nothing is written to the document, so no inspection
 * identity is recorded. The aggregate is derived from the stored snapshots by
 * the same Core function the persistence boundary uses, so the answer the API
 * returns is the answer that gets saved.
 */
export function pendingStandardQualityResult(
  data: UserData,
  content: UserContent,
  document: ContentDocument,
): ApprovalReadinessExecutionResult {
  const approvalReadiness = deriveApprovalReadinessReport({
    document,
    ...(content.opportunity ? { opportunity: content.opportunity } : {}),
    standardQualityApproved: false,
    supersededQualityReview: content.quality?.reviewedRevisionId !== undefined
      && content.quality.reviewedRevisionId !== editorialRevisionId(document),
    standardQualityBlockingReasons: standardQualityBlockingReasons(content.quality),
  });
  const quality = Object.freeze({
    ...content.quality,
    ...(approvalReadiness ? { approvalReadiness } : {}),
  }) as QualityReport;
  const pack: ApprovalEvidencePack = document.metadata?.approvalEvidence
    ?? createNotRequiredApprovalEvidencePack();

  return Object.freeze({
    data: withApprovalReadinessQuality(data, content, document, quality, content.updatedAt),
    document,
    quality,
    evidence: Object.freeze({
      pack,
      verifiedSourceCount: 0,
      rejectedSourceCount: 0,
      reasons: Object.freeze(["기본 품질 승인 전이라 공식 출처를 다시 검사하지 않았습니다."]),
    }),
    siteReadiness: document.metadata?.siteApprovalReadiness
      ?? unavailableSiteSnapshot(content.updatedAt, "기본 품질 승인 전이라 공개 사이트를 검사하지 않았습니다."),
    inspectionPerformed: false,
  });
}

/**
 * Writes the quality report into both persisted locations from one object.
 *
 * `contents[].quality` is canonical and `qualityReports[]` mirrors it. Updating
 * only one of them is how the two copies previously came to disagree about the
 * same article.
 */
function withApprovalReadinessQuality(
  data: UserData,
  content: UserContent,
  document: ContentDocument,
  quality: QualityReport,
  updatedAt: string,
): UserData {
  const nextContent: UserContent = { ...content, document, quality, updatedAt };
  return {
    ...data,
    contents: data.contents.map((item) => item.id === content.id ? nextContent : item),
    qualityReports: [
      ...(data.qualityReports ?? []).filter((item) => item.contentId !== content.id),
      { contentId: content.id, report: quality },
    ],
  };
}

/**
 * Reusable inspection artefacts for a matching execution identity.
 *
 * Deliberately does not return the stored aggregate. The stored inspection
 * contract version must also match: artefacts gathered under an older contract
 * are not evidence that today's checks would pass.
 */
function storedApprovalReadinessSnapshots(
  content: UserContent,
  executionKey: string,
): Readonly<{
  document: ContentDocument;
  evidence: ApprovalEvidenceVerificationResult;
  siteReadiness: SiteApprovalReadinessSnapshot;
  checkedAt: string;
}> | undefined {
  const document = content.document;
  const execution = document?.metadata?.approvalReadinessExecution;
  const pack = document?.metadata?.approvalEvidence;
  const siteReadiness = document?.metadata?.siteApprovalReadiness;
  if (!document
    || !content.quality
    || !execution
    || execution.version !== approvalReadinessInspectionVersion
    || execution.key !== executionKey
    || !pack
    || !siteReadiness) return undefined;
  return Object.freeze({
    document,
    evidence: Object.freeze({
      pack,
      verifiedSourceCount: pack.sources.filter((source) => source.claimVerificationStatus === "verified" || source.verified).length,
      rejectedSourceCount: pack.sources.filter((source) => !source.verified && source.verificationStatus !== "excluded").length,
      reasons: Object.freeze([]),
    }),
    siteReadiness,
    checkedAt: execution.checkedAt,
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

function upsertVerifiedSourceSection(
  document: ContentDocument,
  pack: NonNullable<ContentDocument["metadata"]>["approvalEvidence"],
): Readonly<{
  document: ContentDocument;
  presentationStatus: "ready" | "conflict";
  presentationReasons: readonly string[];
}> {
  const reviewedAt = pack!.reviewedAt!;
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
        text: approvalSourceReviewPresentationText({
          sourceReviewedAt: reviewedAt,
          ...(pack!.informationAsOf ? { informationAsOf: pack!.informationAsOf } : {}),
        }),
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
