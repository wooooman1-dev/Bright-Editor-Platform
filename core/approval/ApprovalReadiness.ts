import type { ContentDocument } from "../content/ContentDocument";
import { evaluateApprovalPreparationText, type ApprovalPreparationIssue } from "./ApprovalPolicy";

export const approvalReadinessCheckKeys = [
  "standard_quality",
  "approval_policy",
  "evidence",
  "duplicate",
  "internal_links",
  "site_readiness",
] as const;

export type ApprovalReadinessCheckKey = (typeof approvalReadinessCheckKeys)[number];
export type ApprovalReadinessCheckStatus = "passed" | "needs_review" | "blocked" | "not_evaluated";

export type ApprovalEvidenceSourceType =
  | "official_institution"
  | "official_archive"
  | "public_agency"
  | "official_law"
  | "official_application_page";

export type ApprovalEvidenceVerificationStatus =
  | "verified"
  | "unreachable"
  | "unsupported_content_type"
  | "unofficial_source"
  | "fact_mismatch"
  | "duplicate_source"
  | "excluded";

export type ApprovalEvidenceFact = Readonly<{
  field: string;
  value: string;
  excerpt?: string;
}>;

export type ApprovalEvidenceSource = Readonly<{
  sourceId: string;
  url: string;
  title: string;
  publisher: string;
  sourceType: ApprovalEvidenceSourceType;
  retrievedAt: string;
  verified: boolean;
  facts: readonly ApprovalEvidenceFact[];
  canonicalUrl?: string;
  finalUrl?: string;
  httpStatus?: number;
  contentType?: string;
  official?: boolean;
  selected?: boolean;
  cited?: boolean;
  verificationStatus?: ApprovalEvidenceVerificationStatus;
  failureReason?: string;
  matchedFacts?: readonly ApprovalEvidenceFact[];
  checkedAt?: string;
  rights?: Readonly<{
    status: "verified" | "unknown" | "restricted";
    note?: string;
  }>;
}>;

export type ApprovalEvidencePack = Readonly<{
  version: "1.0";
  status: "verified" | "needs_review" | "missing";
  reviewedAt?: string;
  reviewedRevisionId?: string;
  requiredFactFields?: readonly string[];
  verifiedFactFields?: readonly string[];
  unverifiedFactFields?: readonly string[];
  sources: readonly ApprovalEvidenceSource[];
}>;

export type ApprovalDuplicateCheckSnapshot = Readonly<{
  version: "1.0";
  status: "passed" | "needs_review" | "blocked";
  checkedAt: string;
  comparedContentIds: readonly string[];
  highestSimilarity?: number;
  matchedContentId?: string;
  reasons: readonly string[];
}>;

export type SiteApprovalReadinessRequirement =
  | "required"
  | "recommended"
  | "setup"
  | "manual";

export type SiteApprovalReadinessSnapshot = Readonly<{
  version: "1.0";
  status: "passed" | "needs_review" | "blocked";
  checkedAt: string;
  checks: readonly Readonly<{
    key: string;
    passed: boolean;
    message: string;
    requirement?: SiteApprovalReadinessRequirement;
  }>[];
}>;

export type ApprovalReadinessCheck = Readonly<{
  key: ApprovalReadinessCheckKey;
  status: ApprovalReadinessCheckStatus;
  message: string;
  action?: string;
}>;

export type ApprovalReadinessReport = Readonly<{
  status: "ready" | "needs_review" | "blocked";
  applicationReady: boolean;
  checks: readonly ApprovalReadinessCheck[];
}>;

export type ApprovalDraftIntegrity = Readonly<{
  passed: boolean;
  reasons: readonly string[];
}>;

export function evaluateApprovalDraftIntegrity(document: ContentDocument): ApprovalDraftIntegrity {
  if (!document.metadata?.approvalPolicy) {
    return Object.freeze({ passed: true, reasons: Object.freeze([]) });
  }
  const issues = evaluateApprovalPreparationText(
    documentText(document),
    document.metadata.approvalPolicy,
  );
  const readiness = evaluateApprovalReadiness(document, issues, true);
  const requiredKeys = new Set<ApprovalReadinessCheckKey>([
    "approval_policy",
    "evidence",
    "duplicate",
  ]);
  const failed = readiness.checks.filter((check) =>
    requiredKeys.has(check.key) && check.status !== "passed");
  return Object.freeze({
    passed: failed.length === 0,
    reasons: Object.freeze(failed.map((check) =>
      [check.message, check.action].filter(Boolean).join(" "))),
  });
}

export function assertApprovalDraftIntegrity(document: ContentDocument): void {
  const result = evaluateApprovalDraftIntegrity(document);
  if (!result.passed) {
    throw new Error(`현재 승인 준비 원고의 사실·출처 무결성을 확인해야 외부 임시저장을 실행할 수 있습니다. ${result.reasons.join(" ")}`);
  }
}

export function evaluateApprovalReadiness(
  document: ContentDocument,
  policyIssues: readonly ApprovalPreparationIssue[],
  standardQualityApproved: boolean,
): ApprovalReadinessReport {
  const checks: ApprovalReadinessCheck[] = [
    standardQualityCheck(standardQualityApproved),
    approvalPolicyCheck(policyIssues),
    evidenceCheck(document),
    duplicateCheck(document),
    internalLinkCheck(document),
    siteReadinessCheck(document),
  ];
  const applicationReady = checks.every((check) => check.status === "passed");
  const status = applicationReady
    ? "ready"
    : checks.some((check) => check.status === "blocked")
      ? "blocked"
      : "needs_review";
  return Object.freeze({
    status,
    applicationReady,
    checks: Object.freeze(checks),
  });
}

function standardQualityCheck(passed: boolean): ApprovalReadinessCheck {
  return passed
    ? Object.freeze({ key: "standard_quality", status: "passed", message: "현재 문서 버전이 기본 품질 승인을 통과했습니다." })
    : Object.freeze({ key: "standard_quality", status: "blocked", message: "현재 문서 버전이 기본 품질 승인을 통과하지 못했습니다.", action: "원고 품질 진단을 반영한 뒤 다시 검토하세요." });
}

function approvalPolicyCheck(issues: readonly ApprovalPreparationIssue[]): ApprovalReadinessCheck {
  if (!issues.length) {
    return Object.freeze({ key: "approval_policy", status: "passed", message: "승인 준비 정책의 결정적 금지 항목을 통과했습니다." });
  }
  return Object.freeze({
    key: "approval_policy",
    status: "blocked",
    message: `승인 준비 정책 위반 ${issues.length}개가 있습니다.`,
    action: issues.map((issue) => issue.message).join(" "),
  });
}

function evidenceCheck(document: ContentDocument): ApprovalReadinessCheck {
  const pack = document.metadata?.approvalEvidence;
  const verifiedSources = pack?.sources.filter(validVerifiedSource) ?? [];
  if (pack?.status === "verified" && pack.reviewedAt && verifiedSources.length > 0) {
    return Object.freeze({ key: "evidence", status: "passed", message: `공식 출처 ${verifiedSources.length}개와 최종 검토일을 확인했습니다.` });
  }
  if (pack?.status === "missing") {
    return Object.freeze({ key: "evidence", status: "blocked", message: "승인 준비 원고에 공식 출처 검증 정보가 없습니다.", action: "공식 기관 자료를 수집하고 원고의 사실과 대조하세요." });
  }
  if (pack) {
    return Object.freeze({ key: "evidence", status: "needs_review", message: "공식 출처 후보가 있지만 출처 검증 또는 최종 검토가 완료되지 않았습니다.", action: "출처 주소, 발행 기관, 확인 사실과 최종 검토일을 검증하세요." });
  }
  const text = documentText(document);
  const hasUrl = /https:\/\/[^\s<>)"']+/i.test(text);
  const hasReviewDate = /(?:최종\s*검토일|정보\s*기준일)\s*[:：]?\s*(?:20\d{2}[-./년]\s*\d{1,2}[-./월]\s*\d{1,2}|20\d{2}[-./]\d{1,2})/i.test(text);
  return Object.freeze({
    key: "evidence",
    status: "not_evaluated",
    message: hasUrl || hasReviewDate
      ? "본문에 출처 표시가 있지만 공식 출처 검증 정보로 확인되지 않았습니다."
      : "공식 출처와 검토일을 확인할 정보가 없습니다.",
    action: "출처 문구만 확인하지 말고 공식 주소와 핵심 사실을 검증 정보로 저장하세요.",
  });
}

function duplicateCheck(document: ContentDocument): ApprovalReadinessCheck {
  const snapshot = document.metadata?.approvalDuplicateCheck;
  if (!snapshot) {
    return Object.freeze({ key: "duplicate", status: "not_evaluated", message: "기존 콘텐츠와의 중복·유사 가치 검사가 실행되지 않았습니다.", action: "같은 프로젝트의 공개 글과 기준 원고를 비교하세요." });
  }
  if (snapshot.status === "passed") {
    return Object.freeze({ key: "duplicate", status: "passed", message: `기존 콘텐츠 ${snapshot.comparedContentIds.length}개와의 중복 검사를 통과했습니다.` });
  }
  return Object.freeze({
    key: "duplicate",
    status: snapshot.status === "blocked" ? "blocked" : "needs_review",
    message: snapshot.status === "blocked" ? "기존 콘텐츠와 중복되거나 고유 정보 가치가 부족합니다." : "기존 콘텐츠와의 유사 위험을 검토해야 합니다.",
    action: snapshot.reasons.join(" ") || "주제·검색 의도·구조·핵심 주장·제공 가치를 차별화하세요.",
  });
}

function internalLinkCheck(document: ContentDocument): ApprovalReadinessCheck {
  const metadata = document.metadata;
  const status = metadata?.internalLinkCatalogStatus;
  const candidates = metadata?.availableRelatedContentCandidates;
  const contextual = document.blocks.filter((block) => block.type === "button" && block.purpose === "internal_link").length;
  const related = document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post").length;
  const placed = contextual + related;

  if (status === "category_missing") {
    return Object.freeze({ key: "internal_links", status: "blocked", message: "발행 카테고리가 없어 내부 링크 후보를 평가하지 못했습니다.", action: "실제 발행 카테고리를 선택한 뒤 공개 글 후보를 다시 불러오세요." });
  }
  if (status === "catalog_unavailable") {
    return Object.freeze({ key: "internal_links", status: "blocked", message: "공개 글 목록을 불러오지 못해 내부 링크를 평가하지 못했습니다.", action: "발행 플랫폼 연결과 공개 글 동기화를 확인하세요." });
  }
  if (status === "evaluated") {
    if ((candidates ?? 0) === 0) {
      return Object.freeze({ key: "internal_links", status: "passed", message: "같은 카테고리에 적합한 공개 후보가 없어 내부 링크를 강제로 넣지 않았습니다." });
    }
    if (placed > 0) {
      return Object.freeze({ key: "internal_links", status: "passed", message: `본문 내부 링크 ${contextual}개와 하단 관련 글 ${related}개가 배치되었습니다.` });
    }
    return Object.freeze({ key: "internal_links", status: "blocked", message: `적합한 공개 후보 ${candidates}개가 있지만 내부 링크가 배치되지 않았습니다.`, action: "본문 문맥 링크와 하단 관련 글 배치 로직을 다시 실행하세요." });
  }
  return Object.freeze({ key: "internal_links", status: "not_evaluated", message: "내부 링크 공개 글 목록 상태를 평가하지 않았습니다.", action: "발행 카테고리와 공개 콘텐츠 후보를 확인하세요." });
}

function siteReadinessCheck(document: ContentDocument): ApprovalReadinessCheck {
  const snapshot = document.metadata?.siteApprovalReadiness;
  if (!snapshot) {
    return Object.freeze({ key: "site_readiness", status: "not_evaluated", message: "사이트 전체 승인 준비 검사가 실행되지 않았습니다.", action: "메뉴·카테고리·개인정보처리방침·깨진 링크·모바일·공개 접근 상태를 자동 검사하세요." });
  }

  const requiredFailures = snapshot.checks.filter((check) => !check.passed && (check.requirement ?? "required") === "required");
  const setupFailures = snapshot.checks.filter((check) => !check.passed && check.requirement === "setup");
  const recommendedFailures = snapshot.checks.filter((check) => !check.passed && check.requirement === "recommended");
  if (snapshot.status !== "blocked" && requiredFailures.length === 0 && setupFailures.length === 0) {
    return Object.freeze({
      key: "site_readiness",
      status: "passed",
      message: recommendedFailures.length
        ? `사이트 필수 자동 검사 항목을 통과했습니다. 권장 보완 항목 ${recommendedFailures.length}개가 남아 있습니다.`
        : "사이트 자동 승인 준비 검사를 통과했습니다.",
      ...(recommendedFailures.length ? { action: recommendedFailures.map((check) => check.message).join(" ") } : {}),
    });
  }

  const pendingLabels = [
    requiredFailures.length ? `필수 오류 ${requiredFailures.length}개` : "",
    setupFailures.length ? `설정 필요 ${setupFailures.length}개` : "",
  ].filter(Boolean);
  const actions = [
    ...requiredFailures,
    ...setupFailures,
  ].map((check) => check.message);

  return Object.freeze({
    key: "site_readiness",
    status: snapshot.status === "blocked" ? "blocked" : "needs_review",
    message: pendingLabels.length ? `사이트 자동 검사 상태: ${pendingLabels.join(" · ")}` : "사이트 전체 공개 상태를 다시 확인해야 합니다.",
    action: actions.join(" ") || "사이트 전체 공개 상태를 다시 자동 검사하세요.",
  });
}

function validVerifiedSource(source: ApprovalEvidenceSource): boolean {
  try {
    const url = new URL(source.url);
    return url.protocol === "https:"
      && Boolean(source.title.trim())
      && Boolean(source.publisher.trim())
      && Boolean(source.retrievedAt)
      && source.verified === true
      && source.facts.length > 0;
  } catch {
    return false;
  }
}

function documentText(document: ContentDocument): string {
  return [
    document.title,
    ...document.blocks.flatMap((block) => {
      if (block.type === "heading" || block.type === "paragraph") return [block.text];
      if (block.type === "button") return [block.label, block.targetUrl];
      if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
      if (block.type === "image") return [block.alt, block.prompt ?? "", block.source];
      return [];
    }),
  ].join("\n");
}
