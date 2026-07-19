import { normalizeSeoKeyword } from "./SeoKeywordPlacement";
import type { EvidenceFreshness, EvidenceType, OpportunityEvidenceStatus, OpportunityRecommendationType } from "../intelligence";

export type ContentOpportunitySelectionMode = "automatic" | "userSpecified";
export type OpportunityEvidenceSource = "verified" | "estimated" | "inferred" | "unknown";

export type OpportunityEvidence = Readonly<{
  source: OpportunityEvidenceSource;
  summary: string;
  evidenceId?: string;
  provider?: string;
  evidenceType?: EvidenceType;
  metric?: string;
  periodStart?: string;
  periodEnd?: string;
  freshness?: EvidenceFreshness;
  verified?: boolean;
  limitation?: string;
  sourceReference?: string;
}>;

export type ContentOpportunityCandidate = Readonly<{
  opportunityId: string;
  version: 1;
  fingerprint: string;
  sourceRequest: string;
  selectionMode: ContentOpportunitySelectionMode;
  selectedTopic: string;
  primaryKeyword: string;
  secondaryKeywords: readonly string[];
  searchIntent: string;
  audience: string;
  contentType: string;
  contentAngle: string;
  readerProblem: string;
  expectedCoverage: readonly string[];
  selectionRationale: string;
  opportunityEvidence: readonly OpportunityEvidence[];
  recommendationType: OpportunityRecommendationType;
  evidenceIds: readonly string[];
  marketEvidenceStatus: OpportunityEvidenceStatus;
  internalGrowthEvidenceStatus: OpportunityEvidenceStatus;
  freshness: EvidenceFreshness;
  limitations: readonly string[];
  classificationVersion: 1;
  confidence: number;
  cautions: readonly string[];
  projectId: string;
}>;

export type ConfirmedContentOpportunity = ContentOpportunityCandidate & Readonly<{
  workspaceId: string;
  contentId: string;
  confirmedAt: string;
}>;

export type ContentOpportunityDraft = Omit<ContentOpportunityCandidate, "opportunityId" | "version" | "fingerprint" | "recommendationType" | "evidenceIds" | "marketEvidenceStatus" | "internalGrowthEvidenceStatus" | "freshness" | "limitations" | "classificationVersion"> & Partial<Pick<ContentOpportunityCandidate, "recommendationType" | "evidenceIds" | "marketEvidenceStatus" | "internalGrowthEvidenceStatus" | "freshness" | "limitations" | "classificationVersion">>;

export function createContentOpportunityCandidate(input: ContentOpportunityDraft): ContentOpportunityCandidate {
  const value = canonicalOpportunityValue(input);
  const fingerprint = fingerprintValue(value);
  return Object.freeze({
    ...value,
    opportunityId: `opportunity-${fingerprint.slice(3)}`,
    version: 1,
    fingerprint,
  });
}

export function confirmContentOpportunity(
  candidate: ContentOpportunityCandidate,
  binding: Readonly<{ workspaceId: string; projectId: string; contentId: string; confirmedAt: string }>,
): ConfirmedContentOpportunity {
  if (candidate.projectId !== binding.projectId) {
    throw new Error("선택한 콘텐츠 전략이 현재 프로젝트와 일치하지 않습니다.");
  }
  const verified = createContentOpportunityCandidate(candidate);
  if (verified.fingerprint !== candidate.fingerprint || verified.opportunityId !== candidate.opportunityId) {
    throw new Error("선택한 콘텐츠 전략의 fingerprint가 유효하지 않습니다. 다시 분석해 주세요.");
  }
  return Object.freeze({
    ...candidate,
    workspaceId: required(binding.workspaceId, "workspaceId"),
    contentId: required(binding.contentId, "contentId"),
    confirmedAt: required(binding.confirmedAt, "confirmedAt"),
  });
}

export function assertConfirmedContentOpportunity(
  value: ConfirmedContentOpportunity | undefined,
  expected: Readonly<{
    workspaceId: string;
    projectId: string;
    contentId: string;
    opportunityId?: unknown;
    opportunityVersion?: unknown;
    opportunityFingerprint?: unknown;
    primaryKeyword?: unknown;
    selectedTopic?: unknown;
    searchIntent?: unknown;
    secondaryKeywords?: unknown;
  }>,
): ConfirmedContentOpportunity {
  if (!value) throw new Error("콘텐츠 기회를 먼저 선택해 주세요.");
  const verified = createContentOpportunityCandidate(value);
  const requestedVersion = Number(expected.opportunityVersion);
  const mismatch = value.workspaceId !== expected.workspaceId
    || value.projectId !== expected.projectId
    || value.contentId !== expected.contentId
    || value.opportunityId !== String(expected.opportunityId ?? "")
    || value.version !== requestedVersion
    || value.fingerprint !== String(expected.opportunityFingerprint ?? "")
    || value.fingerprint !== verified.fingerprint
    || !sameText(value.primaryKeyword, expected.primaryKeyword)
    || !sameText(value.selectedTopic, expected.selectedTopic)
    || !sameText(value.searchIntent, expected.searchIntent)
    || !sameList(value.secondaryKeywords, expected.secondaryKeywords);
  if (mismatch) {
    throw new Error("선택한 콘텐츠 전략이 현재 원고와 일치하지 않습니다. 주제와 대표 키워드를 다시 확인해 주세요.");
  }
  return value;
}

export function contentOpportunityKeywords(opportunity: ContentOpportunityCandidate): readonly string[] {
  const primary = normalizeSeoKeyword(opportunity.primaryKeyword);
  const related = opportunity.secondaryKeywords
    .map(normalizeSeoKeyword)
    .filter((keyword) => keyword && !sameText(keyword, primary));
  return Object.freeze([primary, ...new Set(related)]);
}

export function hasCurrentContentOpportunityFingerprint(opportunity: ContentOpportunityCandidate): boolean {
  try {
    const verified = createContentOpportunityCandidate(opportunity);
    return verified.fingerprint === opportunity.fingerprint && verified.opportunityId === opportunity.opportunityId && opportunity.version === 1;
  } catch {
    return false;
  }
}

export function opportunityEvidenceLabel(source: OpportunityEvidenceSource): string {
  return ({
    verified: "실제 데이터",
    estimated: "AI 추정",
    inferred: "콘텐츠 공백 추론",
    unknown: "근거 미확인",
  })[source];
}

export function detectContentOpportunitySelectionMode(request: string, explicitlyAutomatic = false): ContentOpportunitySelectionMode {
  if (explicitlyAutomatic) return "automatic";
  const normalized = request.normalize("NFKC").toLocaleLowerCase("ko-KR");
  return /(?:아직\s*(?:다루지|작성하지)|겹치지\s*않|검색\s*기회|주제(?:와|를)?\s*(?:골라|선정|맡)|ai(?:가|에게)\s*(?:골라|선정|맡)|오늘\s*글|최적\s*주제)/i.test(normalized)
    ? "automatic"
    : "userSpecified";
}

function canonicalOpportunityValue(input: ContentOpportunityDraft | ContentOpportunityCandidate) {
  const evidence = input.opportunityEvidence.length
    ? input.opportunityEvidence.map((item) => Object.freeze({
      source: normalizeEvidenceSource(item.source), summary: required(item.summary, "opportunityEvidence.summary"),
      ...(item.evidenceId ? { evidenceId: required(item.evidenceId, "opportunityEvidence.evidenceId") } : {}),
      ...(item.provider ? { provider: required(item.provider, "opportunityEvidence.provider") } : {}),
      ...(item.evidenceType ? { evidenceType: item.evidenceType } : {}),
      ...(item.metric ? { metric: item.metric.trim() } : {}),
      ...(item.periodStart ? { periodStart: item.periodStart.trim() } : {}),
      ...(item.periodEnd ? { periodEnd: item.periodEnd.trim() } : {}),
      ...(item.freshness ? { freshness: item.freshness } : {}),
      ...(typeof item.verified === "boolean" ? { verified: item.verified } : {}),
      ...(item.limitation ? { limitation: item.limitation.trim() } : {}),
      ...(item.sourceReference ? { sourceReference: item.sourceReference.trim() } : {}),
    })).sort((left, right) => evidenceSortKey(left).localeCompare(evidenceSortKey(right)))
    : [Object.freeze({ source: "unknown" as const, summary: "검증된 외부 검색 데이터가 연결되지 않았습니다." }) as OpportunityEvidence];
  const selectedTopic = required(input.selectedTopic, "selectedTopic");
  const primaryKeyword = required(normalizeSeoKeyword(input.primaryKeyword), "primaryKeyword");
  if (!topicAndKeywordCoherent(selectedTopic, primaryKeyword)) {
    throw new Error("Content Opportunity의 선정 주제와 대표 키워드가 같은 검색 의도에 속하지 않습니다.");
  }
  return Object.freeze({
    sourceRequest: required(input.sourceRequest, "sourceRequest"),
    selectionMode: input.selectionMode === "userSpecified" ? "userSpecified" as const : "automatic" as const,
    selectedTopic,
    primaryKeyword,
    secondaryKeywords: cleanList(input.secondaryKeywords),
    searchIntent: required(input.searchIntent, "searchIntent"),
    audience: required(input.audience, "audience"),
    contentType: required(input.contentType, "contentType"),
    contentAngle: required(input.contentAngle, "contentAngle"),
    readerProblem: required(input.readerProblem, "readerProblem"),
    expectedCoverage: cleanList(input.expectedCoverage),
    selectionRationale: required(input.selectionRationale, "selectionRationale"),
    opportunityEvidence: Object.freeze(evidence),
    recommendationType: input.recommendationType === "comprehensive" || input.recommendationType === "marketOpportunity" ? input.recommendationType : "blogGrowth" as const,
    evidenceIds: Object.freeze([...cleanList(input.evidenceIds ?? evidence.flatMap((item) => item.evidenceId ? [item.evidenceId] : []))].sort()),
    marketEvidenceStatus: input.marketEvidenceStatus === "verified" || input.marketEvidenceStatus === "limited" ? input.marketEvidenceStatus : "unavailable" as const,
    internalGrowthEvidenceStatus: input.internalGrowthEvidenceStatus === "unavailable" ? "unavailable" as const : input.internalGrowthEvidenceStatus === "limited" ? "limited" as const : "verified" as const,
    freshness: input.freshness === "fresh" || input.freshness === "aging" || input.freshness === "stale" ? input.freshness : "unavailable" as const,
    limitations: cleanList(input.limitations ?? ["외부 시장 데이터가 확인되지 않았습니다. 검색 수요는 검증되지 않았습니다."]),
    classificationVersion: 1 as const,
    confidence: Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence)) : 0,
    cautions: cleanList(input.cautions),
    projectId: required(input.projectId, "projectId"),
  });
}

function topicAndKeywordCoherent(topic: string, keyword: string): boolean {
  const ignored = new Set(["관리", "방법", "가이드", "정보", "글", "콘텐츠", "추천", "실천"]);
  const terms = (value: string) => normalizeSeoKeyword(value).toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣\s]/g, " ").split(/\s+/).filter((term) => term && !ignored.has(term));
  const topicTerms = terms(topic);
  const keywordTerms = terms(keyword);
  if (!topicTerms.length || !keywordTerms.length) return normalizeSeoKeyword(topic).includes(normalizeSeoKeyword(keyword)) || normalizeSeoKeyword(keyword).includes(normalizeSeoKeyword(topic));
  return topicTerms.some((left) => keywordTerms.some((right) => left.includes(right) || right.includes(left)));
}

function fingerprintValue(value: ReturnType<typeof canonicalOpportunityValue>): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function evidenceSortKey(value: Readonly<Record<string, unknown>>): string {
  return `${String(value.evidenceId ?? "")}\u0000${String(value.source ?? "")}\u0000${String(value.summary ?? "")}`;
}

function cleanList(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))]);
}

function normalizeEvidenceSource(value: OpportunityEvidenceSource): OpportunityEvidenceSource {
  return value === "verified" || value === "estimated" || value === "inferred" ? value : "unknown";
}

function sameText(left: unknown, right: unknown): boolean {
  return normalizeSeoKeyword(String(left ?? "")).toLocaleLowerCase("ko-KR")
    === normalizeSeoKeyword(String(right ?? "")).toLocaleLowerCase("ko-KR");
}

function sameList(left: readonly string[], right: unknown): boolean {
  if (!Array.isArray(right)) return false;
  return JSON.stringify(left.map(normalizeSeoKeyword)) === JSON.stringify(right.map((item) => normalizeSeoKeyword(String(item))));
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Content Opportunity is missing ${field}.`);
  return normalized;
}
