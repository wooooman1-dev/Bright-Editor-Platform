import { canonicalDocumentText, type ContentDocument } from "../content";
import type { ApprovalEvidenceFact } from "./ApprovalReadiness";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";
import {
  approvalEvidenceClaimFieldsForSourceUrl,
  approvalFactMatchesPage,
  extractProfileApprovalFacts as baseExtractProfileApprovalFacts,
  extractProfileApprovalFactsFromText as baseExtractProfileApprovalFactsFromText,
  requiredApprovalFactFields as baseRequiredApprovalFactFields,
} from "./ApprovalEvidenceClaimPolicyBase";

export { approvalEvidenceClaimFieldsForSourceUrl, approvalFactMatchesPage };

export function extractProfileApprovalFacts(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  return addConciseLegalFacts(
    canonicalDocumentText(document),
    profileId,
    baseExtractProfileApprovalFacts(document, profileId),
  );
}

export function extractProfileApprovalFactsFromText(
  text: string,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  return addConciseLegalFacts(
    text,
    profileId,
    baseExtractProfileApprovalFactsFromText(text, profileId),
  );
}

export function requiredApprovalFactFields(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
  facts: readonly ApprovalEvidenceFact[],
): readonly string[] {
  const base = baseRequiredApprovalFactFields(document, profileId, facts);
  if (profileId !== "wordpress_life_economy_v1") return base;
  const available = new Set(facts.map((fact) => fact.field));
  return Object.freeze([
    ...base,
    ...(available.has("excessPaymentRefund") && !base.includes("excessPaymentRefund")
      ? ["excessPaymentRefund"]
      : []),
  ]);
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
