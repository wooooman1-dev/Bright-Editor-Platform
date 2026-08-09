import type { DataSourceProvider } from "./DataSourceConnection";

export const evidenceTypes = [
  "searchPerformance", "searchDemand", "relativeTrend", "risingTrend",
  "keywordCompetition", "commercialIntent", "pageEngagement", "revenuePerformance",
  "videoPerformance", "contentGap", "internalLinkOpportunity", "clusterOpportunity", "editorialInference",
] as const;

export type EvidenceType = (typeof evidenceTypes)[number];
export type EvidenceFreshness = "fresh" | "aging" | "stale" | "unavailable";
export type EvidenceProvider = DataSourceProvider | "brightStudio";
export type EvidenceScope = "account" | "site" | "page" | "query" | "project";

export type OpportunityEvidenceRecord = Readonly<{
  evidenceId: string;
  workspaceId: string;
  connectionId?: string;
  projectId?: string | null;
  provider: EvidenceProvider;
  evidenceType: EvidenceType;
  metric?: string;
  keyword?: string;
  topic?: string;
  contentId?: string;
  pageUrl?: string;
  region?: string;
  language?: string;
  device?: string;
  periodStart?: string;
  periodEnd?: string;
  observedAt: string;
  syncedAt: string;
  freshness: EvidenceFreshness;
  verified: boolean;
  value?: number | string | null;
  unit?: string;
  relativeValue?: number | null;
  changeRate?: number | null;
  confidence: number;
  limitations: readonly string[];
  sourceReference: string;
  rawSnapshotReference?: string;
  resourceScope: EvidenceScope;
  version: 1;
  fingerprint: string;
}>;

export type OpportunityEvidenceDraft = Omit<OpportunityEvidenceRecord, "evidenceId" | "fingerprint" | "version">;

export interface OpportunityEvidenceRepository {
  findById(id: string): Promise<OpportunityEvidenceRecord | undefined>;
  listByWorkspace(workspaceId: string): Promise<readonly OpportunityEvidenceRecord[]>;
  saveMany(values: readonly OpportunityEvidenceRecord[]): Promise<void>;
}

export function createOpportunityEvidence(input: OpportunityEvidenceDraft): OpportunityEvidenceRecord {
  const canonical = Object.freeze({
    workspaceId: required(input.workspaceId, "workspaceId"),
    ...(input.connectionId ? { connectionId: input.connectionId.trim() } : {}),
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    provider: input.provider,
    evidenceType: input.evidenceType,
    ...(input.metric ? { metric: input.metric.trim() } : {}),
    ...(input.keyword ? { keyword: input.keyword.trim() } : {}),
    ...(input.topic ? { topic: input.topic.trim() } : {}),
    ...(input.contentId ? { contentId: input.contentId.trim() } : {}),
    ...(input.pageUrl ? { pageUrl: input.pageUrl.trim() } : {}),
    ...(input.region ? { region: input.region.trim() } : {}),
    ...(input.language ? { language: input.language.trim() } : {}),
    ...(input.device ? { device: input.device.trim() } : {}),
    ...(input.periodStart ? { periodStart: input.periodStart.trim() } : {}),
    ...(input.periodEnd ? { periodEnd: input.periodEnd.trim() } : {}),
    observedAt: required(input.observedAt, "observedAt"),
    syncedAt: required(input.syncedAt, "syncedAt"),
    freshness: input.freshness,
    verified: input.verified === true,
    ...(input.value !== undefined ? { value: input.value } : {}),
    ...(input.unit ? { unit: input.unit.trim() } : {}),
    ...(input.relativeValue !== undefined ? { relativeValue: input.relativeValue } : {}),
    ...(input.changeRate !== undefined ? { changeRate: input.changeRate } : {}),
    confidence: clamp(input.confidence),
    limitations: Object.freeze(clean(input.limitations)),
    sourceReference: required(input.sourceReference, "sourceReference"),
    ...(input.rawSnapshotReference ? { rawSnapshotReference: input.rawSnapshotReference.trim() } : {}),
    resourceScope: input.resourceScope,
  });
  assertEvidenceSemantics(canonical);
  const fingerprint = fingerprintValue(canonical);
  return Object.freeze({ ...canonical, evidenceId: `evidence-${fingerprint.slice(3)}`, version: 1, fingerprint });
}

export function assertEvidenceSemantics(evidence: OpportunityEvidenceDraft): void {
  const unit = (evidence.unit ?? "").toLocaleLowerCase("en-US");
  if ((evidence.evidenceType === "relativeTrend" || evidence.evidenceType === "risingTrend")
    && /search(?:es|count|volume)|monthly|검색량/.test(unit)) {
    throw new Error("Relative trend evidence cannot be represented as absolute search volume.");
  }
  if (evidence.provider === "googleAnalytics4" && evidence.evidenceType === "searchDemand") {
    throw new Error("GA4 engagement cannot be represented as search demand.");
  }
  if (evidence.provider === "youtubeAnalytics" && evidence.evidenceType === "searchDemand") {
    throw new Error("YouTube channel performance cannot be represented as search demand.");
  }
  if (evidence.provider === "googleSearchConsole" && evidence.metric === "impressions" && evidence.evidenceType === "searchDemand") {
    throw new Error("Search Console impressions are site search performance, not total search demand.");
  }
  if (evidence.provider === "googleAdsKeywordPlanning" && evidence.evidenceType === "keywordCompetition"
    && !evidence.limitations.some((value) => /광고|advertising/i.test(value) && /SEO/i.test(value))) {
    throw new Error("Google Ads competition evidence must state that it is not SEO difficulty.");
  }
  if (evidence.provider === "googleAdSense" && evidence.evidenceType === "revenuePerformance"
    && evidence.pageUrl && evidence.resourceScope !== "page") {
    throw new Error("AdSense revenue cannot be attributed to a page without page-level data.");
  }
  if (evidence.evidenceType === "editorialInference" && evidence.verified) {
    throw new Error("Editorial inference is not verified market evidence.");
  }
}

export function hasCurrentEvidenceFingerprint(value: OpportunityEvidenceRecord): boolean {
  try { return createOpportunityEvidence(value).fingerprint === value.fingerprint; } catch { return false; }
}

export function fingerprintValue(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) { hash ^= source.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
function clean(values: readonly string[]): string[] { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function clamp(value: number): number { return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; }
function required(value: string, field: string): string { const result = value.trim(); if (!result) throw new Error(`Evidence is missing ${field}.`); return result; }
