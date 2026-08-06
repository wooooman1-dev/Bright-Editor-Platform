import type { VerificationSourceRole } from "./VerificationClaim";
export type VerificationSourceIdentity = Readonly<{ sourceId: string; institutionGroupId: string; sourceFamilyId: string; publisherId?: string; role: VerificationSourceRole; authoritative: boolean; canonicalUrl: string }>;
export function countIndependentInstitutions(sources: readonly Pick<VerificationSourceIdentity, "institutionGroupId">[]): number { return new Set(sources.map((source) => source.institutionGroupId)).size; }
export function countAuthoritativeInstitutions(sources: readonly Pick<VerificationSourceIdentity, "institutionGroupId" | "authoritative">[]): number { return new Set(sources.filter((source) => source.authoritative).map((source) => source.institutionGroupId)).size; }
export function hasPrimaryOfficial(sources: readonly Pick<VerificationSourceIdentity, "role">[]): boolean { return sources.some((source) => source.role === "primaryOfficial"); }
