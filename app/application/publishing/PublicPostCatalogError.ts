import type { Platform } from "../../../core/connections";

export type PublicPostCatalogFailureState =
  | "worker_not_registered"
  | "session_expired"
  | "browser_launch_failed"
  | "selector_error"
  | "permission_denied"
  | "connection_error";

export class PublicPostCatalogError extends Error {
  readonly platform: Platform;
  readonly state: PublicPostCatalogFailureState;
  readonly remediation?: string;
  readonly reconnectRequired: boolean;

  constructor(input: Readonly<{
    platform: Platform;
    state: PublicPostCatalogFailureState;
    message: string;
    remediation?: string;
    reconnectRequired?: boolean;
  }>) {
    super(input.message);
    this.name = "PublicPostCatalogError";
    this.platform = input.platform;
    this.state = input.state;
    this.remediation = input.remediation;
    this.reconnectRequired = input.reconnectRequired === true;
  }
}

export function publicPostCatalogErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "공개 게시글을 불러오지 못했습니다.";
}
