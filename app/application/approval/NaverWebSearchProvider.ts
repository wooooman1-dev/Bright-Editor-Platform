import type { ApprovalSearchProvider } from "../../../core/ai/ApprovalSourcePreflight";
import type { SiteApprovalReadinessFetch } from "../../../core/approval";
import type { DataSourceConnectionRepository } from "../../../core/intelligence";
import type { SecretStore } from "../../../core/connections";
import { connectionSecret, parseSecret } from "../data-sources/adapters/OfficialApiSupport";
import { WindowsDpapiSecretStore } from "../connections/WindowsDpapiSecretStore";
import path from "node:path";

const naverSearchTimeoutMs = 5_000;

/** Application-owned Naver provider. Search results are URL candidates only. */
export class NaverWebSearchProvider implements ApprovalSearchProvider {
  constructor(
    private readonly workspaceId: string,
    private readonly connections: DataSourceConnectionRepository,
    private readonly secrets: SecretStore = new WindowsDpapiSecretStore(path.join(process.cwd(), ".bright-studio", "secrets")),
  ) {}

  async search(query: string, fetcher: SiteApprovalReadinessFetch): Promise<readonly string[]> {
    const connection = (await this.connections.listByWorkspace(this.workspaceId))
      .find((value) => value.provider === "naverSearchTrend" && value.enabled !== false && value.status !== "disconnected" && value.secretReference);
    if (!connection) {
      console.info(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} returnedUrlCount=0 reason=credential_unavailable`);
      return Object.freeze([]);
    }

    const credentials = parseSecret(await connectionSecret(this.secrets, connection));
    if (!credentials.clientId || !credentials.clientSecret) {
      console.info(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} returnedUrlCount=0 reason=credential_incomplete`);
      return Object.freeze([]);
    }

    try {
      const response = await fetcher(
        `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(query)}&display=10`,
        {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(naverSearchTimeoutMs),
          headers: {
            accept: "application/json",
            "X-Naver-Client-Id": credentials.clientId,
            "X-Naver-Client-Secret": credentials.clientSecret,
          },
        },
      );
      if (!response.ok) {
        console.warn(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} failed=http_${response.status}`);
        return Object.freeze([]);
      }
      const body = await response.json() as { items?: readonly { link?: unknown }[] };
      const urls = [...new Set((body.items ?? [])
        .map((item) => typeof item.link === "string" ? item.link.trim() : "")
        .filter((url) => /^https:\/\//iu.test(url)))];
      console.info(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} returnedUrlCount=${urls.length}`);
      return Object.freeze(urls);
    } catch (error) {
      console.warn(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} failed=${error instanceof Error ? error.message : "unknown_error"}`);
      return Object.freeze([]);
    }
  }
}
