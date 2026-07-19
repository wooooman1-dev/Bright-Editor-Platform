import type { DataSourceProvider } from "./DataSourceConnection";
import type { EvidenceFreshness } from "./Evidence";

export type FreshnessPolicy = Readonly<{ freshForMs: number; agingForMs: number; staleUsable: boolean }>;

export const providerFreshnessPolicies: Readonly<Record<DataSourceProvider, FreshnessPolicy>> = Object.freeze({
  googleSearchConsole: { freshForMs: days(2), agingForMs: days(7), staleUsable: true },
  googleAnalytics4: { freshForMs: days(2), agingForMs: days(7), staleUsable: true },
  googleAdSense: { freshForMs: days(2), agingForMs: days(7), staleUsable: true },
  naverSearchTrend: { freshForMs: days(1), agingForMs: days(3), staleUsable: true },
  googleAdsKeywordPlanning: { freshForMs: days(7), agingForMs: days(30), staleUsable: true },
  googleTrendsOfficial: { freshForMs: days(1), agingForMs: days(7), staleUsable: true },
});

export function calculateFreshness(provider: DataSourceProvider, syncedAt: string | undefined, now = new Date()): EvidenceFreshness {
  if (!syncedAt) return "unavailable";
  const observed = Date.parse(syncedAt);
  if (!Number.isFinite(observed)) return "unavailable";
  const age = Math.max(0, now.getTime() - observed), policy = providerFreshnessPolicies[provider];
  if (age <= policy.freshForMs) return "fresh";
  if (age <= policy.agingForMs) return "aging";
  return "stale";
}

function days(value: number): number { return value * 24 * 60 * 60 * 1000; }
