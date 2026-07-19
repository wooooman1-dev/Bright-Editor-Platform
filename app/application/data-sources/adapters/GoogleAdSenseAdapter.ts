import type { DataSourceProviderAdapter } from "../../../../core/intelligence";
import type { SecretStore } from "../../../../core/connections";
import { bearer, connectionSecret, officialJson } from "./OfficialApiSupport";

export class GoogleAdSenseAdapter implements DataSourceProviderAdapter {
  readonly provider = "googleAdSense" as const;
  constructor(private readonly secrets: SecretStore) {}
  async sync(connection: Parameters<DataSourceProviderAdapter["sync"]>[0], request: Parameters<DataSourceProviderAdapter["sync"]>[1]) {
    const secret = await connectionSecret(this.secrets, connection);
    const account = required(connection.resourceConfiguration.accountReference, "Select an AdSense account.").replace(/^accounts\//, "");
    const query = new URLSearchParams({ dateRange: "CUSTOM", "startDate.year": request.periodStart.slice(0, 4), "startDate.month": String(Number(request.periodStart.slice(5, 7))), "startDate.day": String(Number(request.periodStart.slice(8, 10))), "endDate.year": request.periodEnd.slice(0, 4), "endDate.month": String(Number(request.periodEnd.slice(5, 7))), "endDate.day": String(Number(request.periodEnd.slice(8, 10))) });
    for (const metric of ["ESTIMATED_EARNINGS", "IMPRESSIONS", "CLICKS", "IMPRESSIONS_CTR", "IMPRESSIONS_RPM"]) query.append("metrics", metric);
    if (connection.resourceConfiguration.siteReference) query.append("dimensions", "DOMAIN_NAME");
    const raw = await officialJson(`https://adsense.googleapis.com/v2/accounts/${encodeURIComponent(account)}/reports:generate?${query.toString()}`, { headers: { Authorization: bearer(secret) } });
    return Object.freeze({ resourceReference: `accounts/${account}${connection.resourceConfiguration.siteReference ? `/sites/${connection.resourceConfiguration.siteReference}` : ""}`, periodStart: request.periodStart, periodEnd: request.periodEnd, observedAt: request.periodEnd, raw, limitations: Object.freeze([connection.resourceConfiguration.siteReference ? "AdSense metrics are limited to the provider's returned site/domain scope; they are not attributed to individual posts." : "AdSense metrics are account-level and are not attributed to individual posts.", "CPC or RPM is not converted into predicted post revenue."]) });
  }
}
function required(value: string | undefined, error: string): string { if (!value?.trim()) throw new Error(error); return value.trim(); }
