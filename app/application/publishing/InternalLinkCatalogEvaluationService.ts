import type { PlatformConnection } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import type { UserContent } from "../../user-flow/user-data";
import {
  applyInternalLinkCatalogResult,
  publishingCategoryIdentities,
  rankPublishingPostCandidates,
  withInternalLinkCatalogMetadata,
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
    refresh?: boolean;
  }>): Promise<ContentDocument> {
    if (input.document.metadata?.internalLinkCatalogStatus === "evaluated") {
      return input.document;
    }
    if (!publishingCategoryIdentities(input.content).length) {
      return withInternalLinkCatalogMetadata(input.document, 0, "category_missing");
    }
    if (!input.connection) {
      return withInternalLinkCatalogMetadata(input.document, 0, "catalog_unavailable");
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
      const ranked = rankPublishingPostCandidates(input.document, catalog.posts, input.content);
      return applyInternalLinkCatalogResult(input.document, ranked, "evaluated");
    } catch {
      return withInternalLinkCatalogMetadata(input.document, 0, "catalog_unavailable");
    }
  }
}
