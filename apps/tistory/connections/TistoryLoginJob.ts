import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import type { ConnectionFailureDiagnostic, ConnectionJob, ConnectionJobState } from "../../../core/connections";

type WorkerEvent = Readonly<{ state: ConnectionJobState; message: string; failureCode?: ConnectionFailureDiagnostic["failureCode"]; safeMessage?: string; remediation?: string }>;

export class TistoryLoginJob implements ConnectionJob {
  private child?: ChildProcess;
  constructor(readonly connectionId: string, private readonly blogId: string, private readonly storagePath: string, private readonly onConnected: () => Promise<void>, private readonly workerPath = resolveTistoryConnectionWorkerPath()) {}

  async run(report: (state: ConnectionJobState, message: string, diagnostic?: ConnectionFailureDiagnostic) => void, signal: AbortSignal): Promise<void> {
    const worker = this.workerPath;
    try { await access(worker); }
    catch (error) {
      console.error("[tistory-login-job] worker is not registered", { connectionId: this.connectionId, worker, error });
      report("failed", "The Tistory connection worker is unavailable.", diagnostic("worker_not_registered", "The Tistory connection worker is unavailable.", "Restore the registered Tistory worker and restart Bright Studio."));
      throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [worker, this.blogId, this.storagePath], { stdio: ["ignore", "pipe", "pipe"], windowsHide: false }); this.child = child;
      let buffer = "";
      child.stdout?.on("data", (data) => {
        buffer += String(data); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) consumeWorkerEvent(line, report, this.connectionId);
      });
      child.stderr?.on("data", (data) => console.error("[tistory-login-worker]", { connectionId: this.connectionId, detail: String(data) }));
      signal.addEventListener("abort", () => child.kill(), { once: true });
      child.on("error", (error) => {
        console.error("[tistory-login-job] worker process failed", { connectionId: this.connectionId, error });
        report("failed", "The Tistory connection worker could not start.", diagnostic("worker_not_registered", "The Tistory connection worker could not start.", "Restart Bright Studio and verify the registered worker file."));
        reject(error);
      });
      child.on("exit", async (code) => {
        this.child = undefined;
        if (buffer.trim()) consumeWorkerEvent(buffer, report, this.connectionId);
        if (code === 0) { try { await this.onConnected(); resolve(); } catch (error) { console.error("[tistory-login-job] connection verification persistence failed", { connectionId: this.connectionId, error }); report("failed", "The verified connection could not be saved.", diagnostic("verification_failed", "The verified connection could not be saved.", "Check local data write access, then reconnect.")); reject(error); } }
        else reject(new Error(`Tistory connection worker exited with code ${String(code)}.`));
      });
    });
  }
}

export function resolveTistoryConnectionWorkerPath(repositoryRoot = process.cwd()): string {
  return path.resolve(repositoryRoot, "apps", "tistory", "connections", "tistory-connection-worker.mjs");
}

function consumeWorkerEvent(line: string, report: (state: ConnectionJobState, message: string, diagnostic?: ConnectionFailureDiagnostic) => void, connectionId: string) {
  try {
    const event = JSON.parse(line) as WorkerEvent;
    const failure = event.failureCode && event.safeMessage && event.remediation ? diagnostic(event.failureCode, event.safeMessage, event.remediation) : undefined;
    report(event.state, event.safeMessage ?? event.message, failure);
  } catch (error) { console.error("[tistory-login-job] malformed worker event", { connectionId, error }); }
}
function diagnostic(failureCode: ConnectionFailureDiagnostic["failureCode"], safeMessage: string, remediation: string): ConnectionFailureDiagnostic { return { failureCode, safeMessage, remediation }; }
