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
  return addConciseThresholdFact(
    canonicalDocumentText(document),
    profileId,
    baseExtractProfileApprovalFacts(document, profileId),
  );
}

export function extractProfileApprovalFactsFromText(
  text: string,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  return addConciseThresholdFact(
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
  return baseRequiredApprovalFactFields(document, profileId, facts);
}

function addConciseThresholdFact(
  text: string,
  profileId: ApprovalPolicyProfileId,
  facts: readonly ApprovalEvidenceFact[],
): readonly ApprovalEvidenceFact[] {
  if (profileId !== "wordpress_life_economy_v1"
    || facts.some((fact) => fact.field === "continuingTransactionArticle30Threshold")) {
    return facts;
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  const qualifies = /(?:법령|시행령).{0,100}(?:금액|기간).{0,100}요건.{0,80}충족.{0,240}(?:설명|계약서.{0,100}발급)/iu.test(normalized);
  if (!qualifies) return facts;
  return Object.freeze([
    ...facts,
    Object.freeze({
      field: "continuingTransactionArticle30Threshold",
      value: "법령에서 정한 금액·기간 요건을 충족하는 계속거래 계약의 설명·계약서 발급 의무",
    }),
  ]);
}
