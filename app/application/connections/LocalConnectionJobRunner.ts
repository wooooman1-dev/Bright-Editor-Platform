import { randomUUID } from "node:crypto";
import type { ConnectionFailureDiagnostic, ConnectionJob, ConnectionJobRunner, ConnectionJobState, ConnectionJobStatus } from "../../../core/connections";

export class LocalConnectionJobRunner implements ConnectionJobRunner {
  private readonly jobs = new Map<string, { status: ConnectionJobStatus; controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
  constructor(private readonly timeoutMs = 300_000) {}
  async start(job: ConnectionJob) {
    if ([...this.jobs.values()].some((value) => value.status.connectionId === job.connectionId && active(value.status.state))) throw new Error("A connection attempt is already active.");
    const id = randomUUID(), controller = new AbortController();
    const update = (state: ConnectionJobState, message: string, diagnostic?: ConnectionFailureDiagnostic) => { const record = this.jobs.get(id); if (record) record.status = frozen(id, job.connectionId, state, safeMessage(message), diagnostic); };
    const timer = setTimeout(() => { update("timed_out", "Tistory login timed out.", diagnostic("login_timeout", "Tistory login was not completed in time.", "Complete the login within five minutes, then try connecting again.")); controller.abort(); }, this.timeoutMs);
    const initial = frozen(id, job.connectionId, "queued", "Connection queued."); this.jobs.set(id, { status: initial, controller, timer });
    void job.run(update, controller.signal).then(() => { if (active(this.status(id)!.state)) update("completed", "Connected."); }).catch((error) => { if (active(this.status(id)!.state)) { console.error("[connection-job] unclassified failure", { connectionId: job.connectionId, error }); update("failed", "The connection attempt failed.", diagnostic("unknown_error", "The connection attempt failed unexpectedly.", "Try again. If the problem continues, check the server log.")); } }).finally(() => clearTimeout(timer));
    return initial;
  }
  status(id: string) { return this.jobs.get(id)?.status; }
  statusByConnection(connectionId: string) {
    return [...this.jobs.values()]
      .map((record) => record.status)
      .find((status) => status.connectionId === connectionId && active(status.state));
  }
  async cancel(id: string) { const record = this.jobs.get(id); if (!record) throw new Error("Connection job was not found."); record.controller.abort(); clearTimeout(record.timer); record.status = frozen(id, record.status.connectionId, "cancelled", "Connection cancelled."); return record.status; }
}
function frozen(id: string, connectionId: string, state: ConnectionJobState, message: string, failure?: ConnectionFailureDiagnostic) { return Object.freeze({ id, connectionId, state, message, updatedAt: new Date().toISOString(), ...(failure ? { failureCode: failure.failureCode, safeMessage: safeMessage(failure.safeMessage), remediation: safeMessage(failure.remediation) } : {}) }); }
function active(state: ConnectionJobState) { return ["queued", "starting", "waiting_for_user", "verifying"].includes(state); }
function safeMessage(message: string) { return message.replace(/[A-Z]:\\[^\s]+/gi, "local data").slice(0, 180); }
function diagnostic(failureCode: ConnectionFailureDiagnostic["failureCode"], safeMessage: string, remediation: string): ConnectionFailureDiagnostic { return { failureCode, safeMessage, remediation }; }
