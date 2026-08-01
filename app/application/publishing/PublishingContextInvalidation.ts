import { contentBlockOwnership, type ContentDocument } from "../../../core/content";
import type { QualityReport } from "../../../core/quality";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { internalLinkCatalogContextKey } from "./InternalLinkCatalogPolicy";

/**
 * Publishing account and Category state live outside ContentDocument. Only
 * publishing-context projections are invalidated; the editorial manuscript,
 * Standard Quality, Evidence, duplicate result, and manual links are durable.
 */
export function invalidatePublishingContextDependentStateIfChanged(
  before: UserContent,
  next: UserData,
  contentId: string,
  updatedAt: string,
): UserData {
  const after = next.contents.find((content) => content.id === contentId);
  if (!after) throw new Error("발행 문맥 변경 대상 콘텐츠를 찾을 수 없습니다.");
  if (internalLinkCatalogContextKey(before) === internalLinkCatalogContextKey(after)) {
    return next;
  }
  return invalidatePublishingContextDependentState(next, contentId, updatedAt);
}

export function invalidatePublishingContextDependentState(
  data: UserData,
  contentId: string,
  updatedAt: string,
): UserData {
  return {
    ...data,
    contents: data.contents.map((content) => {
      if (content.id !== contentId) return content;
      const document = content.document
        ? invalidatePublishingContextDocument(content.document, updatedAt)
        : undefined;
      return {
        ...content,
        ...(document ? { document } : {}),
        ...(content.quality ? { quality: withoutApprovalReadiness(content.quality) } : {}),
        updatedAt,
      };
    }),
    qualityReports: Object.freeze((data.qualityReports ?? []).map((entry) =>
      entry.contentId === contentId
        ? Object.freeze({ ...entry, report: withoutApprovalReadiness(entry.report) })
        : entry)),
  };
}

export function invalidatePublishingContextDocument(
  document: ContentDocument,
  updatedAt: string,
): ContentDocument {
  const blocks = Object.freeze(document.blocks.filter((block) =>
    contentBlockOwnership(block) !== "system_catalog"));
  if (!document.metadata) return { ...document, blocks };

  const metadata = { ...document.metadata };
  delete metadata.availableRelatedContentCandidates;
  delete metadata.internalLinkCatalogStatus;
  delete metadata.internalLinkCatalogContextKey;
  delete metadata.siteApprovalReadiness;
  delete metadata.approvalReadinessExecution;
  return {
    ...document,
    blocks,
    metadata: {
      ...metadata,
      updatedAt,
      buttonCount: blocks.filter((block) => block.type === "button").length,
    },
  };
}

function withoutApprovalReadiness(report: QualityReport): QualityReport {
  if (!("approvalReadiness" in report)) return report;
  const result = { ...report } as QualityReport & { approvalReadiness?: unknown };
  delete result.approvalReadiness;
  return Object.freeze(result);
}
