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
    const connections = (await this.connections.listByWorkspace(this.workspaceId))
      .filter((value) =>
        value.provider === "naverSearchTrend"
        && value.enabled !== false
        && value.status !== "disconnected"
        && value.secretReference,
      );

    if (!connections.length) {
      console.info(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} returnedUrlCount=0 reason=credential_unavailable`);
      return Object.freeze([]);
    }

    const urls: string[] = [];
    const seen = new Set<string>();

    // Try every usable Naver connection in sequence. A stale/failed credential
    // must not prevent another configured connection from supplying candidates.
    for (const connection of connections) {
      try {
        const credentials = parseSecret(await connectionSecret(this.secrets, connection));
        if (!credentials.clientId || !credentials.clientSecret) {
          console.info(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} connection=${connection.id} skipped=credential_incomplete`);
          continue;
        }

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
          console.warn(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} connection=${connection.id} failed=http_${response.status}`);
          continue;
        }

        const body = await response.json() as { items?: readonly { link?: unknown }[] };
        for (const item of body.items ?? []) {
          const url = typeof item.link === "string" ? item.link.trim() : "";
          if (!/^https:\/\//iu.test(url) || seen.has(url)) continue;
          seen.add(url);
          urls.push(url);
        }

        console.info(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} connection=${connection.id} returnedUrlCount=${body.items?.length ?? 0} accumulatedUrlCount=${urls.length}`);
      } catch (error) {
        console.warn(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} connection=${connection.id} failed=${error instanceof Error ? error.message : "unknown_error"}`);
      }
    }

    // Keep candidates from the administering/official institutions ahead of
    // generic government portals and stale search results. Verification still
    // re-fetches and applies the normal authority/relevance/evidence gates.
    const priority = (url: string): number => {
      try {
        const host = new URL(url).hostname.replace(/^www\./iu, "");
        if (host === "fsc.go.kr" || host.endsWith(".fsc.go.kr")) return 0;
        if (host === "kdic.or.kr" || host.endsWith(".kdic.or.kr")) return 1;
        if (host === "law.go.kr" || host.endsWith(".law.go.kr")) return 2;
        if (host.endsWith(".go.kr")) return 3;
        return 4;
      } catch {
        return 5;
      }
    };

    urls.sort((left, right) => priority(left) - priority(right));
    console.info(`[ApprovalSourcePreflight] provider=naver query=${JSON.stringify(query)} returnedUrlCount=${urls.length}`);
    return Object.freeze(urls);
  }
}
