import type { DataSourceProviderAdapter } from "../../../../core/intelligence";
import type { SecretStore } from "../../../../core/connections";
import { bearer, connectionSecret, officialJson } from "./OfficialApiSupport";

export class GoogleAnalytics4Adapter implements DataSourceProviderAdapter {
  readonly provider = "googleAnalytics4" as const;
  constructor(private readonly secrets: SecretStore) {}
  async sync(connection: Parameters<DataSourceProviderAdapter["sync"]>[0], request: Parameters<DataSourceProviderAdapter["sync"]>[1]) {
    const secret = await connectionSecret(this.secrets, connection);
    const propertyId = required(connection.resourceConfiguration.propertyId, "Select a GA4 property.").replace(/^properties\//, "");
    const raw = await officialJson(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
      method: "POST", headers: { Authorization: bearer(secret), "Content-Type": "application/json" },
      body: JSON.stringify({ dateRanges: [{ startDate: request.periodStart, endDate: request.periodEnd }], dimensions: [{ name: "landingPagePlusQueryString" }, { name: "pageTitle" }], metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }, { name: "sessions" }, { name: "engagedSessions" }, { name: "userEngagementDuration" }, { name: "keyEvents" }], limit: 25000 }),
    });
    return Object.freeze({ resourceReference: `properties/${propertyId}`, periodStart: request.periodStart, periodEnd: request.periodEnd, observedAt: request.periodEnd, raw, limitations: Object.freeze(["GA4 page and engagement metrics describe site performance, not search-market demand.", "Key events are shown only when the GA4 property actually returns configured key-event data."]) });
  }
}
function required(value: string | undefined, error: string): string { if (!value?.trim()) throw new Error(error); return value.trim(); }
