import type { ContentBlockOwnership } from "../content/ContentBlockOwnership";

export function approvalSourceReviewPresentationText(input: Readonly<{
  sourceReviewedAt: string;
  informationAsOf?: string;
}>): string {
  const parts = [`출처 확인일: ${input.sourceReviewedAt.slice(0, 10)}`];
  if (input.informationAsOf?.trim()) parts.push(`정보 기준일: ${input.informationAsOf.trim()}`);
  return parts.join(" · ");
}

/**
 * Reader-visible renderers use this projection for system-owned source blocks.
 * Internal Evidence/Claim terminology remains in canonical metadata and is
 * never rewritten in the stored ContentDocument.
 */
export function readerVisibleApprovalSourceText(input: Readonly<{
  id: string;
  ownership?: ContentBlockOwnership;
  text: string;
}>): string {
  if (input.ownership !== "system_source_projection" && input.id !== "approval-review-date") {
    return input.text;
  }
  return input.text
    .split(/\s*·\s*/gu)
    .filter((part) => !/^Claim\s*최종\s*검토일\s*:/iu.test(part.trim()))
    .join(" · ")
    .trim();
}
