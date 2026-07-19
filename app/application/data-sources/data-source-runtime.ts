import path from "node:path";
import { SnapshotPersistenceStore } from "../../../core/data";
import { JsonFileSnapshotDriver } from "../JsonFileSnapshotDriver";
import { WindowsDpapiSecretStore } from "../connections/WindowsDpapiSecretStore";
import { DataSourceSyncService } from "./DataSourceSyncService";
import { DurableDataSourceConnectionRepository, DurableDataSourceDeletionRepository, DurableDataSourceSnapshotRepository, DurableOpportunityEvidenceRepository, DurableProjectDataSourceReferenceRepository } from "./DataSourceRepositories";
import { FileRawSnapshotStore } from "./FileRawSnapshotStore";
import { GoogleSearchConsoleAdapter } from "./adapters/GoogleSearchConsoleAdapter";
import { GoogleAnalytics4Adapter } from "./adapters/GoogleAnalytics4Adapter";
import { GoogleAdSenseAdapter } from "./adapters/GoogleAdSenseAdapter";
import { NaverSearchTrendAdapter } from "./adapters/NaverSearchTrendAdapter";
import type { DataSourceProviderAdapter } from "../../../core/intelligence";
import { GoogleOAuthClientFactory } from "./google/GoogleOAuthClientFactory";
import { GoogleOAuthCredentialService } from "./google/GoogleOAuthCredentialService";
import { GoogleOAuthStateStore } from "./google/GoogleOAuthStateStore";
import { GoogleSearchConsoleService } from "./google/GoogleSearchConsoleService";
import { GoogleSearchConsoleOAuthFlow } from "./google/GoogleSearchConsoleOAuthFlow";
import { DataSourceDeletionService } from "./DataSourceDeletionService";
import { LocalSafeBackupWriter } from "../SafeDeletionService";

const root = path.join(process.cwd(), ".bright-studio", "intelligence");
const secretStore = new WindowsDpapiSecretStore(path.join(process.cwd(), ".bright-studio", "secrets"));
const store = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(path.join(root, "metadata.json")));
export const dataSourceConnectionRepository = new DurableDataSourceConnectionRepository(store);
export const projectDataSourceReferenceRepository = new DurableProjectDataSourceReferenceRepository(store);
export const dataSourceSnapshotRepository = new DurableDataSourceSnapshotRepository(store);
export const opportunityEvidenceRepository = new DurableOpportunityEvidenceRepository(store);
export const dataSourceDeletionRepository = new DurableDataSourceDeletionRepository(store);
export const rawDataSourceSnapshotStore = new FileRawSnapshotStore(path.join(root, "raw-snapshots"));
export const googleOAuthClientFactory = new GoogleOAuthClientFactory();
export const googleOAuthCredentialService = new GoogleOAuthCredentialService(secretStore, googleOAuthClientFactory);
export const googleOAuthStateStore = new GoogleOAuthStateStore(store);
export const googleSearchConsoleService = new GoogleSearchConsoleService(googleOAuthCredentialService);
export const googleSearchConsoleOAuthFlow = new GoogleSearchConsoleOAuthFlow(dataSourceConnectionRepository, secretStore, googleOAuthCredentialService, googleSearchConsoleService);
const adapters = new Map<string, DataSourceProviderAdapter>([
  ["googleSearchConsole", new GoogleSearchConsoleAdapter(googleSearchConsoleService)],
  ["googleAnalytics4", new GoogleAnalytics4Adapter(secretStore)],
  ["googleAdSense", new GoogleAdSenseAdapter(secretStore)],
  ["naverSearchTrend", new NaverSearchTrendAdapter(secretStore)],
]);
export const dataSourceSyncService = new DataSourceSyncService(dataSourceConnectionRepository, dataSourceSnapshotRepository, opportunityEvidenceRepository, rawDataSourceSnapshotStore, secretStore, adapters);
export const dataSourceDeletionService = new DataSourceDeletionService(dataSourceConnectionRepository, projectDataSourceReferenceRepository, dataSourceSnapshotRepository, opportunityEvidenceRepository, dataSourceDeletionRepository, secretStore, googleOAuthStateStore, googleOAuthCredentialService, dataSourceSyncService, new LocalSafeBackupWriter());
