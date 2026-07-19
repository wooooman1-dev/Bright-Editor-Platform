import type { DataSourceProviderAdapter } from "../../../../core/intelligence";
import type { SecretStore } from "../../../../core/connections";
import { connectionSecret, officialJson, parseSecret } from "./OfficialApiSupport";

export class NaverSearchTrendAdapter implements DataSourceProviderAdapter {
  readonly provider = "naverSearchTrend" as const;
  constructor(private readonly secrets: SecretStore) {}
  async sync(connection: Parameters<DataSourceProviderAdapter["sync"]>[0], request: Parameters<DataSourceProviderAdapter["sync"]>[1]) {
    const secret = await connectionSecret(this.secrets, connection);
    const credentials = parseSecret(secret), keywords = (connection.resourceConfiguration.keywords ?? []).map((value) => value.trim()).filter(Boolean).slice(0, 5);
    if (!credentials.clientId || !credentials.clientSecret) throw new Error("NAVER API client ID and client secret are required in SecretStore.");
    if (!keywords.length) throw new Error("Configure at least one NAVER Search Trend keyword.");
    const raw = await officialJson("https://openapi.naver.com/v1/datalab/search", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Naver-Client-Id": credentials.clientId, "X-Naver-Client-Secret": credentials.clientSecret },
      body: JSON.stringify({ startDate: request.periodStart, endDate: request.periodEnd, timeUnit: "date", keywordGroups: keywords.map((keyword) => ({ groupName: keyword, keywords: [keyword] })), ...(connection.resourceConfiguration.device ? { device: connection.resourceConfiguration.device } : {}), ...(connection.resourceConfiguration.gender ? { gender: connection.resourceConfiguration.gender } : {}), ...(connection.resourceConfiguration.ages?.length ? { ages: connection.resourceConfiguration.ages } : {}) }),
    });
    return Object.freeze({ resourceReference: `naver-search-trend:${keywords.join("|")}`, periodStart: request.periodStart, periodEnd: request.periodEnd, observedAt: request.periodEnd, raw, limitations: Object.freeze(["NAVER Search Trend ratios are relative trend indices, not absolute search volume.", ...(connection.resourceConfiguration.region ? ["The official NAVER Search Trend API does not apply the stored region preference; results are not region-filtered."] : [])]) });
  }
}
