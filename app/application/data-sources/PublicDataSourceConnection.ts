import { calculateFreshness, type DataSourceConnection } from "../../../core/intelligence";
import { connectionErrorCode, connectionErrorMessage } from "./DataSourceErrors";

export function publicDataSourceConnection(connection: DataSourceConnection, snapshot?: { periodStart: string; periodEnd: string; syncedAt: string; limitations: readonly string[] }) {
  const freshness = calculateFreshness(connection.provider, connection.lastSuccessfulSyncAt);
  const credentialMode = connection.credentialMode ?? (connection.provider === "googleSearchConsole" && connection.secretReference ? "legacyManualToken" : undefined);
  const legacyGoogleToken = credentialMode === "legacyManualToken" && connection.provider === "googleSearchConsole";
  const status = legacyGoogleToken ? "error" : connection.status === "ready" && freshness === "stale" ? "stale" : connection.status;
  const { secretReference: _secret, activeOperationId: _operation, ...safe } = connection;
  const lastErrorCode = legacyGoogleToken ? "DATA_SOURCE_AUTHENTICATION_ERROR" : connectionErrorCode(connection.lastErrorCode, connection.lastError);
  void _secret;
  void _operation;
  return { ...safe, credentialMode, lastError: legacyGoogleToken ? "기존 수동 token 연결입니다. Google 계정으로 다시 연결해 주세요." : connection.lastError ? connectionErrorMessage(lastErrorCode, connection.lastError) : undefined, lastErrorCode, status, freshness, hasCredentials: Boolean(connection.secretReference), latestSnapshot: snapshot ? { periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd, syncedAt: snapshot.syncedAt, limitations: snapshot.limitations } : null };
}
