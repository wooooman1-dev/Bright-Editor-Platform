export function parseSecret(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return { accessToken: value }; }
}

export async function officialJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw providerError(response.status);
  try { return JSON.parse(text); } catch { throw new DataSourceError("Provider 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해 주세요.", "DATA_SOURCE_PROVIDER_ERROR", 502); }
}

function providerError(status: number): DataSourceError {
  if (status === 401) return new DataSourceError("인증에 실패했습니다. 연결 정보를 다시 설정해 주세요.", "DATA_SOURCE_AUTHENTICATION_ERROR", 401);
  if (status === 403) return new DataSourceError("해당 데이터에 접근할 권한이 없습니다. 계정 권한을 확인해 주세요.", "DATA_SOURCE_PERMISSION_ERROR", 403);
  if (status === 404) return new DataSourceError("선택한 데이터 리소스를 찾을 수 없습니다. 연결 설정을 확인해 주세요.", "DATA_SOURCE_RESOURCE_NOT_FOUND", 404);
  if (status === 429) return new DataSourceError("API 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", "DATA_SOURCE_QUOTA_ERROR", 429);
  return new DataSourceError("Provider 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", "DATA_SOURCE_PROVIDER_ERROR", 502);
}

export function bearer(secret: string): string {
  const token = parseSecret(secret).accessToken?.trim();
  if (!token) throw new DataSourceError("연결 인증 정보가 없습니다. 연결 정보를 다시 설정해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 401, "accessToken");
  return `Bearer ${token}`;
}

export async function connectionSecret(secrets: SecretStore, connection: DataSourceConnection): Promise<string> {
  if (!connection.secretReference) throw new DataSourceError("연결 인증 정보가 없습니다. 연결 정보를 다시 설정해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 401);
  try { return await secrets.readSecret(connection.secretReference); }
  catch { throw new DataSourceError("연결 인증 정보를 읽지 못했습니다. 다시 연결해 주세요.", "DATA_SOURCE_AUTHENTICATION_ERROR", 401); }
}
import type { SecretStore } from "../../../../core/connections";
import type { DataSourceConnection } from "../../../../core/intelligence";
import { DataSourceError } from "../DataSourceErrors";
