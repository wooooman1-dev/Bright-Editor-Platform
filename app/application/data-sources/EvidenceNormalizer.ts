import {
  calculateFreshness,
  createOpportunityEvidence,
  type DataSourceConnection,
  type DataSourceSnapshot,
  type OpportunityEvidenceRecord,
} from "../../../core/intelligence";

export function normalizeProviderEvidence(
  connection: DataSourceConnection,
  snapshot: DataSourceSnapshot,
  raw: unknown,
): readonly OpportunityEvidenceRecord[] {
  if (connection.workspaceId !== snapshot.workspaceId || connection.id !== snapshot.connectionId || connection.provider !== snapshot.provider) {
    throw new Error("Snapshot ownership does not match its Data Source Connection.");
  }
  if (connection.provider === "googleSearchConsole") return normalizeSearchConsole(connection, snapshot, raw);
  if (connection.provider === "googleAnalytics4") return normalizeGa4(connection, snapshot, raw);
  if (connection.provider === "googleAdSense") return normalizeAdSense(connection, snapshot, raw);
  if (connection.provider === "youtubeAnalytics") return normalizeYouTube(connection, snapshot, raw);
  if (connection.provider === "naverSearchTrend") return normalizeNaver(connection, snapshot, raw);
  throw new Error("This provider does not have an enabled official Evidence normalizer.");
}

function normalizeSearchConsole(connection: DataSourceConnection, snapshot: DataSourceSnapshot, raw: unknown) {
  const rows = records(record(raw).rows), result: OpportunityEvidenceRecord[] = [];
  rows.forEach((row, index) => {
    const keys = strings(row.keys), keyword = keys[0], pageUrl = keys[1];
    const common = base(connection, snapshot, index, { keyword, pageUrl, resourceScope: pageUrl ? "page" as const : keyword ? "query" as const : "site" as const });
    metric(result, common, "searchPerformance", "clicks", number(row.clicks), "clicks");
    metric(result, common, "searchPerformance", "impressions", number(row.impressions), "siteImpressions", ["Search Console impressions are this site's search-result impressions, not monthly search volume."]);
    metric(result, common, "searchPerformance", "ctr", number(row.ctr), "ratio");
    metric(result, common, "searchPerformance", "averagePosition", number(row.position), "averagePosition");
  });
  return Object.freeze(result);
}

function normalizeGa4(connection: DataSourceConnection, snapshot: DataSourceSnapshot, raw: unknown) {
  const value = record(raw), dimensions = records(value.dimensionHeaders).map((item) => String(item.name ?? "")), metrics = records(value.metricHeaders).map((item) => String(item.name ?? ""));
  const result: OpportunityEvidenceRecord[] = [];
  records(value.rows).forEach((row, index) => {
    const dimensionValues = records(row.dimensionValues).map((item) => String(item.value ?? ""));
    const pageUrl = dimensionValues[dimensions.indexOf("landingPagePlusQueryString")] || undefined;
    const metricValues = records(row.metricValues).map((item) => number(item.value));
    metrics.forEach((name, metricIndex) => {
      const amount = metricValues[metricIndex];
      if (amount === undefined || (name === "keyEvents" && amount <= 0)) return;
      metric(result, base(connection, snapshot, index * 20 + metricIndex, { pageUrl, resourceScope: pageUrl ? "page" : "site" }), "pageEngagement", name, amount, ga4Unit(name), name === "keyEvents" ? ["Key events are included only because the selected GA4 property returned configured key-event data."] : ["GA4 engagement is site performance, not search demand."]);
    });
  });
  return Object.freeze(result);
}

function normalizeAdSense(connection: DataSourceConnection, snapshot: DataSourceSnapshot, raw: unknown) {
  const value = record(raw), headers = records(value.headers).map((item) => String(item.name ?? "")), result: OpportunityEvidenceRecord[] = [];
  records(value.rows).forEach((row, index) => {
    const cells = records(row.cells).map((item) => item.value), scope = connection.resourceConfiguration.siteReference ? "site" as const : "account" as const;
    headers.forEach((name, metricIndex) => {
      if (name === "DOMAIN_NAME") return;
      const amount = number(cells[metricIndex]);
      if (amount === undefined) return;
      metric(result, base(connection, snapshot, index * 20 + metricIndex, { resourceScope: scope }), "revenuePerformance", name, amount, adsenseUnit(name), [scope === "account" ? "This value is account-level and is not attributed to an individual post." : "This value is site/domain-level and is not attributed to an individual post.", "Observed AdSense metrics are not converted into predicted earnings."]);
    });
  });
  return Object.freeze(result);
}

function normalizeYouTube(connection: DataSourceConnection, snapshot: DataSourceSnapshot, raw: unknown) {
  const value = record(raw), headers = records(value.columnHeaders).map((item) => String(item.name ?? "")), rows = Array.isArray(value.rows) ? value.rows : [];
  const first = Array.isArray(rows[0]) ? rows[0] as unknown[] : [];
  const topic = connection.resourceConfiguration.channelTitle?.trim() || connection.displayName;
  const result: OpportunityEvidenceRecord[] = [];
  headers.forEach((name, index) => {
    const amount = number(first[index]);
    if (amount === undefined) return;
    metric(result, base(connection, snapshot, index, { topic, resourceScope: "site" }), "videoPerformance", name, amount, youtubeUnit(name), ["YouTube channel performance is observed first-party performance, not external search demand."]);
  });
  return Object.freeze(result);
}

function normalizeNaver(connection: DataSourceConnection, snapshot: DataSourceSnapshot, raw: unknown) {
  const result: OpportunityEvidenceRecord[] = [];
  records(record(raw).results).forEach((group, index) => {
    const keyword = String(group.title ?? strings(group.keywords)[0] ?? "").trim(), data = records(group.data);
    const latest = data.at(-1), prior = data.length > 1 ? data[0] : undefined;
    const latestRatio = number(latest?.ratio), priorRatio = number(prior?.ratio);
    if (!keyword || latestRatio === undefined) return;
    const changeRate = priorRatio !== undefined && priorRatio !== 0 ? (latestRatio - priorRatio) / Math.abs(priorRatio) : null;
    const common = base(connection, snapshot, index * 2, { keyword, resourceScope: "query", observedAt: String(latest?.period ?? snapshot.observedAt) });
    result.push(createOpportunityEvidence({ ...common, evidenceType: "relativeTrend", metric: "searchTrendRatio", relativeValue: latestRatio, value: latestRatio, unit: "relativeRatio", changeRate, limitations: [...common.limitations, "NAVER ratio is a relative trend index and is not absolute search volume."] }));
    if (changeRate !== null && changeRate > 0) result.push(createOpportunityEvidence({ ...common, sourceReference: `${common.sourceReference}:rising`, evidenceType: "risingTrend", metric: "trendChange", relativeValue: latestRatio, value: changeRate, unit: "relativeChangeRate", changeRate, limitations: [...common.limitations, "A rising relative trend does not establish absolute market size."] }));
  });
  return Object.freeze(result);
}

function base(connection: DataSourceConnection, snapshot: DataSourceSnapshot, index: number, extra: Readonly<{ keyword?: string; topic?: string; pageUrl?: string; resourceScope: "account" | "site" | "page" | "query"; observedAt?: string }>) {
  return {
    workspaceId: connection.workspaceId, connectionId: connection.id, projectId: null, provider: connection.provider,
    keyword: extra.keyword, topic: extra.topic, pageUrl: extra.pageUrl, region: connection.resourceConfiguration.country ?? connection.resourceConfiguration.region,
    device: connection.resourceConfiguration.device, periodStart: snapshot.periodStart, periodEnd: snapshot.periodEnd,
    observedAt: extra.observedAt ?? snapshot.observedAt, syncedAt: snapshot.syncedAt,
    freshness: calculateFreshness(connection.provider, snapshot.syncedAt), verified: true, confidence: 1,
    limitations: snapshot.limitations, sourceReference: `${snapshot.snapshotId}:row-${index}`,
    rawSnapshotReference: snapshot.rawSnapshotReference, resourceScope: extra.resourceScope,
  } as const;
}

function metric(result: OpportunityEvidenceRecord[], common: ReturnType<typeof base>, evidenceType: "searchPerformance" | "pageEngagement" | "revenuePerformance" | "videoPerformance", name: string, value: number | undefined, unit: string, limitations: readonly string[] = []) {
  if (value === undefined) return;
  result.push(createOpportunityEvidence({ ...common, sourceReference: `${common.sourceReference}:${name}`, evidenceType, metric: name, value, unit, limitations: [...common.limitations, ...limitations] }));
}
function ga4Unit(name: string) { return name === "userEngagementDuration" ? "seconds" : "count"; }
function adsenseUnit(name: string) { return name.includes("CTR") ? "ratio" : name.includes("RPM") || name.includes("EARNINGS") ? "providerCurrency" : "count"; }
function youtubeUnit(name: string) { return name === "estimatedMinutesWatched" ? "minutes" : "count"; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function number(value: unknown): number | undefined { const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : undefined; }
