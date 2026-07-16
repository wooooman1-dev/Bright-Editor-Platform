import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";

export type TistoryPublicPost = Readonly<{
  platform: "tistory"; publishingAccountId?: string; externalPostId: string; title: string;
  publishedUrl: string; categoryId?: string; categoryName?: string; publishedAt?: string;
  excerpt?: string; keywords: readonly string[]; status: "public"; retrievedAt: string;
}>;
export type TistoryPostCatalogState = "success" | "empty" | "partial";
export type TistoryPostCatalogResult = Readonly<{ posts: readonly TistoryPublicPost[]; state: TistoryPostCatalogState; retrievedAt: string; pagesRead: number; diagnostic?: string }>;

export class TistoryPostWorkflowError extends Error {
  constructor(readonly code: "worker_not_registered" | "session_expired" | "browser_launch_failed" | "selector_error" | "connection_error", message: string, readonly remediation: string) { super(message); this.name = "TistoryPostWorkflowError"; }
}

export async function runTistoryPostReadWorkflow(input: Readonly<{ blogId: string; storageStatePath: string }>, workerPath = resolveTistoryPostWorkerPath()): Promise<TistoryPostCatalogResult> {
  try { await access(workerPath); } catch { throw new TistoryPostWorkflowError("worker_not_registered", "게시글 조회 기능을 시작할 수 없습니다.", "Bright Studio를 다시 시작한 뒤 재시도해 주세요."); }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, input.blogId, input.storageStatePath], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (value) => { stdout += String(value); });
    child.stderr.on("data", (value) => { stderr += String(value); });
    child.on("error", () => reject(new TistoryPostWorkflowError("browser_launch_failed", "게시글 조회용 브라우저를 시작할 수 없습니다.", "Chromium 준비 상태를 확인해 주세요.")));
    child.on("exit", () => {
      try {
        const raw = JSON.parse(stdout.trim().split(/\r?\n/).at(-1) ?? "") as TistoryPostCatalogResult & { errorCode?: TistoryPostWorkflowError["code"]; safeMessage?: string; remediation?: string };
        if (raw.errorCode) { console.error("[tistory-posts] registered workflow failed", { errorCode: raw.errorCode, hasDiagnostic: Boolean(stderr) }); reject(new TistoryPostWorkflowError(raw.errorCode, raw.safeMessage ?? "게시글을 불러오지 못했습니다.", raw.remediation ?? "연결 상태를 확인해 주세요.")); return; }
        resolve(Object.freeze({ ...raw, posts: Object.freeze(raw.posts.map((post) => Object.freeze({ ...post, keywords: Object.freeze(post.keywords) }))) }));
      } catch { reject(new TistoryPostWorkflowError("connection_error", "게시글 조회 결과를 확인할 수 없습니다.", "연결 상태를 확인한 뒤 다시 시도해 주세요.")); }
    });
  });
}

export function resolveTistoryPostWorkerPath(repositoryRoot = process.cwd()) { return path.resolve(repositoryRoot, "apps", "tistory", "workflows", "tistory-post-worker.mjs"); }
