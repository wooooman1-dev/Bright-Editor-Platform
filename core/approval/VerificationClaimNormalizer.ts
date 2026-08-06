import type { VerificationClaimKind, VerificationNormalizedValue, EligibilityPredicate } from "./VerificationClaim";
export function normalizeVerificationValue(kind: VerificationClaimKind, value: VerificationNormalizedValue): VerificationNormalizedValue {
  if (value.kind !== kind) throw new Error(`Verification value kind mismatch: ${kind}.`);
  if (value.kind !== "eligibility") return Object.freeze({ kind: value.kind, value: Object.freeze({ ...value.value }) }) as VerificationNormalizedValue;
  return Object.freeze({ kind: "eligibility", value: Object.freeze({ predicate: canonicalPredicate(value.value.predicate) }) });
}
function canonicalPredicate(predicate: EligibilityPredicate): EligibilityPredicate {
  if ("all" in predicate) return Object.freeze({ all: [...predicate.all].map(canonicalPredicate).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  if ("any" in predicate) return Object.freeze({ any: [...predicate.any].map(canonicalPredicate).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) });
  return Object.freeze({ ...predicate, field: predicate.field.trim(), operator: predicate.operator.trim(), ...(Array.isArray(predicate.value) ? { value: [...predicate.value].sort() } : {}) });
}
