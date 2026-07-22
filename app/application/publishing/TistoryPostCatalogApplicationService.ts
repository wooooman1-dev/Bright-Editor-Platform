import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import type { TistoryPostCatalogResult } from "../../../apps/tistory/workflows/TistoryPostReadWorkflow";

export interface TistoryPostReader { readPosts(input: Readonly<{ blogId: string; storageStatePath: string }>): Promise<TistoryPostCatalogResult>; }
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export class TistoryPostCatalogApplicationService {
  constructor(private readonly adapter: TistoryPostReader = new TistoryPublishingAdapter(), private readonly root = path.join(process.cwd(), ".bright-studio"), private readonly now = () => new Date()) {}
  async read(input: Readonly<{ workspaceId: string; projectId: string; contentId: string; connection: PlatformConnection; selectedTarget: boolean; refresh?: boolean }>): Promise<TistoryPostCatalogResult & { cached: boolean }> {
    if (!input.selectedTarget) throw new Error("선택한 계정은 이 콘텐츠의 발행 대상이 아닙니다.");
    if (input.connection.platform !== "tistory") throw new Error("Tistory 계정이 필요합니다.");
    if (input.connection.publicMetadata.sessionStateAvailable !== true) throw new Error("재연결 필요");
    new PublishingPermissionGate().authorize({ ...input, platformConnectionId: input.connection.id, workflow: "post.read", finalConfirmation: false }, input.connection);
    const blogId = String(input.connection.publicMetadata.blogId ?? ""); if (!blogId) throw new Error("Tistory 계정 정보가 올바르지 않습니다.");
    const cachePath = this.cachePath(input.workspaceId, input.connection.id);
    if (!input.refresh) { const cached = await readCache(cachePath); if (cached && cacheHasCanonicalCategoryMetadata(cached) && this.now().getTime() - Date.parse(cached.retrievedAt) < CACHE_TTL_MS) return { ...cached, cached: true }; }
    const result = await this.adapter.readPosts({ blogId, storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json") });
    const normalized = { ...result, posts: result.posts.map((post) => ({ ...post, publishingAccountId: input.connection.id })) };
    await mkdir(path.dirname(cachePath), { recursive: true }); await writeFile(cachePath, JSON.stringify(normalized), "utf8");
    return { ...normalized, cached: false };
  }
  private cachePath(workspaceId: string, connectionId: string) { return path.join(this.root, "cache", "tistory-posts", safe(workspaceId), `${safe(connectionId)}.json`); }
}
async function readCache(file: string): Promise<TistoryPostCatalogResult | undefined> { try { return JSON.parse(await readFile(file, "utf8")) as TistoryPostCatalogResult; } catch { return undefined; } }
function cacheHasCanonicalCategoryMetadata(cache: TistoryPostCatalogResult) {
  if (cache.posts.length === 0) return true;
  const hasCategoryMetadata = cache.posts.some((post) => Boolean(post.categoryId || post.categoryName));
  return hasCategoryMetadata && cache.posts.every((post) => !post.categoryName || /^\d+$/.test(post.categoryId ?? ""));
}
function safe(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, "_"); }
