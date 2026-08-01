import type { ContentDocument } from "../../../core/content";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { internalLinkCatalogContextKey } from "./InternalLinkCatalogPolicy";

/**
 * Publishing account and Category state live outside ContentDocument while
 * internal-link placement and Quality are derived from that state. Invalidate
 * only those derived projections when the external publishing context changes.
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
  const hasBoundDerivedState = before.document?.metadata?.internalLinkCatalogStatus !== undefined
    || before.document?.metadata?.internalLinkCatalogContextKey !== undefined;
  return hasBoundDerivedState
    ? invalidatePublishingContextDependentState(next, contentId, updatedAt)
    : next;
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
        quality: undefined,
        status: document ? "in_review" : content.status,
        updatedAt,
      };
    }),
    qualityReports: Object.freeze((data.qualityReports ?? [])
      .filter((entry) => entry.contentId !== contentId)),
  };
}

export function invalidatePublishingContextDocument(
  document: ContentDocument,
  updatedAt: string,
): ContentDocument {
  const blocks = Object.freeze(document.blocks.filter((block) =>
    !(block.type === "button"
      && (block.purpose === "internal_link" || block.purpose === "related_post"))));
  if (!document.metadata) return { ...document, blocks };

  const metadata = { ...document.metadata };
  delete metadata.availableRelatedContentCandidates;
  delete metadata.internalLinkCatalogStatus;
  delete metadata.internalLinkCatalogContextKey;
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
