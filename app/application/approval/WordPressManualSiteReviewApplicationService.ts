import type { PlatformConnection } from "../../../core/connections";
import {
  normalizeContentPurpose,
  type ApprovalEvidenceVerificationResult,
  type SiteApprovalReadinessSnapshot,
} from "../../../core/approval";
import type { ContentDocument } from "../../../core/content";
import {
  contentRevisionId,
  isStandardQualityApproved,
  QualityEngine,
  type QualityReport,
} from "../../../core/quality";
import {
  mergeWordPressManualReviewsAfterAudit,
  updateWordPressManualReview,
  type WordPressManualSiteReviewKey,
} from "../../../apps/wordpress/approval/WordPressManualSiteReview";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { publishingCategoryNames } from "../publishing/InternalLinkCatalogPolicy";
import type { ApprovalReadinessExecutionResult } from "./ApprovalReadinessApplicationService";
import type { ApprovalAwareContent } from "./ApprovalContentPolicy";

export class WordPressManualSiteReviewApplicationService {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  preserveAfterAudit(input: Readonly<{
    previousData: UserData;
    contentId: string;
    connection: PlatformConnection;
    result: ApprovalReadinessExecutionResult;
  }>): ApprovalReadinessExecutionResult {
    if (input.connection.platform !== "wordpress") return input.result;
    const previousContent = input.previousData.contents.find(
      (item) => item.id === input.contentId,
    );
    const previousSnapshot =
      previousContent?.document?.metadata?.siteApprovalReadiness;
    const merged = mergeWordPressManualReviewsAfterAudit(
      previousSnapshot,
      input.result.siteReadiness,
      input.connection,
    );
    return finalizeResult({
      data: input.result.data,
      contentId: input.contentId,
      connection: input.connection,
      document: {
        ...input.result.document,
        metadata: {
          ...input.result.document.metadata!,
          siteApprovalReadiness: merged,
        },
      },
      siteReadiness: merged,
      evidence: input.result.evidence,
      checkedAt: input.result.quality.reviewedAt,
    });
  }

  execute(input: Readonly<{
    data: UserData;
    contentId: string;
    connection: PlatformConnection;
    key: WordPressManualSiteReviewKey;
    completed: boolean;
  }>): ApprovalReadinessExecutionResult {
    const content = input.data.contents.find((item) => item.id === input.contentId);
    if (!content?.document) {
      throw new Error("수동 사이트 검토를 저장할 canonical 원고가 없습니다.");
    }
    const aware = content as ApprovalAwareContent;
    if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval") {
      throw new Error("애드센스 승인 준비 콘텐츠에서만 수동 사이트 검토를 저장할 수 있습니다.");
    }
    if (input.connection.platform !== "wordpress") {
      throw new Error("WordPress 사이트 수동 검토는 WordPress 연결에서만 저장할 수 있습니다.");
    }

    const checkedAt = this.now();
    const siteReadiness = updateWordPressManualReview(
      content.document.metadata?.siteApprovalReadiness,
      input.connection,
      input.key,
      input.completed,
      checkedAt,
    );
    const document: ContentDocument = {
      ...content.document,
      metadata: {
        ...content.document.metadata!,
        updatedAt: checkedAt,
        siteApprovalReadiness: siteReadiness,
      },
    };
    const evidence = existingEvidenceResult(document);
    return finalizeResult({
      data: input.data,
      contentId: input.contentId,
      connection: input.connection,
      document,
      siteReadiness,
      evidence,
      checkedAt,
    });
  }
}

function finalizeResult(input: Readonly<{
  data: UserData;
  contentId?: string;
  connection: PlatformConnection;
  document: ContentDocument;
  siteReadiness: SiteApprovalReadinessSnapshot;
  evidence: ApprovalEvidenceVerificationResult;
  checkedAt: string;
}>): ApprovalReadinessExecutionResult {
  const content = input.contentId
    ? input.data.contents.find((item) => item.id === input.contentId)
    : input.data.contents.find((item) => item.document?.id === input.document.id);
  if (!content) throw new Error("승인 준비 상태를 저장할 Content를 찾지 못했습니다.");

  const revisionId = contentRevisionId(input.document);
  const categoryNames = publishingCategoryNames(content);
  const quality = new QualityEngine().review(input.document, {
    contentType: content.contentType,
    platform: content.platform ?? input.connection.platform,
    primaryKeyword: content.primaryKeyword,
    searchIntent: content.searchIntent,
    categoryName: categoryNames.length ? categoryNames.join(", ") : undefined,
    availableInternalLinkCandidates:
      input.document.metadata?.availableRelatedContentCandidates,
    internalLinkCatalogStatus: input.document.metadata?.internalLinkCatalogStatus,
    qualityTarget:
      content.qualityTarget
      ?? content.opportunity?.qualityTarget
      ?? input.document.metadata?.qualityTarget,
    opportunity: content.opportunity,
    revisionId,
    reviewedAt: input.checkedAt,
  });

  const nextContent: UserContent = {
    ...content,
    document: input.document,
    quality,
    status: isStandardQualityApproved(quality) ? "ready" : "in_review",
    updatedAt: input.checkedAt,
  };
  const nextData: UserData = {
    ...input.data,
    contents: input.data.contents.map((item) =>
      item.id === content.id ? nextContent : item),
    qualityReports: [
      ...(input.data.qualityReports ?? [])
        .filter((item) => item.contentId !== content.id),
      { contentId: content.id, report: quality },
    ],
  };

  return Object.freeze({
    data: nextData,
    document: input.document,
    quality,
    evidence: input.evidence,
    siteReadiness: input.siteReadiness,
  });
}

function existingEvidenceResult(
  document: ContentDocument,
): ApprovalEvidenceVerificationResult {
  const pack = document.metadata?.approvalEvidence;
  if (!pack) throw new Error("현재 Revision의 공식 출처 검사 결과가 없습니다.");
  const verifiedSourceCount = pack.sources.filter((source) => source.verified).length;
  const rejectedSourceCount = pack.sources.length - verifiedSourceCount;
  return Object.freeze({
    pack,
    verifiedSourceCount,
    rejectedSourceCount,
    reasons: Object.freeze(
      pack.sources.flatMap((source) =>
        source.failureReason ? [source.failureReason] : []),
    ),
  });
}
