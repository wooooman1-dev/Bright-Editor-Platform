import type { ContentDocument } from "../content/ContentDocument";
import { serializeStructuredList, serializeStructuredTable } from "../content/StructuredText";
import {
  bindGeneratedClaims,
  type GeneratedClaimLocation,
} from "./GeneratedClaimBinding";
import { deliberatelyRemovedGeneratedFactualClaimIds } from "./GeneratedFactualClaimInventory";
import { normalizeVerificationValue } from "./VerificationClaimNormalizer";
import type {
  VerificationClaimKind,
  VerificationClaimQualifiers,
  VerificationClaimSpec,
  VerificationNormalizedValue,
  VerificationSnapshot,
  VerificationTemporalRequirement,
} from "./VerificationClaim";
import { isCriticalVerificationClaim } from "./VerificationClaim";
import type {
  VerificationGenerationGateResult,
  VerificationGenerationPlan,
} from "./VerificationGenerationGate";

export type GeneratedFactualClaimDraft = Readonly<{
  claimId: string;
  surfaceText: string;
  kind: VerificationClaimKind;
  normalizedValueJson: string;
  qualifiers: Readonly<{
    subject: string;
    scope: string;
    basis: string;
    note: string;
  }>;
  temporalRequirementJson: string;
}>;

export type GeneratedFactualClaim = Readonly<{
  claimId: string;
  surfaceText: string;
  kind: VerificationClaimKind;
  normalizedValue: VerificationNormalizedValue;
  qualifiers: VerificationClaimQualifiers;
  temporalRequirement?: VerificationTemporalRequirement;
  locations: readonly GeneratedClaimLocation[];
}>;

export type GeneratedFactualClaimValidationResult = Readonly<{
  passed: boolean;
  reasons: readonly string[];
  claims: readonly GeneratedFactualClaim[];
}>;

/**
 * Validates the semantic Claim projection returned inside the existing
 * Generation response. The AI does not grant verification: every semantic
 * field is compared back to the server-owned Plan/Snapshot and every surface
 * anchor must exist in the generated canonical manuscript.
 */
export function validateGeneratedFactualClaimDrafts(input: Readonly<{
  document: ContentDocument;
  plan: VerificationGenerationPlan;
  snapshot: VerificationSnapshot;
  gate: VerificationGenerationGateResult;
  drafts: readonly GeneratedFactualClaimDraft[];
}>): GeneratedFactualClaimValidationResult {
  if (!input.gate.ready) {
    return failed(["Structured Generated Claim validation requires a ready Verification Generation Gate."]);
  }

  const specs = new Map(input.plan.claims.map((claim) => [claim.claimId, claim]));
  const results = new Map(input.snapshot.results.map((result) => [result.claimId, result]));
  const verifiedClaimIds = new Set(input.gate.verifiedClaimIds);
  const segments = generatedClaimTextSegments(input.document);
  /**
   * A Claim the factual inventory withdrew from the manuscript is not a lost
   * anchor. The inventory runs after this projection is first computed and is
   * the last stage that edits the canonical document, so its `removed`
   * disposition is the final word on whether the sentence is still published.
   * Requiring a verbatim anchor for a sentence the pipeline itself deleted made
   * the two Claim structures contradict each other inside one revision.
   */
  const withdrawnByInventory = deliberatelyRemovedGeneratedFactualClaimIds(input.document);
  const claims: GeneratedFactualClaim[] = [];
  const reasons: string[] = [];
  const seen = new Set<string>();
  const withdrawn = new Set<string>();

  for (const draft of input.drafts) {
    const claimId = draft.claimId.trim();
    const surfaceText = draft.surfaceText.trim();
    const spec = specs.get(claimId);
    const result = results.get(claimId);
    if (!claimId || !spec || !isCriticalVerificationClaim(spec) || !verifiedClaimIds.has(claimId)) {
      reasons.push(`Generation이 검증되지 않은 Claim ID를 구조화 사실로 반환했습니다: ${claimId || "(empty)"}.`);
      continue;
    }
    if (!result || result.status !== "verified" || !result.normalizedValue) {
      reasons.push(`Generation 구조화 Claim이 verified Snapshot 결과와 연결되지 않습니다: ${claimId}.`);
      continue;
    }
    if (draft.kind !== spec.kind || result.normalizedValue.kind !== spec.kind) {
      reasons.push(`Generation 구조화 Claim kind가 canonical Claim과 일치하지 않습니다: ${claimId}.`);
      continue;
    }
    if (!surfaceText) {
      reasons.push(`Generation 구조화 Claim의 원고 anchor가 비어 있습니다: ${claimId}.`);
      continue;
    }

    const normalizedValue = parseNormalizedValue(draft.normalizedValueJson, spec.kind);
    if (!normalizedValue || canonicalJson(normalizedValue) !== canonicalJson(result.normalizedValue)) {
      reasons.push(`Generation 구조화 Claim의 normalized value가 verified Snapshot과 일치하지 않습니다: ${claimId}.`);
      continue;
    }

    const qualifiers = compactQualifiers(draft.qualifiers);
    if (canonicalJson(qualifiers) !== canonicalJson(compactQualifiers(spec.qualifiers))) {
      reasons.push(`Generation 구조화 Claim의 qualifiers가 canonical Claim과 일치하지 않습니다: ${claimId}.`);
      continue;
    }

    const temporalRequirement = parseJson(draft.temporalRequirementJson);
    if (canonicalJson(temporalRequirement) !== canonicalJson(spec.temporalRequirement ?? null)) {
      reasons.push(`Generation 구조화 Claim의 temporal requirement가 canonical Claim과 일치하지 않습니다: ${claimId}.`);
      continue;
    }

    if (!semanticAnchorOwnsClaimContext(surfaceText, spec)) {
      reasons.push(`Generation 구조화 Claim의 원고 anchor가 canonical Claim의 subject/scope 문맥을 소유하지 않습니다: ${claimId}.`);
      continue;
    }

    const locations = segments
      .filter((segment) => normalizeComparableText(segment.text).includes(normalizeComparableText(surfaceText)))
      .map((segment) => segment.location);
    if (!locations.length) {
      if (withdrawnByInventory.has(claimId)) {
        withdrawn.add(claimId);
        continue;
      }
      reasons.push(`Generation 구조화 Claim의 verbatim anchor를 현재 원고에서 찾지 못했습니다: ${claimId}.`);
      continue;
    }

    const key = `${claimId}\u0000${normalizeComparableText(surfaceText)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push(Object.freeze({
      claimId,
      surfaceText,
      kind: spec.kind,
      normalizedValue: result.normalizedValue,
      qualifiers: Object.freeze({ ...spec.qualifiers }),
      ...(spec.temporalRequirement ? { temporalRequirement: spec.temporalRequirement } : {}),
      locations: Object.freeze(deduplicateLocations(locations)),
    }));
  }

  for (const claimId of verifiedClaimIds) {
    if (claims.some((claim) => claim.claimId === claimId)) continue;
    if (withdrawn.has(claimId) || withdrawnByInventory.has(claimId)) continue;
    reasons.push(`검증된 Claim이 Generation 구조화 사실 목록에 연결되지 않았습니다: ${claimId}.`);
  }

  const rebound = bindGeneratedClaims({
    document: input.document,
    plan: input.plan,
    snapshot: input.snapshot,
    gate: input.gate,
  });
  for (const binding of rebound.bindings) {
    const reference = binding.reference;
    if (reference.referenceType !== "verified") continue;
    const covered = claims.some((claim) =>
      claim.claimId === reference.verificationClaimId
      && claim.locations.some((location) => sameLocation(location, binding.location))
      && normalizeComparableText(claim.surfaceText).includes(normalizeComparableText(binding.matchedText)));
    if (!covered) {
      reasons.push(`검증 factual token이 같은 Claim의 구조화 semantic anchor에 포함되지 않았습니다: ${reference.verificationClaimId} / ${binding.matchedText}.`);
    }
  }

  return Object.freeze({
    passed: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)]),
    claims: Object.freeze(claims),
  });
}

/** Revalidates persisted server-approved semantic Claims against a later manuscript revision. */
export function evaluateStoredGeneratedFactualClaims(input: Readonly<{
  document: ContentDocument;
  plan: VerificationGenerationPlan;
  snapshot: VerificationSnapshot;
  gate: VerificationGenerationGateResult;
  claims: readonly GeneratedFactualClaim[];
}>): GeneratedFactualClaimValidationResult {
  return validateGeneratedFactualClaimDrafts({
    document: input.document,
    plan: input.plan,
    snapshot: input.snapshot,
    gate: input.gate,
    drafts: input.claims.map((claim) => Object.freeze({
      claimId: claim.claimId,
      surfaceText: claim.surfaceText,
      kind: claim.kind,
      normalizedValueJson: JSON.stringify(claim.normalizedValue),
      qualifiers: Object.freeze({
        subject: claim.qualifiers.subject ?? "",
        scope: claim.qualifiers.scope ?? "",
        basis: claim.qualifiers.basis ?? "",
        note: claim.qualifiers.note ?? "",
      }),
      temporalRequirementJson: JSON.stringify(claim.temporalRequirement ?? null),
    })),
  });
}

function generatedClaimTextSegments(document: ContentDocument): readonly Readonly<{
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

function parseNormalizedValue(value: string, kind: VerificationClaimKind): VerificationNormalizedValue | undefined {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  try {
    return normalizeVerificationValue(kind, parsed as VerificationNormalizedValue);
  } catch {
    return undefined;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value.trim());
  } catch {
    return undefined;
  }
}

function compactQualifiers(value: VerificationClaimQualifiers | GeneratedFactualClaimDraft["qualifiers"]): VerificationClaimQualifiers {
  const output: Record<string, string> = {};
  for (const key of ["subject", "scope", "basis", "note"] as const) {
    const item = value[key]?.trim();
    if (item) output[key] = item;
  }
  return Object.freeze(output);
}

function semanticAnchorOwnsClaimContext(
  surfaceText: string,
  spec: VerificationClaimSpec,
): boolean {
  const rawTokens = new Set(lexicalTokens(spec.rawValue ?? ""));
  const contextTokens = lexicalTokens([
    spec.statement,
    spec.qualifiers.subject ?? "",
    spec.qualifiers.scope ?? "",
    spec.qualifiers.note ?? "",
  ].join(" ")).filter((token) =>
    !rawTokens.has(token)
    && !genericContextTokens.has(token));
  if (!contextTokens.length) return true;
  const surfaceTokens = new Set(lexicalTokens(surfaceText));
  return contextTokens.some((token) => surfaceTokens.has(token));
}

const genericContextTokens = new Set([
  "현재",
  "관련",
  "해당",
  "기준",
  "정보",
  "내용",
  "사항",
  "경우",
  "대한",
]);

function lexicalTokens(value: string): string[] {
  return (value.normalize("NFKC").toLocaleLowerCase("ko-KR").match(/[가-힣a-z]{2,}/gu) ?? []);
}

function sameLocation(left: GeneratedClaimLocation, right: GeneratedClaimLocation): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "title" && right.kind === "title") return true;
  if (left.kind === "metadata" && right.kind === "metadata") return left.field === right.field;
  return left.kind === "block" && right.kind === "block" && left.blockId === right.blockId;
}

function deduplicateLocations(values: readonly GeneratedClaimLocation[]): GeneratedClaimLocation[] {
  const seen = new Set<string>();
  return values.filter((location) => {
    const key = location.kind === "title"
      ? "title"
      : location.kind === "metadata"
        ? `metadata:${location.field}`
        : `block:${location.blockId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeComparableText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ").trim();
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

function failed(reasons: readonly string[]): GeneratedFactualClaimValidationResult {
  return Object.freeze({
    passed: false,
    reasons: Object.freeze([...new Set(reasons)]),
    claims: Object.freeze([]),
  });
}
