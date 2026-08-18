import type { ContentDocument } from "../content/ContentDocument";
import { serializeStructuredList, serializeStructuredTable } from "../content/StructuredText";
import type { GeneratedFactualClaim } from "./GeneratedFactualClaim";
import type {
  GeneratedClaimReference,
  VerificationClaimSpec,
  VerificationSnapshot,
  VerificationSourceAssessment,
} from "./VerificationClaim";
import {
  evaluateVerificationGenerationGate,
  type VerificationGenerationGateResult,
  type VerificationGenerationPlan,
} from "./VerificationGenerationGate";
import { isCriticalVerificationClaim } from "./VerificationClaim";

export type GeneratedClaimLocation =
  | Readonly<{ kind: "title" }>
  | Readonly<{ kind: "block"; blockId: string }>
  | Readonly<{ kind: "metadata"; field: "seoTitle" | "metaDescription" }>;

export type GeneratedClaimBinding = Readonly<{
  location: GeneratedClaimLocation;
  matchedText: string;
  reference: GeneratedClaimReference;
}>;

export type GeneratedClaimBindingResult = Readonly<{
  bindings: readonly GeneratedClaimBinding[];
  verifiedClaimIds: readonly string[];
  unverifiedDetectedCount: number;
}>;

export type GeneratedClaimVerificationRecord = Readonly<{
  schemaVersion: 1;
  verificationSnapshot: VerificationSnapshot;
  boundEditorialRevisionId: string;
  bindings: readonly GeneratedClaimBinding[];
  verifiedClaimIds: readonly string[];
  unverifiedDetectedCount: number;
  semanticContractVersion?: 1;
  semanticClaims?: readonly GeneratedFactualClaim[];
}>;

/**
 * Phase 5B server-owned binding between generated manuscript facts and the
 * explicit VerificationSnapshot that passed the Generation Gate.
 *
 * AI output never self-asserts verification. We only bind deterministic text
 * representations that the server can map back to a verified Claim. Scalar
 * high-risk values that look factual but cannot be mapped are surfaced as
 * unverifiedDetected diagnostics for the later Quality/Persistence phase.
 */
export function bindGeneratedClaims(input: Readonly<{
  document: ContentDocument;
  plan: VerificationGenerationPlan;
  snapshot: VerificationSnapshot;
  gate: VerificationGenerationGateResult;
}>): GeneratedClaimBindingResult {
  if (!input.gate.ready) {
    throw new Error("Generated Claim binding requires a ready Verification Generation Gate.");
  }

  const verifiedClaimIds = new Set(input.gate.verifiedClaimIds);
  const verifiedSourceIds = new Set(input.gate.verifiedSourceIds);
  const resultByClaimId = new Map(input.snapshot.results.map((result) => [result.claimId, result]));
  const claimMatchers = input.plan.claims.flatMap((claim) => {
    if (!isCriticalVerificationClaim(claim)) return [];
    if (!verifiedClaimIds.has(claim.claimId)) return [];
    const result = resultByClaimId.get(claim.claimId);
    if (!result || result.status !== "verified") return [];
    const sourceIds = trustedClaimSourceIds(result.sourceAssessments, verifiedSourceIds);
    if (!sourceIds.length) return [];
    const tokens = claimTextTokens(claim, result.normalizedValue);
    if (!tokens.length) return [];
    return [{ claim, sourceIds, tokens }];
  }).sort((a, b) => a.claim.claimId.localeCompare(b.claim.claimId));

  const allowedScalarTokens = new Set(
    claimMatchers.flatMap((matcher) => matcher.tokens.map(normalizeComparableText)),
  );
  const bindings: GeneratedClaimBinding[] = [];
  for (const segment of generatedTextSegments(input.document)) {
    const normalizedSegment = normalizeComparableText(segment.text);
    const matchedTokenKeys = new Set<string>();

    for (const matcher of claimMatchers) {
      for (const token of matcher.tokens) {
        const normalizedToken = normalizeComparableText(token);
        if (!normalizedToken || !normalizedSegment.includes(normalizedToken)) continue;
        const key = `${matcher.claim.claimId}\u0000${normalizedToken}`;
        if (matchedTokenKeys.has(key)) continue;
        matchedTokenKeys.add(key);
        bindings.push(Object.freeze({
          location: segment.location,
          matchedText: token,
          reference: Object.freeze({
            referenceType: "verified" as const,
            verificationClaimId: matcher.claim.claimId,
            sourceIds: Object.freeze([...matcher.sourceIds]),
          }),
        }));
      }
    }

    for (const detected of detectHighRiskScalarTokens(segment.text)) {
      const normalized = normalizeComparableText(detected.text);
      if (!normalized || allowedScalarTokens.has(normalized)) continue;
      bindings.push(Object.freeze({
        location: segment.location,
        matchedText: detected.text,
        reference: Object.freeze({
          referenceType: "unverifiedDetected" as const,
          diagnosticCode: `unverified_generated_${detected.kind}`,
        }),
      }));
    }
  }

  const deduplicated = deduplicateBindings(bindings);
  return Object.freeze({
    bindings: Object.freeze(deduplicated),
    verifiedClaimIds: Object.freeze([
      ...new Set(deduplicated.flatMap((binding) =>
        binding.reference.referenceType === "verified"
          ? [binding.reference.verificationClaimId]
          : [])),
    ]),
    unverifiedDetectedCount: deduplicated.filter((binding) =>
      binding.reference.referenceType === "unverifiedDetected").length,
  });
}

/**
 * Phase 5C canonical persistence record.
 *
 * The caller supplies the editorial revision identifier because approval Core
 * does not depend on Quality Core. The record is created only after the server
 * re-evaluates the Generation Gate and rebinds the current document.
 */
export function createGeneratedClaimVerificationRecord(input: Readonly<{
  document: ContentDocument;
  plan: VerificationGenerationPlan;
  snapshot: VerificationSnapshot;
  boundEditorialRevisionId: string;
  semanticClaims?: readonly GeneratedFactualClaim[];
}>): GeneratedClaimVerificationRecord {
  const gate = evaluateVerificationGenerationGate({
    plan: input.plan,
    snapshot: input.snapshot,
  });
  if (!gate.ready) {
    throw new Error(`Generated Claim verification record requires a ready Generation Gate: ${gate.diagnostics.join(",") || gate.blockingClaimIds.join(",")}`);
  }
  const result = bindGeneratedClaims({
    document: input.document,
    plan: input.plan,
    snapshot: input.snapshot,
    gate,
  });
  return Object.freeze({
    schemaVersion: 1 as const,
    verificationSnapshot: input.snapshot,
    boundEditorialRevisionId: input.boundEditorialRevisionId,
    bindings: result.bindings,
    verifiedClaimIds: result.verifiedClaimIds,
    unverifiedDetectedCount: result.unverifiedDetectedCount,
    ...(input.semanticClaims
      ? {
          semanticContractVersion: 1 as const,
          semanticClaims: Object.freeze([...input.semanticClaims]),
        }
      : {}),
  });
}

function trustedClaimSourceIds(
  assessments: readonly VerificationSourceAssessment[],
  gateSourceIds: ReadonlySet<string>,
): readonly string[] {
  const roleRank: Readonly<Record<VerificationSourceAssessment["role"], number>> = {
    primaryOfficial: 0,
    officialCorroborating: 1,
    independentCorroborating: 2,
  };
  const trusted = assessments.filter((assessment) =>
    gateSourceIds.has(assessment.sourceId)
    && assessment.supports === true
    && Boolean(assessment.normalizedValue)
    && assessment.fresh === true
    && assessment.freshnessStatus !== "stale"
    && assessment.freshnessStatus !== "unknown")
    .sort((a, b) => roleRank[a.role] - roleRank[b.role]
      || a.sourceId.localeCompare(b.sourceId));
  return Object.freeze([...new Set(trusted.map((assessment) => assessment.sourceId))]);
}

function claimTextTokens(
  claim: VerificationClaimSpec,
  normalizedValue: VerificationSnapshot["results"][number]["normalizedValue"],
): readonly string[] {
  const values = new Set<string>();
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed) values.add(trimmed);
  };
  add(claim.rawValue);

  if (normalizedValue?.kind === "money" && "amount" in normalizedValue.value) {
    const { amount, currency } = normalizedValue.value;
    const suffix = currency.toUpperCase() === "KRW" ? "원" : ` ${currency.toUpperCase()}`;
    add(`${amount}${suffix}`);
    add(`${amount.toLocaleString("en-US")}${suffix}`);
    if (currency.toUpperCase() === "KRW" && Number.isInteger(amount / 10_000)) add(`${amount / 10_000}만원`);
    if (currency.toUpperCase() === "KRW" && Number.isInteger(amount / 100_000_000)) add(`${amount / 100_000_000}억원`);
  } else if (normalizedValue?.kind === "ratio") {
    if (normalizedValue.value.representation === "percent") {
      add(`${normalizedValue.value.value}%`);
      add(`${normalizedValue.value.value}퍼센트`);
    }
  } else if (normalizedValue?.kind === "date") {
    add(normalizedValue.value.value);
    add(koreanDate(normalizedValue.value.value));
  } else if (normalizedValue?.kind === "dateRange") {
    const start = normalizedValue.value.start;
    const end = normalizedValue.value.end;
    add(start);
    add(end);
    add(koreanDate(start));
    add(koreanDate(end));
    add(`${start}~${end}`);
    add(`${start} - ${end}`);
    add(`${koreanDate(start)}~${koreanDate(end)}`);
  } else if (normalizedValue?.kind === "duration") {
    const unit = ({ day: "일", week: "주", month: "개월", year: "년" } as const)[normalizedValue.value.unit];
    add(`${normalizedValue.value.value}${unit}`);
  } else if (normalizedValue?.kind === "location") {
    add(normalizedValue.value.address);
    add(normalizedValue.value.venue);
    add(normalizedValue.value.city);
  } else if (normalizedValue?.kind === "legal") {
    add(normalizedValue.value.article);
    add(normalizedValue.value.proposition);
  } else if (normalizedValue?.kind === "general") {
    add(normalizedValue.value.statement);
  }

  if (!values.size) add(claim.statement);
  return Object.freeze([...values]);
}

function generatedTextSegments(document: ContentDocument): readonly Readonly<{
  location: GeneratedClaimLocation;
  text: string;
}>[] {
  const segments: Array<Readonly<{ location: GeneratedClaimLocation; text: string }>> = [
    Object.freeze({ location: Object.freeze({ kind: "title" as const }), text: document.title }),
  ];
  for (const block of document.blocks) {
    const text = block.type === "heading" || block.type === "paragraph"
      ? block.text
      : block.type === "list"
        ? serializeStructuredList(block)
        : block.type === "table"
          ? serializeStructuredTable(block)
          : block.type === "button"
            ? block.label
            : block.type === "image"
              ? `${block.alt} ${block.caption ?? ""}`
              : "";
    if (text.trim()) {
      segments.push(Object.freeze({
        location: Object.freeze({ kind: "block" as const, blockId: block.id }),
        text,
      }));
    }
  }
  if (document.metadata?.seoTitle?.trim()) {
    segments.push(Object.freeze({
      location: Object.freeze({ kind: "metadata" as const, field: "seoTitle" as const }),
      text: document.metadata.seoTitle,
    }));
  }
  if (document.metadata?.metaDescription?.trim()) {
    segments.push(Object.freeze({
      location: Object.freeze({ kind: "metadata" as const, field: "metaDescription" as const }),
      text: document.metadata.metaDescription,
    }));
  }
  return Object.freeze(segments);
}

type DetectedScalar = Readonly<{
  kind: "money" | "ratio" | "date" | "duration" | "legal";
  text: string;
  start: number;
  end: number;
}>;

/**
 * A quoted phrase that the same sentence goes on to reject is an example of
 * wording the reader should avoid, not a fact the article asserts. An article
 * was blocked for `'2년 근무'라고 한 줄로 적는 대신 …`, where 2년 is the reader's
 * hypothetical note rather than any claim about the programme.
 *
 * Both signals are required: the quote must be grammatically *mentioned*
 * (라고·라는·처럼) and the sentence must then reject it (대신·말고·아니라). A figure
 * the article actually states, including one quoted from a source and asserted,
 * matches neither and is still detected.
 *
 * Two further limits were added after measuring what this exemption actually
 * let through. It is the only exemption in this detector, and every attempt to
 * widen it to unquoted illustrations leaked statutory periods, so it is held as
 * narrow as the one case it was written for:
 *
 * 1. Only `duration` is exempt. `‘50만원 지급’이라고 적는 대신 …`,
 *    `‘연 3.5%’라고 … 대신 …` and a quoted 제N조 or review date were all being
 *    exempted, which is precisely the unsupported-figure class the approval
 *    policy never relaxes. Amounts, ratios, dates and statute articles are now
 *    detected inside a rejected quote too.
 * 2. A period carrying a threshold or span quantifier is a rule, not a note.
 *    `‘14일 이내 신고’라고만 적는 대신 …` was exempted even though 14일 이내 is the
 *    주민등록법 deadline. The quantifier check only ever cancels an exemption, so
 *    a missing token leaves the strict result rather than opening a hole.
 */
const mentionedQuotePattern =
  /[‘“'"「『]([^’”'"」』]{1,40})[’”'"」』]\s*(?:이?라고|이?라는|처럼|식으로)/gu;
const rejectedExampleTail = /(?:대신|말고|아니라|보다는)/u;
const rejectedExampleTailWindow = 60;
const periodRuleQuantifier =
  /\d+(?:\.\d+)?\s*(?:개월|일|주|년)\s*(?:이내|이상|이하|미만|초과|안에|내에|까지|동안|만에|마다|주기|이후|이전|간)|(?:최대|최소|최장|최단|최고|최저|평균|매월|매년|매주|매일)\s*\d+(?:\.\d+)?\s*(?:개월|일|주|년)/u;

function rejectedExampleSpans(
  value: string,
): readonly Readonly<{ start: number; end: number }>[] {
  const spans: Array<Readonly<{ start: number; end: number }>> = [];
  for (const match of value.matchAll(mentionedQuotePattern)) {
    if (typeof match.index !== "number") continue;
    const end = match.index + match[0].length;
    if (!rejectedExampleTail.test(value.slice(end, end + rejectedExampleTailWindow))) continue;
    if (periodRuleQuantifier.test(match[1] ?? "")) continue;
    spans.push(Object.freeze({ start: match.index, end }));
  }
  return Object.freeze(spans);
}

/**
 * A recency window the article asks the reader to look back over.
 *
 * `최근 1년 동안 발생한 소득을 유형별로 적습니다` is an instruction about the
 * reader's own records. No institution publishes "최근 1년", so no source can
 * ever satisfy it, and demanding one produced a block with no way out: the
 * withdrawal sweep does not match a bare period, so nothing in the pipeline
 * could remove what this gate required, and regenerating reproduced the same
 * block in the same place. Two finished articles scoring 100 sat blocked on
 * `1년` and `2년` for that reason.
 *
 * The exemption is deliberately narrow. It needs the explicit `최근`/`지난`
 * lead-in, so a period predicated of something — `계약 기간은 24개월`,
 * `주거 지원 기간은 24개월` — is untouched. And a threshold cancels it, because
 * `최근 6개월 이내에 폐업한 사업자` is an eligibility rule that an institution
 * does publish, not a window the reader chooses.
 *
 * D-039 Phase 1 replaces this with the shared `FactualSurfaceTaxonomy`, which
 * decides the same question by asking whether the period has an attributed
 * subject instead of matching a lead-in word.
 */
const recencyWindowPattern = /(?:최근|지난)\s*\d+(?:\.\d+)?\s*(?:개월|일|주|년)/gu;
const thresholdQuantifier = /^\s*(?:이내|이상|이하|미만|초과|안에|내에|까지)/u;
const thresholdLookaheadWindow = 8;

function recencyWindowSpans(
  value: string,
): readonly Readonly<{ start: number; end: number }>[] {
  const spans: Array<Readonly<{ start: number; end: number }>> = [];
  for (const match of value.matchAll(recencyWindowPattern)) {
    if (typeof match.index !== "number") continue;
    const end = match.index + match[0].length;
    if (thresholdQuantifier.test(value.slice(end, end + thresholdLookaheadWindow))) continue;
    spans.push(Object.freeze({ start: match.index, end }));
  }
  return Object.freeze(spans);
}

function detectHighRiskScalarTokens(value: string): readonly DetectedScalar[] {
  const detected: DetectedScalar[] = [];
  collectMatches(detected, value, /\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:조원|억원|만원|원)/gu, "money");
  collectMatches(detected, value, /\d+(?:\.\d+)?\s*(?:%|퍼센트)/gu, "ratio");
  collectMatches(detected, value, /\d{4}[.-]\d{1,2}(?:[.-]\d{1,2})?|\d{4}년(?:\s*\d{1,2}월(?:\s*\d{1,2}일)?)?/gu, "date");
  collectMatches(detected, value, /제\s*\d+\s*조(?:의\s*\d+)?/gu, "legal");
  const occupiedByDate = detected.filter((item) => item.kind === "date");
  for (const item of regexMatches(value, /\d+(?:\.\d+)?\s*(?:개월|일|주|년)/gu)) {
    if (occupiedByDate.some((date) => item.start >= date.start && item.end <= date.end)) continue;
    detected.push(Object.freeze({ ...item, kind: "duration" as const }));
  }
  const exemptSpans = [...rejectedExampleSpans(value), ...recencyWindowSpans(value)];
  return Object.freeze(detected
    .filter((item) => item.kind !== "duration"
      || !exemptSpans.some((span) =>
        item.start >= span.start && item.end <= span.end))
    .sort((a, b) => a.start - b.start || a.end - b.end));
}

function collectMatches(
  target: DetectedScalar[],
  value: string,
  pattern: RegExp,
  kind: DetectedScalar["kind"],
): void {
  for (const item of regexMatches(value, pattern)) {
    target.push(Object.freeze({ ...item, kind }));
  }
}

function regexMatches(value: string, pattern: RegExp): readonly Readonly<{
  text: string;
  start: number;
  end: number;
}>[] {
  const matches: Array<Readonly<{ text: string; start: number; end: number }>> = [];
  for (const match of value.matchAll(pattern)) {
    if (typeof match.index !== "number" || !match[0]) continue;
    matches.push(Object.freeze({
      text: match[0].trim(),
      start: match.index,
      end: match.index + match[0].length,
    }));
  }
  return Object.freeze(matches);
}

function koreanDate(value: string): string | undefined {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (day) return `${Number(day[1])}년 ${Number(day[2])}월 ${Number(day[3])}일`;
  const month = /^(\d{4})-(\d{2})$/u.exec(value.trim());
  if (month) return `${Number(month[1])}년 ${Number(month[2])}월`;
  const year = /^(\d{4})$/u.exec(value.trim());
  return year ? `${Number(year[1])}년` : undefined;
}

function normalizeComparableText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s,]+/gu, "");
}

function deduplicateBindings(bindings: readonly GeneratedClaimBinding[]): GeneratedClaimBinding[] {
  const seen = new Set<string>();
  return bindings.filter((binding) => {
    const location = binding.location.kind === "block"
      ? `block:${binding.location.blockId}`
      : binding.location.kind === "metadata"
        ? `metadata:${binding.location.field}`
        : "title";
    const reference = binding.reference.referenceType === "verified"
      ? `verified:${binding.reference.verificationClaimId}:${binding.reference.sourceIds.join(",")}`
      : `unverified:${binding.reference.diagnosticCode}`;
    const key = `${location}\u0000${normalizeComparableText(binding.matchedText)}\u0000${reference}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
