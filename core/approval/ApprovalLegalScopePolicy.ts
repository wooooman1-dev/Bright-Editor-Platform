import type { ContentDocument } from "../content";
import {
  approvalPolicyPromptContext as baseApprovalPolicyPromptContext,
  evaluateApprovalDraftIntegrity as baseEvaluateApprovalDraftIntegrity,
  evaluateApprovalPreparationText as baseEvaluateApprovalPreparationText,
} from "./ApprovalLegalScopePolicyBase";
import type {
  ApprovalPolicySnapshot,
  ApprovalPreparationEvidenceContext,
  ApprovalPreparationIssue,
} from "./ApprovalPolicy";
import type { ApprovalDraftIntegrity } from "./ApprovalReadiness";

const strictDefinitionMessage = "방문판매법상 계속거래의 법정 정의와 성립 요건이 빠져 있습니다.";

export function approvalPolicyPromptContext(snapshot: ApprovalPolicySnapshot): string {
  const base = baseApprovalPolicyPromptContext(snapshot);
  if (snapshot.profileId !== "wordpress_life_economy_v1") return base;
  return [
    base,
    "Concise legal wording is allowed when it explicitly limits the duty to contracts that qualify as continuing transactions and satisfy the amount/period requirements prescribed by law. Do not force a full statutory-definition paragraph when that qualification and a separate scope limitation are already clear.",
  ].join("\n");
}

export function evaluateApprovalPreparationText(
  text: string,
  snapshot: ApprovalPolicySnapshot,
  evidence: ApprovalPreparationEvidenceContext = {},
): readonly ApprovalPreparationIssue[] {
  return refineDefinitionRequirement(
    text,
    baseEvaluateApprovalPreparationText(text, snapshot, evidence),
    snapshot,
  );
}

export function evaluateApprovalDraftIntegrity(document: ContentDocument): ApprovalDraftIntegrity {
  const base = baseEvaluateApprovalDraftIntegrity(document);
  const snapshot = document.metadata?.approvalPolicy;
  if (!snapshot || !hasConciseApplicabilityQualification(documentText(document), snapshot)) return base;
  const reasons = base.reasons.filter((reason) => reason !== strictDefinitionMessage);
  return reasons.length === base.reasons.length
    ? base
    : Object.freeze({ passed: reasons.length === 0, reasons: Object.freeze(reasons) });
}

export function assertApprovalDraftIntegrity(document: ContentDocument): void {
  const result = evaluateApprovalDraftIntegrity(document);
  if (!result.passed) {
    throw new Error(`현재 승인 준비 원고의 사실·출처 무결성을 확인해야 외부 임시저장을 실행할 수 있습니다. ${result.reasons.join(" ")}`);
  }
}

function refineDefinitionRequirement(
  text: string,
  issues: readonly ApprovalPreparationIssue[],
  snapshot: ApprovalPolicySnapshot,
): readonly ApprovalPreparationIssue[] {
  if (!hasConciseApplicabilityQualification(text, snapshot)) return issues;
  return Object.freeze(issues.filter((issue) => issue.message !== strictDefinitionMessage));
}

function hasConciseApplicabilityQualification(text: string, snapshot: ApprovalPolicySnapshot): boolean {
  if (snapshot.profileId !== "wordpress_life_economy_v1") return false;
  const normalized = text.replace(/\s+/g, " ").trim();
  const hasQualification = /계속거래에\s*해당.{0,140}(?:법령|시행령).{0,100}(?:금액|기간).{0,100}요건.{0,60}충족/iu.test(normalized);
  const hasScopeLimitation = /(?:모든|일반적인|단순한|매달|정기적으로).{0,120}(?:자동(?:결제|이체)|정기결제|구독).{0,160}계속거래.{0,100}(?:해당하지|해당하는 것은 (?:아니|아닙)|모두가 (?:아니|아닙)|일률적으로 볼 수 없)/iu.test(normalized)
    || /(?:적용 여부|해당 여부).{0,120}(?:계약 기간|환급|위약금|거래 형태|다른 법률)/iu.test(normalized);
  return hasQualification && hasScopeLimitation;
}

function documentText(document: ContentDocument): string {
  return [
    document.title,
    ...document.blocks.flatMap((block) => {
      if (block.type === "heading" || block.type === "paragraph") return [block.text];
      if (block.type === "list") return block.items;
      if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
      return [];
    }),
  ].join("\n");
}
