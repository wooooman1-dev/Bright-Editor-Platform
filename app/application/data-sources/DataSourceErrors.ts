import type { DataSourceConnectionErrorCode } from "../../../core/intelligence";

export type DataSourceErrorCode = DataSourceConnectionErrorCode;

export class DataSourceError extends Error {
  constructor(
    message: string,
    readonly code: DataSourceErrorCode,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DataSourceError";
  }
}

export type PublicDataSourceError = Readonly<{
  error: string;
  code: DataSourceErrorCode;
  status: number;
  field?: string;
}>;

export function publicDataSourceError(
  error: unknown,
  fallback: PublicDataSourceError = {
    error: "Data Source 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    code: "DATA_SOURCE_INTERNAL_ERROR",
    status: 500,
  },
): PublicDataSourceError {
  if (error instanceof DataSourceError) {
    return Object.freeze({ error: error.message, code: error.code, status: error.status, ...(error.field ? { field: error.field } : {}) });
  }
  return fallback;
}

export function connectionErrorMessage(code?: DataSourceErrorCode, legacyMessage?: string): string {
  if (code === "GOOGLE_OAUTH_NOT_CONFIGURED") return "Google OAuth 설정이 필요합니다.";
  if (code === "GOOGLE_OAUTH_REFRESH_FAILED") return "Google 인증이 만료되었습니다. 계정을 다시 연결해 주세요.";
  if (code === "GOOGLE_OAUTH_SCOPE_MISSING") return "Search Console 읽기 권한이 승인되지 않았습니다. Google 계정을 다시 연결해 주세요.";
  if (code === "GOOGLE_SEARCH_CONSOLE_RESOURCE_NOT_FOUND") return "선택한 Search Console 속성에 접근할 수 없습니다. 속성을 다시 선택해 주세요.";
  if (code === "GOOGLE_SEARCH_CONSOLE_NO_PROPERTIES") return "접근 가능한 Search Console 사이트 속성이 없습니다. Search Console 권한을 확인해 주세요.";
  if (code === "DATA_SOURCE_AUTHENTICATION_ERROR" || legacyMessage?.includes("Provider authentication failed")) return "인증에 실패했습니다. 연결 정보를 다시 설정해 주세요.";
  if (code === "DATA_SOURCE_PERMISSION_ERROR" || legacyMessage?.includes("Provider permission is insufficient")) return "해당 데이터에 접근할 권한이 없습니다. 계정 권한을 확인해 주세요.";
  if (code === "DATA_SOURCE_QUOTA_ERROR" || legacyMessage?.includes("Provider quota is temporarily exhausted")) return "API 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.";
  if (code === "DATA_SOURCE_RESOURCE_NOT_FOUND") return "선택한 데이터 리소스를 찾을 수 없습니다. 연결 설정을 확인해 주세요.";
  if (code === "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR") return "연결 인증 정보가 없습니다. 연결 정보를 다시 설정해 주세요.";
  if (legacyMessage && code && code !== "DATA_SOURCE_PROVIDER_ERROR" && code !== "DATA_SOURCE_INTERNAL_ERROR") return legacyMessage;
  return "Provider 동기화 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}

export function connectionErrorCode(code?: DataSourceErrorCode, legacyMessage?: string): DataSourceErrorCode | undefined {
  if (code) return code;
  if (legacyMessage?.includes("Provider authentication failed")) return "DATA_SOURCE_AUTHENTICATION_ERROR";
  if (legacyMessage?.includes("Provider permission is insufficient")) return "DATA_SOURCE_PERMISSION_ERROR";
  if (legacyMessage?.includes("Provider quota is temporarily exhausted")) return "DATA_SOURCE_QUOTA_ERROR";
  return legacyMessage ? "DATA_SOURCE_PROVIDER_ERROR" : undefined;
}
