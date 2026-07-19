import { describe, expect, it, vi } from "vitest";
import { InMemoryPersistenceStore } from "../../../../core/data";
import type { DataSourceProviderAdapter, RawDataSourceSnapshotStore } from "../../../../core/intelligence";
import { DurableDataSourceConnectionRepository, DurableDataSourceDeletionRepository, DurableDataSourceSnapshotRepository, DurableOpportunityEvidenceRepository } from "../../../../app/application/data-sources/DataSourceRepositories";
import { DataSourceSyncService } from "../../../../app/application/data-sources/DataSourceSyncService";
import { DataSourceError } from "../../../../app/application/data-sources/DataSourceErrors";

function setup(failure?: unknown) {
  const store = new InMemoryPersistenceStore(), connections = new DurableDataSourceConnectionRepository(store), snapshots = new DurableDataSourceSnapshotRepository(store), evidence = new DurableOpportunityEvidenceRepository(store);
  const secret = { storeSecret: vi.fn(), readSecret: vi.fn().mockResolvedValue("token"), replaceSecret: vi.fn(), deleteSecret: vi.fn(), secretExists: vi.fn().mockResolvedValue(true) };
  const raw: RawDataSourceSnapshotStore = { write: vi.fn().mockResolvedValue("raw.json"), read: vi.fn() };
  const adapter: DataSourceProviderAdapter = { provider: "googleSearchConsole", sync: failure ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue({ resourceReference: "sc-domain:example.com", periodStart: "2026-07-01", periodEnd: "2026-07-18", observedAt: "2026-07-18", raw: { rows: [{ keys: ["장 건강", "https://example.com/gut"], clicks: 3 }] }, limitations: [] }) };
  const service = new DataSourceSyncService(connections, snapshots, evidence, raw, secret, new Map([[adapter.provider, adapter]]));
  return { store, connections, snapshots, evidence, metadata: new DurableDataSourceDeletionRepository(store), service, adapter };
}

describe("Data Source manual synchronization", () => {
  it("stores a raw reference and normalized Evidence while preventing duplicate active sync", async () => {
    const value = setup(); await value.connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret-1", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    const job = await value.service.start({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 1, periodStart: "2026-07-01", periodEnd: "2026-07-18", operationId: "operation-1" });
    await expect(value.service.start({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 2, periodStart: "2026-07-01", periodEnd: "2026-07-18" })).rejects.toMatchObject({ code: "DATA_SOURCE_CONFLICT" });
    await vi.waitFor(() => expect(value.service.status("workspace-1", job.id)?.state).toBe("completed"));
    expect((await value.snapshots.listByWorkspace("workspace-1"))).toHaveLength(1);
    expect((await value.evidence.listByWorkspace("workspace-1"))).toHaveLength(1);
    expect((await value.connections.findById("connection-1"))?.status).toBe("ready");
  });

  it("isolates provider failure and retains the last successful snapshot", async () => {
    const value = setup(new DataSourceError("Google 인증을 갱신하지 못했습니다. 계정을 다시 연결해 주세요.", "GOOGLE_OAUTH_REFRESH_FAILED", 401)); await value.connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "ready", secretReference: "secret-1", credentialMode: "googleOAuth", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, availableResources: [{ siteUrl: "sc-domain:example.com" }], enabled: true, lastSuccessfulSyncAt: "2026-07-17T00:00:00.000Z", createdAt: "now", updatedAt: "now", version: 1 });
    await value.snapshots.save({ snapshotId: "old", connectionId: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", resourceReference: "resource", periodStart: "2026-06-01", periodEnd: "2026-06-30", observedAt: "2026-06-30", syncedAt: "2026-07-17T00:00:00.000Z", status: "ready", schemaVersion: 1, rawSnapshotReference: "old.json", fingerprint: "old", limitations: [], createdAt: "old", operationId: "old" });
    const job = await value.service.start({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 1, periodStart: "2026-07-01", periodEnd: "2026-07-18" });
    await vi.waitFor(() => expect(value.service.status("workspace-1", job.id)?.state).toBe("failed"));
    expect((await value.snapshots.findLatestSuccessful("connection-1"))?.snapshotId).toBe("old");
    expect((await value.connections.findById("connection-1"))?.lastSuccessfulSyncAt).toBe("2026-07-17T00:00:00.000Z");
    expect(await value.connections.findById("connection-1")).toMatchObject({ status: "error", lastErrorCode: "GOOGLE_OAUTH_REFRESH_FAILED", lastError: "Google 인증이 만료되었습니다. 계정을 다시 연결해 주세요." });
  });

  it("rejects cross-Workspace and stale connection versions before provider calls", async () => {
    const value = setup(); await value.connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret-1", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 2 });
    await expect(value.service.start({ workspaceId: "workspace-2", connectionId: "connection-1", connectionVersion: 2, periodStart: "2026-07-01", periodEnd: "2026-07-18" })).rejects.toMatchObject({ code: "DATA_SOURCE_NOT_FOUND", status: 404 });
    await expect(value.service.start({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 1, periodStart: "2026-07-01", periodEnd: "2026-07-18" })).rejects.toMatchObject({ code: "DATA_SOURCE_CONFLICT", status: 409 });
    expect(value.adapter.sync).not.toHaveBeenCalled();
  });

  it("rejects a late result after the connection operation is superseded", async () => {
    const value = setup();
    let release!: (payload: unknown) => void;
    (value.adapter.sync as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await value.connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret-1", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    const job = await value.service.start({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 1, periodStart: "2026-07-01", periodEnd: "2026-07-18", operationId: "old-operation" });
    await vi.waitFor(() => expect(value.service.status("workspace-1", job.id)?.state).toBe("syncing"));
    const syncing = (await value.connections.findById("connection-1"))!;
    await value.connections.save({ ...syncing, activeOperationId: "new-operation", version: syncing.version + 1 });
    release({ resourceReference: "resource", periodStart: "2026-07-01", periodEnd: "2026-07-18", observedAt: "2026-07-18", raw: { rows: [] }, limitations: [] });
    await vi.waitFor(() => expect(value.service.status("workspace-1", job.id)?.state).toBe("superseded"));
    expect(await value.snapshots.listByWorkspace("workspace-1")).toHaveLength(0);
    expect(await value.evidence.listByWorkspace("workspace-1")).toHaveLength(0);
  });

  it("does not persist or recreate a Connection when deletion invalidates an in-flight sync", async () => {
    const value = setup();
    let release!: (payload: unknown) => void;
    (value.adapter.sync as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    await value.connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret-1", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    const job = await value.service.start({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 1, periodStart: "2026-07-01", periodEnd: "2026-07-18", operationId: "delete-operation" });
    await vi.waitFor(() => expect(value.service.status("workspace-1", job.id)?.state).toBe("syncing"));
    value.service.invalidate("workspace-1", "connection-1", "delete-operation");
    await value.metadata.deleteConnectionAndReferences("connection-1", [], { connectionId: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, priorStatus: "syncing", projectReferenceCount: 0, snapshotCount: 0, evidenceCount: 0, deletedAt: "now", status: "archived" });
    release({ resourceReference: "resource", periodStart: "2026-07-01", periodEnd: "2026-07-18", observedAt: "2026-07-18", raw: { rows: [] }, limitations: [] });
    await vi.waitFor(() => expect(value.service.status("workspace-1", job.id)?.state).toBe("superseded"));
    expect(await value.connections.findById("connection-1")).toBeUndefined();
    expect(await value.snapshots.listByWorkspace("workspace-1")).toHaveLength(0);
    expect(await value.evidence.listByWorkspace("workspace-1")).toHaveLength(0);
  });
});
