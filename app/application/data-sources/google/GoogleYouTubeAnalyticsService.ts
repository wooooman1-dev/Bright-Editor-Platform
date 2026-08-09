import { google } from "googleapis";
import type { DataSourceConnection, DataSourceResourceOption, DataSourceSyncRequest, ProviderSnapshotPayload } from "../../../../core/intelligence";
import { DataSourceError } from "../DataSourceErrors";
import type { GoogleOAuthCredentialService } from "./GoogleOAuthCredentialService";
import type { GoogleOAuthClient } from "./GoogleOAuthClientFactory";

type YouTubeDataApi = ReturnType<typeof google.youtube>;
type YouTubeAnalyticsApi = ReturnType<typeof google.youtubeAnalytics>;

export class GoogleYouTubeAnalyticsService {
  constructor(
    private readonly credentials: Pick<GoogleOAuthCredentialService, "authorized">,
    private readonly dataApi: (auth: GoogleOAuthClient) => YouTubeDataApi = (auth) => google.youtube({ version: "v3", auth }),
    private readonly analyticsApi: (auth: GoogleOAuthClient) => YouTubeAnalyticsApi = (auth) => google.youtubeAnalytics({ version: "v2", auth }),
  ) {}

  async listChannels(client: GoogleOAuthClient): Promise<readonly DataSourceResourceOption[]> {
    try {
      const response = await this.dataApi(client).channels.list({ part: ["snippet"], mine: true, maxResults: 50 });
      const resources = (response.data.items ?? []).flatMap((channel) => {
        const id = channel.id?.trim(), title = channel.snippet?.title?.trim();
        return id ? [Object.freeze({ resourceId: id, siteUrl: id, displayName: title || id, permissionLevel: "owner" })] : [];
      });
      return Object.freeze([...new Map(resources.map((value) => [value.resourceId, value])).values()].sort((a, b) => (a.displayName ?? a.siteUrl).localeCompare(b.displayName ?? b.siteUrl)));
    } catch (error) { throw providerFailure(error); }
  }

  async sync(connection: DataSourceConnection, request: DataSourceSyncRequest): Promise<ProviderSnapshotPayload> {
    const channelId = connection.resourceConfiguration.channelId?.trim();
    if (!channelId || !connection.availableResources?.some((value) => (value.resourceId ?? value.siteUrl) === channelId)) {
      throw new DataSourceError("선택한 YouTube 채널에 접근할 수 없습니다. 채널을 다시 선택해 주세요.", "DATA_SOURCE_RESOURCE_NOT_FOUND", 400, "channelId");
    }
    const session = await this.credentials.authorized(connection);
    try {
      const response = await this.analyticsApi(session.client).reports.query({
        ids: `channel==${channelId}`,
        startDate: request.periodStart,
        endDate: request.periodEnd,
        metrics: "views,estimatedMinutesWatched,likes,comments,shares,subscribersGained,subscribersLost",
      });
      await session.persist();
      return Object.freeze({
        resourceReference: channelId,
        periodStart: request.periodStart,
        periodEnd: request.periodEnd,
        observedAt: request.periodEnd,
        raw: response.data,
        limitations: Object.freeze([
          "YouTube Analytics values describe the selected channel's observed performance; they are not external search demand.",
          "Monetary metrics are not requested by this connection.",
        ]),
      });
    } catch (error) { await session.persist().catch(() => undefined); throw providerFailure(error); }
  }
}

function providerFailure(error: unknown): DataSourceError {
  if (error instanceof DataSourceError) return error;
  const status = typeof error === "object" && error !== null && "response" in error && typeof error.response === "object" && error.response !== null && "status" in error.response ? Number(error.response.status) : 0;
  if (status === 401) return new DataSourceError("YouTube Google 인증이 만료되었습니다. 계정을 다시 연결해 주세요.", "GOOGLE_OAUTH_REFRESH_FAILED", 401);
  if (status === 403) return new DataSourceError("선택한 YouTube 채널의 Analytics 데이터를 읽을 권한이 없습니다.", "DATA_SOURCE_PERMISSION_ERROR", 403);
  if (status === 404) return new DataSourceError("선택한 YouTube 채널을 찾을 수 없습니다.", "DATA_SOURCE_RESOURCE_NOT_FOUND", 404);
  if (status === 429) return new DataSourceError("YouTube API 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.", "DATA_SOURCE_QUOTA_ERROR", 429);
  return new DataSourceError("YouTube Analytics 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", "DATA_SOURCE_PROVIDER_ERROR", 502);
}
