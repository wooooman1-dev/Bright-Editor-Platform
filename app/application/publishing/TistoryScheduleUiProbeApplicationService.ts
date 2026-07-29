import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PlatformConnection } from "../../../core/connections";
import { PublishingPermissionGate } from "../../../core/publishing";

export type TistoryScheduleUiProbeExecution = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  connection: PlatformConnection;
  selectedTarget: boolean;
}>;

export type TistoryScheduleUiProbeResult = Readonly<{
  status: "diagnosed" | "failed";
  workflow: "schedule.verify";
  readOnly: true;
  observedAt?: string;
  editorUrl?: string;
  clickCounts?: Readonly<{ total: number; restricted: number; labels: readonly string[] }>;
  inventory?: Readonly<Record<string, unknown>>;
  stateEvidence?: Readonly<Record<string, unknown>>;
  diagnosticCode?: string;
  error?: string;
}>;

export type TistoryScheduleUiProbeAuditRecord = Readonly<{
  operationId: string;
  workspaceId: string;
  projectId: string;
  contentId: string;
  platformConnectionId: string;
  platform: "tistory";
  workflow: "schedule.verify";
  requiredPermission: "schedule.create";
  initiatedBy: "user";
  confirmationState: "not_required";
  startedAt: string;
  completedAt: string;
  result: TistoryScheduleUiProbeResult["status"];
  safeErrorCode?: string;
}>;

export interface TistoryScheduleUiProbeAuditRepository {
  save(record: TistoryScheduleUiProbeAuditRecord): Promise<void>;
}

type ProbeWorker = (commandPath: string) => Promise<TistoryScheduleUiProbeResult>;

export class TistoryScheduleUiProbeApplicationService {
  constructor(
    private readonly audits: TistoryScheduleUiProbeAuditRepository,
    private readonly root = path.join(process.cwd(), ".bright-studio"),
    private readonly now = () => new Date(),
    private readonly executeWorker: ProbeWorker = runWorker,
  ) {}

  async execute(input: TistoryScheduleUiProbeExecution): Promise<TistoryScheduleUiProbeResult> {
    const operationId = randomUUID();
    const startedAt = this.now().toISOString();
    let result: TistoryScheduleUiProbeResult;

    try {
      if (!input.selectedTarget) throw codedError("TARGET_NOT_SELECTED", "선택한 Tistory 계정이 현재 Project의 발행 대상이 아닙니다.");
      if (input.connection.platform !== "tistory") throw codedError("PLATFORM_MISMATCH", "Tistory 발행 계정이 필요합니다.");

      new PublishingPermissionGate().authorize({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        contentId: input.contentId,
        platformConnectionId: input.connection.id,
        workflow: "schedule.verify",
        finalConfirmation: false,
      }, input.connection);

      if (input.connection.publicMetadata.sessionStateAvailable !== true) {
        throw codedError("SESSION_REQUIRED", "저장된 Tistory 로그인 세션이 필요합니다. 계정을 다시 연결해 주세요.");
      }
      const blogId = String(input.connection.publicMetadata.blogId ?? "").trim();
      if (!blogId) throw codedError("BLOG_ID_REQUIRED", "Tistory 계정 metadata가 올바르지 않습니다. 계정을 다시 연결해 주세요.");

      const jobs = path.join(this.root, "publishing-jobs");
      const commandPath = path.join(jobs, `${operationId}-schedule-ui-probe.json`);
      await mkdir(jobs, { recursive: true });
      await writeFile(commandPath, JSON.stringify({
        blogId,
        storageStatePath: path.join(this.root, "connections", "tistory", input.connection.id, "storage-state.json"),
      }), { encoding: "utf8", mode: 0o600 });
      try {
        result = await this.executeWorker(commandPath);
      } finally {
        await rm(commandPath, { force: true });
      }
    } catch (error) {
      result = Object.freeze({
        status: "failed",
        workflow: "schedule.verify",
        readOnly: true,
        diagnosticCode: errorCode(error),
        error: error instanceof Error ? error.message : "Tistory 예약 UI 읽기 전용 조사를 완료하지 못했습니다.",
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
      workflow: "schedule.verify",
      requiredPermission: "schedule.create",
      initiatedBy: "user",
      confirmationState: "not_required",
      startedAt,
      completedAt,
      result: result.status,
      ...(result.diagnosticCode ? { safeErrorCode: result.diagnosticCode } : {}),
    }));
    return result;
  }
}

function runWorker(commandPath: string): Promise<TistoryScheduleUiProbeResult> {
  const worker = path.join(process.cwd(), "apps", "tistory", "workflows", "tistory-schedule-ui-probe.mjs");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [worker, commandPath], {
      cwd: process.cwd(),
      env: { ...process.env, BRIGHT_TISTORY_WORKER_DIAGNOSTICS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let stderr = "";
    child.stdout.on("data", (data) => output += String(data));
    child.stderr.on("data", (data) => stderr += String(data));
    child.on("error", () => reject(codedError("WORKER_START_FAILED", "Tistory 예약 UI 조사 workflow를 시작하지 못했습니다.")));
    child.on("exit", () => {
      try {
        const line = output.trim().split(/\r?\n/).at(-1);
        if (!line) throw new Error("missing output");
        const parsed = JSON.parse(line) as unknown;
        if (!isProbeResult(parsed)) throw new Error("invalid result");
        resolve(parsed);
      } catch {
        const safeDiagnostic = stderr.trim().split(/\r?\n/).at(-1)?.slice(0, 160);
        reject(codedError(
          "WORKER_RESULT_INVALID",
          safeDiagnostic ? `Tistory 예약 UI 조사 결과가 올바르지 않습니다: ${safeDiagnostic}` : "Tistory 예약 UI 조사 결과가 올바르지 않습니다.",
        ));
      }
    });
  });
}

function isProbeResult(value: unknown): value is TistoryScheduleUiProbeResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<TistoryScheduleUiProbeResult>;
  return (candidate.status === "diagnosed" || candidate.status === "failed")
    && candidate.workflow === "schedule.verify"
    && candidate.readOnly === true
    && (candidate.status !== "diagnosed"
      || (candidate.clickCounts?.total === 0 && candidate.clickCounts.restricted === 0));
}

function codedError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "SCHEDULE_UI_PROBE_FAILED";
}
