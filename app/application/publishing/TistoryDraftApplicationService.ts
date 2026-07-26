import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import type { PlatformConnection } from "../../../core/connections";
import { deriveContentTags, type ContentDocument } from "../../../core/content";
import { PublishingPermissionGate } from "../../../core/publishing";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { createTistoryMediaUploadPlan, type TistoryMediaUploadPlan } from "../../../apps/tistory/publishing/TistoryMediaUploadPlan";
import type { TistoryDraftSaveResult, TistoryDraftWorkflowStep } from "../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";
import { localMediaFilePath } from "../media/LocalMediaStorage";

export type TistoryDraftExecution = Readonly<{ workspaceId: string; projectId: string; contentId: string; connection: PlatformConnection; document: ContentDocument; primaryKeyword?: string; finalConfirmation: boolean; selectedTarget: boolean; categoryId?: string | null; categoryName?: string | null; diagnosticMode?: "body_editor_probe" | "category_verification_probe" | "draft_reopen_verify" }>;
export type PublishingAuditRecord = Readonly<{ operationId: string; workspaceId: string; projectId: string; contentId: string; platformConnectionId: string; platform: "tistory"; workflow: "media.upload" | "draft.create" | "draft.verify"; requiredPermission: "media.upload" | "draft.create" | "draft.verify"; initiatedBy: "user"; confirmationState: "confirmed" | "missing"; startedAt: string; completedAt: string; result: TistoryDraftSaveResult["status"] | "completed"; safeErrorCode?: string }>;
export interface PublishingAuditRepository { save(record: PublishingAuditRecord): Promise<void>; }

type MediaPreparationDiagnostic = Readonly<Record<string, string | number>>;
type MediaPreparationResult = Readonly<{ status: "prepared" | "not_required" | "failed"; error?: string; code?: string; diagnostic?: MediaPreparationDiagnostic }>;
type SemanticHtmlDiagnostic = Readonly<{ code: string; evidence?: Readonly<Record<string, unknown>> }>;

const SEMANTIC_DIAGNOSTIC_PREFIX = "[tistory-semantic-html]";

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
      const mediaFailure = readMediaPreparationFailure(error);
      result = failed(
        error instanceof Error ? error.message : "Tistory draft save failed.",
        mediaFailure?.code,
        mediaFailure?.diagnostic,
      );
    }

    const completedAt = this.now().toISOString();
    if (mediaPlan.items.length) {
      await this.audits.save({
        operationId: `${operationId}:media`, workspaceId: input.workspaceId, projectId: input.projectId, contentId: input.contentId,
        platformConnectionId: input.connection.id, platform: "tistory", workflow: "media.upload", requiredPermission: "media.upload",
        initiatedBy: "user", confirmationState: input.finalConfirmation ? "confirmed" : "missing", startedAt, completedAt,
        result: mediaUploadCompleted ? "completed" : "failed",
        ...(!mediaUploadCompleted && result.error ? { safeErrorCode: mediaFailureCode(result) ?? safeCode(result.error) } : {}),
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
    const media = mediaPlan.items.map((item) => Object.freeze({ ...item, localPath: localMediaFilePath(item.storageKey) }));
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
    const child = spawn(process.execPath, [worker, commandPath], {
      cwd: process.cwd(),
      env: { ...process.env, BRIGHT_TISTORY_WORKER_DIAGNOSTICS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "", stderr = "";
    child.stdout.on("data", (data) => output += String(data));
    child.stderr.on("data", (data) => stderr += String(data));
    child.on("error", () => reject(new Error("The registered Tistory draft workflow could not start.")));
    child.on("exit", () => {
      try {
        const line = output.trim().split(/\r?\n/).at(-1); if (!line) throw new Error();
        const parsed = JSON.parse(line) as TistoryDraftSaveResult;
        const result = normalizeTistoryDraftWorkerResult(parsed, stderr);
        if (result.status === "failed" || result.status === "partial_failure" || result.status === "partially_verified") {
          console.error("[tistory-draft] workflow incomplete", {
            failedStep: result.failedStep,
            diagnosticCode: result.steps?.find((step) => !step.passed)?.diagnosticCode,
            completedSteps: result.steps?.filter((step) => step.passed).map((step) => step.key),
            draftSaveClickCount: result.draftSaveClickCount ?? 0,
            verification: result.verification,
            runtimeFailure: result.diagnostic?.runtimeFailure,
            currentUrl: result.diagnostic?.currentUrl,
            safeError: result.error,
            workerDiagnostic: stderr.trim().slice(0, 500) || undefined,
          });
        }
        resolve(result);
      } catch { reject(new Error("The registered Tistory draft workflow returned an invalid result.")); }
    });
  });
}

export function normalizeTistoryDraftWorkerResult(result: TistoryDraftSaveResult, stderr: string): TistoryDraftSaveResult {
  const semantic = readSemanticHtmlDiagnostic(stderr);
  const normalizedSemantic = semantic ? normalizeSemanticFailure(result, semantic) : result;
  return normalizeRepresentativeUiWarning(normalizeExplicitWorkflowSteps(normalizedSemantic));
}

function normalizeSemanticFailure(result: TistoryDraftSaveResult, semantic: SemanticHtmlDiagnostic): TistoryDraftSaveResult {
  const failedStep = result.failedStep === "structure_verified" ? "structure_verified" : "body_verified";
  const message = result.error ?? "Tistory 기본모드에서 Renderer HTML 본문을 확인하지 못했습니다.";
  const failedRecord = Object.freeze({
    key: failedStep,
    passed: false,
    diagnosticCode: semantic.code,
    message,
    ...(semantic.evidence ? { evidence: semantic.evidence } : {}),
  });
  const steps = Object.freeze([
    ...(result.steps ?? []).filter((step) => !(step.key === failedStep && !step.passed)),
    failedRecord,
  ]);
  return Object.freeze({
    ...result,
    failedStep,
    steps,
    ...(semantic.evidence ? { verification: semantic.evidence } : {}),
    diagnostic: Object.freeze({ ...(result.diagnostic ?? {}), semanticHtml: semantic }),
  });
}

function normalizeExplicitWorkflowSteps(result: TistoryDraftSaveResult): TistoryDraftSaveResult {
  const existing = result.steps ?? [];
  const expanded: TistoryDraftWorkflowStep[] = [];
  const has = (key: TistoryDraftWorkflowStep["key"]) => existing.some((step) => step.key === key);

  for (const step of existing) {
    if (step.passed && step.key === "tags_filled") {
      const evidence = step.evidence ?? {};
      if (!has("media_prepared") && hasEvidence(evidence.upload)) {
        expanded.push(Object.freeze({ key: "media_prepared", passed: true, message: "Tistory 네이티브 이미지 업로드와 본문 배치를 확인했습니다.", evidence: asEvidence(evidence.upload) }));
      }
    }
    if (step.passed && step.key === "tags_reverified") {
      const evidence = step.evidence ?? {};
      if (!has("media_reverified") && hasEvidence(evidence.media)) {
        expanded.push(Object.freeze({ key: "media_reverified", passed: true, message: "다시 연 Tistory 임시글에서 네이티브 이미지와 ALT 상태를 확인했습니다.", evidence: asEvidence(evidence.media) }));
      }
    }
    expanded.push(step);
  }

  const failedIndex = expanded.findIndex((step) => !step.passed && step.warning !== true);
  if (failedIndex >= 0) {
    const failedRecord = expanded[failedIndex];
    const mapped = explicitFailureStep(result.failedStep, failedRecord.diagnosticCode);
    if (mapped && mapped !== failedRecord.key) {
      expanded[failedIndex] = Object.freeze({ ...failedRecord, key: mapped });
      return Object.freeze({ ...result, failedStep: mapped, steps: Object.freeze(expanded) });
    }
  }

  if (!expanded.length || expanded.length === existing.length && expanded.every((step, index) => step === existing[index])) return result;
  return Object.freeze({ ...result, steps: Object.freeze(expanded) });
}

function explicitFailureStep(
  failedStep: TistoryDraftSaveResult["failedStep"],
  diagnosticCode?: string,
): TistoryDraftWorkflowStep["key"] | undefined {
  if (!diagnosticCode) return failedStep;
  if (diagnosticCode.startsWith("representative_persisted_")) return "representative_persisted_verified";
  if (diagnosticCode === "tistory_representative_ui_not_rehydrated") return "representative_reverified";
  if (diagnosticCode.startsWith("representative_persistence_")) return "representative_reverified";
  if (diagnosticCode.startsWith("representative_")) return "representative_image_verified";
  if (diagnosticCode.startsWith("media_persistence_")) return "media_reverified";
  if (diagnosticCode.startsWith("media_")) return "media_prepared";
  if (failedStep === "tags_reverified" && diagnosticCode.startsWith("category_")) return "category_reverified";
  return failedStep;
}

const REPRESENTATIVE_UI_DIAGNOSTIC_CODES = new Set([
  "tistory_representative_ui_not_rehydrated",
  "representative_persistence_control_not_found",
  "representative_persistence_not_selected",
  "representative_persistence_image_click_failed",
]);

const REQUIRED_REPRESENTATIVE_DRAFT_STEPS: readonly TistoryDraftWorkflowStep["key"][] = [
  "draft_save_confirmed",
  "title_reverified",
  "body_reverified",
  "media_reverified",
  "representative_image_verified",
  "representative_persisted_verified",
  "category_reverified",
  "tags_reverified",
  "structure_verified",
  "publication_state_verified",
  "draft_verified",
];

function normalizeRepresentativeUiWarning(result: TistoryDraftSaveResult): TistoryDraftSaveResult {
  const existing = result.steps ?? [];
  const requiredStepsPassed = REQUIRED_REPRESENTATIVE_DRAFT_STEPS.every((key) =>
    existing.some((step) => step.key === key && step.passed === true),
  );
  if (!requiredStepsPassed) return result;

  let changed = false;
  const steps = existing.map((step) => {
    if (step.passed || !REPRESENTATIVE_UI_DIAGNOSTIC_CODES.has(step.diagnosticCode ?? "")) return step;
    changed = true;
    return Object.freeze({
      ...step,
      key: "representative_reverified" as const,
      warning: true,
      diagnosticCode: "tistory_representative_ui_not_rehydrated",
      message: "대표이미지 데이터는 저장됐지만 Tistory 임시글 편집기가 재열기 시 대표 버튼 활성 UI를 복원하지 않았습니다.",
    });
  });
  if (!changed) return result;

  const blockingFailure = steps.some((step) => !step.passed && step.warning !== true);
  if (blockingFailure || !["partial_failure", "partially_verified"].includes(result.status)) {
    return Object.freeze({ ...result, steps: Object.freeze(steps) });
  }

  const normalized = {
    ...result,
    status: "saved",
    saveNotificationDetected: true,
    draftListVerified: true,
    reopenedDraftVerified: true,
    titleMatched: true,
    bodyMatched: true,
    steps: Object.freeze(steps),
  } as TistoryDraftSaveResult & { failedStep?: TistoryDraftWorkflowStep["key"]; error?: string };
  delete normalized.failedStep;
  delete normalized.error;
  return Object.freeze(normalized);
}

function hasEvidence(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && !(value as { skipped?: unknown }).skipped);
}

function asEvidence(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === "object" ? value as Readonly<Record<string, unknown>> : Object.freeze({});
}

function readSemanticHtmlDiagnostic(stderr: string): SemanticHtmlDiagnostic | undefined {
  const lines = stderr.split(/\r?\n/).reverse();
  for (const line of lines) {
    const marker = `${SEMANTIC_DIAGNOSTIC_PREFIX} `;
    const index = line.indexOf(marker);
    if (index < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(index + marker.length)) as Partial<SemanticHtmlDiagnostic>;
      if (typeof parsed.code !== "string" || !parsed.code.startsWith("rendered_")) continue;
      const evidence = parsed.evidence && typeof parsed.evidence === "object"
        ? parsed.evidence as Readonly<Record<string, unknown>>
        : undefined;
      return Object.freeze({ code: parsed.code, ...(evidence ? { evidence } : {}) });
    } catch {
      continue;
    }
  }
  return undefined;
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
        else reject(new MediaPreparationError(
          result.code ?? "media_upload_failed",
          result.error ?? "Tistory image upload failed.",
          result.diagnostic,
        ));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("The registered Tistory media upload workflow returned an invalid result."));
      }
    });
  });
}

class MediaPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly diagnostic?: MediaPreparationDiagnostic,
  ) {
    super(message);
    this.name = "MediaPreparationError";
  }
}

function readMediaPreparationFailure(error: unknown): Readonly<{ code: string; diagnostic?: MediaPreparationDiagnostic }> | undefined {
  if (!(error instanceof Error)) return undefined;
  const candidate = error as Error & { code?: unknown; diagnostic?: unknown };
  if (typeof candidate.code !== "string" || !candidate.code.startsWith("media_")) return undefined;
  const diagnostic = candidate.diagnostic && typeof candidate.diagnostic === "object"
    ? candidate.diagnostic as MediaPreparationDiagnostic
    : undefined;
  return Object.freeze({ code: candidate.code, ...(diagnostic ? { diagnostic } : {}) });
}

function failed(
  error: string,
  mediaUploadFailureCode?: string,
  mediaUploadDiagnostic?: MediaPreparationDiagnostic,
): TistoryDraftSaveResult {
  return {
    saveClicked: false,
    saveNotificationDetected: false,
    draftIdDetected: false,
    draftListVerified: false,
    reopenedDraftVerified: false,
    titleMatched: false,
    bodyMatched: false,
    publicPostCreated: false,
    status: "failed",
    steps: [],
    error,
    ...(mediaUploadFailureCode
      ? { diagnostic: { mediaUploadFailureCode, ...(mediaUploadDiagnostic ? { mediaUploadDiagnostic } : {}) } }
      : {}),
  };
}

function mediaFailureCode(result: TistoryDraftSaveResult) {
  const code = result.diagnostic?.mediaUploadFailureCode;
  return typeof code === "string" ? code : undefined;
}
function safeCode(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 80); }
