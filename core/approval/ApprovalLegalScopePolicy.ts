import { canonicalDocumentText, type ContentDocument } from "../content";
import {
  approvalPolicyPromptContext as baseApprovalPolicyPromptContext,
  evaluateApprovalPreparationText as baseEvaluateApprovalPreparationText,
  type ApprovalPolicySnapshot,
  type ApprovalPreparationEvidenceContext,
  type ApprovalPreparationIssue,
} from "./ApprovalPolicy";
import {
  evaluateApprovalDraftIntegrity as baseEvaluateApprovalDraftIntegrity,
  type ApprovalDraftIntegrity,
} from "./ApprovalReadiness";

/**
 * Adds deterministic legal-applicability safeguards without another AI call.
 *
 * The generic approval policy remains platform-neutral. This layer is enabled
 * only by the WordPress life-economy approval profile and prevents a rule for a
 * defined legal category from being generalized to every recurring payment or
 * subscription that merely looks similar.
 */
export function approvalPolicyPromptContext(snapshot: ApprovalPolicySnapshot): string {
  const base = baseApprovalPolicyPromptContext(snapshot);
  if (snapshot.profileId !== "wordpress_life_economy_v1") return base;
  return `${base}\nLegal applicability contract: for every legal or regulatory claim, state the statutory definition, applicability conditions, current thresholds, exceptions, and direct official re-check path. Never generalize a rule for one defined legal category to every superficially similar payment, subscription, product, service, or contract.\nContinuing-transaction contract: never equate recurring payment with a continuing transaction under Korean law. State the one-month-and-termination-condition definition, make clear that not every automatic payment or subscription qualifies, and when Article 30 duties are mentioned verify the current amount and period thresholds from the official enforcement decree.`;
}

export function evaluateApprovalPreparationText(
  text: string,
  snapshot: ApprovalPolicySnapshot,
  evidence: ApprovalPreparationEvidenceContext = {},
): readonly ApprovalPreparationIssue[] {
  return Object.freeze([
    ...baseEvaluateApprovalPreparationText(text, snapshot, evidence),
    ...legalScopePreparationIssues(text, snapshot, evidence),
  ]);
}

export function evaluateApprovalDraftIntegrity(document: ContentDocument): ApprovalDraftIntegrity {
  const base = baseEvaluateApprovalDraftIntegrity(document);
  const snapshot = document.metadata?.approvalPolicy;
  if (!snapshot) return base;
  const evidence = document.metadata?.approvalEvidence;
  const legalIssues = legalScopePreparationIssues(
    canonicalDocumentText(document),
    snapshot,
    {
      sourceUrls: evidence?.sources
        .filter((source) => source.provenance !== "search_candidate")
        .map((source) => source.canonicalUrl ?? source.url),
      reviewedAt: evidence?.reviewedAt,
    },
  );
  if (!legalIssues.length) return base;
  return Object.freeze({
    passed: false,
    reasons: Object.freeze([
      ...base.reasons,
      ...legalIssues.map((issue) => issue.message),
    ]),
  });
}

export function assertApprovalDraftIntegrity(document: ContentDocument): void {
  const result = evaluateApprovalDraftIntegrity(document);
  if (!result.passed) {
    throw new Error(`현재 승인 준비 원고의 사실·출처 무결성을 확인해야 외부 임시저장을 실행할 수 있습니다. ${result.reasons.join(" ")}`);
  }
}

function legalScopePreparationIssues(
  text: string,
  snapshot: ApprovalPolicySnapshot,
  evidence: ApprovalPreparationEvidenceContext,
): readonly ApprovalPreparationIssue[] {
  if (snapshot.profileId !== "wordpress_life_economy_v1") return Object.freeze([]);
  const normalized = text.replace(/\s+/g, " ").trim();
  const hasContinuingTransactionClaim = /(?:방문판매법|방문판매 등에 관한 법률|계속거래).{0,220}(?:계약서|설명|위약금|환급|해지)|(?:계약서|위약금|환급).{0,220}계속거래/iu.test(normalized);
  if (!hasContinuingTransactionClaim) return Object.freeze([]);

  const issues: ApprovalPreparationIssue[] = [];
  const hasDefinition = /1\s*개월\s*이상/iu.test(normalized)
    && /(?:대금\s*환급|환급).{0,24}제한|위약금.{0,24}(?:약정|조건)/iu.test(normalized);
  if (!hasDefinition) {
    issues.push(blockingIssue("방문판매법상 계속거래의 법정 정의와 성립 요건이 빠져 있습니다."));
  }

  const mentionsRecurringPayment = /자동(?:결제|이체)|정기결제|구독/iu.test(normalized);
  const hasScopeLimitation = /(?:모든|일반적인|단순한|매달|정기적으로).{0,80}(?:자동(?:결제|이체)|정기결제|구독).{0,120}계속거래.{0,60}(?:해당하지|해당하는 것은 (?:아니|아닙)|모두가 (?:아니|아닙)|일률적으로 볼 수 없)/iu.test(normalized)
    || /(?:적용 여부|해당 여부).{0,100}(?:계약 기간|환급|위약금|거래 형태)/iu.test(normalized);
  if (mentionsRecurringPayment && !hasScopeLimitation) {
    issues.push(blockingIssue("모든 자동결제·구독이 방문판매법상 계속거래에 해당하는 것은 아니라는 적용 범위와 판단 조건이 빠져 있습니다."));
  }

  const mentionsArticle30Duty = /계속거래/iu.test(normalized)
    && /(?:법\s*제?\s*30조|제30조|계약.{0,80}설명|계약서.{0,80}발급)/iu.test(normalized);
  const hasArticle30Threshold = /10\s*만\s*원/iu.test(normalized)
    && /3\s*개월/iu.test(normalized);
  if (mentionsArticle30Duty && !hasArticle30Threshold) {
    issues.push(blockingIssue("방문판매법 제30조의 설명·계약서 발급 의무에 적용되는 현재 금액·기간 기준이 빠져 있습니다."));
  }

  const sourceUrls = evidence.sourceUrls ?? [];
  if (sourceUrls.length > 0) {
    if (!sourceUrls.some(isContinuingTransactionDefinitionSource)) {
      issues.push(blockingIssue("방문판매법상 계속거래의 정의를 확인할 수 있는 국가법령정보센터 조문 출처가 없습니다."));
    }
    if (mentionsArticle30Duty && !sourceUrls.some(isContinuingTransactionThresholdSource)) {
      issues.push(blockingIssue("방문판매법 제30조의 금액·기간 기준을 확인할 수 있는 시행령 공식 출처가 없습니다."));
    }
  }

  return Object.freeze(issues);
}

function blockingIssue(message: string): ApprovalPreparationIssue {
  return Object.freeze({
    code: "PROFILE_SOURCE_REQUIREMENT_MISSING",
    message,
    blocking: true,
  });
}

function isContinuingTransactionDefinitionSource(value: string): boolean {
  const url = legalSourceUrl(value);
  return Boolean(url
    && url.pathname.endsWith("/lsLinkCommonInfo.do")
    && url.searchParams.get("lsJoLnkSeq") === "1031805825");
}

function isContinuingTransactionThresholdSource(value: string): boolean {
  const url = legalSourceUrl(value);
  if (!url) return false;
  return (url.pathname.endsWith("/lsLawLinkInfo.do")
      && url.searchParams.get("lsJoLnkSeq") === "1000070098")
    || (url.pathname.endsWith("/lsLinkCommonInfo.do")
      && url.searchParams.get("lspttninfSeq") === "58591");
}

function legalSourceUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
    return host === "law.go.kr" && url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}
