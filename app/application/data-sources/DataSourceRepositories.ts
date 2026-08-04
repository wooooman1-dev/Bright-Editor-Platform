import type {
  DataSourceConnection,
  DataSourceConnectionRepository,
  DataSourceSnapshot,
  DataSourceSnapshotRepository,
  OpportunityEvidenceRecord,
  OpportunityEvidenceRepository,
  ProjectDataSourceReference,
  ProjectDataSourceReferenceRepository,
} from "../../../core/intelligence";
import type { PersistenceStore } from "../../../core/data";
import { DataSourceError } from "./DataSourceErrors";
import { projectDataSourceScopeConflict, projectScopedReferences } from "./ProjectDataSourceScopePolicy";

const connectionCollection = "data-source-connections";
const referenceCollection = "project-data-source-references";
const deletionCollection = "data-source-deletion-tombstones";

export type DataSourceDeletionTombstone = Readonly<{
  connectionId: string;
  workspaceId: string;
  provider: DataSourceConnection["provider"];
  displayName: string;
  resourceConfiguration: DataSourceConnection["resourceConfiguration"];
  priorStatus: DataSourceConnection["status"];
  projectReferenceCount: number;
  snapshotCount: number;
  evidenceCount: number;
  deletedAt: string;
  status: "archived";
}>;

export class DurableDataSourceConnectionRepository implements DataSourceConnectionRepository {
  constructor(private readonly store: PersistenceStore) {}
  delete(id: string) { return this.store.delete(connectionCollection, id); }
  findById(id: string) { return this.store.get<DataSourceConnection>(connectionCollection, id); }
  async listByWorkspace(workspaceId: string) { return (await this.store.list<DataSourceConnection>(connectionCollection)).filter((value) => value.workspaceId === workspaceId); }
  async save(value: DataSourceConnection) { await assertNotDeleted(this.store, value.id); return this.store.set(connectionCollection, value.id, value); }
}

export class DurableProjectDataSourceReferenceRepository implements ProjectDataSourceReferenceRepository {
  constructor(private readonly store: PersistenceStore) {}
  async listByProject(projectId: string) {
    const references = await this.store.list<ProjectDataSourceReference>(referenceCollection);
    return projectScopedReferences(references, projectId);
  }
  async listByWorkspace(workspaceId: string) { return (await this.store.list<ProjectDataSourceReference>(referenceCollection)).filter((value) => value.workspaceId === workspaceId); }
  async save(value: ProjectDataSourceReference) {
    const references = await this.store.list<ProjectDataSourceReference>(referenceCollection);
    const conflict = projectDataSourceScopeConflict(references, value);
    if (conflict) {
      throw new DataSourceError(
        "이 Data Source 연결은 이미 다른 Project에 배정되어 있습니다. 현재 Project 전용 연결을 새로 추가해 주세요.",
        "DATA_SOURCE_PROJECT_SCOPE_CONFLICT",
        409,
        "connectionId",
      );
    }
    return this.store.set(referenceCollection, `${value.projectId}:${value.connectionId}`, value);
  }
  delete(projectId: string, connectionId: string) { return this.store.delete(referenceCollection, `${projectId}:${connectionId}`); }
}

export class DurableDataSourceSnapshotRepository implements DataSourceSnapshotRepository {
  constructor(private readonly store: PersistenceStore) {}
  async findLatestSuccessful(connectionId: string) {
    return (await this.store.list<DataSourceSnapshot>("data-source-snapshots"))
      .filter((value) => value.connectionId === connectionId && value.status !== "failed")
      .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))[0];
  }
  async listByWorkspace(workspaceId: string) { return (await this.store.list<DataSourceSnapshot>("data-source-snapshots")).filter((value) => value.workspaceId === workspaceId); }
  async save(value: DataSourceSnapshot) { await assertNotDeleted(this.store, value.connectionId); return this.store.set("data-source-snapshots", value.snapshotId, value); }
}

export class DurableOpportunityEvidenceRepository implements OpportunityEvidenceRepository {
  constructor(private readonly store: PersistenceStore) {}
  findById(id: string) { return this.store.get<OpportunityEvidenceRecord>("opportunity-evidence", id); }
  async listByWorkspace(workspaceId: string) { return (await this.store.list<OpportunityEvidenceRecord>("opportunity-evidence")).filter((value) => value.workspaceId === workspaceId); }
  async saveMany(values: readonly OpportunityEvidenceRecord[]) {
    for (const connectionId of [...new Set(values.flatMap((value) => value.connectionId ? [value.connectionId] : []))]) await assertNotDeleted(this.store, connectionId);
    for (const value of values) await this.store.set("opportunity-evidence", value.evidenceId, value);
  }
}

export class DurableDataSourceDeletionRepository {
  constructor(private readonly store: PersistenceStore) {}
  findTombstone(connectionId: string) { return this.store.get<DataSourceDeletionTombstone>(deletionCollection, connectionId); }
  deleteConnectionAndReferences(connectionId: string, references: readonly ProjectDataSourceReference[], tombstone: DataSourceDeletionTombstone) {
    return this.store.batch([
      { type: "set", collection: deletionCollection, id: connectionId, value: tombstone },
      ...references.map((reference) => ({ type: "delete" as const, collection: referenceCollection, id: `${reference.projectId}:${reference.connectionId}` })),
      { type: "delete", collection: connectionCollection, id: connectionId },
    ]);
  }
}

async function assertNotDeleted(store: PersistenceStore, connectionId: string): Promise<void> {
  if (await store.get<DataSourceDeletionTombstone>(deletionCollection, connectionId)) throw new Error("Deleted Data Source metadata cannot be recreated.");
}
