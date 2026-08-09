import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import {
  TistoryPostWorkflowError,
  type TistoryPostCatalogResult,
} from "../../../apps/tistory/workflows/TistoryPostReadWorkflow";
import {
  PublicPostCatalogError,
  publicPostCatalogErrorMessage,
} from "./PublicPostCatalogError";

export interface TistoryPostReader {
  readPosts(input: Readonly<{
    blogId: string;
    storageStatePath: string;
  }>): Promise<TistoryPostCatalogResult>;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class TistoryPostCatalogApplicationService {
  constructor(
    private readonly adapter: TistoryPostReader = new TistoryPublishingAdapter(),
    private readonly root = path.join(process.cwd(), ".bright-studio"),
    private readonly now = () => new Date(),
  ) {}

  async read(input: Readonly<{
    workspaceId: string;
    projectId: string;
    contentId: string;
    connection: PlatformConnection;
    selectedTarget: boolean;
    refresh?: boolean;
  }>): Promise<TistoryPostCatalogResult & { cached: boolean }> {
    try {
      if (!input.selectedTarget) {
        throw new PublicPostCatalogError({
          platform: "tistory",
          state: "permission_denied",
          message: "선택한 계정은 이 콘텐츠의 발행 대상이 아닙니다.",
        });
      }
      if (input.connection.platform !== "tistory") {
        throw new PublicPostCatalogError({
          platform: "tistory",
          state: "connection_error",
          message: "티스토리 계정이 필요합니다.",
        });
      }
      if (input.connection.publicMetadata.sessionStateAvailable !== true) {
        throw new PublicPostCatalogError({
          platform: "tistory",
          state: "session_expired",
          message: "티스토리 연결을 다시 확인해 주세요.",
          remediation: "설정의 플랫폼 연결에서 티스토리 계정을 다시 연결해 주세요.",
          reconnectRequired: true,
        });
      }

      try {
        new PublishingPermissionGate().authorize({
          ...input,
          platformConnectionId: input.connection.id,
          workflow: "post.read",
          finalConfirmation: false,
        }, input.connection);
      } catch (error) {
        throw new PublicPostCatalogError({
          platform: "tistory",
          state: "permission_denied",
          message: publicPostCatalogErrorMessage(error),
          remediation: "티스토리 연결 계정의 공개 글 조회 권한을 확인해 주세요.",
        });
      }

      const blogId = String(input.connection.publicMetadata.blogId ?? "");
      if (!blogId) {
        throw new PublicPostCatalogError({
          platform: "tistory",
          state: "connection_error",
          message: "티스토리 계정 정보가 올바르지 않습니다.",
        });
      }

      const cachePath = this.cachePath(input.workspaceId, input.connection.id);
      if (!input.refresh) {
        const cached = await readCache(cachePath);
        if (cached
          && cacheHasCanonicalCategoryMetadata(cached)
          && this.now().getTime() - Date.parse(cached.retrievedAt) < CACHE_TTL_MS) {
          return { ...cached, cached: true };
        }
      }

      const result = await this.adapter.readPosts({
        blogId,
        storageStatePath: path.join(
          this.root,
          "connections",
          "tistory",
          input.connection.id,
          "storage-state.json",
        ),
      });
      const normalized = {
        ...result,
        posts: result.posts.map((post) => ({
          ...post,
          publishingAccountId: input.connection.id,
        })),
      };
      await mkdir(path.dirname(cachePath), { recursive: true });
      await writeFile(cachePath, JSON.stringify(normalized), "utf8");
      return { ...normalized, cached: false };
    } catch (error) {
      if (error instanceof PublicPostCatalogError) throw error;
      if (error instanceof TistoryPostWorkflowError) {
        throw new PublicPostCatalogError({
          platform: "tistory",
          state: error.code,
          message: error.message,
          remediation: error.remediation,
          reconnectRequired: error.code === "session_expired",
        });
      }
      throw new PublicPostCatalogError({
        platform: "tistory",
        state: "connection_error",
        message: publicPostCatalogErrorMessage(error),
        remediation: "티스토리 연결 상태를 확인한 뒤 다시 시도해 주세요.",
      });
    }
  }

  private cachePath(workspaceId: string, connectionId: string): string {
    return path.join(
      this.root,
      "cache",
      "tistory-posts",
      safe(workspaceId),
      `${safe(connectionId)}.json`,
    );
  }
}

async function readCache(file: string): Promise<TistoryPostCatalogResult | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as TistoryPostCatalogResult;
  } catch {
    return undefined;
  }
}

function cacheHasCanonicalCategoryMetadata(cache: TistoryPostCatalogResult): boolean {
  if (cache.posts.length === 0) return true;
  const hasCategoryMetadata = cache.posts.some((post) => Boolean(
    post.categoryId || post.categoryName,
  ));
  return hasCategoryMetadata && cache.posts.every((post) =>
    !post.categoryName || /^\d+$/.test(post.categoryId ?? ""));
}

function safe(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
