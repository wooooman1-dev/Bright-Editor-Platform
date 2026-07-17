import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { PlatformConnection } from "../../../core/connections";
import type { ContentDocument } from "../../../core/content";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import type { TistoryDraftSaveResult } from "../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

export type TistoryDraftExecution = Readonly<{ workspaceId: string; projectId: string; contentId: string; connection: PlatformConnection; document: ContentDocument; finalConfirmation: boolean; selectedTarget: boolean; categoryId?: string | null; categoryName?: string | null; diagnosticMode?: "body_editor_probe" | "category_verification_probe" | "draft_reopen_verify" }>;
export type PublishingAuditRecord = Readonly<{ operationId: string; workspaceId: string; projectId: string; contentId: string; platformConnectionId: string; platform: "tistory"; workflow: "draft.create" | "draft.verify"; requiredPermission: "draft.create" | "draft.verify"; initiatedBy: "user"; confirmationState: "confirmed" | "missing"; startedAt: string; completedAt: string; result: TistoryDraftSaveResult["status"]; safeErrorCode?: string }>;
export interface PublishingAuditRepository { save(record: PublishingAuditRecord): Promise<void>; }

export class TistoryDraftApplicationService {
  constructor(private readonly audits: PublishingAuditRepository, private readonly root = path.join(process.cwd(), ".bright-studio"), private readonly now = () => new Date(), private readonly executeWorker = runWorker) {}
  async execute(input: TistoryDraftExecution): Promise<TistoryDraftSaveResult> {
    const operationId = randomUUID(), startedAt = this.now().toISOString(); let result: TistoryDraftSaveResult;
    const workflow = input.diagnosticMode ? "draft.verify" : "draft.create";
    try {
      if (!input.selectedTarget) throw new Error("The selected account is not a Project publishing target.");
      if (input.connection.platform !== "tistory") throw new Error("A Tistory publishing account is required.");
      new PublishingPermissionGate().authorize({ ...input, platformConnectionId: input.connection.id, workflow }, input.connection);
      if (input.connection.publicMetadata.sessionStateAvailable !== true) throw new Error("A stored Tistory session is required. Reconnect the account.");
      if (!input.diagnosticMode) new PublishingPermissionGate().authorize({ ...input, platformConnectionId: input.connection.id, workflow: "category.select" }, input.connection);
      result = await this.runRegisteredDraftWorkflow(input, operationId);
    } catch (error) { result = failed(error instanceof Error ? error.message : "Tistory draft save failed."); }
    await this.audits.save({ operationId, workspaceId: input.workspaceId, projectId: input.projectId, contentId: input.contentId, platformConnectionId: input.connection.id, platform: "tistory", workflow, requiredPermission: workflow, initiatedBy: "user", confirmationState: input.finalConfirmation ? "confirmed" : "missing", startedAt, completedAt: this.now().toISOString(), result: result.status, ...(result.error ? { safeErrorCode: safeCode(result.error) } : {}) });
    return result;
  }
  private async runRegisteredDraftWorkflow(input: TistoryDraftExecution, operationId: string): Promise<TistoryDraftSaveResult> {
    const blogId = String(input.connection.publicMetadata.blogId ?? ""); if (!blogId) throw new Error("Tistory account metadata is invalid. Reconnect the account.");
    if (!("categoryId" in input)) throw new Error("Tistory 카테고리를 선택하거나 '카테고리 없음'을 명시해 주세요.");
    const prepared = await new TistoryPublishingAdapter().prepare({ content: input.document, platform: "tistory" });
    const jobs = path.join(this.root, "publishing-jobs"), commandPath = path.join(jobs, `${operationId}.json`);
    await mkdir(jobs, { recursive: true });
    await writeFile(commandPath, JSON.stringify({ blogId, storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json"), title: prepared.payload.title, html: prepared.payload.html, categoryId: input.categoryId, categoryName: input.categoryName, diagnosticMode: input.diagnosticMode }), { encoding: "utf8", mode: 0o600 });
    try { return await this.executeWorker(commandPath); } finally { await rm(commandPath, { force: true }); }
  }
}

function runWorker(commandPath: string): Promise<TistoryDraftSaveResult> {
  const worker = path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-draft-worker.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, commandPath], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); let output = "", stderr = "";
    child.stdout.on("data", (data) => output += String(data)); child.stderr.on("data", (data) => stderr += String(data)); child.on("error", () => reject(new Error("The registered Tistory draft workflow could not start.")));
    child.on("exit", () => { try { const line = output.trim().split(/\r?\n/).at(-1); if (!line) throw new Error(); const result = JSON.parse(line) as TistoryDraftSaveResult; if (result.status === "failed" || result.status === "partial_failure" || result.status === "partially_verified") console.error("[tistory-draft] workflow incomplete", { failedStep: result.failedStep, diagnosticCode: result.steps?.find((step) => !step.passed)?.diagnosticCode, completedSteps: result.steps?.filter((step) => step.passed).map((step) => step.key), draftSaveClickCount: result.draftSaveClickCount ?? 0, workerDiagnostic: stderr.trim().slice(0, 200) || undefined }); resolve(result); } catch { reject(new Error("The registered Tistory draft workflow returned an invalid result.")); } });
  });
}
function failed(error: string): TistoryDraftSaveResult { return { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false, status: "failed", steps: [], error }; }
function safeCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80); }
