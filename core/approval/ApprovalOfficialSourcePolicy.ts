import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";

/**
 * Canonical official-domain policy shared by Generation search and deterministic
 * Evidence verification. Keeping one Core allow-list prevents the two paths
 * from accepting different institutions.
 */
export const wordpressLifeEconomyOfficialDomains = Object.freeze([
  "gov.kr",
  "go.kr",
  "korea.kr",
  "law.go.kr",
  "nts.go.kr",
  "fsc.go.kr",
  "fss.or.kr",
  "bok.or.kr",
  "molit.go.kr",
  "moel.go.kr",
  "mohw.go.kr",
  "mois.go.kr",
  "lh.or.kr",
  "hf.go.kr",
  "nhuf.molit.go.kr",
  "kdic.or.kr",
]);

export function approvalOfficialDomains(
  profileId: ApprovalPolicyProfileId,
): readonly string[] | undefined {
  return profileId === "wordpress_life_economy_v1"
    ? wordpressLifeEconomyOfficialDomains
    : undefined;
}

export function officialDomainAllowed(
  host: string,
  domains: readonly string[],
): boolean {
  const normalized = host.toLocaleLowerCase("en-US").replace(/\.$/, "");
  return domains.some((domain) =>
    normalized === domain || normalized.endsWith(`.${domain}`));
}

export function publicSectorDomainAllowed(host: string): boolean {
  const normalized = host.toLocaleLowerCase("en-US").replace(/\.$/, "");
  return /(?:^|\.)gov(?:\.[a-z]{2,})?$/u.test(normalized)
    || /(?:^|\.)mil(?:\.[a-z]{2,})?$/u.test(normalized)
    || /(?:^|\.)(?:go|gob)\.[a-z]{2,}$/u.test(normalized);
}
