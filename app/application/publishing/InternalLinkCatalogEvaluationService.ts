import type { PlatformConnection } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import type { UserContent } from "../../user-flow/user-data";
import {
  applyInternalLinkCatalogResult,
  internalLinkCatalogContextIsCurrent,
  internalLinkCatalogContextKey,
  publishingCategoryIdentities,
  rankPublishingPostCandidates,
} from "./InternalLinkCatalogPolicy";
import { PublicPostCatalogApplicationService } from "./PublicPostCatalogApplicationService";

export type PublicPostCatalogReader = Pick<PublicPostCatalogApplicationService, "read">;

export class InternalLinkCatalogEvaluationService {
  constructor(
    private readonly catalog: PublicPostCatalogReader = new PublicPostCatalogApplicationService(),
  ) {}

  async evaluate(input: Readonly<{
    workspaceId: string;
    projectId: string;
    content: UserContent;
    document: ContentDocument;
    connection?: PlatformConnection;
    selectedTarget: boolean;
    /** Posts this manuscript is already published to, so it never links to itself. */
    ownExternalPostIds: readonly string[];
    refresh?: boolean;
  }>): Promise<ContentDocument> {
    const contextKey = internalLinkCatalogContextKey(input.content, input.connection?.id);
    if (input.refresh !== true
      && input.document.metadata?.internalLinkCatalogStatus === "evaluated"
      && internalLinkCatalogContextIsCurrent(
        input.content,
        input.document,
        input.connection?.id,
      )) {
      return input.document;
    }
    if (!publishingCategoryIdentities(input.content).length) {
      return applyInternalLinkCatalogResult(
        input.document,
        [],
        "category_missing",
        contextKey,
      );
    }
    if (!input.connection) {
      return applyInternalLinkCatalogResult(
        input.document,
        [],
        "catalog_unavailable",
        contextKey,
      );
    }

    try {
      const catalog = await this.catalog.read({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        contentId: input.content.id,
        content: input.content,
        connection: input.connection,
        selectedTarget: input.selectedTarget,
        refresh: input.refresh,
      });
      const ranked = rankPublishingPostCandidates(
        input.document,
        catalog.posts,
        input.content,
        input.ownExternalPostIds,
      );
      return applyInternalLinkCatalogResult(
        input.document,
        ranked,
        "evaluated",
        contextKey,
      );
    } catch {
      return applyInternalLinkCatalogResult(
        input.document,
        [],
        "catalog_unavailable",
        contextKey,
      );
    }
  }
}
