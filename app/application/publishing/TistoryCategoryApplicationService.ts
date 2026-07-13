import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import type { TistoryCategoryResult } from "../../../apps/tistory/workflows/TistoryCategoryReadWorkflow";

export interface TistoryCategoryReader { readCategories(input: Readonly<{ blogId: string; storageStatePath: string }>): Promise<TistoryCategoryResult>; }

export class TistoryCategoryApplicationService {
  constructor(private readonly adapter: TistoryCategoryReader = new TistoryPublishingAdapter(), private readonly root = path.join(process.cwd(), ".bright-studio")) {}
  async read(input: Readonly<{ workspaceId: string; projectId: string; contentId: string; connection: PlatformConnection; selectedTarget: boolean }>): Promise<TistoryCategoryResult> {
    if (!input.selectedTarget) throw new Error("선택한 계정은 이 콘텐츠의 발행 대상이 아닙니다.");
    if (input.connection.platform !== "tistory") throw new Error("Tistory 계정이 필요합니다.");
    if (input.connection.publicMetadata.sessionStateAvailable !== true) throw new Error("재연결 필요");
    new PublishingPermissionGate().authorize({ ...input, platformConnectionId: input.connection.id, workflow: "category.read", finalConfirmation: false }, input.connection);
    const blogId = String(input.connection.publicMetadata.blogId ?? "");
    if (!blogId) throw new Error("Tistory 계정 정보가 올바르지 않습니다. 다시 연결해 주세요.");
    return this.adapter.readCategories({ blogId, storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json") });
  }
}
