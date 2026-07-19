import { randomUUID } from "node:crypto";
import {
  calculateFreshness,
  fingerprintValue,
  type DataSourceConnectionRepository,
  type DataSourceProviderAdapter,
  type DataSourceSnapshot,
  type DataSourceSnapshotRepository,
  type OpportunityEvidenceRepository,
  type RawDataSourceSnapshotStore,
} from "../../../core/intelligence";
import type { SecretStore } from "../../../core/connections";
import { normalizeProviderEvidence } from "./EvidenceNormalizer";
import { connectionErrorMessage, DataSourceError, publicDataSourceError, type DataSourceErrorCode } from "./DataSourceErrors";

export type DataSourceSyncJobStatus = Readonly<{
  id: string;
  workspaceId: string;
  connectionId: string;
  operationId: string;
  state: "queued" | "syncing" | "completed" | "failed" | "superseded";
  message: string;
  updatedAt: string;
  cached?: boolean;
}>;

export class DataSourceSyncService {
  private readonly jobs = new Map<string, DataSourceSyncJobStatus>();
  private readonly activeConnections = new Set<string>();
  private readonly invalidatedOperations = new Set<string>();
  constructor(
    private readonly connections: DataSourceConnectionRepository,
    private readonly snapshots: DataSourceSnapshotRepository,
    private readonly evidence: OpportunityEvidenceRepository,
    private readonly rawSnapshots: RawDataSourceSnapshotStore,
    private readonly secrets: SecretStore,
    private readonly adapters: ReadonlyMap<string, DataSourceProviderAdapter>,
  ) {}

  async start(input: Readonly<{ workspaceId: string; connectionId: string; connectionVersion: number; periodStart: string; periodEnd: string; operationId?: string }>): Promise<DataSourceSyncJobStatus> {
    const connection = await this.connections.findById(input.connectionId);
    if (!connection || connection.workspaceId !== input.workspaceId) throw new DataSourceError("Data Source 연결을 찾을 수 없습니다.", "DATA_SOURCE_NOT_FOUND", 404);
    if (connection.version !== input.connectionVersion) throw new DataSourceError("연결 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", "DATA_SOURCE_CONFLICT", 409);
    if (!connection.enabled || connection.status === "disconnected" || connection.status === "configurationRequired") throw new DataSourceError("Data Source를 활성화하고 필수 연결 정보를 설정해 주세요.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400);
    if (!connection.secretReference || !(await this.secrets.secretExists(connection.secretReference))) throw new DataSourceError("연결 인증 정보가 없습니다. 연결 정보를 다시 설정해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 401);
    if (this.activeConnections.has(connection.id)) throw new DataSourceError("이미 이 Data Source의 동기화가 진행 중입니다.", "DATA_SOURCE_CONFLICT", 409);
    const latest = await this.snapshots.findLatestSuccessful(connection.id), operationId = input.operationId?.trim() || randomUUID(), id = randomUUID();
    if (latest?.periodStart === input.periodStart && latest.periodEnd === input.periodEnd && calculateFreshness(connection.provider, latest.syncedAt) === "fresh") {
      const cached = frozen(id, input.workspaceId, connection.id, operationId, "completed", "The latest successful snapshot already covers this period.", true); this.jobs.set(id, cached); return cached;
    }
    const adapter = this.adapters.get(connection.provider);
    if (!adapter) throw new DataSourceError("이 Provider는 공식 API 접근 구성이 필요합니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400);
    const now = new Date().toISOString(), initial = frozen(id, input.workspaceId, connection.id, operationId, "queued", "Sync queued.");
    this.jobs.set(id, initial); this.activeConnections.add(connection.id);
    await this.connections.save(Object.freeze({ ...connection, status: "syncing", activeOperationId: operationId, lastSyncAttemptAt: now, lastError: undefined, lastErrorCode: undefined, updatedAt: now, version: connection.version + 1 }));
    void this.run(id, connection.id, operationId, input.periodStart, input.periodEnd, adapter);
    return initial;
  }

  status(workspaceId: string, jobId: string): DataSourceSyncJobStatus | undefined {
    const job = this.jobs.get(jobId); return job?.workspaceId === workspaceId ? job : undefined;
  }

  invalidate(workspaceId: string, connectionId: string, operationId?: string): void {
    if (operationId) this.invalidatedOperations.add(operationKey(connectionId, operationId));
    for (const [jobId, job] of this.jobs) {
      if (job.workspaceId === workspaceId && job.connectionId === connectionId && !["completed", "failed", "superseded"].includes(job.state)) {
        this.update(jobId, "superseded", "The Data Source connection was deleted before synchronization completed.");
      }
    }
  }

  private async run(jobId: string, connectionId: string, operationId: string, periodStart: string, periodEnd: string, adapter: DataSourceProviderAdapter) {
    this.update(jobId, "syncing", "The official provider is being synchronized.");
    try {
      const started = await this.connections.findById(connectionId);
      if (this.invalidatedOperations.has(operationKey(connectionId, operationId))) return this.update(jobId, "superseded", "The Data Source connection was deleted before synchronization completed.");
      if (!started?.secretReference || started.activeOperationId !== operationId) return this.update(jobId, "superseded", "A newer connection operation replaced this sync.");
      const payload = await adapter.sync(started, { periodStart, periodEnd, operationId });
      const current = await this.connections.findById(connectionId);
      if (!current || current.workspaceId !== started.workspaceId || current.activeOperationId !== operationId || current.status === "disconnected") return this.update(jobId, "superseded", "A newer connection operation replaced this sync.");
      const syncedAt = new Date().toISOString(), snapshotId = `snapshot-${randomUUID()}`;
      const rawSnapshotReference = await this.rawSnapshots.write(current.workspaceId, current.id, snapshotId, payload.raw);
      if (this.invalidatedOperations.has(operationKey(connectionId, operationId))) return this.update(jobId, "superseded", "The Data Source connection was deleted before synchronization completed.");
      const snapshotValue = { snapshotId, connectionId: current.id, workspaceId: current.workspaceId, provider: current.provider, resourceReference: payload.resourceReference, periodStart: payload.periodStart, periodEnd: payload.periodEnd, observedAt: payload.observedAt, syncedAt, status: "ready" as const, schemaVersion: 1 as const, rawSnapshotReference, limitations: Object.freeze([...payload.limitations]), createdAt: syncedAt, operationId };
      const snapshot: DataSourceSnapshot = Object.freeze({ ...snapshotValue, fingerprint: fingerprintValue(snapshotValue) });
      const evidence = normalizeProviderEvidence(current, snapshot, payload.raw);
      const beforeCommit = await this.connections.findById(connectionId);
      if (!beforeCommit || beforeCommit.activeOperationId !== operationId || beforeCommit.workspaceId !== current.workspaceId || beforeCommit.status === "disconnected") return this.update(jobId, "superseded", "A newer connection operation replaced this sync.");
      await this.snapshots.save(snapshot); await this.evidence.saveMany(evidence);
      await this.connections.save(Object.freeze({ ...beforeCommit, status: "ready", activeOperationId: undefined, lastSuccessfulSyncAt: syncedAt, lastError: undefined, lastErrorCode: undefined, updatedAt: syncedAt, version: beforeCommit.version + 1 }));
      this.update(jobId, "completed", `Synchronized ${evidence.length} normalized Evidence records.`);
    } catch (error) {
      const current = await this.connections.findById(connectionId), failure = syncFailure(error), message = failure.error;
      if (current?.activeOperationId === operationId) await this.connections.save(Object.freeze({ ...current, status: "error", activeOperationId: undefined, lastError: message, lastErrorCode: failure.code, updatedAt: new Date().toISOString(), version: current.version + 1 }));
      this.update(jobId, "failed", message);
    } finally { this.activeConnections.delete(connectionId); this.invalidatedOperations.delete(operationKey(connectionId, operationId)); }
  }

  private update(id: string, state: DataSourceSyncJobStatus["state"], message: string, cached?: boolean) {
    const prior = this.jobs.get(id); if (!prior) return;
    this.jobs.set(id, Object.freeze({ ...prior, state, message, updatedAt: new Date().toISOString(), ...(cached ? { cached: true } : {}) }));
  }
}

function frozen(id: string, workspaceId: string, connectionId: string, operationId: string, state: DataSourceSyncJobStatus["state"], message: string, cached?: boolean): DataSourceSyncJobStatus { return Object.freeze({ id, workspaceId, connectionId, operationId, state, message, updatedAt: new Date().toISOString(), ...(cached ? { cached: true } : {}) }); }
function operationKey(connectionId: string, operationId: string): string { return `${connectionId}:${operationId}`; }
function syncFailure(error: unknown): Readonly<{ error: string; code: DataSourceErrorCode }> {
  const failure = publicDataSourceError(error, { error: connectionErrorMessage("DATA_SOURCE_PROVIDER_ERROR"), code: "DATA_SOURCE_PROVIDER_ERROR", status: 502 });
  return Object.freeze({ error: connectionErrorMessage(failure.code, failure.error), code: failure.code });
}
