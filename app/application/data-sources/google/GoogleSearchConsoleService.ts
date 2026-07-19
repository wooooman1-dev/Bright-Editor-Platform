import { google } from "googleapis";
import type { DataSourceConnection, DataSourceResourceOption, DataSourceSyncRequest, ProviderSnapshotPayload } from "../../../../core/intelligence";
import { DataSourceError } from "../DataSourceErrors";
import type { GoogleOAuthCredentialService } from "./GoogleOAuthCredentialService";
import type { GoogleOAuthClient } from "./GoogleOAuthClientFactory";

type SearchConsoleApi = ReturnType<typeof google.webmasters>;

export class GoogleSearchConsoleService {
  constructor(
    private readonly credentials: Pick<GoogleOAuthCredentialService, "authorized">,
    private readonly api: (auth: GoogleOAuthClient) => SearchConsoleApi = (auth) => google.webmasters({ version: "v3", auth }),
  ) {}

  async listSites(client: GoogleOAuthClient): Promise<readonly DataSourceResourceOption[]> {
    try {
      const response = await this.api(client).sites.list();
      const resources = (response.data.siteEntry ?? []).flatMap((entry) => typeof entry.siteUrl === "string" && entry.siteUrl.trim() ? [Object.freeze({ siteUrl: entry.siteUrl.trim(), ...(typeof entry.permissionLevel === "string" ? { permissionLevel: entry.permissionLevel } : {}) })] : []);
      return Object.freeze([...new Map(resources.map((value) => [value.siteUrl, value])).values()].sort((a, b) => a.siteUrl.localeCompare(b.siteUrl)));
    } catch (error) { throw providerFailure(error); }
  }

  async sync(connection: DataSourceConnection, request: DataSourceSyncRequest): Promise<ProviderSnapshotPayload> {
    const siteProperty = connection.resourceConfiguration.siteProperty?.trim();
    if (!siteProperty || !connection.availableResources?.some((value) => value.siteUrl === siteProperty)) throw new DataSourceError("선택한 Search Console 속성에 접근할 수 없습니다. 속성을 다시 선택해 주세요.", "GOOGLE_SEARCH_CONSOLE_RESOURCE_NOT_FOUND", 400, "siteProperty");
    const session = await this.credentials.authorized(connection);
    try {
      const resource = connection.resourceConfiguration;
      const response = await this.api(session.client).searchanalytics.query({ siteUrl: siteProperty, requestBody: {
        startDate: request.periodStart, endDate: request.periodEnd, dimensions: ["query", "page"], rowLimit: 25000, searchType: resource.searchType ?? "web",
        ...(resource.country || resource.device ? { dimensionFilterGroups: [{ filters: [
          ...(resource.country ? [{ dimension: "country", operator: "equals", expression: resource.country }] : []),
          ...(resource.device ? [{ dimension: "device", operator: "equals", expression: resource.device }] : []),
        ] }] } : {}),
      } });
      await session.persist();
      return Object.freeze({ resourceReference: siteProperty, periodStart: request.periodStart, periodEnd: request.periodEnd, observedAt: request.periodEnd, raw: response.data, limitations: Object.freeze(["Search Console impressions are this site's search-result impressions, not total monthly search volume."]) });
    } catch (error) { await session.persist().catch(() => undefined); throw providerFailure(error); }
  }
}

function providerFailure(error: unknown): DataSourceError {
  if (error instanceof DataSourceError) return error;
  const status = typeof error === "object" && error !== null && "response" in error && typeof error.response === "object" && error.response !== null && "status" in error.response ? Number(error.response.status) : 0;
  if (status === 401) return new DataSourceError("Google 인증이 만료되었습니다. 계정을 다시 연결해 주세요.", "GOOGLE_OAUTH_REFRESH_FAILED", 401);
  if (status === 403) return new DataSourceError("해당 Search Console 속성에 접근할 권한이 없습니다.", "DATA_SOURCE_PERMISSION_ERROR", 403);
  if (status === 404) return new DataSourceError("선택한 Search Console 속성을 찾을 수 없습니다.", "GOOGLE_SEARCH_CONSOLE_RESOURCE_NOT_FOUND", 404);
  if (status === 429) return new DataSourceError("Search Console API 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", "DATA_SOURCE_QUOTA_ERROR", 429);
  return new DataSourceError("Search Console 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", "DATA_SOURCE_PROVIDER_ERROR", 502);
}
