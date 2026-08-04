import { describe, expect, it } from "vitest";
import { normalizeProviderEvidence } from "../../../../app/application/data-sources/EvidenceNormalizer";
import type { DataSourceConnection, DataSourceSnapshot } from "../../../../core/intelligence";

const connection = (provider: DataSourceConnection["provider"], resourceConfiguration: DataSourceConnection["resourceConfiguration"] = {}): DataSourceConnection => ({ id: `connection-${provider}`, workspaceId: "workspace-1", provider, displayName: provider, status: "syncing", resourceConfiguration, enabled: true, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z", version: 1 });
const snapshot = (provider: DataSourceConnection["provider"]): DataSourceSnapshot => ({ snapshotId: `snapshot-${provider}`, connectionId: `connection-${provider}`, workspaceId: "workspace-1", provider, resourceReference: "resource", periodStart: "2026-07-01", periodEnd: "2026-07-18", observedAt: "2026-07-18", syncedAt: new Date().toISOString(), status: "ready", schemaVersion: 1, rawSnapshotReference: "raw.json", fingerprint: "fp", limitations: [], createdAt: "now", operationId: "operation-1" });

describe("official provider Evidence normalization", () => {
  it("normalizes Search Console query/page metrics without calling impressions demand", () => {
    const values = normalizeProviderEvidence(connection("googleSearchConsole"), snapshot("googleSearchConsole"), { rows: [{ keys: ["장 건강", "https://example.com/gut"], clicks: 10, impressions: 120, ctr: 0.08, position: 4.2 }] });
    expect(values.map((value) => value.metric)).toEqual(["clicks", "impressions", "ctr", "averagePosition"]);
    expect(values.every((value) => value.evidenceType === "searchPerformance")).toBe(true);
    expect(values.find((value) => value.metric === "impressions")?.unit).toBe("siteImpressions");
  });

  it("normalizes GA4 only as page engagement and keeps actual key events conditional", () => {
    const raw = { dimensionHeaders: [{ name: "landingPagePlusQueryString" }, { name: "pageTitle" }], metricHeaders: [{ name: "screenPageViews" }, { name: "keyEvents" }], rows: [{ dimensionValues: [{ value: "/gut" }, { value: "Gut" }], metricValues: [{ value: "20" }, { value: "0" }] }] };
    const values = normalizeProviderEvidence(connection("googleAnalytics4"), snapshot("googleAnalytics4"), raw);
    expect(values).toHaveLength(1); expect(values[0]).toMatchObject({ evidenceType: "pageEngagement", metric: "screenPageViews", pageUrl: "/gut" });
  });

  it("keeps AdSense at account/site scope without post revenue", () => {
    const raw = { headers: [{ name: "ESTIMATED_EARNINGS" }, { name: "IMPRESSIONS" }], rows: [{ cells: [{ value: "12.3" }, { value: "900" }] }] };
    const values = normalizeProviderEvidence(connection("googleAdSense", { accountReference: "pub-1" }), snapshot("googleAdSense"), raw);
    expect(values.every((value) => value.resourceScope === "account" && !value.pageUrl)).toBe(true);
    expect(values[0].limitations.join(" ")).toContain("not attributed");
  });

  it("normalizes YouTube aggregate metrics as first-party video performance", () => {
    const raw = { columnHeaders: [{ name: "views" }, { name: "estimatedMinutesWatched" }, { name: "subscribersGained" }], rows: [[1200, 5400, 18]] };
    const values = normalizeProviderEvidence(connection("youtubeAnalytics", { channelId: "channel-1", channelTitle: "밝은건강TV" }), snapshot("youtubeAnalytics"), raw);
    expect(values.map((value) => value.metric)).toEqual(["views", "estimatedMinutesWatched", "subscribersGained"]);
    expect(values.every((value) => value.evidenceType === "videoPerformance" && value.topic === "밝은건강TV" && value.resourceScope === "site")).toBe(true);
    expect(values.find((value) => value.metric === "estimatedMinutesWatched")?.unit).toBe("minutes");
    expect(values[0].limitations.join(" ")).toContain("not external search demand");
  });

  it("normalizes NAVER ratio and rising change without absolute volume", () => {
    const raw = { results: [{ title: "장 건강", keywords: ["장 건강"], data: [{ period: "2026-07-01", ratio: 20 }, { period: "2026-07-18", ratio: 40 }] }] };
    const values = normalizeProviderEvidence(connection("naverSearchTrend", { keywords: ["장 건강"] }), snapshot("naverSearchTrend"), raw);
    expect(values.map((value) => value.evidenceType)).toEqual(["relativeTrend", "risingTrend"]);
    expect(values.every((value) => value.unit !== "searchVolume")).toBe(true);
    expect(values[0].changeRate).toBe(1);
  });

  it("does not invent missing metrics", () => {
    expect(normalizeProviderEvidence(connection("googleSearchConsole"), snapshot("googleSearchConsole"), { rows: [{ keys: ["장 건강"] }] })).toHaveLength(0);
    expect(normalizeProviderEvidence(connection("youtubeAnalytics", { channelId: "channel-1" }), snapshot("youtubeAnalytics"), { columnHeaders: [{ name: "views" }], rows: [[]] })).toHaveLength(0);
  });
});
