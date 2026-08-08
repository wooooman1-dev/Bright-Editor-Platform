import type {
  GeneratedFactualClaimDraft,
  VerificationClaimKind,
} from "../approval";

const verificationClaimKinds = new Set<VerificationClaimKind>([
  "money",
  "ratio",
  "date",
  "dateRange",
  "duration",
  "location",
  "eligibility",
  "legal",
  "general",
]);

/**
 * Adds the structured semantic-Claim response contract to the existing
 * Generation call. Canonical factual authority is still the server-owned
 * Claim-ID evidence bundle already attached to the instruction.
 */
export function withGeneratedFactualClaimResponseInstruction(
  instruction: string,
): string {
  return `${instruction}\n\nStructured generated factual-Claim contract (mandatory for this verified Generation response):
- Return a top-level verificationClaimsUsed array in the same JSON response. This is metadata for deterministic server verification, not reader-visible prose.
- Include every verified claimId from the Explicit verification Generation bundle at least once when that Claim appears in reader-visible title, SEO title, meta description, heading, paragraph, list, table, image ALT/caption, or CTA label.
- surfaceText must be one exact verbatim complete reader-visible sentence, heading, metadata phrase, list/table cell text, or other contiguous phrase from the returned manuscript that expresses that Claim. Do not return only a bare scalar such as “50만원” when the surrounding subject, basis, comparator, scope, eligibility condition, location, or legal proposition changes its meaning.
- Copy claimId and kind from the same canonical Claim. Never invent or substitute another claimId.
- normalizedValueJson must be JSON.stringify of that Claim's exact canonical normalizedValue object from the server bundle, including basis, comparator, meaning, scope, predicate, law proposition, dates, and other represented semantics. Do not paraphrase or simplify it.
- qualifiers must contain subject, scope, basis, note as strings. Copy the canonical qualifier value; use an empty string only when that qualifier is absent.
- temporalRequirementJson must be the exact JSON serialization of the canonical temporalRequirement, or the string "null" when absent.
- If the same Claim appears in materially different reader-visible sentences, include each occurrence separately. Do not attach one Claim's semantic metadata to another Claim's sentence.
- The server will reject the whole Generation result if a verified Claim is missing, the semantic JSON differs from the VerificationSnapshot, or surfaceText does not actually occur in the returned manuscript.`;
}

export function parseGeneratedFactualClaimDrafts(
  response: string,
): readonly GeneratedFactualClaimDraft[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(response));
  } catch {
    return Object.freeze([]);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return Object.freeze([]);
  }
  const values = (parsed as Record<string, unknown>).verificationClaimsUsed;
  if (!Array.isArray(values)) return Object.freeze([]);

  return Object.freeze(values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const qualifiers = record.qualifiers;
    if (!qualifiers || typeof qualifiers !== "object" || Array.isArray(qualifiers)) return [];
    const qualifierRecord = qualifiers as Record<string, unknown>;
    const kind = record.kind;
    if (!isVerificationClaimKind(kind)) return [];
    if (
      typeof record.claimId !== "string"
      || typeof record.surfaceText !== "string"
      || typeof record.normalizedValueJson !== "string"
      || typeof record.temporalRequirementJson !== "string"
      || typeof qualifierRecord.subject !== "string"
      || typeof qualifierRecord.scope !== "string"
      || typeof qualifierRecord.basis !== "string"
      || typeof qualifierRecord.note !== "string"
    ) {
      return [];
    }
    return [Object.freeze({
      claimId: record.claimId.trim(),
      surfaceText: record.surfaceText.trim(),
      kind,
      normalizedValueJson: record.normalizedValueJson.trim(),
      qualifiers: Object.freeze({
        subject: qualifierRecord.subject.trim(),
        scope: qualifierRecord.scope.trim(),
        basis: qualifierRecord.basis.trim(),
        note: qualifierRecord.note.trim(),
      }),
      temporalRequirementJson: record.temporalRequirementJson.trim(),
    })];
  }));
}

function isVerificationClaimKind(value: unknown): value is VerificationClaimKind {
  return typeof value === "string"
    && verificationClaimKinds.has(value as VerificationClaimKind);
}

function stripFence(value: string): string {
  return value.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
