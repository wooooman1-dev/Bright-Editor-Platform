import type { PlatformConnection } from "../../../core/connections";
import type { PublicPostCandidate } from "../../../core/content";
import type { UserContent } from "../../user-flow/user-data";
import { TistoryPostCatalogApplicationService } from "./TistoryPostCatalogApplicationService";
import {
  WordPressPostCatalogApplicationService,
} from "./WordPressPostCatalogApplicationService";
import { publishingCategoryIdentities } from "./InternalLinkCatalogPolicy";

export type PublicPostCatalogResult = Readonly<{
  platform: "tistory" | "wordpress";
  platformConnectionId: string;
  state: string;
  posts: readonly PublicPostCandidate[];
  retrievedAt: string;
  cached: boolean;
  diagnostic?: string;
  warnings?: readonly string[];
}>;

export class PublicPostCatalogApplicationService {
  constructor(
    private readonly tistory = new TistoryPostCatalogApplicationService(),
    private readonly wordpress = new WordPressPostCatalogApplicationService(),
  ) {}

  async read(input: Readonly<{
    workspaceId: string;
    projectId: string;
    contentId: string;
    content: UserContent;
    connection: PlatformConnection;
    selectedTarget: boolean;
    refresh?: boolean;
  }>): Promise<PublicPostCatalogResult> {
    if (input.connection.platform === "tistory") {
      const result = await this.tistory.read({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        contentId: input.contentId,
        connection: input.connection,
        selectedTarget: input.selectedTarget,
        refresh: input.refresh,
      });
      return Object.freeze({
        ...result,
        platform: "tistory",
        platformConnectionId: input.connection.id,
        posts: Object.freeze([...result.posts]),
      });
    }

    const selectedCategories = publishingCategoryIdentities(input.content)
      .flatMap((category) => {
        const id = category.id?.trim();
        if (!id) return [];
        return [Object.freeze({ id, name: category.name?.trim() || id })];
      });
    return this.wordpress.read({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      contentId: input.contentId,
      connection: input.connection,
      selectedTarget: input.selectedTarget,
      selectedCategories,
      refresh: input.refresh,
    });
  }
}
