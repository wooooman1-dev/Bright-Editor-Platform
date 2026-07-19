import type { DataSourceProvider } from "./DataSourceConnection";

export type DataSourceSnapshotStatus = "ready" | "partial" | "failed";
export type DataSourceSnapshot = Readonly<{
  snapshotId: string;
  connectionId: string;
  workspaceId: string;
  provider: DataSourceProvider;
  resourceReference: string;
  periodStart: string;
  periodEnd: string;
  observedAt: string;
  syncedAt: string;
  status: DataSourceSnapshotStatus;
  schemaVersion: 1;
  rawSnapshotReference: string;
  fingerprint: string;
  limitations: readonly string[];
  createdAt: string;
  operationId: string;
}>;

export interface DataSourceSnapshotRepository {
  findLatestSuccessful(connectionId: string): Promise<DataSourceSnapshot | undefined>;
  listByWorkspace(workspaceId: string): Promise<readonly DataSourceSnapshot[]>;
  save(snapshot: DataSourceSnapshot): Promise<void>;
}

export interface RawDataSourceSnapshotStore {
  write(workspaceId: string, connectionId: string, snapshotId: string, payload: unknown): Promise<string>;
  read(reference: string): Promise<unknown>;
}
