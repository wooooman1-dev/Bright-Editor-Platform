import type { DataSourceConnection, DataSourceProvider } from "./DataSourceConnection";

export type DataSourceSyncRequest = Readonly<{ periodStart: string; periodEnd: string; operationId: string }>;
export type ProviderSnapshotPayload = Readonly<{
  resourceReference: string;
  periodStart: string;
  periodEnd: string;
  observedAt: string;
  raw: unknown;
  limitations: readonly string[];
}>;

export interface DataSourceProviderAdapter {
  readonly provider: DataSourceProvider;
  sync(connection: DataSourceConnection, request: DataSourceSyncRequest): Promise<ProviderSnapshotPayload>;
}
