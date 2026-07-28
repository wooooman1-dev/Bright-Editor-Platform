import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import { PublishingPermissionGate } from "../../../core/publishing";

export type TistoryScheduleCreateExecution = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  connection: PlatformConnection;
  selectedTarget: boolean;
  revisionId: string;
  title: string;
  html: string;
  tags: readonly string[];
  categoryId: string | null;
  categoryName: string | null;
  scheduledAt: string;
  timezone: "Asia/Seoul";
  finalConfirmation: true;
}>;

export type TistoryScheduleCreateResult = Readonly<{
  status: "scheduled_verified" | "scheduled_unverified" | "failed";
  workflow: "schedule.create";
  finalClickIssued: boolean;
  registeredAt?: string;
  verifiedAt?: string;
  externalPostId?: string;
  externalManagementUrl?: string;
  editorUrl?: string;
  clickCounts?: Readonly<Record<string, number>>;
  verification?: Readonly<Record<string, unknown>>;
  diagnosticCode?: string;
  error?: string;
}>;

export type TistoryScheduleCreateAuditRecord = Readonly<{
  operationId: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  platformConnectionId: string;
  platform: "tistory";
  workflow: "schedule.create";
  requiredPermission: "schedule.create";
  initiatedBy: "user";
  confirmationState: "confirmed";
  revisionId: string;
  scheduledAt: string;
  timezone: "Asia/Seoul";
  startedAt: string;
  completedAt: string;
  result: TistoryScheduleCreateResult["status"];
  finalClickIssued: boolean;
  safeErrorCode?: string;
}>;

export interface TistoryScheduleCreateAuditRepository {
  save(record: TistoryScheduleCreateAuditRecord): Promise<void>;
}

type ScheduleWorker = (commandPath: string) => Promise<TistoryScheduleCreateResult>;

export class TistoryScheduleCreateApplicationService {
  constructor(
    private readonly audits: TistoryScheduleCreateAuditRepository,
    private readonly root = path.join(process.cwd(), ".bright-studio"),
    private readonly now = () => new Date(),
    private readonly executeWorker: ScheduleWorker = runWorker,
  ) {}

  async execute(input: TistoryScheduleCreateExecution): Promise<TistoryScheduleCreateResult> {
    const operationId = randomUUID();
    const startedAt = this.now().toISOString();
    let result: TistoryScheduleCreateResult;

    try {
      if (!input.selectedTarget) throw codedError("TARGET_NOT_SELECTED", "선택한 Tistory 계정이 현재 Project의 발행 대상이 아닙니다.");
      if (input.connection.platform !== "tistory") throw codedError("PLATFORM_MISMATCH", "Tistory 발행 계정이 필요합니다.");
      new PublishingPermissionGate().authorize({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        contentId: input.contentId,
        platformConnectionId: input.connection.id,
        workflow: "schedule.create",
        finalConfirmation: input.finalConfirmation,
      }, input.connection);
      if (input.connection.publicMetadata.sessionStateAvailable !== true) {
        throw codedError("SESSION_REQUIRED", "저장된 Tistory 로그인 세션이 필요합니다. 계정을 다시 연결해 주세요.");
      }
      if (input.timezone !== "Asia/Seoul") throw codedError("TIMEZONE_NOT_ALLOWED", "Tistory 예약 발행은 Asia/Seoul 시간대만 사용할 수 있습니다.");
      const blogId = String(input.connection.publicMetadata.blogId ?? "").trim();
      if (!blogId) throw codedError("BLOG_ID_REQUIRED", "Tistory 계정 metadata가 올바르지 않습니다. 계정을 다시 연결해 주세요.");

      const jobs = path.join(this.root, "publishing-jobs");
      const commandPath = path.join(jobs, `${operationId}-tistory-schedule-create.json`);
      await mkdir(jobs, { recursive: true });
      await writeFile(commandPath, JSON.stringify({
        blogId,
        storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json"),
        revisionId: input.revisionId,
        title: input.title,
        html: input.html,
        tags: input.tags,
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        scheduledAt: input.scheduledAt,
        timezone: input.timezone,
      }), { encoding: "utf8", mode: 0o600 });
      try {
        result = await this.executeWorker(commandPath);
      } finally {
        await rm(commandPath, { force: true });
      }
    } catch (error) {
      const code = errorCode(error);
      const ambiguous = code === "WORKER_RESULT_INVALID" || code === "WORKER_START_FAILED_AFTER_LAUNCH";
      result = Object.freeze({
        status: ambiguous ? "scheduled_unverified" : "failed",
        workflow: "schedule.create",
        finalClickIssued: ambiguous,
        ...(ambiguous ? { registeredAt: this.now().toISOString() } : {}),
        diagnosticCode: code,
        error: ambiguous
          ? "Tistory 예약 등록 worker의 최종 상태를 확인하지 못했습니다. 중복 방지를 위해 자동 재시도하지 않습니다."
          : error instanceof Error ? error.message : "Tistory 예약 등록을 완료하지 못했습니다.",
      });
    }

    const completedAt = this.now().toISOString();
    await this.audits.save(Object.freeze({
      operationId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      contentId: input.contentId,
      platformConnectionId: input.connection.id,
      platform: "tistory",
      workflow: "schedule.create",
      requiredPermission: "schedule.create",
      initiatedBy: "user",
      confirmationState: "confirmed",
      revisionId: input.revisionId,
      scheduledAt: input.scheduledAt,
      timezone: input.timezone,
      startedAt,
      completedAt,
      result: result.status,
      finalClickIssued: result.finalClickIssued,
      ...(result.diagnosticCode ? { safeErrorCode: result.diagnosticCode } : {}),
    }));
    return result;
  }
}

function runWorker(commandPath: string): Promise<TistoryScheduleCreateResult> {
  const worker = path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-schedule-create-worker.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, commandPath], {
      cwd: process.cwd(),
      env: { ...process.env, BRIGHT_TISTORY_WORKER_DIAGNOSTICS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let output = "";
    let stderr = "";
    let launched = false;
    child.once("spawn", () => { launched = true; });
    child.stdout.on("data", (data: string) => { output += data; });
    child.stderr.on("data", (data: string) => { stderr += data; });
    child.on("error", () => reject(codedError(launched ? "WORKER_START_FAILED_AFTER_LAUNCH" : "WORKER_START_FAILED", "Tistory 예약 등록 workflow를 시작하지 못했습니다.")));
    child.on("exit", () => {
      try {
        const line = output.trim().split(/\r?\n/).at(-1);
        if (!line) throw new Error("missing output");
        const parsed = JSON.parse(line) as unknown;
        if (!isResult(parsed)) throw new Error("invalid result");
        resolve(parsed);
      } catch {
        const diagnostic = stderr.trim().split(/\r?\n/).at(-1)?.slice(0, 200);
        reject(codedError("WORKER_RESULT_INVALID", diagnostic ? `Tistory 예약 등록 결과가 올바르지 않습니다: ${diagnostic}` : "Tistory 예약 등록 결과가 올바르지 않습니다."));
      }
    });
  });
}

function isResult(value: unknown): value is TistoryScheduleCreateResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TistoryScheduleCreateResult>;
  return candidate.workflow === "schedule.create"
    && (candidate.status === "scheduled_verified" || candidate.status === "scheduled_unverified" || candidate.status === "failed")
    && typeof candidate.finalClickIssued === "boolean"
    && (candidate.status !== "scheduled_verified" || (candidate.finalClickIssued && Boolean(candidate.registeredAt) && Boolean(candidate.verifiedAt)))
    && (candidate.status !== "scheduled_unverified" || candidate.finalClickIssued);
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "TISTORY_SCHEDULE_CREATE_FAILED";
}
