import { describe, expect, it, vi } from "vitest";
import { GoogleYouTubeAnalyticsService } from "../../../../app/application/data-sources/google/GoogleYouTubeAnalyticsService";
import { GoogleOAuthClientFactory, GOOGLE_YOUTUBE_ANALYTICS_READONLY_SCOPE, GOOGLE_YOUTUBE_READONLY_SCOPE } from "../../../../app/application/data-sources/google/GoogleOAuthClientFactory";
import type { DataSourceConnection } from "../../../../core/intelligence";

const connection: DataSourceConnection = {
  id: "youtube-connection",
  workspaceId: "workspace-1",
  provider: "youtubeAnalytics",
  displayName: "YouTube · 밝은건강TV",
  status: "connected",
  secretReference: "secret-reference",
  credentialMode: "googleOAuth",
  resourceConfiguration: { channelId: "channel-1", channelTitle: "밝은건강TV" },
  availableResources: [{ resourceId: "channel-1", siteUrl: "channel-1", displayName: "밝은건강TV", permissionLevel: "owner" }],
  enabled: true,
  createdAt: "2026-08-04T00:00:00.000Z",
  updatedAt: "2026-08-04T00:00:00.000Z",
  version: 1,
};

describe("Google YouTube Analytics official integration", () => {
  it("requests only the two read-only scopes required by the YouTube data source", () => {
    const factory = new GoogleOAuthClientFactory({ GOOGLE_OAUTH_CLIENT_ID: "client", GOOGLE_OAUTH_CLIENT_SECRET: "secret", GOOGLE_OAUTH_REDIRECT_URI: "http://localhost/callback" });
    expect(factory.scopes("youtubeAnalytics")).toEqual([GOOGLE_YOUTUBE_READONLY_SCOPE, GOOGLE_YOUTUBE_ANALYTICS_READONLY_SCOPE]);
  });

  it("lists only channels owned by the authorized Google account", async () => {
    const list = vi.fn().mockResolvedValue({ data: { items: [{ id: "channel-1", snippet: { title: "밝은건강TV" } }, { id: "", snippet: { title: "invalid" } }] } });
    const service = new GoogleYouTubeAnalyticsService({ authorized: vi.fn() } as never, () => ({ channels: { list } }) as never, () => ({ reports: { query: vi.fn() } }) as never);
    await expect(service.listChannels({} as never)).resolves.toEqual([{ resourceId: "channel-1", siteUrl: "channel-1", displayName: "밝은건강TV", permissionLevel: "owner" }]);
    expect(list).toHaveBeenCalledWith({ part: ["snippet"], mine: true, maxResults: 50 });
  });

  it("syncs aggregate channel performance without requesting monetary metrics", async () => {
    const persist = vi.fn().mockResolvedValue(undefined), query = vi.fn().mockResolvedValue({ data: { columnHeaders: [{ name: "views" }], rows: [[100]] } });
    const service = new GoogleYouTubeAnalyticsService({ authorized: vi.fn().mockResolvedValue({ client: {}, persist }) } as never, () => ({ channels: { list: vi.fn() } }) as never, () => ({ reports: { query } }) as never);
    const result = await service.sync(connection, { periodStart: "2026-07-01", periodEnd: "2026-07-31", operationId: "operation-1" });
    expect(query).toHaveBeenCalledWith({
      ids: "channel==channel-1",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      metrics: "views,estimatedMinutesWatched,likes,comments,shares,subscribersGained,subscribersLost",
    });
    expect(query.mock.calls[0][0].metrics).not.toMatch(/revenue|earnings|estimatedRevenue/i);
    expect(result.resourceReference).toBe("channel-1");
    expect(result.limitations.join(" ")).toContain("not external search demand");
    expect(persist).toHaveBeenCalledOnce();
  });

  it("rejects a channel that is not in the server-listed authorized resources", async () => {
    const service = new GoogleYouTubeAnalyticsService({ authorized: vi.fn() } as never, () => ({ channels: { list: vi.fn() } }) as never, () => ({ reports: { query: vi.fn() } }) as never);
    await expect(service.sync({ ...connection, resourceConfiguration: { channelId: "other-channel" } }, { periodStart: "2026-07-01", periodEnd: "2026-07-31", operationId: "operation-1" })).rejects.toMatchObject({ code: "DATA_SOURCE_RESOURCE_NOT_FOUND", field: "channelId" });
  });
});
