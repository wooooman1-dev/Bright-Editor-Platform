import type { PlatformConnection, PublishingTarget } from "./PlatformConnection";

export interface PlatformConnectionRepository {
  delete(id: string): Promise<void>;
  findById(id: string): Promise<PlatformConnection | undefined>;
  listByWorkspace(workspaceId: string): Promise<readonly PlatformConnection[]>;
  save(connection: PlatformConnection): Promise<void>;
}
export interface SecretStore {
  storeSecret(scope: string, secretData: string): Promise<string>;
  readSecret(secretReference: string): Promise<string>;
  replaceSecret(secretReference: string, secretData: string): Promise<void>;
  deleteSecret(secretReference: string): Promise<void>;
  secretExists(secretReference: string): Promise<boolean>;
}
export type ConnectionJobState = "queued" | "starting" | "waiting_for_user" | "verifying" | "completed" | "failed" | "cancelled" | "timed_out";
export type ConnectionFailureCode = "browser_backend_unavailable" | "chromium_not_installed" | "worker_not_registered" | "browser_launch_failed" | "login_timeout" | "session_not_created" | "invalid_blog_url" | "network_access_denied" | "verification_failed" | "unknown_error";
export type ConnectionFailureDiagnostic = Readonly<{ failureCode: ConnectionFailureCode; safeMessage: string; remediation: string }>;
export type ConnectionJobStatus = Readonly<{ id: string; connectionId: string; state: ConnectionJobState; message: string; updatedAt: string; failureCode?: ConnectionFailureCode; safeMessage?: string; remediation?: string }>;
export interface ConnectionJob { readonly connectionId: string; run(report: (state: ConnectionJobState, message: string, diagnostic?: ConnectionFailureDiagnostic) => void, signal: AbortSignal): Promise<void>; }
export interface ConnectionJobRunner { start(job: ConnectionJob): Promise<ConnectionJobStatus>; status(jobId: string): ConnectionJobStatus | undefined; cancel(jobId: string): Promise<ConnectionJobStatus>; }
export interface PublishingTargetRepository {
  findByProject(projectId: string): Promise<PublishingTarget | undefined>;
  listByProject?(projectId: string): Promise<readonly PublishingTarget[]>;
  save(target: PublishingTarget): Promise<void>;
  delete(projectId: string): Promise<void>;
}
