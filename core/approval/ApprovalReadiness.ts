import type { ContentDocument } from "../content/ContentDocument";
import { serializeStructuredList } from "../content/StructuredText";
import {
  evaluateApprovalPreparationText,
  type ApprovalPreparationIssue,
} from "./ApprovalPolicy";
import {
  activeGeneratedFactualClaims,
  locateGeneratedFactualSurface,
} from "./GeneratedFactualClaimInventory";
import type {
  ApprovalSourceDocumentFormat,
  ApprovalSourceExtractionStatus,
} from "./ApprovalSourceDocumentAdapter";

export const approvalReadinessCheckKeys = [
  "standard_quality",
  "approval_policy",
  "evidence",
  "duplicate",
  "internal_links",
  "site_readiness",
] as const;

/**
 * Version of the approval-readiness inspection contract.
 *
 * A stored inspection result is only comparable with today's rules when it was
 * produced under the same contract version. Bumping this constant invalidates
 * every persisted inspection: the identity key embeds it, so the service
 * re-runs, and `withCurrentApprovalInspectionContract` refuses to keep showing
 * an outdated `passed` verdict in the meantime.
 *
 * This lives in Core because both the Quality engine and the readiness
 * application service must agree on it; neither platform App owns it.
 *
 * 4.1 — the site audit began opening the trust pages it had only been checking
 * for links to. Measured before the bump: an article inspected at 15:16 kept
 * answering with that snapshot at 21:57, fifteen checks and no
 * `trust_page_indexable`, because the site snapshot is one of the artefacts a
 * matching identity key reuses. A gate fix that never reaches an already
 * inspected article is not a fix.
 */
export const approvalReadinessInspectionVersion = "4.1" as const;

/**
 * Checks whose verdict is only as trustworthy as the stored inspection
 * artefact behind it (Evidence pack, duplicate snapshot, public-post catalog,
 * site audit). `standard_quality` and `approval_policy` are recomputed from the
 * manuscript text on every read, so they are never degraded by contract age.
 */
const snapshotBackedCheckKeys: ReadonlySet<string> = new Set([
  "evidence",
  "duplicate",
  "internal_links",
  "site_readiness",
]);

const outdatedInspectionAction = "승인 준비 판정 기준이 갱신되었습니다. 승인 준비 검사를 다시 실행해 현재 기준으로 확인하세요.";

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
  | "empty_content"
  | "malformed_content"
  | "content_too_large"
  | "unsupported_claim"
  | "unofficial_source"
  | "fact_mismatch"
  | "duplicate_source"
  | "excluded";

export type ApprovalEvidenceProvenance =
  | "search_candidate"
  | "citation"
  | "document_link"
  | "user_selected"
  | "system_verified";

export type ApprovalEvidenceStageStatus = "verified" | "failed" | "not_evaluated";

export type ApprovalEvidenceFact = Readonly<{
  field: string;
  value: string;
  excerpt?: string;
  blockId?: string;
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
  provenance?: ApprovalEvidenceProvenance;
  citationExcerpt?: string;
  linkedBlockIds?: readonly string[];
  originalUrl?: string;
  canonicalUrl?: string;
  finalUrl?: string;
  httpStatus?: number;
  contentType?: string;
  documentFormat?: ApprovalSourceDocumentFormat;
  extractionStatus?: ApprovalSourceExtractionStatus;
  extractionReason?: string;
  contentLength?: number;
  official?: boolean;
  selected?: boolean;
  cited?: boolean;
  verificationStatus?: ApprovalEvidenceVerificationStatus;
  accessVerificationStatus?: ApprovalEvidenceStageStatus;
  officialDomainVerificationStatus?: ApprovalEvidenceStageStatus;
  claimVerificationStatus?: ApprovalEvidenceStageStatus;
  failureReason?: string;
  matchedFacts?: readonly ApprovalEvidenceFact[];
  /** D-045: 인정 범위 안의 출처가 실제로 열렸다는 단일 경로만 남는다. */
  trustRoute?: "official_single";
  checkedAt?: string;
  rights?: Readonly<{
    status: "verified" | "unknown" | "restricted";
    note?: string;
  }>;
}>;

export type ApprovalEvidencePack = Readonly<{
  version: "1.0";
  status: "verified" | "needs_review" | "missing" | "not_required";
  reviewedAt?: string;
  reviewedRevisionId?: string;
  informationAsOf?: string;
  coverageStatus?: "verified" | "needs_review" | "missing" | "not_required";
  sourcePolicyCompliance?: "passed" | "failed" | "not_required";
  presentationStatus?: "ready" | "conflict" | "not_projected";
  presentationReasons?: readonly string[];
  requiredFactFields?: readonly string[];
  verifiedFactFields?: readonly string[];
  unverifiedFactFields?: readonly string[];
  sources: readonly ApprovalEvidenceSource[];
}>;

export function createNotRequiredApprovalEvidencePack(): ApprovalEvidencePack {
  return Object.freeze({
    version: "1.0",
    status: "not_required",
    coverageStatus: "not_required",
    sourcePolicyCompliance: "not_required",
    sources: Object.freeze([]),
  });
}

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
    /**
     * D-039: 통과하지 못한 검사에는 사용자가 실제로 할 수 있는 다음 행동을 붙인다.
     * 해결 경로 없는 차단 상태를 만들지 않기 위한 계약이다.
     */
    action?: string;
  }>[];
}>;

export type ApprovalReadinessCheck = Readonly<{
  key: ApprovalReadinessCheckKey;
  status: ApprovalReadinessCheckStatus;
  message: string;
  action?: string;
  applicable?: boolean;
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

export function evaluateApprovalDraftIntegrity(
  document: ContentDocument,
  verificationRequired = true,
): ApprovalDraftIntegrity {
  if (!document.metadata?.approvalPolicy) {
    return Object.freeze({ passed: true, reasons: Object.freeze([]) });
  }
  const evidence = document.metadata.approvalEvidence;
  const issues = evaluateApprovalPreparationText(
    documentText(document),
    document.metadata.approvalPolicy,
    {
      sourceUrls: evidence?.sources
        .filter((source) => source.provenance !== "search_candidate")
        .map((source) => source.canonicalUrl ?? source.url),
      reviewedAt: evidence?.reviewedAt,
      coverageStatus: evidence?.coverageStatus ?? evidence?.status,
      requiredFactFields: evidence?.requiredFactFields,
      verifiedFactFields: evidence?.verifiedFactFields,
      unverifiedFactFields: evidence?.unverifiedFactFields,
      evidenceRequired: verificationRequired,
      timeSensitiveEvidenceRequired: verificationRequired,
    },
  );
  const readiness = evaluateApprovalReadiness(document, issues, true, verificationRequired);
  const requiredKeys = new Set<ApprovalReadinessCheckKey>([
    "approval_policy",
    "duplicate",
    ...(verificationRequired ? ["evidence" as const] : []),
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
  verificationRequired = true,
  supersededQualityReview = false,
  /**
   * The Standard Quality tasks that are currently blocking approval, verbatim.
   *
   * Without them this check could only say "quality was not approved", which is
   * useless exactly when it matters most: a manuscript can score 100 on every
   * scored dimension and still be blocked by a task-level rule, so neither the
   * score nor this card told the user what to fix.
   */
  standardQualityBlockingReasons: readonly string[] = [],
): ApprovalReadinessReport {
  return aggregateApprovalReadinessChecks([
    standardQualityCheck(standardQualityApproved, supersededQualityReview, standardQualityBlockingReasons),
    approvalPolicyCheck(policyIssues),
    evidenceCheck(document, verificationRequired),
    duplicateCheck(document),
    internalLinkCheck(document),
    siteReadinessCheck(document),
  ]);
}

function aggregateApprovalReadinessChecks(
  checks: readonly ApprovalReadinessCheck[],
): ApprovalReadinessReport {
  const applicationReady = checks.every((check) => check.status === "passed");
  const status = applicationReady
    ? "ready"
    : checks.some((check) => check.status === "blocked")
      ? "blocked"
      : "needs_review";
  return Object.freeze({
    status,
    applicationReady,
    checks: Object.freeze([...checks]),
  });
}

/**
 * Refuses to keep presenting a `passed` snapshot verdict that was produced by
 * an outdated inspection contract.
 *
 * Before this, a stored aggregate survived a contract bump untouched, so an
 * article inspected under an older version kept showing that version's answer
 * until somebody happened to press the button again. The stored artefacts are
 * still real evidence, so this never invents a failure: it downgrades only the
 * snapshot-backed `passed` checks to `needs_review` and says what to do. A
 * check that already reports `blocked`, `needs_review`, or `not_evaluated`
 * keeps its own, more specific diagnosis.
 */
export function withCurrentApprovalInspectionContract(
  report: ApprovalReadinessReport,
  document: ContentDocument,
): ApprovalReadinessReport {
  const execution = document.metadata?.approvalReadinessExecution;
  if (!execution || execution.version === approvalReadinessInspectionVersion) return report;
  return aggregateApprovalReadinessChecks(report.checks.map((check) => {
    if (check.applicable === false) return check;
    if (!snapshotBackedCheckKeys.has(check.key) || check.status !== "passed") return check;
    return Object.freeze({
      ...check,
      status: "needs_review" as const,
      action: [check.action, outdatedInspectionAction].filter(Boolean).join(" "),
    });
  }));
}

/**
 * Explains the checks that are empty because the readiness inspection has not
 * run for this manuscript yet.
 *
 * The readiness service deliberately spends no source fetch, public site audit
 * or catalog refresh on a manuscript that has not passed Standard Quality and
 * is about to be rewritten. That is a cost decision, and it used to be
 * expressed by throwing, which showed the user nothing at all. The five other
 * checks keep whatever their own stored snapshots say — Standard Quality must
 * never decide whether Evidence or site readiness "passed" — and only the
 * genuinely unevaluated ones gain the reason they are still empty.
 */
export function withPendingStandardQualityGuidance(
  report: ApprovalReadinessReport,
): ApprovalReadinessReport {
  const pending = "기본 품질 승인을 통과해야 승인 준비 검사가 실행됩니다. 원고 품질 진단을 반영하고 품질 검토를 다시 실행한 뒤 승인 준비 검사를 실행하세요.";
  return aggregateApprovalReadinessChecks(report.checks.map((check) => {
    if (check.key === "standard_quality" || check.status !== "not_evaluated") return check;
    return Object.freeze({
      ...check,
      action: [check.action, pending].filter(Boolean).join(" "),
    });
  }));
}

function standardQualityCheck(
  passed: boolean,
  supersededReview = false,
  blockingReasons: readonly string[] = [],
): ApprovalReadinessCheck {
  if (supersededReview && passed) {
    return Object.freeze({
      key: "standard_quality",
      status: "blocked",
      message: "마지막 품질 검토 이후 원고가 수정되어 현재 문서 버전에는 기본 품질 승인이 없습니다.",
      action: "현재 문서 버전으로 품질 검토를 다시 실행하세요.",
    });
  }
  if (passed) {
    return Object.freeze({ key: "standard_quality", status: "passed", message: "현재 문서 버전이 기본 품질 승인을 통과했습니다." });
  }
  const reasons = [...new Set(blockingReasons.map((reason) => reason.trim()).filter(Boolean))];
  if (supersededReview) {
    return Object.freeze({
      key: "standard_quality",
      status: "blocked",
      message: "마지막 품질 검토 이후 원고가 수정되어 현재 문서 버전의 기본 품질 승인이 없습니다.",
      action: "현재 문서 버전으로 품질 검토를 다시 실행하세요.",
    });
  }
  return Object.freeze({
    key: "standard_quality",
    status: "blocked",
    message: reasons.length
      ? `점수와 별개로 기본 품질 승인을 막고 있는 차단 항목 ${reasons.length}개가 남아 있습니다.`
      : "현재 문서 버전이 기본 품질 승인을 통과하지 못했습니다.",
    action: reasons.length
      ? `${reasons.join(" / ")} 위 항목을 원고에서 해결한 뒤 품질 검토를 다시 실행하세요.`
      : "원고 품질 진단을 반영한 뒤 다시 검토하세요.",
  });
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

function evidenceCheck(
  document: ContentDocument,
  verificationRequired: boolean,
): ApprovalReadinessCheck {
  const pack = document.metadata?.approvalEvidence;
  const verifiedSources = pack?.sources.filter(validVerifiedSource) ?? [];
  if (!verificationRequired) {
    return optionalEvidenceCheck(document);
  }
  if (pack?.presentationStatus === "conflict") {
    return Object.freeze({
      key: "evidence",
      status: "needs_review",
      message: "수동·AI 출처 섹션과 시스템 Evidence projection이 충돌합니다.",
      action: pack.presentationReasons?.join(" ") || "중복 출처 섹션의 소유권을 확인하세요.",
    });
  }
  if (pack?.status === "verified"
    && (pack.coverageStatus === "verified" || pack.coverageStatus === undefined)
    && verifiedSources.length > 0
    ) {
    return Object.freeze({ key: "evidence", status: "passed", message: `인용 범위 안의 공식 출처 ${verifiedSources.length}개가 실제로 열리는 주소인지 확인했습니다.` });
  }
  if (pack?.status === "missing") {
    return Object.freeze({ key: "evidence", status: "blocked", message: "승인 준비 원고에 AI가 참고한 출처 URL이 저장되어 있지 않습니다.", action: "AI가 참고한 출처 URL을 저장하세요." });
  }
  if (pack) {
    return unresolvedEvidenceCheck(pack, verifiedSources.length);
  }
  const text = documentText(document);
  const hasUrl = /https:\/\/[^\s<>)"']+/i.test(text);
  const hasReviewDate = /(?:최종\s*검토일|정보\s*기준일)\s*[:：]?\s*(?:20\d{2}[-./년]\s*\d{1,2}[-./월]\s*\d{1,2}|20\d{2}[-./]\d{1,2})/i.test(text);
  return Object.freeze({
    key: "evidence",
    status: "not_evaluated",
    message: hasUrl || hasReviewDate
      ? "본문에 출처 표시가 있지만 시스템이 확인한 출처 기록이 없습니다."
      : "AI가 참고한 출처 URL 기록이 없습니다.",
    action: "출처 문구만 두지 말고 공식 주소를 출처 기록으로 저장하세요.",
  });
}

/**
 * Reports the Evidence state of a manuscript that has no mandatory Claim.
 *
 * `applicable: false` means "no mandatory Evidence contract applies", not "no
 * source work happened". Measured on the 밝은재테크 corpus, 8 of the 16 approval
 * manuscripts carrying a readiness aggregate land here, and 4 of those 8 store a
 * factual-Claim inventory in which sentences were withdrawn from the published
 * article because their source anchor could not be confirmed. The check used to
 * answer that with one fixed sentence — "mandatory Evidence는 적용되지 않습니다"
 * — which, combined with the card being hidden, meant every trace of the source
 * work the system actually performed was invisible. AGENTS.md ch.14 requires
 * Evidence Verification to be a represented state, so this states what was
 * checked, what was dropped, and what would make Evidence mandatory.
 *
 * A manuscript where nothing was withdrawn stays `passed`: risk-based
 * applicability is a deliberate decision (`resolveApprovalEvidenceRequirement`),
 * and turning a correctly evidence-free manuscript into a blocker would be a
 * threshold change with no measurement behind it.
 *
 * A manuscript where sentences *were* withdrawn does not stay `passed`. The
 * measurement that was missing arrived with the 대출 상환방식 비교 article: 14
 * critical surfaces were withdrawn, every value of its comparison table went
 * with them, and the aggregate still reported `applicationReady: true` on an
 * article whose remaining prose explains figures the reader can no longer see.
 * Reporting "14 sentences were dropped" and "ready to apply" in the same
 * snapshot is the aggregate contradicting itself. It becomes `needs_review`
 * rather than `blocked` because the manuscript violates no policy rule — a
 * person has to decide whether what survived still says what the article
 * promises.
 */
function optionalEvidenceCheck(document: ContentDocument): ApprovalReadinessCheck {
  const record = document.metadata?.generatedFactualClaimInventory;
  const withdrawn = (record?.items ?? []).filter((item) =>
    item.disposition === "removed"
    && locateGeneratedFactualSurface(document, item.surfaceText).length === 0);
  const confirmed = activeGeneratedFactualClaims(record).filter((item) =>
    item.evidenceStatus === "critical_verified" || item.evidenceStatus === "verify_verified");
  const hasConfirmationPath = bodyOffersConfirmationPath(documentText(document));
  const summary = [
    confirmed.length ? `공식 자료로 확인된 사실 ${confirmed.length}개` : "",
    withdrawn.length ? `출처를 확인하지 못해 원고에서 제외된 문장 ${withdrawn.length}개` : "",
    hasConfirmationPath ? "" : "본문에 독자가 원문을 확인할 경로 표시 없음",
  ].filter(Boolean);

  return Object.freeze({
    key: "evidence",
    status: withdrawn.length || !hasConfirmationPath ? "needs_review" : "passed",
    applicable: false,
    message: summary.length
      ? `필수 출처 Claim이 기획에 없어 출처 검증은 실행하지 않았습니다. ${summary.join(" · ")}가 있습니다.`
      : "필수 출처 Claim이 기획에 없어 출처 검증을 실행하지 않았습니다.",
    action: [
      withdrawn.length
        ? `출처를 확인하지 못해 제외된 문장: ${withdrawn.slice(0, 3).map(withdrawnClaimLabel).join(" / ")}${withdrawn.length > 3 ? ` 외 ${withdrawn.length - 3}개` : ""}.`
        : "",
      hasConfirmationPath
        ? ""
        : "원고 본문에 독자가 원문을 확인할 경로를 표시하세요. 발표 기관과 공식 주소가 가장 좋지만, 공식 기관 자료가 없는 주제라면 계약서·상품설명서·약관·공고문처럼 독자가 직접 열어 볼 수 있는 문서를 지목해도 됩니다.",
      "금액·비율·기한·법정 요건처럼 중요한 사실은 기획 단계에서 필수(CRITICAL) Claim으로 등록해 공식 출처를 붙이세요.",
    ].filter(Boolean).join(" "),
  });
}

/**
 * Whether the article tells the reader where to go and check for themselves.
 *
 * The approval content policy requires the body to carry a route back to the
 * original material, and that requirement is not conditional on the article
 * having mandatory Claims — an article can be entirely free of verifiable
 * external facts and still owe the reader a way to confirm what it describes.
 * Nothing measured this before, so the 대출 상환방식 비교 article passed
 * `approval_policy` with no publisher, no address and no named document.
 *
 * This deliberately accepts a named official document — a contract, a product
 * disclosure sheet, a public notice — and not only a URL, because whole topics
 * have no institutional page to link while still having a document the reader
 * can open. It is reported, never counted as verification: AGENTS.md ch.14
 * forbids treating the presence of a source label as Evidence verification, so
 * this only ever lowers the check to `needs_review` and never raises it to
 * `passed`.
 */
function bodyOffersConfirmationPath(text: string): boolean {
  if (/https?:\/\/[^\s<>)"']+/i.test(text)) return true;
  if (/(?:정부24|국세청|금융위원회|금융감독원|보건복지부|고용노동부|국민연금공단|건강보험공단|예금보험공사|한국주택금융공사|주택도시보증공사|은행연합회|여신금융협회|법제처|국가법령정보센터)/u.test(text)) return true;
  return /(?:상품설명서|약관|대출거래약정서|공고문|공식\s*공고|사업\s*공고|신청\s*페이지|상환예정표|계약서)/u.test(text);
}

function withdrawnClaimLabel(item: Readonly<{ statement: string; surfaceText: string }>): string {
  const text = (item.statement || item.surfaceText).replace(/\s+/gu, " ").trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * Names the Claim that is actually missing evidence.
 *
 * A fixed "verify the addresses, publishers, facts and review date" sentence
 * sent the user back over sources that are already verified while saying
 * nothing about the one uncovered Claim recorded in `unverifiedFactFields`.
 * The failing Claim fields and the individually rejected sources are the only
 * work items, so they belong in the action.
 */
function unresolvedEvidenceCheck(
  pack: ApprovalEvidencePack,
  verifiedSourceCount: number,
): ApprovalReadinessCheck {
  const unverifiedFields = pack.unverifiedFactFields ?? [];
  const rejected = pack.sources.filter((source) =>
    source.provenance !== "search_candidate"
    && !source.verified
    && source.verificationStatus !== "excluded");
  const actions = [
    unverifiedFields.length
      ? `출처가 붙지 않은 핵심 Claim ${unverifiedFields.length}개를 확인하세요: ${unverifiedFields.join(", ")}. 해당 Claim을 다루는 공식 출처를 추가하세요.`
      : "",
    rejected.length
      ? `검증에 실패한 출처 ${rejected.length}개를 확인하세요: ${rejected.map(rejectedSourceLabel).join(" / ")}.`
      : "",
  ].filter(Boolean);
  return Object.freeze({
    key: "evidence",
    status: "needs_review",
    message: `출처 ${verifiedSourceCount}개를 확인했지만 도달을 확인하지 못한 출처가 남아 있습니다.`,
    action: actions.join(" ") || "출처 URL과 페이지 내용이 원고의 핵심 Claim을 뒷받침하는지 검증하세요.",
  });
}

function rejectedSourceLabel(source: ApprovalEvidenceSource): string {
  const reason = source.failureReason?.trim() || source.verificationStatus || "검증 미완료";
  return `${source.publisher?.trim() || source.title?.trim() || source.url} (${reason})`;
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

  if (status === "catalog_unavailable") {
    return Object.freeze({ key: "internal_links", status: "blocked", message: "공개 글 목록을 불러오지 못해 내부 링크를 평가하지 못했습니다.", action: "발행 플랫폼 연결과 공개 글 동기화 상태를 확인해 주세요." });
  }
  if ((status === "evaluated" || status === "category_missing") && candidates === 0) {
    return Object.freeze({ key: "internal_links", status: "passed", message: "연결할 수 있는 기존 공개 글 후보가 없어 내부 링크를 강제하지 않았습니다." });
  }
  if (status === "category_missing") {
    return Object.freeze({ key: "internal_links", status: "blocked", message: "발행 카테고리가 없어 내부 링크 후보를 평가하지 못했습니다.", action: "실제 발행 카테고리를 선택한 뒤 공개 글 후보를 다시 불러오세요." });
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
      && source.claimVerificationStatus !== "failed"
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
      if (block.type === "list") return [serializeStructuredList(block)];
      if (block.type === "button") return [block.label, block.targetUrl];
      if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
      if (block.type === "image") return [block.alt, block.prompt ?? "", block.source];
      return [];
    }),
  ].join("\n");
}
