import { canonicalDocumentText, type ContentDocument } from "../content";
import type { ApprovalEvidenceFact } from "./ApprovalReadiness";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import {
  approvalEvidenceClaimFieldsForSourceUrl,
  approvalFactMatchesPage as baseApprovalFactMatchesPage,
  extractProfileApprovalFacts as baseExtractProfileApprovalFacts,
  extractProfileApprovalFactsFromText as baseExtractProfileApprovalFactsFromText,
  requiredApprovalFactFields as baseRequiredApprovalFactFields,
} from "./ApprovalEvidenceClaimPolicyBase";

export { approvalEvidenceClaimFieldsForSourceUrl };

export function extractProfileApprovalFacts(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  const text = canonicalDocumentText(document);
  return addGenericVerifiableClaims(
    text,
    profileId,
    addConciseLegalFacts(
      text,
      profileId,
      baseExtractProfileApprovalFacts(document, profileId),
    ),
  );
}

export function extractProfileApprovalFactsFromText(
  text: string,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  return addGenericVerifiableClaims(
    text,
    profileId,
    addConciseLegalFacts(
      text,
      profileId,
      baseExtractProfileApprovalFactsFromText(text, profileId),
    ),
  );
}

export function requiredApprovalFactFields(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
  facts: readonly ApprovalEvidenceFact[],
): readonly string[] {
  const generic = facts.map((fact) => fact.field).filter(isGenericClaimField);
  const nonGeneric = facts.filter((fact) => !isGenericClaimField(fact.field));
  if (generic.length > 0 && nonGeneric.length === 0) {
    return Object.freeze([...new Set(generic)]);
  }

  const base = baseRequiredApprovalFactFields(document, profileId, facts);
  if (profileId !== "wordpress_life_economy_v1") {
    return Object.freeze([...new Set([...base, ...generic])]);
  }
  const available = new Set(facts.map((fact) => fact.field));
  return Object.freeze([...new Set([
    ...base,
    ...(available.has("excessPaymentRefund") && !base.includes("excessPaymentRefund")
      ? ["excessPaymentRefund"]
      : []),
    ...generic,
  ])]);
}

export function approvalFactMatchesPage(
  page: Readonly<{ title: string; publisher: string; text: string }>,
  fact: ApprovalEvidenceFact,
): boolean {
  if (!isGenericClaimField(fact.field)) return baseApprovalFactMatchesPage(page, fact);
  return genericClaimMatchesPage(page, fact.value);
}

function addConciseLegalFacts(
  text: string,
  profileId: ApprovalPolicyProfileId,
  facts: readonly ApprovalEvidenceFact[],
): readonly ApprovalEvidenceFact[] {
  if (profileId !== "wordpress_life_economy_v1") return facts;
  const normalized = text.replace(/\s+/g, " ").trim();
  const existing = new Set(facts.map((fact) => fact.field));
  const additions: ApprovalEvidenceFact[] = [];
  const hasQualification = /계속거래에\s*해당.{0,140}(?:법령|시행령).{0,100}(?:금액|기간).{0,100}요건.{0,80}충족/iu.test(normalized);

  if (hasQualification && !existing.has("continuingTransactionDefinition")) {
    additions.push(Object.freeze({
      field: "continuingTransactionDefinition",
      value: "방문판매법상 계속거래 해당 여부는 법정 정의와 성립 요건에 따라 판단",
    }));
  }
  if (hasQualification && !existing.has("continuingTransactionArticle30Threshold")) {
    additions.push(Object.freeze({
      field: "continuingTransactionArticle30Threshold",
      value: "법령에서 정한 금액·기간 요건을 충족하는 계속거래 계약의 설명·계약서 발급 의무",
    }));
  }
  if (/계속거래.{0,260}부당한\s*환급\s*거부/iu.test(normalized)
    && !existing.has("excessPaymentRefund")) {
    additions.push(Object.freeze({
      field: "excessPaymentRefund",
      value: "계속거래 계약 해지·해제 시 부당한 환급 거부 제한",
    }));
  }
  return additions.length ? Object.freeze([...facts, ...additions]) : facts;
}

/**
 * Captures previously unknown legal assertions as deterministic dynamic Claim
 * roles. A new Claim can therefore be matched against an official candidate;
 * when no source supports it, the readiness result safely remains needs_review
 * instead of silently ignoring or falsely approving the assertion.
 */
function addGenericVerifiableClaims(
  text: string,
  profileId: ApprovalPolicyProfileId,
  facts: readonly ApprovalEvidenceFact[],
): readonly ApprovalEvidenceFact[] {
  if (profileId !== "wordpress_life_economy_v1") return facts;
  const additions: ApprovalEvidenceFact[] = [];
  const existingValues = new Set(facts.map((fact) => normalizeClaim(fact.value)));

  for (const sentence of legalAssertionSentences(text)) {
    if (additions.length >= maximumGenericClaims) break;
    if (baseExtractProfileApprovalFactsFromText(sentence, profileId).length > 0) continue;
    const normalized = normalizeClaim(sentence);
    if (normalized.length < 16 || existingValues.has(normalized)) continue;
    existingValues.add(normalized);
    additions.push(Object.freeze({
      field: `genericClaim:${stableClaimId(normalized)}`,
      value: sentence,
      excerpt: sentence,
    }));
  }

  return additions.length ? Object.freeze([...facts, ...additions]) : facts;
}

function legalAssertionSentences(text: string): readonly string[] {
  const candidates = text
    .replace(/https:\/\/\S+/giu, " ")
    .split(/(?<=[.!?。！？])\s+|\r?\n+/gu)
    .map((sentence) => sentence.replace(/\s+/gu, " ").trim())
    .filter((sentence) => sentence.length >= 20 && sentence.length <= 500);

  return Object.freeze(candidates.filter((sentence) => {
    if (/(?:출처|참고|확인\s*경로|다시\s*확인|확인하세요|정보\s*기준일|최종\s*검토일)/u.test(sentence)) return false;
    const hasLegalAnchor = /(?:「[^」]{2,80}(?:법|시행령|시행규칙)」|[가-힣A-Za-z]{2,40}(?:법|시행령|시행규칙)|법\s*제?\s*\d+조|제\s*\d+조(?:의\d+)?|법률상|법령상)/u.test(sentence);
    const hasAssertion = /(?:적용|정의|의무|금지|제한|허용|가능|불가|해야|하여야|할\s*수\s*있|대상|제외|기준|요건|한도|기간|금액|환급|위약금|처벌|과태료|세율|공제)/u.test(sentence);
    return hasLegalAnchor && hasAssertion;
  }));
}

function genericClaimMatchesPage(
  page: Readonly<{ title: string; publisher: string; text: string }>,
  claim: string,
): boolean {
  const haystack = `${page.title} ${page.publisher} ${page.text}`;
  const normalizedHaystack = normalizeClaim(haystack);
  const normalizedClaim = normalizeClaim(claim);
  if (normalizedClaim.length >= 16 && normalizedHaystack.includes(normalizedClaim)) return true;

  const claimAnchors = claim.match(/(?:제\s*\d+조(?:의\d+)?|\d+(?:[.,]\d+)?\s*(?:원|만원|억원|퍼센트|%|년|개월|일)|20\d{2}\s*년?)/gu) ?? [];
  if (claimAnchors.some((anchor) => !normalizedHaystack.includes(normalizeClaim(anchor)))) return false;

  const claimTokens = significantClaimTokens(claim);
  if (claimTokens.length < minimumGenericClaimTokens) return false;
  const matched = claimTokens.filter((token) => normalizedHaystack.includes(normalizeClaim(token)));
  const ratio = matched.length / claimTokens.length;
  return matched.length >= minimumGenericClaimTokens && ratio >= genericClaimMatchRatio;
}

function significantClaimTokens(value: string): readonly string[] {
  const found = new Set<string>();
  for (const match of value.normalize("NFKC").matchAll(/[가-힣A-Za-z0-9]{2,}/gu)) {
    const token = match[0];
    if (genericClaimStopWords.has(token)) continue;
    found.add(token);
  }
  return Object.freeze([...found].slice(0, maximumGenericClaimTokens));
}

function isGenericClaimField(field: string): boolean {
  return field.startsWith("genericClaim:");
}

function stableClaimId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeClaim(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s\p{P}\p{S}]+/gu, "");
}

const genericClaimStopWords = new Set([
  "그리고",
  "그러나",
  "따라서",
  "또한",
  "경우",
  "대한",
  "관한",
  "에서",
  "으로",
  "하는",
  "있는",
  "있습니다",
  "합니다",
  "됩니다",
  "것입니다",
  "소비자",
  "사업자",
]);
const maximumGenericClaims = 20;
const maximumGenericClaimTokens = 40;
const minimumGenericClaimTokens = 4;
const genericClaimMatchRatio = 0.7;
