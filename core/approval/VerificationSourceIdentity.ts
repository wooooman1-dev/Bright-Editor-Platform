import type { VerificationSourceRole } from "./VerificationClaim";
export type VerificationSourceIdentity = Readonly<{ sourceId: string; institutionGroupId: string; sourceFamilyId: string; publisherId?: string; role: VerificationSourceRole; authoritative: boolean; canonicalUrl: string }>;
export type VerificationSourceIdentityInput = Readonly<{ requestedUrl: string; finalUrl?: string; publisherId?: string; role: VerificationSourceRole; authoritative: boolean }>;
export function canonicalizeVerificationSourceIdentity(input: VerificationSourceIdentityInput): VerificationSourceIdentity | undefined {
  const raw = input.finalUrl || input.requestedUrl;
  let url: URL;
  try { url = new URL(raw); } catch { return undefined; }
  if (url.protocol !== "https:") return undefined;
  const host = url.hostname.toLocaleLowerCase("en-US").replace(/\.$/u, "");
  const institutionHost = host.replace(/^(www|m|mobile|amp)\./iu, "");
  if (!institutionHost || institutionHost.split(".").length < 2) return undefined;
  const canonicalUrl = `${url.origin}${url.pathname.replace(/\/{2,}/gu, "/").replace(/\/$/u, "") || "/"}${url.search}`;
  const sourceFamilyId = stableId(`family:${institutionHost}`);
  return Object.freeze({
    sourceId: approvalCompatibleSourceId(canonicalUrl),
    institutionGroupId: `institution-${stableId(institutionHost)}`,
    sourceFamilyId,
    ...(input.publisherId?.trim() ? { publisherId: input.publisherId.trim() } : {}),
    role: input.role,
    authoritative: input.authoritative,
    canonicalUrl,
  });
}
export function approvalCompatibleSourceId(url: string): string {
  return stableId(`url:${url}`, "approval-source");
}
type Usable = { institutionGroupId: string; authoritative?: boolean; role?: VerificationSourceRole; supports?: boolean; fresh?: boolean; freshnessStatus?: "fresh" | "stale" | "unknown"; normalizedValue?: unknown };
function usable(sources: readonly Usable[]): readonly Usable[] { return sources.filter((source) => source.supports !== false && source.freshnessStatus !== "unknown" && source.freshnessStatus !== "stale" && source.fresh !== false && (!("normalizedValue" in source) || source.normalizedValue !== undefined)); }
export function countIndependentInstitutions(sources: readonly Usable[]): number { return new Set(usable(sources).map((source) => source.institutionGroupId)).size; }
export function countAuthoritativeInstitutions(sources: readonly Usable[]): number { return new Set(usable(sources).filter((source) => source.authoritative).map((source) => source.institutionGroupId)).size; }
export function hasPrimaryOfficial(sources: readonly Usable[]): boolean {
  return usable(sources).some((source) => source.role === "primaryOfficial" && source.authoritative === true);
}
function stableId(value: string, prefix = "vsi"): string { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); } return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`; }
