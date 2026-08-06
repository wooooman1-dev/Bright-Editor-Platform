import type { VerificationClaimResult, VerificationClaimSpec, VerificationSourceAssessment } from "./VerificationClaim";
export function verificationPlanFingerprint(specs: readonly VerificationClaimSpec[]): string { return hash(canonical(specs)); }
export function sourceSnapshotFingerprint(assessments: readonly VerificationSourceAssessment[]): string { return hash(canonical(assessments)); }
export function verificationSnapshotFingerprint(input: Readonly<{ claimDefinitionFingerprint: string; sourceSnapshotFingerprint: string; results: readonly VerificationClaimResult[] }>): string { return hash(canonical(input)); }
function canonical(value: unknown): string { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown { if (Array.isArray(value)) return [...value].map(sortValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)])); return value; }
function hash(value: string): string { let result = 2166136261; for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619); } return `vfp-${(result >>> 0).toString(16).padStart(8, "0")}`; }
