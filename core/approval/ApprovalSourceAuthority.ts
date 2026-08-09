import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import type { ApprovalSourcePage } from "./ApprovalEvidenceVerification";
import { officialSourceAllowed } from "./ApprovalEvidenceVerification";
import type { VerificationClaimSpec } from "./VerificationClaim";

export type ApprovalClaimAuthorityKind =
  | "law"
  | "tax"
  | "government_program"
  | "financial_regulation"
  | "entity_product"
  | "profile_official";

export type ApprovalSourceAuthorityDiagnosticCode =
  | "official_source_rejected"
  | "source_owner_missing"
  | "source_owner_mismatch"
  | "official_document_unverified";

export type ApprovalSourceAuthorityResult = Readonly<{
  status: "passed" | "rejected";
  authorityKinds: readonly ApprovalClaimAuthorityKind[];
  matchedClaimIds: readonly string[];
  rejectedClaimIds: readonly string[];
  diagnosticCode?: ApprovalSourceAuthorityDiagnosticCode;
  sourceOwner?: string;
}>;

/**
 * Determines primary-source authority from the Claim owner rather than treating
 * government-domain membership as a synonym for officialness.
 *
 * Public-law, tax, government-program, and financial-regulation Claims keep the
 * existing profile/public-sector policy. Entity-owned product Claims instead
 * require the Claim subject to match the observed page owner and require an
 * owner-bound official domain or formal first-party product document.
 */
export function evaluateApprovalSourceAuthority(input: Readonly<{
  profileId: ApprovalPolicyProfileId;
  page: ApprovalSourcePage;
  claims: readonly VerificationClaimSpec[];
}>): ApprovalSourceAuthorityResult {
  const sourceOwner = input.page.publisher.trim();
  const evaluations = input.claims.map((claim) => {
    const kind = approvalClaimAuthorityKind(claim);
    if (kind !== "entity_product") {
      return Object.freeze({
        claimId: claim.claimId,
        kind,
        passed: officialSourceAllowed(input.profileId, input.page),
        diagnosticCode: "official_source_rejected" as const,
      });
    }

    const subject = claim.qualifiers.subject?.trim() ?? "";
    if (!subject || !sourceOwner) {
      return Object.freeze({
        claimId: claim.claimId,
        kind,
        passed: false,
        diagnosticCode: "source_owner_missing" as const,
      });
    }
    if (!sameSourceOwner(subject, sourceOwner)) {
      return Object.freeze({
        claimId: claim.claimId,
        kind,
        passed: false,
        diagnosticCode: "source_owner_mismatch" as const,
      });
    }
    const passed = entityOwnedOfficialSource(input.page, subject);
    return Object.freeze({
      claimId: claim.claimId,
      kind,
      passed,
      diagnosticCode: "official_document_unverified" as const,
    });
  });

  const rejected = evaluations.filter((item) => !item.passed);
  const diagnosticCode = rejected.find((item) =>
    item.diagnosticCode === "source_owner_mismatch")?.diagnosticCode
    ?? rejected[0]?.diagnosticCode;
  return Object.freeze({
    status: rejected.length ? "rejected" : "passed",
    authorityKinds: Object.freeze([...new Set(evaluations.map((item) => item.kind))]),
    matchedClaimIds: Object.freeze(evaluations.filter((item) => item.passed).map((item) => item.claimId)),
    rejectedClaimIds: Object.freeze(rejected.map((item) => item.claimId)),
    ...(diagnosticCode ? { diagnosticCode } : {}),
    ...(sourceOwner ? { sourceOwner } : {}),
  });
}

export function approvalClaimAuthorityKind(
  claim: VerificationClaimSpec,
): ApprovalClaimAuthorityKind {
  const context = claimContext(claim);
  if (taxClaimPattern.test(context)) return "tax";
  if (governmentProgramPattern.test(context)) return "government_program";
  if (financialRegulationPattern.test(context)) return "financial_regulation";
  // Planning already declared this Claim to be about what the law provides.
  // A declared kind is owned truth and must outrank vocabulary inference,
  // which otherwise reads "보험"/"약관" in a statute Claim as a private product.
  if (claim.kind === "legal") return "law";
  if (entityProductClaim(claim, context)) return "entity_product";
  if (legalClaimPattern.test(context)) return "law";
  return "profile_official";
}

/**
 * An entity-owned product Claim is one whose subject *names* the entity that
 * owns the product, because the whole point of the classification is to require
 * that same entity's page as the source. Product vocabulary appearing anywhere
 * in the Claim context is not enough: "보험금 지급 여부" or "보험금 청구" mention
 * 보험 without naming any insurer, and classifying them as entity-owned made the
 * authority gate demand a publisher equal to the topic itself, rejecting every
 * real source with `source_owner_mismatch`.
 */
function entityProductClaim(claim: VerificationClaimSpec, context: string): boolean {
  return subjectNamesOrganization(claim.qualifiers.subject ?? "")
    && entityProductPattern.test(context)
    && !socialInsuranceProgramPattern.test(context);
}

/**
 * Whether the subject reads as an organization name: an organization-type word
 * has to close a word in it ("국민은행", "삼성생명", "Alpha Bank"), not merely
 * appear inside a longer common noun ("보험금", "카드사용액").
 */
function subjectNamesOrganization(subject: string): boolean {
  const value = subject.normalize("NFKC").trim();
  return Boolean(value) && organizationNamePattern.test(value);
}

function entityOwnedOfficialSource(page: ApprovalSourcePage, subject: string): boolean {
  let url: URL;
  try {
    url = new URL(page.finalUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const ownerBoundDomain = organizationIdentityTokens(subject).some((token) =>
    hostnameIdentity(url.hostname).includes(token));
  const documentText = `${page.title}\n${page.publisher}\n${page.text.slice(0, 8_000)}`;
  const formalOwnedDocument = officialProductDocumentPattern.test(documentText)
    && organizationIdentity(subject).length >= 2
    && organizationIdentity(documentText).includes(organizationIdentity(subject));
  return ownerBoundDomain || formalOwnedDocument;
}

function sameSourceOwner(subject: string, sourceOwner: string): boolean {
  const subjectIdentity = organizationIdentity(subject);
  const ownerIdentity = organizationIdentity(sourceOwner);
  if (subjectIdentity.length < 2 || ownerIdentity.length < 2) return false;
  return subjectIdentity === ownerIdentity;
}

function organizationIdentity(value: string): string {
  return value.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(organizationSuffixPattern, " ")
    .replace(/[^0-9a-z\p{Script=Hangul}]+/gu, "")
    .trim();
}

function organizationIdentityTokens(value: string): readonly string[] {
  const withoutSuffixes = value.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(organizationSuffixPattern, " ");
  return Object.freeze([...new Set(
    (withoutSuffixes.match(/[0-9a-z\p{Script=Hangul}]{2,}/gu) ?? [])
      .filter((token) => !organizationStopWords.has(token)),
  )]);
}

function hostnameIdentity(hostname: string): string {
  return hostname.toLocaleLowerCase("en-US").replace(/[^0-9a-z]+/gu, "");
}

function claimContext(claim: VerificationClaimSpec): string {
  return [
    claim.field,
    claim.statement,
    claim.rawValue ?? "",
    claim.qualifiers.subject ?? "",
    claim.qualifiers.scope ?? "",
    claim.qualifiers.basis ?? "",
    claim.qualifiers.note ?? "",
  ].join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR");
}

const taxClaimPattern = /(?:세금|세율|과세|소득세|법인세|부가가치세|국세|tax(?:ation|\s+rate)?)/iu;
const governmentProgramPattern = /(?:정부\s*지원|지원금|보조금|공공\s*지원|정부\s*사업|government\s+(?:support|benefit|program)|public\s+benefit)/iu;
const financialRegulationPattern = /(?:금융\s*(?:규제|제도|감독|정책)|예금자\s*보호|소비자\s*보호\s*규제|financial\s+(?:regulation|supervision|policy)|deposit\s+protection)/iu;
const legalClaimPattern = /(?:법률|법적\s*요건|법령|시행령|시행규칙|조문|statute|regulation|legal\s+requirement)/iu;
const entityProductPattern = /(?:은행|카드사?|보험사?|금융\s*회사|bank|card\s+(?:issuer|company|product)|insur(?:er|ance)|상품|product|금리|이자율|중도\s*해지|해지\s*조건|상품\s*조건|수수료|연회비|보험료|보장\s*조건|상품\s*설명서|약관|공시|disclosure|fee|premium|coverage|terms?)/iu;
/**
 * Government-run social insurance/pension programs (고용보험, 국민건강보험,
 * 산재보험, 국민연금, etc.) contain "보험" or "연금" as a substring, which would
 * otherwise false-positive-match entityProductPattern's private insurer tokens
 * and misclassify a law/government-program Claim as an entity-owned product,
 * wrongly requiring the source publisher to equal the program name.
 */
const socialInsuranceProgramPattern = /(?:고용보험|구직급여|실업급여|산재보험|산업재해보상보험|국민건강보험|건강보험|국민연금|공무원연금|사학연금|군인연금|노인장기요양보험|요양보험)/iu;
/**
 * Organization-type words in name-final position. The lookahead keeps the match
 * anchored to a word end (including the Korean possessive "의"), so "○○카드의
 * 연회비" names an entity while "카드사용액" and "보험금" do not.
 */
const organizationNamePattern = /(?:은행|카드|보험|생명|화재|증권|캐피탈|저축은행|금융지주|지주|공사|공단|주식회사|㈜|\(주\)|bank|card\s+(?:issuer|company)|insurance|insurer|corporation|corp\.?|company|inc\.?|ltd\.?)(?=$|[\s.,·ㆍ)\]]|의(?:$|[\s.,·ㆍ)\]]))/iu;
const officialProductDocumentPattern = /(?:공식\s*상품|상품\s*(?:안내|설명서|공시)|약관|공시|금리\s*안내|수수료\s*안내|보험\s*상품\s*설명서|official\s+product|product\s+(?:page|guide|description|disclosure)|terms\s+and\s+conditions|fee\s+schedule|policy\s+document)/iu;
const organizationSuffixPattern = /(?:주식회사|유한회사|㈜|\(주\)|은행|카드사?|보험사?|금융회사|금융|bank|card\s+(?:issuer|company)|insurance\s+company|insurer|corporation|corp(?:oration)?\.?|company|co\.?|limited|ltd\.?|inc(?:orporated)?\.?|official)/giu;
const organizationStopWords = new Set(["the", "www", "official", "company"]);
