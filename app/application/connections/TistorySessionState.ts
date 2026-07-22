import type { PlatformConnection } from "../../../core/connections";

export type TistorySessionFailure = Readonly<{
  diagnosticCode?: string;
  failedStep?: string;
  steps?: readonly Readonly<{ passed?: boolean; diagnosticCode?: string }>[];
}>;

export function isTistorySessionExpiredFailure(result: TistorySessionFailure): boolean {
  if (result.diagnosticCode === "session_expired") return true;
  return Boolean(result.steps?.some((step) => step.passed === false && step.diagnosticCode === "session_expired"));
}

export function expireTistorySession(
  connection: PlatformConnection,
  updatedAt: string,
): PlatformConnection {
  if (connection.platform !== "tistory") return connection;
  return Object.freeze({
    ...connection,
    status: "expired",
    secretReference: undefined,
    updatedAt,
    version: connection.version + 1,
    publicMetadata: {
      ...connection.publicMetadata,
      sessionStateAvailable: false,
      failureCode: "session_expired",
      safeError: "Tistory 로그인 세션이 만료되었습니다.",
      remediation: "같은 계정 카드의 다시 연결을 실행해 주세요.",
      sessionExpiredAt: updatedAt,
    },
  });
}
