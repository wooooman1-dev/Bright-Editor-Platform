import type { ApprovalEvidenceFactField } from "../../../core/approval/ApprovalReadiness";

export const APPROVAL_EVIDENCE_FACT_FIELDS: readonly ApprovalEvidenceFactField[] = Object.freeze([
  "eligibility",
  "period",
  "amount",
  "incomeThreshold",
  "interestRate",
  "taxRate",
  "exceptions",
  "statutoryBasis",
]);

export function requiredApprovalFactFields(
  facts: readonly ApprovalEvidenceFactField[],
): readonly ApprovalEvidenceFactField[] {
  const available = new Set(facts);
  return Object.freeze(APPROVAL_EVIDENCE_FACT_FIELDS.filter((field) => available.has(field)));
}
