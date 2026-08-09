import type { SecretStore } from "../../../core/connections";
import type {
  DataSourceConnection,
  DataSourceConnectionRepository,
  DataSourceSnapshotRepository,
  OpportunityEvidenceRepository,
  ProjectDataSourceReferenceRepository,
} from "../../../core/intelligence";
import type { SafeBackupWriter } from "../SafeDeletionService";
import { DataSourceError } from "./DataSourceErrors";
import type { DataSourceDeletionTombstone, DurableDataSourceDeletionRepository } from "./DataSourceRepositories";

export type DataSourceDeletionMode = "deleteDisconnected" | "disconnectAndDelete";
export type DataSourceDeletionResult = Readonly<{
  deleted: true;
  alreadyDeleted: boolean;
  connectionId: string;
  status: "deleted";
  removedProjectReferences: number;
  retainedSnapshots: number;
  retainedEvidence: number;
}>;

export class DataSourceDeletionService {
  constructor(
    private readonly connections: DataSourceConnectionRepository,
    private readonly references: ProjectDataSourceReferenceRepository,
    private readonly snapshots: DataSourceSnapshotRepository,
    private readonly evidence: OpportunityEvidenceRepository,
    private readonly metadata: Pick<DurableDataSourceDeletionRepository, "findTombstone" | "deleteConnectionAndReferences">,
    private readonly secrets: SecretStore,
    private readonly oauthStates: Readonly<{ invalidate(input: Readonly<{ workspaceId: string; connectionId?: string }>): Promise<void> }>,
    private readonly oauthCredentials: Readonly<{ revoke(connection: DataSourceConnection): Promise<void> }>,
    private readonly sync: Readonly<{ invalidate(workspaceId: string, connectionId: string, operationId?: string): void }>,
    private readonly backupWriter: SafeBackupWriter,
  ) {}

  async delete(input: Readonly<{ workspaceId: string; connectionId: string; connectionVersion: number; confirmationMode: DataSourceDeletionMode }>): Promise<DataSourceDeletionResult> {
    const connection = await this.connections.findById(input.connectionId);
    if (!connection) return this.deletedResult(await this.metadata.findTombstone(input.connectionId), input.workspaceId, input.connectionId);
    if (connection.workspaceId !== input.workspaceId) throw new DataSourceError("이 Workspace에서 Data Source 연결을 삭제할 수 없습니다.", "DATA_SOURCE_PERMISSION_ERROR", 403);
    if (connection.version !== input.connectionVersion) throw new DataSourceError("연결 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", "DATA_SOURCE_CONFLICT", 409, "connectionVersion");
    const active = connection.status !== "disconnected";
    if (active && input.confirmationMode !== "disconnectAndDelete") throw new DataSourceError("활성 Data Source는 연결 해제 후 삭제 확인이 필요합니다.", "DATA_SOURCE_CONFLICT", 409, "confirmationMode");
    if (!active && input.confirmationMode !== "deleteDisconnected") throw new DataSourceError("연결 해제된 Data Source 삭제 확인이 필요합니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "confirmationMode");

    const workspaceReferences = await this.references.listByWorkspace(input.workspaceId);
    const relatedReferences = workspaceReferences.filter((reference) => reference.connectionId === connection.id);
    if (relatedReferences.some((reference) => reference.workspaceId !== connection.workspaceId)) throw new DataSourceError("Project 참조 소유권을 확인할 수 없습니다.", "DATA_SOURCE_PERMISSION_ERROR", 403);
    const retainedSnapshots = (await this.snapshots.listByWorkspace(input.workspaceId)).filter((snapshot) => snapshot.connectionId === connection.id);
    const retainedEvidence = (await this.evidence.listByWorkspace(input.workspaceId)).filter((value) => value.connectionId === connection.id);
    const deletedAt = new Date().toISOString();
    const tombstone: DataSourceDeletionTombstone = Object.freeze({
      connectionId: connection.id, workspaceId: connection.workspaceId, provider: connection.provider, displayName: connection.displayName,
      resourceConfiguration: connection.resourceConfiguration, priorStatus: connection.status, projectReferenceCount: relatedReferences.length,
      snapshotCount: retainedSnapshots.length, evidenceCount: retainedEvidence.length, deletedAt, status: "archived",
    });
    await this.backupWriter.write("data-source", connection.id, {
      connection: safeConnection(connection), projectReferences: relatedReferences, snapshots: retainedSnapshots, evidence: retainedEvidence, tombstone,
    });

    this.sync.invalidate(connection.workspaceId, connection.id, connection.activeOperationId);
    const invalidated = Object.freeze({ ...connection, status: "disconnected" as const, enabled: false, activeOperationId: undefined, updatedAt: deletedAt, version: connection.version + 1 });
    await this.connections.save(invalidated);
    await this.oauthStates.invalidate({ workspaceId: connection.workspaceId, connectionId: connection.id });
    const sharedCredential = await this.credentialIsShared(connection);
    if (!sharedCredential) {
      await this.oauthCredentials.revoke(connection).catch(() => undefined);
      if (connection.secretReference) await this.secrets.deleteSecret(connection.secretReference);
    }
    const scrubbed = Object.freeze({ ...invalidated, secretReference: undefined, lastError: undefined, lastErrorCode: undefined, version: invalidated.version + 1 });
    await this.connections.save(scrubbed);
    await this.metadata.deleteConnectionAndReferences(connection.id, relatedReferences, tombstone);
    return Object.freeze({ deleted: true, alreadyDeleted: false, connectionId: connection.id, status: "deleted", removedProjectReferences: relatedReferences.length, retainedSnapshots: retainedSnapshots.length, retainedEvidence: retainedEvidence.length });
  }

  private async credentialIsShared(connection: DataSourceConnection): Promise<boolean> {
    if (!connection.secretReference) return false;
    return (await this.connections.listByWorkspace(connection.workspaceId)).some((value) => value.id !== connection.id && value.secretReference === connection.secretReference && value.status !== "disconnected");
  }

  private deletedResult(tombstone: DataSourceDeletionTombstone | undefined, workspaceId: string, connectionId: string): DataSourceDeletionResult {
    if (!tombstone || tombstone.workspaceId !== workspaceId) throw new DataSourceError("Data Source 연결을 찾을 수 없습니다.", "DATA_SOURCE_NOT_FOUND", 404);
    return Object.freeze({ deleted: true, alreadyDeleted: true, connectionId, status: "deleted", removedProjectReferences: tombstone.projectReferenceCount, retainedSnapshots: tombstone.snapshotCount, retainedEvidence: tombstone.evidenceCount });
  }
}

function safeConnection(connection: DataSourceConnection) {
  const { secretReference: _secret, activeOperationId: _operation, ...safe } = connection;
  void _secret; void _operation;
  return safe;
}
