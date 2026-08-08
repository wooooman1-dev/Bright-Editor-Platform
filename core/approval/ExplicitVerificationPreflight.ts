import type { ContentOpportunityVerificationPlan } from "../content/ContentOpportunity";
import type { VerificationClaimResult, VerificationClaimSpec, VerificationSnapshot, VerificationSourceAssessment } from "./VerificationClaim";
import { verificationOverallStatus } from "./VerificationClaim";
import { sourceSnapshotFingerprint, verificationSnapshotFingerprint } from "./VerificationClaimFingerprint";
import { evaluateVerificationClaim } from "./VerificationClaimPolicy";
import { normalizeVerificationValue } from "./VerificationClaimNormalizer";
import { canonicalizeVerificationSourceIdentity } from "./VerificationSourceIdentity";
import { evaluateVerificationTemporalEvidence } from "./VerificationTemporalPolicy";

export type ExplicitVerificationClock = () => string;
export type ExplicitVerificationInput = Readonly<{
  plan: ContentOpportunityVerificationPlan;
  assessments: readonly VerificationSourceAssessment[];
  results?: readonly Omit<VerificationClaimResult, "status" | "independentInstitutionCount" | "authoritativeInstitutionCount" | "primarySourceFound">[];
  now?: ExplicitVerificationClock;
}>;

export type ExplicitDiscoveredClaim = Readonly<{ claimId: string; value: string; evidenceExcerpt: string }>;
export type ExplicitDiscoveredSource = Readonly<{ requestedUrl: string; finalUrl?: string; title?: string; evidenceExcerpt: string; pageText?: string; publisherId?: string; role?: "primaryOfficial" | "officialCorroborating" | "independentCorroborating"; authoritative?: boolean; observedAt?: string; effectiveFrom?: string; effectiveUntil?: string; fresh?: boolean; claims: readonly ExplicitDiscoveredClaim[]; diagnostics?: readonly string[] }>;

/** Converts server-validated explicit discovery records into claim assessments. AI-owned identity fields are ignored. */
export function assessmentsFromExplicitDiscovery(input: Readonly<{ claims: readonly VerificationClaimSpec[]; sources: readonly ExplicitDiscoveredSource[]; now?: ExplicitVerificationClock }>): readonly VerificationSourceAssessment[] {
  const specs = new Map(input.claims.map((claim) => [claim.claimId, claim]));
  const output: VerificationSourceAssessment[] = [];
  const now = input.now ?? (() => new Date().toISOString());
  for (const source of input.sources) {
    const identity = canonicalizeVerificationSourceIdentity({ requestedUrl: source.requestedUrl, finalUrl: source.finalUrl, publisherId: source.publisherId, role: source.role ?? "independentCorroborating", authoritative: source.authoritative === true });
    const baseDiagnostics = [...(source.diagnostics ?? [])];
    if (!identity) { output.push(Object.freeze({ sourceId: `unresolved-${source.requestedUrl}`, institutionGroupId: `unresolved-${source.requestedUrl}`, role: "independentCorroborating", authoritative: false, supports: false, fresh: false, freshnessStatus: "unknown", diagnostics: Object.freeze([...baseDiagnostics, "Source institution identity could not be resolved.", "freshness_unknown"]) })); continue; }
    for (const claim of source.claims) {
      const spec = specs.get(claim.claimId);
      if (!spec) continue;
      const normalized = normalizeExplicitClaimValue(spec, claim.value);
      const plannedRawValue = spec.rawValue ? normalizeExplicitClaimValue(spec, spec.rawValue) : undefined;
      const page = (source.pageText ?? "").replace(/\s+/gu, " ").normalize("NFKC");
      const excerptFound = page.includes(claim.evidenceExcerpt.replace(/\s+/gu, " ").normalize("NFKC"));
      const valueFound = page.includes(claim.value.replace(/\s+/gu, " ").normalize("NFKC"));
      const rawMatches = !spec.rawValue || Boolean(
        normalized
        && plannedRawValue
        && canonicalValue(normalized) === canonicalValue(plannedRawValue),
      );
      const supports = Boolean(claim.evidenceExcerpt.trim() && excerptFound && valueFound && rawMatches && normalized);
      const temporal = spec.temporalRequirement
        ? evaluateVerificationTemporalEvidence({
          claimKind: spec.kind,
          requirement: spec.temporalRequirement,
          claimEvidenceExcerpt: claim.evidenceExcerpt,
          pageText: source.pageText ?? "",
          claimValue: claim.value,
          observedAt: source.observedAt ?? (source.pageText ? now() : undefined),
        })
        : legacyFixtureFreshness(source);
      output.push(Object.freeze({
        ...identity,
        supports,
        ...(normalized && valueFound ? { normalizedValue: normalized } : {}),
        freshnessStatus: temporal.freshnessStatus,
        ...(temporal.observedAt ? { observedAt: temporal.observedAt } : {}),
        ...(temporal.effectiveFrom ? { effectiveFrom: temporal.effectiveFrom } : {}),
        ...(temporal.effectiveUntil ? { effectiveUntil: temporal.effectiveUntil } : {}),
        ...(temporal.temporalEvidence ? { temporalEvidence: temporal.temporalEvidence } : {}),
        fresh: temporal.fresh,
        diagnostics: Object.freeze([
          ...baseDiagnostics,
          ...(excerptFound ? [] : ["claim_evidence_excerpt_not_found"]),
          ...(valueFound ? [] : ["claim_value_not_found"]),
          ...(rawMatches ? [] : ["claim_raw_value_mismatch"]),
          ...(normalized ? [] : ["claim_normalization_failed"]),
          ...temporal.diagnostics,
          `claim:${claim.claimId}`,
        ]),
      }));
    }
  }
  return Object.freeze(output);
}

function legacyFixtureFreshness(source: ExplicitDiscoveredSource): ReturnType<typeof evaluateVerificationTemporalEvidence> {
  if (source.fresh === true) return Object.freeze({ freshnessStatus: "fresh" as const, fresh: true, ...(source.observedAt ? { observedAt: source.observedAt } : {}), diagnostics: Object.freeze([] as string[]) });
  if (source.fresh === false) return Object.freeze({ freshnessStatus: "stale" as const, fresh: false, ...(source.observedAt ? { observedAt: source.observedAt } : {}), diagnostics: Object.freeze(["claim_stale"]) });
  if (source.effectiveUntil && source.observedAt) {
    const observed = Date.parse(source.observedAt), end = Date.parse(source.effectiveUntil);
    if (Number.isFinite(observed) && Number.isFinite(end) && observed > end) return Object.freeze({ freshnessStatus: "stale" as const, fresh: false, observedAt: source.observedAt, effectiveUntil: source.effectiveUntil, diagnostics: Object.freeze(["claim_stale"]) });
  }
  return Object.freeze({ freshnessStatus: "unknown" as const, fresh: false, ...(source.observedAt ? { observedAt: source.observedAt } : {}), diagnostics: Object.freeze(["freshness_unknown"]) });
}

/** Builds the Phase 4 server-owned immutable Snapshot. No AI, fetch, or persistence is performed here. */
export function createVerificationSnapshot(input: ExplicitVerificationInput): VerificationSnapshot {
  const now = input.now ?? (() => new Date(0).toISOString());
  const assessments = freezeAssessments(input.assessments);
  const resultById = new Map((input.results ?? []).map((result) => [result.claimId, result]));
  const results = input.plan.claims.map((spec) => {
    const supplied = resultById.get(spec.claimId);
    if (!supplied) return evaluateVerificationClaim(spec, {
      claimId: spec.claimId, sourceAssessments: assessments.filter((a) => a.diagnostics.includes(`claim:${spec.claimId}`)),
      unresolvedConflict: false, freshnessPassed: false, diagnostics: ["No source assessment was supplied."],
    });
    return evaluateVerificationClaim(spec, {
      ...supplied,
      sourceAssessments: freezeAssessments(supplied.sourceAssessments),
      ...(supplied.normalizedValue ? { normalizedValue: normalizeVerificationValue(spec.kind, supplied.normalizedValue) } : {}),
      unresolvedConflict: supplied.unresolvedConflict || hasNormalizedConflict(supplied.sourceAssessments),
      diagnostics: Object.freeze([...supplied.diagnostics]),
    });
  }).map((result) => Object.freeze(result));
  const frozenResults = Object.freeze(results);
  const createdAt = now();
  const base = { verificationMode: "explicit" as const, claimDefinitionFingerprint: input.plan.fingerprint, sourceSnapshotFingerprint: sourceSnapshotFingerprint(assessments), results: frozenResults, overallStatus: verificationOverallStatus(input.plan.claims, frozenResults), createdAt, updatedAt: createdAt };
  return Object.freeze({ ...base, verificationSnapshotFingerprint: verificationSnapshotFingerprint({ claimDefinitionFingerprint: base.claimDefinitionFingerprint, sourceSnapshotFingerprint: base.sourceSnapshotFingerprint, results: frozenResults }) });
}

export function emptyVerificationSnapshot(plan: ContentOpportunityVerificationPlan, now: ExplicitVerificationClock = () => new Date(0).toISOString()): VerificationSnapshot {
  return createVerificationSnapshot({ plan, assessments: [], now });
}

function freezeAssessments(values: readonly VerificationSourceAssessment[]): readonly VerificationSourceAssessment[] {
  return Object.freeze(values.map((value) => Object.freeze({ ...value, diagnostics: Object.freeze([...value.diagnostics]) })));
}

function normalizeExplicitClaimValue(spec: VerificationClaimSpec, value: string): VerificationSourceAssessment["normalizedValue"] {
  const text = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!text) return undefined;
  if (spec.kind === "general") return { kind: "general", value: { statement: text } };
  if (spec.kind === "money") return normalizeExplicitMoney(text, spec);
  if (spec.kind === "ratio") return normalizeExplicitRatio(text, spec);
  if (spec.kind === "date") return normalizeExplicitDate(text, spec);
  if (spec.kind === "dateRange") return normalizeExplicitDateRange(text);
  if (spec.kind === "duration") return normalizeExplicitDuration(text);
  if (spec.kind === "location") return normalizeExplicitLocation(text);
  if (spec.kind === "eligibility") return normalizeExplicitEligibility(text, spec);
  if (spec.kind === "legal") return normalizeExplicitLegal(text, spec);
  return undefined;
}

type MoneyBasis = "oneTime" | "daily" | "monthly" | "annual" | "total" | "perPerson" | "perHousehold";

function normalizeExplicitMoney(text: string, spec: VerificationClaimSpec): VerificationSourceAssessment["normalizedValue"] {
  const compact = text.replace(/,/gu, "");
  const match = compact.match(/^(?:(최대|최소|이상|이하|미만|초과)\s*)?(?:(월|매월|월간|월별|연|연간|연별|매년|일|일일|매일|하루|1인당|인당|개인당|가구당|세대당|1회|일회|한\s*번)\s+)?(?:(최대|최소|이상|이하|미만|초과)\s*)?(-?\d+(?:\.\d+)?)\s*(억원|만원|천원|원|KRW|달러|USD)(?:\s*(이상|이하|미만|초과))?(?:\s*(?:\/\s*)?(월|매월|월간|월별|연|연간|연별|매년|일|일일|매일|하루|1인당|인당|개인당|가구당|세대당|1회|일회|한\s*번))?$/iu);
  if (!match) return undefined;
  const numeric = Number(match[4]);
  if (!Number.isFinite(numeric)) return undefined;
  const unit = (match[5] ?? "").toLocaleLowerCase("en-US");
  const koreanFactor = unit === "억원" ? 100_000_000 : unit === "만원" ? 10_000 : unit === "천원" ? 1_000 : 1;
  const currency = unit === "달러" || unit === "usd" ? "USD" : "KRW";
  const comparators = [match[1], match[3], match[6]].map(scalarComparator).filter((value): value is NonNullable<ReturnType<typeof scalarComparator>> => Boolean(value));
  if (new Set(comparators).size > 1) return undefined;
  const comparator = comparators[0];
  const prefixBasis = explicitMoneyBasis(match[2]);
  const suffixBasis = explicitMoneyBasis(match[7]);
  if (prefixBasis && suffixBasis && prefixBasis !== suffixBasis) return undefined;
  const basis = prefixBasis ?? suffixBasis ?? moneyBasis(spec);
  return {
    kind: "money",
    value: {
      amount: numeric * koreanFactor,
      currency,
      basis,
      ...(comparator ? { comparator } : {}),
    },
  };
}

function normalizeExplicitRatio(text: string, spec: VerificationClaimSpec): VerificationSourceAssessment["normalizedValue"] {
  const match = text.match(/^(?:(최대|최소|이상|이하|미만|초과)\s*)?(-?\d+(?:\.\d+)?)\s*(%p|%|퍼센트포인트|퍼센트)(?:\s*(이상|이하|미만|초과))?$/iu);
  if (!match) return undefined;
  const numeric = Number(match[2]);
  if (!Number.isFinite(numeric)) return undefined;
  const unit = (match[3] ?? "").toLocaleLowerCase("ko-KR");
  const comparator = scalarComparator(match[1] ?? match[4]);
  return {
    kind: "ratio",
    value: {
      value: numeric,
      representation: unit === "%p" || unit === "퍼센트포인트" ? "percentagePoint" : "percent",
      meaning: ratioMeaning(spec),
      ...(comparator ? { comparator } : {}),
    },
  };
}

function normalizeExplicitDate(text: string, spec: VerificationClaimSpec): VerificationSourceAssessment["normalizedValue"] {
  const tokens = dateTokens(text);
  if (tokens.length !== 1) return undefined;
  const token = tokens[0]!;
  return {
    kind: "date",
    value: {
      value: token.value,
      precision: token.precision,
      role: dateRole(spec, text),
    },
  };
}

function normalizeExplicitDateRange(text: string): VerificationSourceAssessment["normalizedValue"] {
  const tokens = dateTokens(text);
  if (tokens.length !== 2 || tokens[0]!.precision !== tokens[1]!.precision) return undefined;
  const start = tokens[0]!.value;
  const end = tokens[1]!.value;
  if (start > end) return undefined;
  return { kind: "dateRange", value: { start, end, inclusive: true, locale: "ko-KR" } };
}

function normalizeExplicitDuration(text: string): VerificationSourceAssessment["normalizedValue"] {
  const match = text.match(/^(?:(최대|최소|이상|이하|이내)\s*)?(\d+(?:\.\d+)?)\s*(일간?|주간?|개월(?:간)?|달|년간?)(?:\s*(이상|이하|이내))?$/u);
  if (!match) return undefined;
  const value = Number(match[2]);
  if (!Number.isFinite(value) || value < 0) return undefined;
  const rawUnit = match[3] ?? "";
  const unit = rawUnit.startsWith("일") ? "day" as const
    : rawUnit.startsWith("주") ? "week" as const
      : rawUnit.startsWith("년") ? "year" as const
        : "month" as const;
  const comparator = durationComparator(match[1] ?? match[4]);
  return { kind: "duration", value: { value, unit, ...(comparator ? { comparator } : {}) } };
}

function normalizeExplicitLocation(text: string): VerificationSourceAssessment["normalizedValue"] {
  if (text.length > 300) return undefined;
  if (/^(?:전국|대한민국|한국)$/u.test(text)) return { kind: "location", value: { country: text, scope: "national" } };
  if (/(?:특별시|광역시|특별자치시|특별자치도|도)$/u.test(text)) return { kind: "location", value: { region: text, scope: "regional" } };
  if (/(?:시|군|구)$/u.test(text)) return { kind: "location", value: { city: text, scope: "local" } };
  if (/\d|(?:로|길)\s*\d/u.test(text)) return { kind: "location", value: { address: text, scope: "specific" } };
  return { kind: "location", value: { venue: text, scope: "specific" } };
}

function normalizeExplicitEligibility(text: string, spec: VerificationClaimSpec): VerificationSourceAssessment["normalizedValue"] {
  if (text.length > 500) return undefined;
  return {
    kind: "eligibility",
    value: {
      predicate: {
        field: spec.field.trim() || "eligibility",
        operator: "textEquals",
        value: text,
      },
    },
  };
}

function normalizeExplicitLegal(text: string, spec: VerificationClaimSpec): VerificationSourceAssessment["normalizedValue"] {
  const articleMatch = text.match(/제\s*(\d+)\s*조(?:의\s*(\d+))?/u);
  const paragraphMatch = text.match(/제\s*(\d+)\s*항/u);
  const lawName = legalName(text) ?? legalName(spec.statement);
  if (!lawName || !spec.statement.trim()) return undefined;
  const sourceClass = /(?:시행령|시행규칙)/u.test(lawName)
    ? "regulation" as const
    : /(?:고시|지침|가이드|안내)/u.test(`${lawName} ${spec.statement}`)
      ? "officialGuidance" as const
      : /(?:판결|대법원|법원)/u.test(`${lawName} ${spec.statement}`)
        ? "caseLaw" as const
        : /(?:해석|유권해석)/u.test(`${lawName} ${spec.statement}`)
          ? "interpretation" as const
          : "statute" as const;
  return {
    kind: "legal",
    value: {
      lawName,
      ...(articleMatch ? { article: `제${articleMatch[1]}조${articleMatch[2] ? `의${articleMatch[2]}` : ""}` } : {}),
      ...(paragraphMatch ? { paragraph: `제${paragraphMatch[1]}항` } : {}),
      proposition: spec.statement.replace(/\s+/gu, " ").trim(),
      sourceClass,
    },
  };
}

function scalarComparator(value: string | undefined): "lt" | "lte" | "gt" | "gte" | undefined {
  if (value === "미만") return "lt";
  if (value === "이하" || value === "최대") return "lte";
  if (value === "초과") return "gt";
  if (value === "이상" || value === "최소") return "gte";
  return undefined;
}

function durationComparator(value: string | undefined): "upTo" | "atLeast" | undefined {
  if (value === "이하" || value === "이내" || value === "최대") return "upTo";
  if (value === "이상" || value === "최소") return "atLeast";
  return undefined;
}

function explicitMoneyBasis(value: string | undefined): MoneyBasis | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("ko-KR");
  if (["월", "매월", "월간", "월별"].includes(normalized)) return "monthly";
  if (["연", "연간", "연별", "매년"].includes(normalized)) return "annual";
  if (["일", "일일", "매일", "하루"].includes(normalized)) return "daily";
  if (["1인당", "인당", "개인당"].includes(normalized)) return "perPerson";
  if (["가구당", "세대당"].includes(normalized)) return "perHousehold";
  if (["1회", "일회", "한 번"].includes(normalized)) return "oneTime";
  return undefined;
}

function moneyBasis(spec: VerificationClaimSpec): MoneyBasis {
  const context = `${spec.field} ${spec.statement} ${spec.qualifiers.basis ?? ""}`;
  if (/(?:1인당|인당|개인당|per\s*person)/iu.test(context)) return "perPerson";
  if (/(?:가구당|세대당|per\s*household)/iu.test(context)) return "perHousehold";
  if (/(?:매월|월간|월별|(?:^|\s)월(?=\s*[-+]?\d)|monthly)/iu.test(context)) return "monthly";
  if (/(?:연간|연별|매년|(?:^|\s)연(?=\s*[-+]?\d)|annual)/iu.test(context)) return "annual";
  if (/(?:매일|일일|하루|(?:^|\s)일(?=\s*[-+]?\d)|daily)/iu.test(context)) return "daily";
  if (/(?:1회|일회|한\s*번|one[-\s]*time)/iu.test(context)) return "oneTime";
  return "total";
}

function ratioMeaning(spec: VerificationClaimSpec): "rate" | "share" | "change" {
  const context = `${spec.field} ${spec.statement} ${spec.qualifiers.basis ?? ""}`;
  if (/(?:증가|감소|증감|변동|변화|change)/iu.test(context)) return "change";
  if (/(?:비중|점유|구성비|share)/iu.test(context)) return "share";
  return "rate";
}

function dateRole(spec: VerificationClaimSpec, value: string): "announced" | "effective" | "applicationStart" | "applicationEnd" | "reference" {
  const context = `${spec.field} ${spec.statement} ${value}`;
  if (/(?:신청|접수).{0,10}(?:시작|개시|부터)|(?:신청|접수)\s*시작/iu.test(context)) return "applicationStart";
  if (/(?:신청|접수).{0,10}(?:마감|종료|까지)|(?:신청|접수)\s*마감/iu.test(context)) return "applicationEnd";
  if (/(?:시행|적용|효력|발효)/iu.test(context)) return "effective";
  if (/(?:발표|공표|공고)/iu.test(context)) return "announced";
  return "reference";
}

type DateToken = Readonly<{ value: string; precision: "day" | "month" | "year"; start: number; end: number }>;

function dateTokens(value: string): readonly DateToken[] {
  const found: DateToken[] = [];
  const add = (token: DateToken | undefined) => {
    if (!token || found.some((item) => token.start < item.end && token.end > item.start)) return;
    found.push(token);
  };
  for (const match of value.matchAll(/\b(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\b/gu)) add(dayToken(match));
  for (const match of value.matchAll(/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/gu)) add(dayToken(match));
  for (const match of value.matchAll(/\b(20\d{2})[-./](\d{1,2})(?![-./]\d)/gu)) add(monthToken(match));
  for (const match of value.matchAll(/(20\d{2})\s*년\s*(\d{1,2})\s*월(?!\s*\d)/gu)) add(monthToken(match));
  for (const match of value.matchAll(/\b(20\d{2})\b|(?<!\d)(20\d{2})\s*년/gu)) {
    if (typeof match.index !== "number") continue;
    const year = match[1] ?? match[2];
    if (!year) continue;
    add(Object.freeze({ value: year, precision: "year", start: match.index, end: match.index + match[0].length }));
  }
  return Object.freeze(found.sort((left, right) => left.start - right.start));
}

function dayToken(match: RegExpMatchArray): DateToken | undefined {
  if (typeof match.index !== "number") return undefined;
  const value = dateParts(match[1], match[2], match[3]);
  return value ? Object.freeze({ value, precision: "day", start: match.index, end: match.index + match[0].length }) : undefined;
}

function monthToken(match: RegExpMatchArray): DateToken | undefined {
  if (typeof match.index !== "number") return undefined;
  const year = Number(match[1]), month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return undefined;
  return Object.freeze({ value: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`, precision: "month", start: match.index, end: match.index + match[0].length });
}

function dateParts(yearValue: string | undefined, monthValue: string | undefined, dayValue: string | undefined): string | undefined {
  const year = Number(yearValue), month = Number(monthValue), day = Number(dayValue);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function legalName(value: string): string | undefined {
  const match = value.match(/([가-힣A-Za-z0-9·]+(?:법률|법|시행령|시행규칙|고시|지침))/u);
  return match?.[1]?.trim() || undefined;
}

function hasNormalizedConflict(assessments: readonly VerificationSourceAssessment[]): boolean {
  const usable = assessments.filter((assessment) => assessment.supports && assessment.fresh && assessment.normalizedValue);
  if (usable.length < 2) return false;
  const primary = usable.find((assessment) => assessment.role === "primaryOfficial");
  if (primary) return usable.some((assessment) => assessment !== primary && canonicalValue(assessment.normalizedValue) !== canonicalValue(primary.normalizedValue));
  const values = new Set(usable.map((assessment) => canonicalValue(assessment.normalizedValue)));
  return values.size > 1;
}

function canonicalValue(value: VerificationSourceAssessment["normalizedValue"]): string { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(JSON.stringify(b)) ? 1 : a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)])); return value; }
