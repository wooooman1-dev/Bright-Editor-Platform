import type {
  VerificationFreshnessStatus,
  VerificationTemporalEvidence,
  VerificationTemporalRequirement,
} from "./VerificationClaim";

export type VerificationTemporalEvaluation = Readonly<{
  freshnessStatus: VerificationFreshnessStatus;
  fresh: boolean;
  observedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  temporalEvidence?: VerificationTemporalEvidence;
  diagnostics: readonly string[];
}>;

export function evaluateVerificationTemporalEvidence(input: Readonly<{
  requirement?: VerificationTemporalRequirement;
  evidence?: VerificationTemporalEvidence;
  claimEvidenceExcerpt?: string;
  pageText: string;
  claimValue: string;
  observedAt?: string;
}>): VerificationTemporalEvaluation {
  const requirement = input.requirement ?? { mode: "unknown" as const };
  if (requirement.mode === "notRequired") {
    return frozen({ freshnessStatus: "fresh", fresh: true, diagnostics: ["freshness_not_required"] });
  }
  if (requirement.mode === "unknown") return unknown(["freshness_unknown"]);

  const claimExcerpt = input.claimEvidenceExcerpt ?? "";
  const evidence = normalizeEvidence(input.evidence)
    ?? deriveVerificationTemporalEvidence({
      requirement,
      evidenceExcerpt: claimExcerpt,
      claimValue: input.claimValue,
    })
    ?? deriveTemporalEvidenceFromUniqueClaimContext({
      requirement,
      pageText: input.pageText,
      claimEvidenceExcerpt: claimExcerpt,
      claimValue: input.claimValue,
    });
  if (!evidence) return unknown(["temporal_evidence_missing", "freshness_unknown"]);
  const page = normalizeWhitespace(input.pageText);
  const excerpt = normalizeWhitespace(evidence.evidenceExcerpt);
  if (!excerpt || !page.includes(excerpt)) return unknown(["temporal_evidence_excerpt_not_found", "freshness_unknown"]);
  if (!compact(excerpt).includes(compact(input.claimValue))) return unknown(["temporal_evidence_claim_not_linked", "freshness_unknown"]);
  if (!datesBelongToExcerpt(evidence, excerpt)) return unknown(["temporal_evidence_date_not_found", "freshness_unknown"]);

  if (requirement.mode === "current") return evaluateCurrent(evidence, input.observedAt);
  if (requirement.mode === "asOf") return evaluateAsOf(evidence, requirement.date);
  return evaluatePeriod(evidence, requirement.start, requirement.end);
}

/**
 * Derives temporal Evidence only from a Claim-owned Evidence excerpt.
 * A page-level date elsewhere in the document is intentionally insufficient.
 */
export function deriveVerificationTemporalEvidence(input: Readonly<{
  requirement: Exclude<VerificationTemporalRequirement, Readonly<{ mode: "notRequired" }> | Readonly<{ mode: "unknown" }>>;
  evidenceExcerpt: string;
  claimValue: string;
}>): VerificationTemporalEvidence | undefined {
  const excerpt = normalizeWhitespace(input.evidenceExcerpt);
  if (!excerpt || !compact(excerpt).includes(compact(input.claimValue))) return undefined;
  const dates = extractDateLiterals(excerpt);
  if (!dates.length) return undefined;

  if (input.requirement.mode === "current") {
    if (dates.length >= 2 && hasEffectivePeriodMarker(excerpt)) {
      return Object.freeze({ kind: "effectivePeriod", evidenceExcerpt: excerpt, start: dates[0], end: dates[dates.length - 1] });
    }
    if (hasValidThroughMarker(excerpt)) {
      return Object.freeze({ kind: "validThrough", evidenceExcerpt: excerpt, end: dates[dates.length - 1] });
    }
    return undefined;
  }

  if (input.requirement.mode === "asOf") {
    const target = strictDate(input.requirement.date);
    if (!target || !hasReferenceMarker(excerpt)) return undefined;
    if (dates.length >= 2 && dates[0]! <= target && target <= dates[dates.length - 1]!) {
      return Object.freeze({ kind: "referencePeriod", evidenceExcerpt: excerpt, start: dates[0], end: dates[dates.length - 1] });
    }
    if (dates.includes(target)) return Object.freeze({ kind: "referenceDate", evidenceExcerpt: excerpt, date: target });
    return undefined;
  }

  const start = strictDate(input.requirement.start), end = strictDate(input.requirement.end);
  if (!start || !end || start > end || !hasReferenceMarker(excerpt) || dates.length < 2) return undefined;
  const evidenceStart = dates[0]!, evidenceEnd = dates[dates.length - 1]!;
  return evidenceStart <= start && evidenceEnd >= end
    ? Object.freeze({ kind: "referencePeriod", evidenceExcerpt: excerpt, start: evidenceStart, end: evidenceEnd })
    : undefined;
}

function deriveTemporalEvidenceFromUniqueClaimContext(input: Readonly<{
  requirement: Exclude<VerificationTemporalRequirement, Readonly<{ mode: "notRequired" }> | Readonly<{ mode: "unknown" }>>;
  pageText: string;
  claimEvidenceExcerpt: string;
  claimValue: string;
}>): VerificationTemporalEvidence | undefined {
  const page = normalizeWhitespace(input.pageText);
  const claimExcerpt = normalizeWhitespace(input.claimEvidenceExcerpt);
  if (!page || !claimExcerpt || !compact(claimExcerpt).includes(compact(input.claimValue))) return undefined;
  const first = page.indexOf(claimExcerpt);
  if (first < 0 || page.indexOf(claimExcerpt, first + claimExcerpt.length) >= 0) return undefined;
  const margin = 240;
  const context = page.slice(Math.max(0, first - margin), Math.min(page.length, first + claimExcerpt.length + margin));
  return deriveVerificationTemporalEvidence({ requirement: input.requirement, evidenceExcerpt: context, claimValue: input.claimValue });
}

function evaluateCurrent(evidence: VerificationTemporalEvidence, observedAt: string | undefined): VerificationTemporalEvaluation {
  const observed = observedAt ? timestampDay(observedAt) : undefined;
  if (!observed) return unknown(["temporal_observation_missing", "freshness_unknown"], evidence, observedAt);
  if (evidence.kind === "validThrough" && evidence.end) {
    if (observed > evidence.end) return stale(evidence, observedAt, ["claim_stale"]);
    return fresh(evidence, observedAt);
  }
  if (evidence.kind === "effectivePeriod" && evidence.start && evidence.end) {
    if (observed < evidence.start) return unknown(["temporal_not_yet_effective", "freshness_unknown"], evidence, observedAt);
    if (observed > evidence.end) return stale(evidence, observedAt, ["claim_stale"]);
    return fresh(evidence, observedAt);
  }
  return unknown(["temporal_requirement_mismatch", "freshness_unknown"], evidence, observedAt);
}

function evaluateAsOf(evidence: VerificationTemporalEvidence, rawDate: string): VerificationTemporalEvaluation {
  const date = strictDate(rawDate);
  if (!date) return unknown(["temporal_requirement_invalid", "freshness_unknown"], evidence);
  if (evidence.kind === "referenceDate" && evidence.date === date) return fresh(evidence);
  if ((evidence.kind === "referencePeriod" || evidence.kind === "effectivePeriod") && evidence.start && evidence.end && evidence.start <= date && date <= evidence.end) return fresh(evidence);
  return unknown(["temporal_requirement_mismatch", "freshness_unknown"], evidence);
}

function evaluatePeriod(evidence: VerificationTemporalEvidence, rawStart: string, rawEnd: string): VerificationTemporalEvaluation {
  const start = strictDate(rawStart), end = strictDate(rawEnd);
  if (!start || !end || start > end) return unknown(["temporal_requirement_invalid", "freshness_unknown"], evidence);
  if ((evidence.kind === "referencePeriod" || evidence.kind === "effectivePeriod") && evidence.start && evidence.end && evidence.start <= start && evidence.end >= end) return fresh(evidence);
  return unknown(["temporal_requirement_mismatch", "freshness_unknown"], evidence);
}

function normalizeEvidence(value: VerificationTemporalEvidence | undefined): VerificationTemporalEvidence | undefined {
  if (!value?.evidenceExcerpt?.trim()) return undefined;
  const date = value.date ? strictDate(value.date) : undefined;
  const start = value.start ? strictDate(value.start) : undefined;
  const end = value.end ? strictDate(value.end) : undefined;
  if (value.kind === "referenceDate") {
    if (!date) return undefined;
    return Object.freeze({ kind: value.kind, evidenceExcerpt: value.evidenceExcerpt.trim(), date });
  }
  if (value.kind === "validThrough") {
    if (!end) return undefined;
    return Object.freeze({ kind: value.kind, evidenceExcerpt: value.evidenceExcerpt.trim(), end });
  }
  if (value.kind === "effectivePeriod" || value.kind === "referencePeriod") {
    if (!start || !end || start > end) return undefined;
    return Object.freeze({ kind: value.kind, evidenceExcerpt: value.evidenceExcerpt.trim(), start, end });
  }
  return undefined;
}

function datesBelongToExcerpt(evidence: VerificationTemporalEvidence, excerpt: string): boolean {
  const dates = new Set(extractDateLiterals(excerpt));
  return [evidence.date, evidence.start, evidence.end].filter((value): value is string => Boolean(value)).every((value) => dates.has(value));
}

export function extractVerificationDateLiterals(value: string): readonly string[] {
  return Object.freeze(extractDateLiterals(value));
}

function extractDateLiterals(value: string): string[] {
  const found: string[] = [];
  const add = (value: string | undefined) => { if (value && !found.includes(value)) found.push(value); };
  for (const match of value.matchAll(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/gu)) add(dateParts(match[1], match[2], match[3]));
  for (const match of value.matchAll(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu)) add(dateParts(match[1], match[2], match[3]));
  return found;
}

function strictDate(value: string): string | undefined {
  const match = value.trim().match(/^(20\d{2})-(\d{2})-(\d{2})$/u);
  return match ? dateParts(match[1], match[2], match[3]) : undefined;
}

function dateParts(yearValue: string | undefined, monthValue: string | undefined, dayValue: string | undefined): string | undefined {
  const year = Number(yearValue), month = Number(monthValue), day = Number(dayValue);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function timestampDay(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : undefined;
}

function hasEffectivePeriodMarker(value: string): boolean {
  return /(?:적용\s*기간|유효\s*기간|시행\s*기간|효력\s*기간|적용\s*일자|effective\s+(?:period|from)|valid\s+from)/iu.test(value);
}
function hasValidThroughMarker(value: string): boolean {
  return /(?:유효\s*기한|만료일|종료일|(?:적용|유효|시행|지원|지급)[^.!?]{0,40}까지|valid\s+through|\buntil\b|\bexpires?\b)/iu.test(value);
}
function hasReferenceMarker(value: string): boolean {
  return /(?:기준(?:일|기간|연도|년도|시점)?|통계\s*(?:기간|연도|년도)?|대상\s*기간|reference\s+(?:date|period)|\bas\s+of\b)/iu.test(value);
}

function normalizeWhitespace(value: string): string { return value.replace(/\s+/gu, " ").normalize("NFKC").trim(); }
function compact(value: string): string { return normalizeWhitespace(value).replace(/\s+/gu, "").toLocaleLowerCase("ko-KR"); }

function fresh(evidence: VerificationTemporalEvidence, observedAt?: string): VerificationTemporalEvaluation {
  return frozen({
    freshnessStatus: "fresh",
    fresh: true,
    ...(observedAt ? { observedAt } : {}),
    ...(evidence.start ? { effectiveFrom: evidence.start } : {}),
    ...(evidence.end ? { effectiveUntil: evidence.end } : {}),
    temporalEvidence: evidence,
    diagnostics: [],
  });
}

function stale(evidence: VerificationTemporalEvidence, observedAt: string | undefined, diagnostics: readonly string[]): VerificationTemporalEvaluation {
  return frozen({
    freshnessStatus: "stale",
    fresh: false,
    ...(observedAt ? { observedAt } : {}),
    ...(evidence.start ? { effectiveFrom: evidence.start } : {}),
    ...(evidence.end ? { effectiveUntil: evidence.end } : {}),
    temporalEvidence: evidence,
    diagnostics,
  });
}

function unknown(diagnostics: readonly string[], evidence?: VerificationTemporalEvidence, observedAt?: string): VerificationTemporalEvaluation {
  return frozen({
    freshnessStatus: "unknown",
    fresh: false,
    ...(observedAt ? { observedAt } : {}),
    ...(evidence?.start ? { effectiveFrom: evidence.start } : {}),
    ...(evidence?.end ? { effectiveUntil: evidence.end } : {}),
    ...(evidence ? { temporalEvidence: evidence } : {}),
    diagnostics,
  });
}

function frozen(value: Omit<VerificationTemporalEvaluation, "diagnostics"> & Readonly<{ diagnostics: readonly string[] }>): VerificationTemporalEvaluation {
  return Object.freeze({ ...value, diagnostics: Object.freeze([...value.diagnostics]) });
}
