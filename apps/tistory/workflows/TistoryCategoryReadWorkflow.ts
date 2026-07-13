import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export type TistoryCategory = Readonly<{ id: string; name: string; depth: number; parentId?: string }>;
export type TistoryCategoryResult = Readonly<{
  categories: readonly TistoryCategory[];
  supportsUncategorized: true;
  retrievedAt: string;
}>;

export class TistoryCategoryWorkflowError extends Error {
  constructor(readonly code: "worker_not_registered" | "session_expired" | "browser_launch_failed" | "category_read_failed", message: string, readonly remediation: string) { super(message); this.name = "TistoryCategoryWorkflowError"; }
}

export async function runTistoryCategoryReadWorkflow(input: Readonly<{ blogId: string; storageStatePath: string }>, workerPath = resolveTistoryCategoryWorkerPath()): Promise<TistoryCategoryResult> {
  try { await access(workerPath); } catch { throw new TistoryCategoryWorkflowError("worker_not_registered", "카테고리 조회 기능을 시작할 수 없습니다.", "Bright Studio를 다시 시작한 뒤 재시도해 주세요."); }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, input.blogId, input.storageStatePath], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (value) => { stdout += String(value); });
    child.stderr.on("data", (value) => { stderr += String(value); });
    child.on("error", (error) => { console.error("[tistory-category] worker launch failed", { error }); reject(new TistoryCategoryWorkflowError("browser_launch_failed", "브라우저를 시작할 수 없습니다.", "자동화 상태에서 Chromium 설치를 확인해 주세요.")); });
    child.on("exit", () => {
      const line = stdout.trim().split(/\r?\n/).at(-1);
      try {
        const result = JSON.parse(line ?? "") as TistoryCategoryResult & { errorCode?: TistoryCategoryWorkflowError["code"]; safeMessage?: string; remediation?: string };
        if (result.errorCode) {
          console.error("[tistory-category] registered workflow failed", { errorCode: result.errorCode, stderr });
          reject(new TistoryCategoryWorkflowError(result.errorCode, result.safeMessage ?? "카테고리를 불러오지 못했습니다.", result.remediation ?? "잠시 후 다시 시도해 주세요.")); return;
        }
        resolve(Object.freeze({ categories: Object.freeze(result.categories.map((item) => Object.freeze(item))), supportsUncategorized: true, retrievedAt: result.retrievedAt }));
      } catch (error) { console.error("[tistory-category] invalid worker result", { error, stderr }); reject(new TistoryCategoryWorkflowError("category_read_failed", "카테고리 응답을 확인할 수 없습니다.", "연결을 다시 확인한 뒤 재시도해 주세요.")); }
    });
  });
}

export function resolveTistoryCategoryWorkerPath(repositoryRoot = process.cwd()) { return path.resolve(repositoryRoot, "apps", "tistory", "workflows", "tistory-category-worker.mjs"); }
