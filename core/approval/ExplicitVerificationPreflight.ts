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
      const normalized = normalizeExplicitScalar(spec.kind, claim.value);
      const page = (source.pageText ?? "").replace(/\s+/gu, " ").normalize("NFKC");
      const excerptFound = page.includes(claim.evidenceExcerpt.replace(/\s+/gu, " ").normalize("NFKC"));
      const valueFound = page.includes(claim.value.replace(/\s+/gu, " ").normalize("NFKC"));
      const rawMatches = !spec.rawValue || normalizeScalarText(spec.rawValue) === normalizeScalarText(claim.value);
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
function normalizeScalarText(value: string): string { return value.replace(/,/gu, "").replace(/\s+/gu, "").normalize("NFKC").toLocaleLowerCase("en-US"); }

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

function normalizeExplicitScalar(kind: VerificationClaimSpec["kind"], value: string): VerificationSourceAssessment["normalizedValue"] {
  const text = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if (!text) return undefined;
  if (kind === "general") return { kind, value: { statement: text } };
  if (kind === "money") return normalizeExplicitMoney(text);
  if (kind === "ratio") {
    const match = text.match(/^(-?\d+(?:\.\d+)?)\s*%$/u);
    return match ? { kind, value: { value: Number(match[1]), representation: "percent", meaning: "rate" } } : undefined;
  }
  return undefined;
}

function normalizeExplicitMoney(text: string): VerificationSourceAssessment["normalizedValue"] {
  const match = text.replace(/,/gu, "").match(/^(-?\d+(?:\.\d+)?)\s*(억원|만원|천원|원|KRW|달러|USD)$/iu);
  if (!match) return undefined;
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return undefined;
  const unit = (match[2] ?? "").toLocaleLowerCase("en-US");
  const koreanFactor = unit === "억원" ? 100_000_000 : unit === "만원" ? 10_000 : unit === "천원" ? 1_000 : 1;
  const currency = unit === "달러" || unit === "usd" ? "USD" : "KRW";
  return { kind: "money", value: { amount: numeric * koreanFactor, currency, basis: "total" } };
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
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(sortValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)])); return value; }
