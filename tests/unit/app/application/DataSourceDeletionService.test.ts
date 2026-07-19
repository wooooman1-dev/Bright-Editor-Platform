import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryPersistenceStore } from "../../../../core/data";
import type { DataSourceConnection, OpportunityEvidenceRecord } from "../../../../core/intelligence";
import { DataSourceDeletionService } from "../../../../app/application/data-sources/DataSourceDeletionService";
import { DurableDataSourceConnectionRepository, DurableDataSourceDeletionRepository, DurableDataSourceSnapshotRepository, DurableOpportunityEvidenceRepository, DurableProjectDataSourceReferenceRepository } from "../../../../app/application/data-sources/DataSourceRepositories";
import { OpportunityEvidenceService } from "../../../../app/application/data-sources/OpportunityEvidenceService";
import type { UserData, UserProject } from "../../../../app/user-flow/user-data";

const disconnected: DataSourceConnection = Object.freeze({ id: "delete-me", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "Old GSC", status: "disconnected", resourceConfiguration: { siteProperty: "sc-domain:old.example" }, enabled: false, createdAt: "old", updatedAt: "old", version: 3 });
const active: DataSourceConnection = Object.freeze({ ...disconnected, status: "ready", enabled: true, secretReference: "secret-reference", credentialMode: "googleOAuth", activeOperationId: "operation-1", version: 5 });

function setup() {
  const store = new InMemoryPersistenceStore();
  const connections = new DurableDataSourceConnectionRepository(store), references = new DurableProjectDataSourceReferenceRepository(store), snapshots = new DurableDataSourceSnapshotRepository(store), evidence = new DurableOpportunityEvidenceRepository(store), metadata = new DurableDataSourceDeletionRepository(store);
  const secrets = { storeSecret: vi.fn(), readSecret: vi.fn(), replaceSecret: vi.fn(), deleteSecret: vi.fn().mockResolvedValue(undefined), secretExists: vi.fn() };
  const oauthStates = { invalidate: vi.fn().mockResolvedValue(undefined) }, oauthCredentials = { revoke: vi.fn().mockResolvedValue(undefined) }, sync = { invalidate: vi.fn() }, backup = { write: vi.fn().mockResolvedValue("backup.json") };
  const service = new DataSourceDeletionService(connections, references, snapshots, evidence, metadata, secrets, oauthStates, oauthCredentials, sync, backup);
  return { store, connections, references, snapshots, evidence, metadata, secrets, oauthStates, oauthCredentials, sync, backup, service };
}

async function seedRetained(value: ReturnType<typeof setup>, connection: DataSourceConnection = disconnected) {
  await value.connections.save(connection);
  await value.connections.save({ ...active, id: "keep-me", displayName: "Current GSC", activeOperationId: undefined, version: 1 });
  await value.references.save({ workspaceId: "workspace-1", projectId: "project-1", connectionId: connection.id, enabled: true, updatedAt: "now" });
  await value.references.save({ workspaceId: "workspace-1", projectId: "project-2", connectionId: connection.id, enabled: true, updatedAt: "now" });
  await value.references.save({ workspaceId: "workspace-1", projectId: "project-1", connectionId: "keep-me", enabled: true, updatedAt: "now" });
  await value.snapshots.save({ snapshotId: "snapshot-old", connectionId: connection.id, workspaceId: "workspace-1", provider: "googleSearchConsole", resourceReference: "sc-domain:old.example", periodStart: "2026-06-01", periodEnd: "2026-06-30", observedAt: "2026-06-30", syncedAt: "2026-07-01", status: "ready", schemaVersion: 1, rawSnapshotReference: "raw.json", fingerprint: "fingerprint", limitations: [], createdAt: "now", operationId: "old-operation" });
  await value.evidence.saveMany([evidenceRecord(connection.id)]);
}

describe("Data Source safe deletion", () => {
  let value: ReturnType<typeof setup>;
  beforeEach(() => { value = setup(); });

  it("deletes a disconnected Connection and all of its Project references while retaining snapshots and Evidence", async () => {
    await seedRetained(value);
    const result = await value.service.delete({ workspaceId: "workspace-1", connectionId: disconnected.id, connectionVersion: disconnected.version, confirmationMode: "deleteDisconnected" });
    expect(result).toMatchObject({ deleted: true, alreadyDeleted: false, removedProjectReferences: 2, retainedSnapshots: 1, retainedEvidence: 1 });
    expect(await value.connections.findById(disconnected.id)).toBeUndefined();
    expect((await value.references.listByWorkspace("workspace-1")).map((item) => item.connectionId)).toEqual(["keep-me"]);
    expect(await value.snapshots.findLatestSuccessful(disconnected.id)).toMatchObject({ snapshotId: "snapshot-old" });
    expect((await value.evidence.listByWorkspace("workspace-1")).map((item) => item.evidenceId)).toContain("evidence-old");
    expect(await value.metadata.findTombstone(disconnected.id)).toMatchObject({ status: "archived", provider: "googleSearchConsole", snapshotCount: 1, evidenceCount: 1 });
    expect(value.backup.write).toHaveBeenCalledBefore(value.oauthStates.invalidate);
  });

  it("excludes deleted-connection Evidence from new Planning without changing persisted historical Evidence IDs", async () => {
    await seedRetained(value);
    const historicalOpportunity = Object.freeze({ evidenceIds: ["evidence-old"] });
    await value.service.delete({ workspaceId: "workspace-1", connectionId: disconnected.id, connectionVersion: disconnected.version, confirmationMode: "deleteDisconnected" });
    const planning = new OpportunityEvidenceService(value.connections, value.references, value.evidence);
    const project: UserProject = { id: "project-1", workspaceId: "workspace-1", name: "Health", description: "health", createdAt: "now", updatedAt: "now" };
    const data: UserData = { workspace: { id: "workspace-1", name: "Workspace" }, brands: [], projects: [project], contents: [], history: [], qualityReports: [], publishingRecords: [], scheduledPublishing: [] };
    const bundle = await planning.buildPlanningBundle(data, project);
    expect(bundle.some((item) => item.connectionId === disconnected.id)).toBe(false);
    expect(historicalOpportunity.evidenceIds).toEqual(["evidence-old"]);
  });

  it("requires strong confirmation for an active Connection, invalidates sync, and tolerates revoke failure", async () => {
    await seedRetained(value, active);
    await expect(value.service.delete({ workspaceId: "workspace-1", connectionId: active.id, connectionVersion: active.version, confirmationMode: "deleteDisconnected" })).rejects.toMatchObject({ code: "DATA_SOURCE_CONFLICT", status: 409 });
    value.oauthCredentials.revoke.mockRejectedValueOnce(new Error("remote revoke failed with secret"));
    await expect(value.service.delete({ workspaceId: "workspace-1", connectionId: active.id, connectionVersion: active.version, confirmationMode: "disconnectAndDelete" })).resolves.toMatchObject({ deleted: true });
    expect(value.sync.invalidate).toHaveBeenCalledWith("workspace-1", active.id, "operation-1");
    expect(value.secrets.deleteSecret).toHaveBeenCalledWith("secret-reference");
    expect(await value.connections.findById(active.id)).toBeUndefined();
  });

  it("keeps Connection metadata and Project references when SecretStore deletion fails", async () => {
    await seedRetained(value, active);
    value.secrets.deleteSecret.mockRejectedValueOnce(new Error("DPAPI deletion failed"));
    await expect(value.service.delete({ workspaceId: "workspace-1", connectionId: active.id, connectionVersion: active.version, confirmationMode: "disconnectAndDelete" })).rejects.toThrow("DPAPI deletion failed");
    expect(await value.connections.findById(active.id)).toMatchObject({ status: "disconnected", secretReference: "secret-reference" });
    expect((await value.references.listByWorkspace("workspace-1")).filter((item) => item.connectionId === active.id)).toHaveLength(2);
    expect(await value.metadata.findTombstone(active.id)).toBeUndefined();
  });

  it("keeps Connection metadata when the atomic reference/Connection deletion fails", async () => {
    await seedRetained(value);
    const failing = new DataSourceDeletionService(value.connections, value.references, value.snapshots, value.evidence, { findTombstone: value.metadata.findTombstone.bind(value.metadata), deleteConnectionAndReferences: vi.fn().mockRejectedValue(new Error("metadata write failed")) }, value.secrets, value.oauthStates, value.oauthCredentials, value.sync, value.backup);
    await expect(failing.delete({ workspaceId: "workspace-1", connectionId: disconnected.id, connectionVersion: disconnected.version, confirmationMode: "deleteDisconnected" })).rejects.toThrow("metadata write failed");
    expect(await value.connections.findById(disconnected.id)).toMatchObject({ status: "disconnected" });
    expect((await value.references.listByWorkspace("workspace-1")).filter((item) => item.connectionId === disconnected.id)).toHaveLength(2);
  });

  it("rejects stale versions and foreign Workspaces and handles a repeated delete idempotently", async () => {
    await value.connections.save(disconnected);
    await expect(value.service.delete({ workspaceId: "workspace-1", connectionId: disconnected.id, connectionVersion: 2, confirmationMode: "deleteDisconnected" })).rejects.toMatchObject({ code: "DATA_SOURCE_CONFLICT", status: 409 });
    await expect(value.service.delete({ workspaceId: "workspace-2", connectionId: disconnected.id, connectionVersion: 3, confirmationMode: "deleteDisconnected" })).rejects.toMatchObject({ code: "DATA_SOURCE_PERMISSION_ERROR", status: 403 });
    await value.service.delete({ workspaceId: "workspace-1", connectionId: disconnected.id, connectionVersion: 3, confirmationMode: "deleteDisconnected" });
    await expect(value.service.delete({ workspaceId: "workspace-1", connectionId: disconnected.id, connectionVersion: 3, confirmationMode: "deleteDisconnected" })).resolves.toMatchObject({ alreadyDeleted: true, connectionId: disconnected.id });
    await expect(value.service.delete({ workspaceId: "workspace-1", connectionId: "missing", connectionVersion: 1, confirmationMode: "deleteDisconnected" })).rejects.toMatchObject({ code: "DATA_SOURCE_NOT_FOUND", status: 404 });
  });
});

function evidenceRecord(connectionId: string): OpportunityEvidenceRecord {
  return { evidenceId: "evidence-old", workspaceId: "workspace-1", connectionId, provider: "googleSearchConsole", evidenceType: "searchPerformance", metric: "clicks", keyword: "health", observedAt: "2026-06-30", syncedAt: "2026-07-01", freshness: "fresh", verified: true, value: 1, unit: "clicks", confidence: 1, limitations: [], sourceReference: "sc-domain:old.example", resourceScope: "query", version: 1, fingerprint: "fingerprint" };
}
