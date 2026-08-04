export const dataSourceProviders = [
  "googleSearchConsole",
  "googleAnalytics4",
  "googleAdSense",
  "youtubeAnalytics",
  "naverSearchTrend",
  "googleAdsKeywordPlanning",
  "googleTrendsOfficial",
] as const;

export type DataSourceProvider = (typeof dataSourceProviders)[number];
export type DataSourceConnectionStatus =
  | "disconnected"
  | "configurationRequired"
  | "connected"
  | "syncing"
  | "ready"
  | "stale"
  | "error";

export type DataSourceCredentialMode = "googleOAuth" | "legacyManualToken" | "providerCredential";

export type DataSourceResourceOption = Readonly<{
  /** Stable provider resource identifier. Kept optional for legacy Search Console snapshots. */
  resourceId?: string;
  /** Human-readable label shown in Settings. */
  displayName?: string;
  /** Search Console compatibility field. */
  siteUrl: string;
  permissionLevel?: string;
}>;

export type DataSourceConnectionErrorCode =
  | "DATA_SOURCE_REQUEST_VALIDATION_ERROR"
  | "DATA_SOURCE_RESOURCE_VALIDATION_ERROR"
  | "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR"
  | "DATA_SOURCE_AUTHENTICATION_ERROR"
  | "DATA_SOURCE_PERMISSION_ERROR"
  | "DATA_SOURCE_PROJECT_SCOPE_CONFLICT"
  | "DATA_SOURCE_RESOURCE_NOT_FOUND"
  | "DATA_SOURCE_QUOTA_ERROR"
  | "DATA_SOURCE_NOT_FOUND"
  | "DATA_SOURCE_CONFLICT"
  | "DATA_SOURCE_PROVIDER_ERROR"
  | "DATA_SOURCE_INTERNAL_ERROR"
  | "GOOGLE_OAUTH_NOT_CONFIGURED"
  | "GOOGLE_OAUTH_STATE_INVALID"
  | "GOOGLE_OAUTH_STATE_EXPIRED"
  | "GOOGLE_OAUTH_ACCESS_DENIED"
  | "GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED"
  | "GOOGLE_OAUTH_REFRESH_FAILED"
  | "GOOGLE_OAUTH_SCOPE_MISSING"
  | "GOOGLE_SEARCH_CONSOLE_RESOURCE_NOT_FOUND"
  | "GOOGLE_SEARCH_CONSOLE_NO_PROPERTIES"
  | "DATA_SOURCE_WORKSPACE_FORBIDDEN";

export type DataSourceResourceConfiguration = Readonly<{
  siteProperty?: string;
  country?: string;
  device?: string;
  searchType?: string;
  propertyId?: string;
  streamReference?: string;
  accountReference?: string;
  siteReference?: string;
  channelId?: string;
  channelTitle?: string;
  region?: string;
  gender?: string;
  ages?: readonly string[];
  keywords?: readonly string[];
  customerReference?: string;
  officialResourceReference?: string;
}>;

export type DataSourceConnection = Readonly<{
  id: string;
  workspaceId: string;
  provider: DataSourceProvider;
  displayName: string;
  status: DataSourceConnectionStatus;
  secretReference?: string;
  credentialMode?: DataSourceCredentialMode;
  resourceConfiguration: DataSourceResourceConfiguration;
  availableResources?: readonly DataSourceResourceOption[];
  enabled: boolean;
  lastSyncAttemptAt?: string;
  lastSuccessfulSyncAt?: string;
  lastError?: string;
  lastErrorCode?: DataSourceConnectionErrorCode;
  activeOperationId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}>;

export type ProjectDataSourceReference = Readonly<{
  workspaceId: string;
  projectId: string;
  connectionId: string;
  enabled: boolean;
  updatedAt: string;
}>;

export interface DataSourceConnectionRepository {
  delete(id: string): Promise<void>;
  findById(id: string): Promise<DataSourceConnection | undefined>;
  listByWorkspace(workspaceId: string): Promise<readonly DataSourceConnection[]>;
  save(connection: DataSourceConnection): Promise<void>;
}

export interface ProjectDataSourceReferenceRepository {
  listByProject(projectId: string): Promise<readonly ProjectDataSourceReference[]>;
  listByWorkspace(workspaceId: string): Promise<readonly ProjectDataSourceReference[]>;
  save(reference: ProjectDataSourceReference): Promise<void>;
  delete(projectId: string, connectionId: string): Promise<void>;
}

export function isDataSourceProvider(value: unknown): value is DataSourceProvider {
  return typeof value === "string" && (dataSourceProviders as readonly string[]).includes(value);
}
