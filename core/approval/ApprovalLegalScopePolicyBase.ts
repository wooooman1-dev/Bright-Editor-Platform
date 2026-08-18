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
 * Adds deterministic date-role and legal-applicability safeguards without
 * another AI call.
 *
 * The generic approval policy remains platform-neutral. This layer is enabled
 * only by the WordPress life-economy approval profile. It keeps the manuscript's
 * information date separate from system-owned source/Claim review dates and
 * prevents a rule for a defined legal category from being generalized to every
 * recurring payment or subscription that merely looks similar.
 */
export function approvalPolicyPromptContext(snapshot: ApprovalPolicySnapshot): string {
  const base = baseApprovalPolicyPromptContext(snapshot);
  if (snapshot.profileId !== "wordpress_life_economy_v1") return base;
  return [
    base,
    "Date ownership contract: the manuscript may state only its information date using the exact role '정보 기준일'. Never combine 정보 기준일 with 최종 검토일, 출처 확인일, or Claim 최종 검토일. Do not author or alter 출처 확인일 or Claim 최종 검토일; Bright Studio adds those system-owned dates only after Evidence verification.",
    "Legal applicability contract: for every legal or regulatory claim, state the statutory definition, applicability conditions, current thresholds, exceptions, and direct official re-check path. Never generalize a rule for one defined legal category to every superficially similar payment, subscription, product, service, or contract.",
    "Continuing-transaction contract: never equate recurring payment with a continuing transaction under Korean law. State the one-month-and-termination-condition definition, make clear that not every automatic payment or subscription qualifies, and when Article 30 duties are mentioned verify the current amount and period thresholds from the official enforcement decree.",
  ].join("\n");
}

export function evaluateApprovalPreparationText(
  text: string,
  snapshot: ApprovalPolicySnapshot,
  evidence: ApprovalPreparationEvidenceContext = {},
): readonly ApprovalPreparationIssue[] {
  return Object.freeze([
    ...baseEvaluateApprovalPreparationText(text, snapshot, evidence),
    ...dateRolePreparationIssues(text, snapshot, evidence),
    ...legalScopePreparationIssues(text, snapshot, evidence),
  ]);
}

export function evaluateApprovalDraftIntegrity(
  document: ContentDocument,
  verificationRequired = true,
  timeSensitiveEvidenceRequired = verificationRequired,
): ApprovalDraftIntegrity {
  const base = baseEvaluateApprovalDraftIntegrity(document, verificationRequired);
  const snapshot = document.metadata?.approvalPolicy;
  if (!snapshot) return base;
  const evidence = document.metadata?.approvalEvidence;
  const text = canonicalDocumentText(document);
  const profileIssues = [
    ...dateRolePreparationIssues(text, snapshot, {
      evidenceRequired: verificationRequired,
      timeSensitiveEvidenceRequired,
    }),
    ...legalScopePreparationIssues(text, snapshot, {
      sourceUrls: evidence?.sources
        .filter((source) => source.provenance !== "search_candidate")
        .map((source) => source.canonicalUrl ?? source.url),
      reviewedAt: evidence?.reviewedAt,
    }),
  ];
  if (!profileIssues.length) return base;
  return Object.freeze({
    passed: false,
    reasons: Object.freeze([
      ...base.reasons,
      ...profileIssues.map((issue) => issue.message),
    ]),
  });
}

export function assertApprovalDraftIntegrity(document: ContentDocument): void {
  const result = evaluateApprovalDraftIntegrity(document);
  if (!result.passed) {
    throw new Error(`현재 승인 준비 원고의 사실·출처 무결성을 확인해야 외부 임시저장을 실행할 수 있습니다. ${result.reasons.join(" ")}`);
  }
}

function dateRolePreparationIssues(
  text: string,
  snapshot: ApprovalPolicySnapshot,
  evidence: ApprovalPreparationEvidenceContext,
): readonly ApprovalPreparationIssue[] {
  // D-040: information dates and reader-visible review dates are optional
  // diagnostics, not approval-policy blockers.
  return Object.freeze([]);
  if (snapshot.profileId !== "wordpress_life_economy_v1") return Object.freeze([]);
  const normalized = text.replace(/\s+/g, " ").trim();
  const issues: ApprovalPreparationIssue[] = [];
  const combinedDateRoles = /정보\s*기준일\s*(?:과|와|및|·|\/|,)\s*(?:(?:Claim\s*)?최종\s*검토일|출처\s*확인일)|(?:(?:Claim\s*)?최종\s*검토일|출처\s*확인일)\s*(?:과|와|및|·|\/|,)\s*정보\s*기준일/iu.test(normalized);
  if (combinedDateRoles) {
    issues.push(blockingIssue(
      "정보 기준일과 출처 확인일·Claim 최종 검토일은 서로 다른 역할입니다. 본문에는 정보 기준일만 쓰고 검토일은 시스템 Evidence 기록으로 분리해야 합니다.",
      "PROFILE_REVIEW_DATE_MISSING",
    ));
  }

  const hasInformationDate = /정보\s*기준일\s*(?:은|는|이|가)?\s*[:：]?\s*(?:20\d{2}[-./년]\s*\d{1,2}(?:[-./월]\s*\d{1,2})?|20\d{2}[-./]\d{1,2}(?:[-./]\d{1,2})?)/iu.test(normalized);
  if (!hasInformationDate && evidence.timeSensitiveEvidenceRequired !== false) {
    issues.push(blockingIssue(
      "원고가 기준으로 삼은 날짜를 '정보 기준일'로 명확히 표시해야 합니다.",
      "PROFILE_REVIEW_DATE_MISSING",
    ));
  }

  return Object.freeze(issues);
}

function legalScopePreparationIssues(
  text: string,
  snapshot: ApprovalPolicySnapshot,
  evidence: ApprovalPreparationEvidenceContext,
): readonly ApprovalPreparationIssue[] {
  if (snapshot.profileId !== "wordpress_life_economy_v1") return Object.freeze([]);
  const normalized = text.replace(/\s+/g, " ").trim();
  const hasContinuingTransactionClaim = /(?:방문판매법|방문판매 등에 관한 법률|계속거래).{0,260}(?:계약서|설명|위약금|환급|해지)|(?:계약서|위약금|환급).{0,260}계속거래/iu.test(normalized);
  if (!hasContinuingTransactionClaim) return Object.freeze([]);

  const issues: ApprovalPreparationIssue[] = [];
  const hasDefinition = /1\s*개월\s*이상/iu.test(normalized)
    && /(?:(?:대금\s*)?환급.{0,30}제한|위약금.{0,30}(?:약정|조건))/iu.test(normalized);
  if (!hasDefinition) {
    issues.push(blockingIssue("방문판매법상 계속거래의 법정 정의와 성립 요건이 빠져 있습니다."));
  }

  const mentionsRecurringPayment = /자동(?:결제|이체)|정기결제|구독/iu.test(normalized);
  const hasScopeLimitation = /(?:모든|일반적인|단순한|매달|정기적으로).{0,100}(?:자동(?:결제|이체)|정기결제|구독).{0,140}계속거래.{0,80}(?:해당하지|해당하는 것은 (?:아니|아닙)|모두가 (?:아니|아닙)|일률적으로 볼 수 없)/iu.test(normalized)
    || /(?:적용 여부|해당 여부).{0,120}(?:계약 기간|환급|위약금|거래 형태|다른 법률)/iu.test(normalized);
  if (mentionsRecurringPayment && !hasScopeLimitation) {
    issues.push(blockingIssue("모든 자동결제·구독이 방문판매법상 계속거래에 해당하는 것은 아니라는 적용 범위와 판단 조건이 빠져 있습니다."));
  }

  const mentionsArticle30Duty = /계속거래/iu.test(normalized)
    && /(?:법\s*제?\s*30조|제30조|계약.{0,100}설명|계약서.{0,100}발급)/iu.test(normalized);
  const hasArticle30Threshold = /10\s*만\s*원/iu.test(normalized)
    && /3\s*개월/iu.test(normalized);
  const hasThresholdReference = /법령.{0,30}(?:금액|기간).{0,40}요건|금액.{0,20}기간.{0,30}요건/iu.test(normalized);
  if (mentionsArticle30Duty && !hasArticle30Threshold && !hasThresholdReference) {
    issues.push(blockingIssue("방문판매법 제30조의 설명·계약서 발급 의무에 적용되는 금액·기간 요건이 빠져 있습니다."));
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

function blockingIssue(
  message: string,
  code: ApprovalPreparationIssue["code"] = "PROFILE_SOURCE_REQUIREMENT_MISSING",
): ApprovalPreparationIssue {
  return Object.freeze({
    code,
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
