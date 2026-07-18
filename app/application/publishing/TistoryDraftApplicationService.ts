import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { PlatformConnection } from "../../../core/connections";
import { deriveContentTags, type ContentDocument } from "../../../core/content";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { createTistoryMediaUploadPlan, type TistoryMediaUploadPlan } from "../../../apps/tistory/publishing/TistoryMediaUploadPlan";
import type { TistoryDraftSaveResult } from "../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";
import { localMediaFilePath } from "../media/LocalMediaStorage";

export type TistoryDraftExecution = Readonly<{ workspaceId: string; projectId: string; contentId: string; connection: PlatformConnection; document: ContentDocument; primaryKeyword?: string; finalConfirmation: boolean; selectedTarget: boolean; categoryId?: string | null; categoryName?: string | null; diagnosticMode?: "body_editor_probe" | "category_verification_probe" | "draft_reopen_verify" }>;
export type PublishingAuditRecord = Readonly<{ operationId: string; workspaceId: string; projectId: string; contentId: string; platformConnectionId: string; platform: "tistory"; workflow: "media.upload" | "draft.create" | "draft.verify"; requiredPermission: "media.upload" | "draft.create" | "draft.verify"; initiatedBy: "user"; confirmationState: "confirmed" | "missing"; startedAt: string; completedAt: string; result: TistoryDraftSaveResult["status"] | "completed"; safeErrorCode?: string }>;
export interface PublishingAuditRepository { save(record: PublishingAuditRecord): Promise<void>; }

type MediaPreparationResult = Readonly<{ status: "prepared" | "not_required" | "failed"; error?: string; code?: string }>;

export class TistoryDraftApplicationService {
  constructor(
    private readonly audits: PublishingAuditRepository,
    private readonly root = path.join(process.cwd(), ".bright-studio"),
    private readonly now = () => new Date(),
    private readonly executeWorker = runWorker,
    private readonly executeMediaWorker = runMediaWorker,
  ) {}

  async execute(input: TistoryDraftExecution): Promise<TistoryDraftSaveResult> {
    const operationId = randomUUID(), startedAt = this.now().toISOString();
    const workflow = input.diagnosticMode ? "draft.verify" : "draft.create";
    const mediaPlan = input.diagnosticMode
      ? Object.freeze({ document: input.document, items: Object.freeze([]) })
      : createTistoryMediaUploadPlan(input.document);
    let result: TistoryDraftSaveResult;
    let mediaUploadCompleted = false;
    try {
      if (!input.selectedTarget) throw new Error("The selected account is not a Project publishing target.");
      if (input.connection.platform !== "tistory") throw new Error("A Tistory publishing account is required.");
      const gate = new PublishingPermissionGate();
      gate.authorize({ ...input, platformConnectionId: input.connection.id, workflow }, input.connection);
      if (input.connection.publicMetadata.sessionStateAvailable !== true) throw new Error("A stored Tistory session is required. Reconnect the account.");
      if (!input.diagnosticMode) gate.authorize({ ...input, platformConnectionId: input.connection.id, workflow: "category.select" }, input.connection);
      if (mediaPlan.items.length) gate.authorize({ ...input, platformConnectionId: input.connection.id, workflow: "media.upload" }, input.connection);
      const execution = await this.runRegisteredDraftWorkflow(input, operationId, mediaPlan);
      result = execution.result;
      mediaUploadCompleted = execution.mediaUploadCompleted;
    } catch (error) {
      result = failed(error instanceof Error ? error.message : "Tistory draft save failed.");
    }

    const completedAt = this.now().toISOString();
    if (mediaPlan.items.length) {
      await this.audits.save({
        operationId: `${operationId}:media`, workspaceId: input.workspaceId, projectId: input.projectId, contentId: input.contentId,
        platformConnectionId: input.connection.id, platform: "tistory", workflow: "media.upload", requiredPermission: "media.upload",
        initiatedBy: "user", confirmationState: input.finalConfirmation ? "confirmed" : "missing", startedAt, completedAt,
        result: mediaUploadCompleted ? "completed" : "failed",
        ...(!mediaUploadCompleted && result.error ? { safeErrorCode: safeCode(result.error) } : {}),
      });
    }
    await this.audits.save({ operationId, workspaceId: input.workspaceId, projectId: input.projectId, contentId: input.contentId, platformConnectionId: input.connection.id, platform: "tistory", workflow, requiredPermission: workflow, initiatedBy: "user", confirmationState: input.finalConfirmation ? "confirmed" : "missing", startedAt, completedAt, result: result.status, ...(result.error ? { safeErrorCode: safeCode(result.error) } : {}) });
    return result;
  }

  private async runRegisteredDraftWorkflow(input: TistoryDraftExecution, operationId: string, mediaPlan: TistoryMediaUploadPlan): Promise<Readonly<{ result: TistoryDraftSaveResult; mediaUploadCompleted: boolean }>> {
    const blogId = String(input.connection.publicMetadata.blogId ?? ""); if (!blogId) throw new Error("Tistory account metadata is invalid. Reconnect the account.");
    if (!("categoryId" in input)) throw new Error("Tistory 카테고리를 선택하거나 '카테고리 없음'을 명시해 주세요.");
    const prepared = await new TistoryPublishingAdapter().prepare({ content: mediaPlan.document, platform: "tistory" });
    const tags = deriveContentTags(input.document, input.primaryKeyword);
    const media = await Promise.all(mediaPlan.items.map(async (item) => {
      const localPath = localMediaFilePath(item.storageKey);
      await access(localPath);
      return Object.freeze({ ...item, localPath });
    }));
    const jobs = path.join(this.root, "publishing-jobs"), commandPath = path.join(jobs, `${operationId}.json`);
    await mkdir(jobs, { recursive: true });
    await writeFile(commandPath, JSON.stringify({ blogId, storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json"), title: prepared.payload.title, html: prepared.payload.html, tags, media, categoryId: input.categoryId, categoryName: input.categoryName, diagnosticMode: input.diagnosticMode }), { encoding: "utf8", mode: 0o600 });
    let mediaUploadCompleted = false;
    try {
      if (media.length) {
        await this.executeMediaWorker(commandPath);
        mediaUploadCompleted = true;
      }
      return Object.freeze({ result: await this.executeWorker(commandPath), mediaUploadCompleted });
    } finally {
      await rm(commandPath, { force: true });
    }
  }
}

function runWorker(commandPath: string): Promise<TistoryDraftSaveResult> {
  const worker = path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-draft-worker.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, commandPath], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); let output = "", stderr = "";
    child.stdout.on("data", (data) => output += String(data)); child.stderr.on("data", (data) => stderr += String(data)); child.on("error", () => reject(new Error("The registered Tistory draft workflow could not start.")));
    child.on("exit", () => {
      try {
        const line = output.trim().split(/\r?\n/).at(-1); if (!line) throw new Error();
        const result = JSON.parse(line) as TistoryDraftSaveResult;
        if (result.status === "failed" || result.status === "partial_failure" || result.status === "partially_verified") {
          console.error("[tistory-draft] workflow incomplete", {
            failedStep: result.failedStep,
            diagnosticCode: result.steps?.find((step) => !step.passed)?.diagnosticCode,
            completedSteps: result.steps?.filter((step) => step.passed).map((step) => step.key),
            draftSaveClickCount: result.draftSaveClickCount ?? 0,
            runtimeFailure: result.diagnostic?.runtimeFailure,
            currentUrl: result.diagnostic?.currentUrl,
            safeError: result.error,
            workerDiagnostic: stderr.trim().slice(0, 200) || undefined,
          });
        }
        resolve(result);
      } catch { reject(new Error("The registered Tistory draft workflow returned an invalid result.")); }
    });
  });
}

function runMediaWorker(commandPath: string): Promise<void> {
  const worker = path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-media-preparation-worker.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, commandPath], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    child.stdout.on("data", (data) => output += String(data));
    child.on("error", () => reject(new Error("The registered Tistory media upload workflow could not start.")));
    child.on("exit", () => {
      try {
        const line = output.trim().split(/\r?\n/).at(-1); if (!line) throw new Error();
        const result = JSON.parse(line) as MediaPreparationResult;
        if (result.status === "prepared" || result.status === "not_required") resolve();
        else reject(new Error(result.error ?? "Tistory image upload failed."));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("The registered Tistory media upload workflow returned an invalid result."));
      }
    });
  });
}

function failed(error: string): TistoryDraftSaveResult { return { saveClicked: false, saveNotificationDetected: false, draftIdDetected: false, draftListVerified: false, reopenedDraftVerified: false, titleMatched: false, bodyMatched: false, publicPostCreated: false, status: "failed", steps: [], error }; }
function safeCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80); }
