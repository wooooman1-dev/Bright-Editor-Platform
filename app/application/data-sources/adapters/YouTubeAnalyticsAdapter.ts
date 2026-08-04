import type { DataSourceProviderAdapter } from "../../../../core/intelligence";
import type { GoogleYouTubeAnalyticsService } from "../google/GoogleYouTubeAnalyticsService";

export class YouTubeAnalyticsAdapter implements DataSourceProviderAdapter {
  readonly provider = "youtubeAnalytics" as const;
  constructor(private readonly youtube: Pick<GoogleYouTubeAnalyticsService, "sync">) {}
  sync(connection: Parameters<DataSourceProviderAdapter["sync"]>[0], request: Parameters<DataSourceProviderAdapter["sync"]>[1]) { return this.youtube.sync(connection, request); }
}
