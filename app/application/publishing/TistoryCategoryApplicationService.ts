import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import type { TistoryCategoryResult } from "../../../apps/tistory/workflows/TistoryCategoryReadWorkflow";
import { TistoryCategoryWorkflowError } from "../../../apps/tistory/workflows/TistoryCategoryReadWorkflow";
import { JsonFileSnapshotDriver } from "../JsonFileSnapshotDriver";

export interface TistoryCategoryReader { readCategories(input: Readonly<{ blogId: string; storageStatePath: string }>): Promise<TistoryCategoryResult>; }

export class TistoryCategoryApplicationService {
  constructor(private readonly adapter: TistoryCategoryReader = new TistoryPublishingAdapter(), private readonly root = path.join(process.cwd(), ".bright-studio")) {}
  async read(input: Readonly<{ workspaceId: string; projectId: string; contentId: string; connection: PlatformConnection; selectedTarget: boolean }>): Promise<TistoryCategoryResult & { cached: boolean; stale?: boolean; failureCode?: string }> {
    if (!input.selectedTarget) throw new Error("선택한 계정은 이 콘텐츠의 발행 대상이 아닙니다.");
    if (input.connection.platform !== "tistory") throw new Error("Tistory 계정이 필요합니다.");
    if (input.connection.publicMetadata.sessionStateAvailable !== true) throw new Error("재연결 필요");
    new PublishingPermissionGate().authorize({ ...input, platformConnectionId: input.connection.id, workflow: "category.read", finalConfirmation: false }, input.connection);
    const blogId = String(input.connection.publicMetadata.blogId ?? "");
    if (!blogId) throw new Error("Tistory 계정 정보가 올바르지 않습니다. 다시 연결해 주세요.");
    const cache = new JsonFileSnapshotDriver(this.cachePath(input.workspaceId, input.connection.id));
    try {
      const result = await this.adapter.readCategories({ blogId, storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json") });
      const envelope = { workspaceId: input.workspaceId, connectionId: input.connection.id, result };
      try { await cache.write({ categories: { current: envelope } }); }
      catch (error) { console.error("[tistory-category] cache write failed", { operation: "write", code: fileErrorCode(error) }); }
      return { ...result, cached: false };
    } catch (error) {
      if (error instanceof TistoryCategoryWorkflowError && error.code === "session_expired") throw error;
      const cached = await readCache(cache, input.workspaceId, input.connection.id);
      if (!cached) throw error;
      return { ...cached, cached: true, stale: true, failureCode: categoryFailureCode(error) };
    }
  }
  private cachePath(workspaceId: string, connectionId: string) { return path.join(this.root, "cache", "tistory-categories", safe(workspaceId), `${safe(connectionId)}.json`); }
}

type CategoryCache = Readonly<{ workspaceId: string; connectionId: string; result: TistoryCategoryResult }>;
async function readCache(driver: JsonFileSnapshotDriver, workspaceId: string, connectionId: string): Promise<TistoryCategoryResult | undefined> {
  try {
    const snapshot = await driver.read();
    const cached = snapshot?.categories?.current as CategoryCache | undefined;
    if (!cached || cached.workspaceId !== workspaceId || cached.connectionId !== connectionId || !cached.result.retrievedAt || !Array.isArray(cached.result.categories)) return undefined;
    return cached.result;
  } catch { return undefined; }
}
function categoryFailureCode(error: unknown): string {
  if (error instanceof TistoryCategoryWorkflowError) return error.code === "worker_not_registered" || error.code === "browser_launch_failed" ? "worker_unavailable" : error.code;
  const message = error instanceof Error ? error.message : "";
  return /permission|allow|허용|권한/i.test(message) ? "permission_denied" : "unknown_error";
}
function fileErrorCode(error: unknown) { const match = error instanceof Error ? error.message.match(/\(([^ ]+) during/) : undefined; return match?.[1] ?? "UNKNOWN"; }
function safe(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, "_"); }
