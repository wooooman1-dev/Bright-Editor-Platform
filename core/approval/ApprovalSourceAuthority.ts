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
  if (governmentProgramPattern.test(context) || publicProgramPattern.test(context)) {
    return "government_program";
  }
  if (financialRegulationPattern.test(context)) return "financial_regulation";
  /**
   * Planning already tags a Claim `kind: "legal"`, and that must outrank the
   * incidental vocabulary test below: a Claim about a statutory concept such as
   * 계속거래 states its condition as "법령상 해지 조건", which matches
   * `entityProductPattern`'s `해지\s*조건` even though nothing here is a
   * company's product. Classified as `entity_product`, the Claim then requires
   * its subject — an abstract legal question, not an organization — to match a
   * page owner, which no source can ever satisfy, so 법제처's own 법령해석례
   * for the concept was rejected as `source_owner_mismatch`.
   */
  if (claim.kind === "legal") return "law";
  if (entityProductClaim(claim, context)) return "entity_product";
  if (legalClaimPattern.test(context)) return "law";
  return "profile_official";
}

function entityProductClaim(claim: VerificationClaimSpec, context: string): boolean {
  const subject = claim.qualifiers.subject?.trim();
  return Boolean(subject && !genericFinancialProductSubjectPattern.test(subject))
    && entityProductPattern.test(context);
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

const taxClaimPattern = /(?:세금|세율|과세|소득세|법인세|부가가치세|국세|세액\s*공제|소득\s*공제|연말\s*정산|tax(?:ation|\s+rate|\s+credit|\s+deduction)?)/iu;
const governmentProgramPattern = /(?:정부\s*지원|지원금|보조금|공공\s*지원|정부\s*사업|government\s+(?:support|benefit|program)|public\s+benefit)/iu;

/**
 * Public social-insurance and public-benefit programmes, matched before the
 * entity-product test.
 *
 * `entityProductPattern` contains `보험사?`, which has no word boundary to rely
 * on in Korean and therefore matches the `보험` inside 고용보험, 건강보험 and
 * 산재보험. A Claim about 실업급여 수급자격 was consequently classified as a
 * commercial entity's product, which demands a page owned by the Claim subject,
 * and every government portal carrying the rule — 국가법령정보센터 included — was
 * rejected as `source_owner_mismatch`. No source could ever satisfy that,
 * because a public programme has no vendor to own its page.
 */
const publicProgramPattern = /(?:고용\s*보험|산재\s*보험|국민\s*연금|건강\s*보험|장기\s*요양|사회\s*보험|공적\s*연금|실업\s*급여|구직\s*급여|육아\s*휴직\s*급여|출산\s*전후\s*휴가|기초\s*연금|기초\s*생활\s*보장|수급\s*자격|수급자|피보험\s*단위\s*기간|employment\s+insurance|unemployment\s+benefit|national\s+pension|public\s+health\s+insurance)/iu;
const financialRegulationPattern = /(?:금융\s*(?:규제|제도|감독|정책)|예금자\s*보호|소비자\s*보호\s*규제|financial\s+(?:regulation|supervision|policy)|deposit\s+protection)/iu;
const legalClaimPattern = /(?:법률|법적\s*요건|법령|시행령|시행규칙|조문|statute|regulation|legal\s+requirement)/iu;
const entityProductPattern = /(?:은행|카드사?|보험사?|금융\s*회사|bank|card\s+(?:issuer|company|product)|insur(?:er|ance)|상품|product|금리|이자율|중도\s*해지|해지\s*조건|상품\s*조건|수수료|연회비|보험료|보장\s*조건|상품\s*설명서|약관|공시|disclosure|fee|premium|coverage|terms?)/iu;
/**
 * A regulator or law portal is the appropriate primary source for a general
 * consumer-finance concept. Requiring it to be "owned" by an abstract subject
 * such as "general credit-card instalment transactions" makes every official
 * public source fail the entity-owner check, while no particular card issuer
 * has been named. Named issuers remain entity-owned product Claims.
 */
const genericFinancialProductSubjectPattern = /^(?:(?:일반|개별|해당)\s*)?(?:(?:신용|체크|직불)\s*)?(?:카드|은행|보험|금융)(?:\s*(?:상품|거래|할부|결제|대출|예금|적금|계좌|수수료|금리))*$/iu;
const officialProductDocumentPattern = /(?:공식\s*상품|상품\s*(?:안내|설명서|공시)|약관|공시|금리\s*안내|수수료\s*안내|보험\s*상품\s*설명서|official\s+product|product\s+(?:page|guide|description|disclosure)|terms\s+and\s+conditions|fee\s+schedule|policy\s+document)/iu;
const organizationSuffixPattern = /(?:주식회사|유한회사|㈜|\(주\)|은행|카드사?|보험사?|금융회사|금융|bank|card\s+(?:issuer|company)|insurance\s+company|insurer|corporation|corp(?:oration)?\.?|company|co\.?|limited|ltd\.?|inc(?:orporated)?\.?|official)/giu;
const organizationStopWords = new Set(["the", "www", "official", "company"]);
