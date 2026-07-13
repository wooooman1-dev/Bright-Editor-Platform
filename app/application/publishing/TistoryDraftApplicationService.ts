import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { PlatformConnection } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryHtmlRenderer } from "../../../apps/tistory/publishing/TistoryHtmlRenderer";
import type { TistoryDraftSaveResult } from "../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

export type TistoryDraftExecution = Readonly<{ workspaceId: string; projectId: string; contentId: string; connection: PlatformConnection; document: ContentDocument; finalConfirmation: boolean; selectedTarget: boolean; categoryId?: string | null }>;
export type PublishingAuditRecord = Readonly<{ operationId: string; workspaceId: string; projectId: string; contentId: string; platformConnectionId: string; platform: "tistory"; workflow: "draft.create"; requiredPermission: "draft.create"; initiatedBy: "user"; confirmationState: "confirmed" | "missing"; startedAt: string; completedAt: string; result: TistoryDraftSaveResult["status"]; safeErrorCode?: string }>;
export interface PublishingAuditRepository { save(record: PublishingAuditRecord): Promise<void>; }

export class TistoryDraftApplicationService {
  constructor(private readonly audits: PublishingAuditRepository, private readonly root = path.join(process.cwd(), ".bright-studio"), private readonly now = () => new Date(), private readonly executeWorker = runWorker) {}
  async execute(input: TistoryDraftExecution): Promise<TistoryDraftSaveResult> {
    const operationId = randomUUID(), startedAt = this.now().toISOString(); let result: TistoryDraftSaveResult;
    try {
      if (!input.selectedTarget) throw new Error("The selected account is not a Project publishing target.");
      if (input.connection.platform !== "tistory") throw new Error("A Tistory publishing account is required.");
      new PublishingPermissionGate().authorize({ ...input, platformConnectionId: input.connection.id, workflow: "draft.create" }, input.connection);
      if (input.connection.publicMetadata.sessionStateAvailable !== true) throw new Error("A stored Tistory session is required. Reconnect the account.");
      new PublishingPermissionGate().authorize({ ...input, platformConnectionId: input.connection.id, workflow: "category.select" }, input.connection);
      result = await this.runRegisteredDraftWorkflow(input, operationId);
    } catch (error) { result = failed(error instanceof Error ? error.message : "Tistory draft save failed."); }
    await this.audits.save({ operationId, workspaceId: input.workspaceId, projectId: input.projectId, contentId: input.contentId, platformConnectionId: input.connection.id, platform: "tistory", workflow: "draft.create", requiredPermission: "draft.create", initiatedBy: "user", confirmationState: input.finalConfirmation ? "confirmed" : "missing", startedAt, completedAt: this.now().toISOString(), result: result.status, ...(result.error ? { safeErrorCode: safeCode(result.error) } : {}) });
    return result;
  }
  private async runRegisteredDraftWorkflow(input: TistoryDraftExecution, operationId: string): Promise<TistoryDraftSaveResult> {
    const blogId = String(input.connection.publicMetadata.blogId ?? ""); if (!blogId) throw new Error("Tistory account metadata is invalid. Reconnect the account.");
    if (!("categoryId" in input)) throw new Error("Tistory 카테고리를 선택하거나 '카테고리 없음'을 명시해 주세요.");
    const jobs = path.join(this.root, "publishing-jobs"), commandPath = path.join(jobs, `${operationId}.json`);
    await mkdir(jobs, { recursive: true });
    await writeFile(commandPath, JSON.stringify({ blogId, storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json"), title: input.document.title, html: new TistoryHtmlRenderer().render(input.document), categoryId: input.categoryId }), { encoding: "utf8", mode: 0o600 });
    try { return await this.executeWorker(commandPath); } finally { await rm(commandPath, { force: true }); }
  }
}

function runWorker(commandPath: string): Promise<TistoryDraftSaveResult> {
  const worker = path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-draft-worker.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, commandPath], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); let output = "";
    child.stdout.on("data", (data) => output += String(data)); child.on("error", () => reject(new Error("The registered Tistory draft workflow could not start.")));
    child.on("exit", () => { try { const line = output.trim().split(/\r?\n/).at(-1); if (!line) throw new Error(); resolve(JSON.parse(line) as TistoryDraftSaveResult); } catch { reject(new Error("The registered Tistory draft workflow returned an invalid result.")); } });
  });
}
function failed(error: string): TistoryDraftSaveResult { return { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false, status: "failed", error }; }
function safeCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80); }
