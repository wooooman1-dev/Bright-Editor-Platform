import type { PlatformConnection } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import type { UserContent } from "../../user-flow/user-data";
import {
  applyInternalLinkCatalogResult,
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
    refresh?: boolean;
  }>): Promise<ContentDocument> {
    if (input.document.metadata?.internalLinkCatalogStatus === "evaluated"
      && input.refresh !== true) {
      return input.document;
    }
    if (!publishingCategoryIdentities(input.content).length) {
      return applyInternalLinkCatalogResult(input.document, [], "category_missing");
    }
    if (!input.connection) {
      return applyInternalLinkCatalogResult(input.document, [], "catalog_unavailable");
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
      return applyInternalLinkCatalogResult(input.document, [], "catalog_unavailable");
    }
  }
}
