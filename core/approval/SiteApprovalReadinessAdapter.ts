import type { PlatformConnection, Platform } from "../connections";
import type { SiteApprovalReadinessSnapshot } from "./ApprovalReadiness";

export type SiteApprovalReadinessFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type SiteApprovalReadinessAuditInput = Readonly<{
  connection: PlatformConnection;
  checkedAt: string;
  expectedTerms: readonly string[];
  fetcher: SiteApprovalReadinessFetch;
}>;

export interface SiteApprovalReadinessAdapter {
  readonly platform: Platform;
  audit(input: SiteApprovalReadinessAuditInput): Promise<SiteApprovalReadinessSnapshot>;
}

export class SiteApprovalReadinessAdapterRegistry {
  private readonly adapters = new Map<Platform, SiteApprovalReadinessAdapter>();

  constructor(adapters: readonly SiteApprovalReadinessAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: SiteApprovalReadinessAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  get(platform: Platform): SiteApprovalReadinessAdapter | undefined {
    return this.adapters.get(platform);
  }
}
