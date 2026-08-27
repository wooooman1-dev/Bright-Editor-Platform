import {
  approvalOfficialDomains,
  approvalSourcePreflightClaimMatchesPage,
  canonicalizeApprovalEvidenceUrl,
  evaluateApprovalSourceAuthority,
  evaluateApprovalSourcePreflightCoverage,
  evaluateExplicitApprovalSourcePreflightCoverage,
  approvalSourceScriptRenderedView,
  evaluateApprovalSourceUrlSafety,
  officialSourceAllowed,
  createApprovalSourcePreflightDiagnostic,
  evaluateApprovalSourceRelevance,
  requiredApprovalSourcePreflightClaims,
  type ApprovalPolicySnapshot,
  type ApprovalSourcePage,
  type ApprovalSourcePreflightClaim,
  type ApprovalSourcePreflightCoverageResult,
  type ApprovalSourcePreflightRequirement,
  type SiteApprovalReadinessFetch,
  type ApprovalSourcePreflightDiagnostic,
} from "../approval";
import { normalizeApprovalSourceDocumentServer } from "../approval/ApprovalSourceDocumentServerAdapter";
import { evidenceExcerptAnchored } from "../approval/ApprovalEvidenceAnchor";
import { scopeApprovalSourcePreflightRequirements } from "../approval/ApprovalSourcePreflightClaimScope";
import { assessmentsFromExplicitDiscovery, createVerificationSnapshot, type ExplicitDiscoveredSource } from "../approval/ExplicitVerificationPreflight";
import {
  createVerificationGenerationClaimSources,
  groupVerificationGenerationClaimEvidence,
  type VerificationGenerationClaimSourceProjection,
} from "../approval/VerificationGenerationEvidence";
import { hasUsableContentOpportunityVerificationPlan, type ConfirmedContentOpportunity } from "../content";
import { isCriticalVerificationClaim } from "../approval/VerificationClaim";
import { AIProviderError, type AIProvider, type AIResponse, type AIWebSource } from "./AIProvider";

export const approvalSourcePreflightTask = "approval-source-preflight";
/**
 * A source may support several Claims, but the Provider must not serialize an
 * unbounded Claim matrix into one response. Coverage remains Claim-ID based;
 * this is only an output-size ceiling.
 */
export const approvalSourcePreflightMaximumClaimsPerSource = 12;

export type ApprovalSourcePreflightClaimSource = Readonly<{
  url: string;
  /** Legacy compatibility projection for Approval Evidence metadata only. */
  claims: readonly ApprovalSourcePreflightClaim[];
  /** Canonical Claim-ID-owned explicit Generation evidence. */
  verificationClaims?: readonly VerificationGenerationClaimSourceProjection[];
}>;

export type ApprovalSourcePreflightResult = Readonly<{
  sources: readonly AIWebSource[];
  claimSources: readonly ApprovalSourcePreflightClaimSource[];
  coverage: ApprovalSourcePreflightCoverageResult;
  diagnostics?: AIResponse["diagnostics"];
  verificationSnapshot?: import("../approval").VerificationSnapshot;
  sourcePolicyCompliance?: "passed" | "failed" | "not_required";
}>;

export class ApprovalSourcePreflightError extends Error {
  readonly code = "APPROVAL_SOURCE_NOT_READY";
  readonly diagnostic?: ApprovalSourcePreflightDiagnostic;

  constructor(
    message: string,
    diagnostic?: ApprovalSourcePreflightDiagnostic,
    readonly providerDiagnostics?: AIResponse["diagnostics"],
  ) {
    super(message);
    this.name = "ApprovalSourcePreflightError";
    this.diagnostic = diagnostic;
  }
}

export type ApprovalSourceRejectionNote = Readonly<{
  url: string;
  rejectionCode: string;
  /** What the server's own extraction actually read from that page. */
  extractedSample?: string;
}>;

export type ApprovalSourceClaimGapNote = Readonly<{
  claimId: string;
  /** The Claim's own field name, so discovery is told what to look for, not just an opaque ID. */
  field: string;
}>;

export async function runApprovalSourcePreflight(input: Readonly<{
  provider: AIProvider;
  snapshot: ApprovalPolicySnapshot;
  opportunity: ConfirmedContentOpportunity;
  platform: string;
  contentType: string;
  fetcher?: SiteApprovalReadinessFetch;
  /** Candidates a previous attempt already had rejected, fed back into discovery. */
  rejectedSourceFeedback?: readonly ApprovalSourceRejectionNote[];
  /** Claims a previous attempt left without any source at all, fed back into discovery. */
  uncoveredClaimFeedback?: readonly ApprovalSourceClaimGapNote[];
}>): Promise<ApprovalSourcePreflightResult> {
  if (hasUsableContentOpportunityVerificationPlan(input.opportunity.verificationPlan)) {
    if (input.opportunity.verificationPlan.claims.some(isCriticalVerificationClaim)) return runExplicitPreflightWithRetry(input);
    return notRequiredExplicitPreflight(input);
  }
  const contract = input.opportunity.requiredEvidenceContract;
  const profileSourceRequirementApplicable = contract?.profileSourceRequirementApplicable === true;
  const requiredClaims = scopeApprovalSourcePreflightRequirements(
    input.opportunity,
    contract?.requiredClaims
      ?? requiredApprovalSourcePreflightClaims(input.opportunity, input.snapshot.profileId),
  );
  if (profileSourceRequirementApplicable && !requiredClaims.length) {
    throw new ApprovalSourcePreflightError(
      "Planning에서 공식 출처로 검증할 구조화 Claim이 없어 원고 생성을 시작하지 않았습니다.",
      createPreflightDiagnostic(input, {
        rejectionCode: "planning_contract_missing",
        rejectionStage: "contract",
      }),
    );
  }
  if (!requiredClaims.length && !profileSourceRequirementApplicable) {
    const coverage = evaluateApprovalSourcePreflightCoverage({
      profileId: input.snapshot.profileId,
      opportunity: input.opportunity,
      requiredClaims,
      sources: [],
    });
    return Object.freeze({
      sources: Object.freeze([]),
      claimSources: Object.freeze([]),
      coverage,
      sourcePolicyCompliance: "not_required",
    });
  }

  const response = await input.provider.generate({
    instruction: approvalSourceDiscoveryInstruction(
      input.snapshot,
      input.opportunity,
      requiredClaims,
    ),
    metadata: {
      task: approvalSourcePreflightTask,
      approvalPurpose: input.snapshot.contentPurpose,
      approvalProfileId: input.snapshot.profileId,
      approvalPolicyVersion: input.snapshot.policyVersion,
      platform: input.platform,
      contentType: input.contentType,
    },
  });

  let discovered: ReturnType<typeof parseDiscoveredSources>;
  try {
    discovered = parseDiscoveredSources(response.content);
  } catch (error) {
    throw AIProviderError.parse({
      stage: "source_preflight",
      message: error instanceof Error ? error.message : "Source Preflight response could not be parsed.",
      diagnostic: response.diagnostics,
    });
  }
  const observedUrls = new Set((response.diagnostics?.webSources ?? [])
    .map((source) => canonicalizeApprovalEvidenceUrl(source.url)));
  const eligible = discovered.filter((source) => observedUrls.has(source.url));
  if (!eligible.length) {
    throw new ApprovalSourcePreflightError(
      "공식 출처 사전검증을 중단했습니다. 웹 검색 도구가 실제로 확인한 직접 출처 URL이 없습니다.",
    );
  }

  const fetcher = input.fetcher ?? fetch;
  const pages = await fetchPreflightPages(
    eligible.map((source) => source.url),
    fetcher,
  );
  const pageByRequestedUrl = new Map(pages.map((page) => [
    canonicalizeApprovalEvidenceUrl(page.requestedUrl),
    page,
  ]));
  const rejected: string[] = [];
  const accepted: AcceptedPreflightSource[] = [];

  for (const source of eligible) {
    const page = pageByRequestedUrl.get(source.url);
    const rejection = page
      ? preflightPageRejection(
        input.snapshot,
        page,
        source.evidenceExcerpt,
        input.opportunity,
        sourceRelevanceScope(input.opportunity, source.claims),
      )
      : "출처 응답을 확인하지 못했습니다.";
    if (rejection) {
      rejected.push(`${source.url}: ${rejection}`);
      continue;
    }

    const finalUrl = canonicalizeApprovalEvidenceUrl(page!.finalUrl || source.url);
    accepted.push(Object.freeze({
      source,
      page: Object.freeze({ ...page!, finalUrl }),
      finalUrl,
    }));
  }

  const uniqueAccepted = [...new Map(
    accepted.map((item) => [item.finalUrl, item]),
  ).values()];
  if (!uniqueAccepted.length) {
    const detail = rejected.slice(0, 4).join(" | ");
    const relevanceFailure = eligible
      .map((source) => ({ source, page: pageByRequestedUrl.get(source.url) }))
      .filter((item): item is { source: DiscoveredSource; page: ApprovalSourcePage } => Boolean(item.page))
      .map(({ source, page }) => evaluateApprovalSourceRelevance({
        profileId: input.snapshot.profileId,
        opportunity: input.opportunity,
        page,
        additionalScope: sourceRelevanceScope(input.opportunity, source.claims),
      }))
      .find((result) => result.status === "rejected");
    const diagnostic = createPreflightDiagnostic(input, {
      canonicalSourceUrl: eligible[0]?.url,
      sourceTitle: eligible[0]?.title,
      evidenceExcerpt: eligible[0]?.evidenceExcerpt,
      rejectionCode: relevanceFailure?.diagnosticCode ?? "all_sources_rejected",
      rejectionStage: relevanceFailure ? "relevance" : "source",
      sourcePolicyCompliance: "failed",
      ...(relevanceFailure ? {
        relevanceStatus: "rejected" as const,
        matchedSignals: relevanceFailure.matchedSignals,
      } : {}),
      ...preflightDiagnosticMetadata(response),
    });
    if (diagnostic) {
      throw new ApprovalSourcePreflightError(
        `사용 가능한 공식 출처를 확보하지 못해 원고 생성을 시작하지 않았습니다.${detail ? ` ${detail}` : ""}`,
        diagnostic,
      );
    }
    throw new ApprovalSourcePreflightError(
      `사용 가능한 공식 출처를 확보하지 못해 원고 생성을 시작하지 않았습니다.${detail ? ` ${detail}` : ""}`,
    );
  }

  const coverage = evaluateApprovalSourcePreflightCoverage({
    profileId: input.snapshot.profileId,
    opportunity: input.opportunity,
    requiredClaims,
    sources: uniqueAccepted.map((item) => Object.freeze({
      page: item.page,
      claims: item.source.claims,
    })),
  });
  if (coverage.status === "incomplete") {
    const diagnostic = createPreflightDiagnostic(input, {
      requiredClaimId: coverage.uncoveredClaimIds?.[0] ?? coverage.uncoveredClaimFields[0],
      rejectionCode: "coverage_incomplete",
      rejectionStage: "coverage",
      coverageStatus: coverage.status,
      sourcePolicyCompliance: "passed",
    });
    if (diagnostic) {
      throw new ApprovalSourcePreflightError(
        `필수 사실 근거가 완전히 검증되지 않아 원고 생성을 시작하지 않았습니다. 미확보 Claim: ${coverage.uncoveredClaimFields.join(", ")}`,
        diagnostic,
      );
    }
    throw new ApprovalSourcePreflightError(
      `필수 사실 근거가 완전히 검증되지 않아 원고 생성을 시작하지 않았습니다. 미확보 Claim: ${coverage.uncoveredClaimFields.join(", ")}`,
    );
  }

  const requirementsByField = new Map(
    requiredClaims.map((requirement) => [requirement.field, requirement]),
  );
  const claimSources = uniqueAccepted.map((item) => Object.freeze({
    url: item.finalUrl,
    claims: Object.freeze(uniqueClaims(item.source.claims.filter((claim) => {
      const requirement = requirementsByField.get(claim.field);
      return Boolean(
        requirement
        && approvalSourcePreflightClaimMatchesPage(
          item.page,
          requirement,
          claim,
        )
      );
    }))),
  }));
  const sources = uniqueAccepted.map((item) => Object.freeze({
    url: item.finalUrl,
    title: item.page.title.trim()
      || item.source.title
      || sourcePublisher(item.finalUrl),
    excerpt: normalizeExcerpt(item.source.evidenceExcerpt),
    provenance: "citation" as const,
  }));

  return Object.freeze({
    sources: Object.freeze(sources),
    claimSources: Object.freeze(claimSources),
    coverage,
    sourcePolicyCompliance: "passed",
    ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
  });
}

function notRequiredExplicitPreflight(input: Readonly<Parameters<typeof runApprovalSourcePreflight>[0]>): ApprovalSourcePreflightResult {
  const plan = input.opportunity.verificationPlan!;
  return Object.freeze({
    sources: Object.freeze([]),
    claimSources: Object.freeze([]),
    coverage: evaluateApprovalSourcePreflightCoverage({
      profileId: input.snapshot.profileId,
      opportunity: input.opportunity,
      requiredClaims: [],
      sources: [],
    }),
    verificationSnapshot: createVerificationSnapshot({ plan, assessments: [] }),
    sourcePolicyCompliance: "not_required",
  });
}

/**
 * One rejected candidate must not be terminal.
 *
 * Discovery is a single provider call, so when the model submits one page and
 * the server rejects it, the whole article stops even though the server knows
 * exactly why. It is not a lottery that a retry would win: a 휴면예금 조회 방법
 * article was blocked twice in a row on the identical URL — a 금융위원회
 * 카드뉴스 홍보자료 page whose body is images, so the verbatim quote the model
 * read off those images could never appear in the text the server extracts, and
 * `evidence_anchor_unverified` was guaranteed before the fetch began. The
 * excerpt even named the administering body's own site, which was never
 * submitted, and the model declared 1 source out of 17 web results both times.
 *
 * Discovery is therefore given one more attempt, told which URLs were rejected
 * and under which code. Nothing about acceptance is relaxed — the second
 * attempt passes the same gates — so this buys a different candidate rather
 * than a lower bar. Two attempts, because a model that cannot avoid a named
 * rejected URL on its second try is not going to find a source on its third.
 */
const explicitDiscoveryMaximumAttempts = 2;

async function runExplicitPreflightWithRetry(
  input: Readonly<Parameters<typeof runApprovalSourcePreflight>[0]>,
): Promise<ApprovalSourcePreflightResult> {
  let attemptInput = input;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runExplicitPreflight(attemptInput);
    } catch (error) {
      const retryable = attempt < explicitDiscoveryMaximumAttempts;
      const rejected = retryable ? retryableSourceRejections(error) : [];
      const namedGaps = retryable ? uncoveredClaimGaps(error, attemptInput.opportunity) : [];
      const uncovered = namedGaps.length
        ? namedGaps
        : retryable ? emptyDeclarationClaimGaps(error, attemptInput.opportunity) : [];
      if (!rejected.length && !uncovered.length) throw error;
      attemptInput = Object.freeze({
        ...attemptInput,
        rejectedSourceFeedback: Object.freeze([
          ...(attemptInput.rejectedSourceFeedback ?? []),
          ...rejected,
        ]),
        uncoveredClaimFeedback: Object.freeze([
          ...(attemptInput.uncoveredClaimFeedback ?? []),
          ...uncovered,
        ]),
      });
    }
  }
}

/**
 * Only a rejection that names a page can be fed back. A contract or planning
 * failure carries no samples, so it falls through and throws unchanged.
 */
function retryableSourceRejections(error: unknown): readonly ApprovalSourceRejectionNote[] {
  if (!(error instanceof ApprovalSourcePreflightError)) return [];
  return Object.freeze((error.diagnostic?.rejectionSamples ?? []).flatMap((sample) =>
    sample.url && sample.rejectionCode
      ? [Object.freeze({
        url: sample.url,
        rejectionCode: sample.rejectionCode,
        ...(sample.extractedSample ? { extractedSample: sample.extractedSample } : {}),
      })]
      : []));
}

/**
 * A Claim that never had a source submitted is invisible to rejection feedback:
 * there is no URL to name, so the retry hears only "avoid these pages" and repeats
 * the search that already missed it. 피부양자 자격 요건 was blocked exactly this
 * way — discovery stayed inside law.go.kr 조문정보 across both attempts while the
 * administering body's own page carried the requirement in 11,250 characters of
 * plain HTML that a single GET returns. Naming the uncovered Claim is what lets
 * the second attempt look somewhere else. Nothing about acceptance is relaxed.
 */
/**
 * 제출이 0건인 실패는 재시도에서 통째로 빠져 있었다. 이름 붙일 URL이 없어
 * rejectionSamples 가 비고, 커버리지 단계까지 가지 못해 missingClaimIds 도 없어
 * 두 피드백 통로가 동시에 비기 때문이다. 2026-08-26 실측: 통신비 미환급액 원고가
 * 웹 검색 4회로 44건을 받고도 sources 를 하나도 선언하지 않은 채 1회 만에 막혔다
 * (official_source_missing, assistantDeclaredSourceCount 0).
 *
 * 아무것도 제출되지 않았다면 아직 근거가 없는 것은 CRITICAL Claim 전부다. 그대로
 * 이름을 붙여 넘기면 2차 시도는 "이 Claim들은 근거가 없다"를 듣고 이미 빗나간
 * 검색 밖을 보게 된다. 승인 기준은 그대로다 — 2차 시도도 같은 관문을 지난다.
 *
 * assistantDeclaredSourceCount 는 응답을 파싱한 뒤에만 기록되므로, 계약·기획
 * 단계에서 Provider 호출 전에 막힌 실패는 값이 없어 여기 걸리지 않는다.
 */
function emptyDeclarationClaimGaps(
  error: unknown,
  opportunity: ConfirmedContentOpportunity,
): readonly ApprovalSourceClaimGapNote[] {
  if (!(error instanceof ApprovalSourcePreflightError)) return [];
  if (error.diagnostic?.assistantDeclaredSourceCount !== 0) return [];
  return Object.freeze((opportunity.verificationPlan?.claims ?? [])
    .filter(isCriticalVerificationClaim)
    .map((claim) => Object.freeze({ claimId: claim.claimId, field: claim.field })));
}

function uncoveredClaimGaps(
  error: unknown,
  opportunity: ConfirmedContentOpportunity,
): readonly ApprovalSourceClaimGapNote[] {
  if (!(error instanceof ApprovalSourcePreflightError)) return [];
  const missing = error.diagnostic?.missingClaimIds ?? [];
  if (!missing.length) return [];
  const fieldByClaimId = new Map(
    (opportunity.verificationPlan?.claims ?? []).map((claim) => [claim.claimId, claim.field]),
  );
  return Object.freeze(missing.map((claimId) => Object.freeze({
    claimId,
    field: fieldByClaimId.get(claimId) ?? claimId,
  })));
}

async function runExplicitPreflight(input: Readonly<Parameters<typeof runApprovalSourcePreflight>[0]>): Promise<ApprovalSourcePreflightResult> {
  const plan = input.opportunity.verificationPlan!;
  const contract = input.opportunity.requiredEvidenceContract;
  const profileSourceRequirementApplicable = contract?.profileSourceRequirementApplicable === true;
  const profileRequiredClaims = scopeApprovalSourcePreflightRequirements(
    input.opportunity,
    contract?.requiredClaims
      ?? requiredApprovalSourcePreflightClaims(input.opportunity, input.snapshot.profileId),
  );
  if (profileSourceRequirementApplicable && !profileRequiredClaims.length) {
    throw new ApprovalSourcePreflightError(
      "Planning에서 공식 출처로 검증할 구조화 Claim을 만들지 못해 원고 생성을 시작할 수 없습니다.",
      createPreflightDiagnostic(input, {
        rejectionCode: "planning_contract_missing",
        rejectionStage: "contract",
      }),
    );
  }
  const response = await input.provider.generate({
    instruction: explicitPreflightInstruction(input.snapshot, input.opportunity, input.rejectedSourceFeedback, input.uncoveredClaimFeedback),
    metadata: {
      task: approvalSourcePreflightTask,
      verificationMode: "explicit",
      approvalPurpose: input.snapshot.contentPurpose,
      approvalProfileId: input.snapshot.profileId,
      approvalPolicyVersion: input.snapshot.policyVersion,
      platform: input.platform,
      contentType: input.contentType,
    },
  });
  let parsedSources: ReturnType<typeof parseExplicitSources>;
  try {
    parsedSources = parseExplicitSources(
      response.content,
      new Set(plan.claims.filter(isCriticalVerificationClaim).map((claim) => claim.claimId)),
    );
  } catch (error) {
    throw AIProviderError.parse({
      stage: "source_preflight",
      message: error instanceof Error ? error.message : "Source Preflight response could not be parsed.",
      diagnostic: response.diagnostics,
    });
  }
  const discovered = parsedSources.sources;
  const pipelineMetrics: SourcePipelineMetrics = {
    ...parsedSources.metrics,
    officialnessEvaluatedCount: 0,
    officialnessPassCount: 0,
    policyRetainedCount: 0,
    relevanceEvaluatedCount: 0,
    relevancePassCount: 0,
    fetchAttemptedCount: 0,
    fetchSucceededCount: 0,
    extractionAttemptedCount: 0,
    extractionSucceededCount: 0,
    evidenceAnchorEvaluatedCount: 0,
    evidenceAnchorPassCount: 0,
    semanticVerificationEvaluatedCount: 0,
    semanticVerificationPassCount: 0,
  };
  const linkageFailureSources = discovered.filter((source) =>
    source.diagnostics?.includes("source_claim_linkage_missing")
    || source.diagnostics?.includes("source_claim_id_unknown"),
  );
  if (linkageFailureSources.length) {
    const linkageCode = linkageFailureSources.some((source) =>
      source.diagnostics?.includes("source_claim_id_unknown"),
    )
      ? "source_claim_id_unknown"
      : "source_claim_linkage_missing";
    const linkageDiagnostic = createPreflightDiagnostic(input, {
      rejectionCode: linkageCode,
      rejectionStage: "contract",
      requiredClaimIds: Object.freeze(plan.claims.map((claim) => claim.claimId)),
      coveredClaimIds: Object.freeze([]),
      missingClaimIds: Object.freeze(plan.claims.map((claim) => claim.claimId)),
      coverageStatus: "incomplete",
      sourcePolicyCompliance: "failed",
      coverageSources: Object.freeze(linkageFailureSources.slice(0, 6).map((source) => Object.freeze({
        url: source.requestedUrl,
        ...(source.title ? { title: source.title } : {}),
        supportingClaimIds: Object.freeze(source.claims.map((claim) => claim.claimId)),
        rejectedClaimIds: Object.freeze(plan.claims.map((claim) => claim.claimId)),
        officialness: "unknown" as const,
        relevance: "unknown" as const,
        anchor: "unknown" as const,
        semantic: "unknown" as const,
        ...(source.evidenceExcerpt ? { evidenceExcerpt: source.evidenceExcerpt } : {}),
      }))),
      ...preflightDiagnosticMetadata(response),
      ...preflightPipelineMetadata(response, pipelineMetrics),
    });
    throw new ApprovalSourcePreflightError(
      "Source evidence Claim linkage did not satisfy the canonical required Claim contract.",
      linkageDiagnostic,
      response.diagnostics,
    );
  }
  const observed = new Set((response.diagnostics?.webSources ?? [])
    .map((source) => canonicalizeApprovalEvidenceUrl(source.url)));
  const eligible = discovered.filter((source) => !observed.size || observed.has(source.requestedUrl));
  pipelineMetrics.fetchAttemptedCount = eligible.length;
  const pages = await fetchPreflightPages(
    eligible.map((source) => source.requestedUrl),
    input.fetcher ?? fetch,
  );
  const byUrl = new Map(pages.map((page) => [
    canonicalizeApprovalEvidenceUrl(page.requestedUrl),
    page,
  ]));
  const accepted: ExplicitDiscoveredSource[] = [];
  for (const source of eligible) {
    const page = byUrl.get(source.requestedUrl);
    if (page && !page.fetchError && page.status >= 200 && page.status < 400) {
      pipelineMetrics.fetchSucceededCount += 1;
      pipelineMetrics.extractionAttemptedCount += 1;
    }
    if (page?.extractionStatus === "extracted") pipelineMetrics.extractionSucceededCount += 1;
    if (!page || page.fetchError) {
      if (pipelineMetrics.rejectionSamples.length < 3) pipelineMetrics.rejectionSamples.push(Object.freeze({
        url: source.requestedUrl,
        canonicalUrl: source.requestedUrl,
        title: source.title,
        ...(page ? { status: page.status, contentType: page.contentType, documentFormat: page.documentFormat, extractionStatus: page.extractionStatus } : {}),
        rejectionStage: "evidence",
        rejectionCode: "source_fetch_failed",
        reason: page?.fetchError ?? "source page was not returned",
      }));
      accepted.push({
        ...source,
        role: "independentCorroborating",
        authoritative: false,
        diagnostics: ["source_fetch_failed"],
      });
      continue;
    }
    if (page.extractionStatus !== "extracted") {
      if (pipelineMetrics.rejectionSamples.length < 3) pipelineMetrics.rejectionSamples.push(Object.freeze({
        url: source.requestedUrl,
        canonicalUrl: page.finalUrl,
        title: source.title,
        status: page.status,
        contentType: page.contentType,
        documentFormat: page.documentFormat,
        extractionStatus: page.extractionStatus,
        rejectionStage: "evidence",
        rejectionCode: "source_document_extraction_failed",
        reason: page.extractionReason ?? "source document was not extracted",
      }));
      accepted.push({
        ...source,
        finalUrl: page.finalUrl,
        pageText: page.text,
        role: "independentCorroborating",
        authoritative: false,
        fresh: false,
        diagnostics: ["source_document_extraction_failed"],
      });
      continue;
    }
    pipelineMetrics.officialnessEvaluatedCount += 1;
    const authorityClaims = explicitSourceAuthorityClaims(plan.claims, source.claims);
    const authority = evaluateApprovalSourceAuthority({
      profileId: input.snapshot.profileId,
      page,
      claims: authorityClaims,
    });
    const official = authority.status === "passed";
    if (official) pipelineMetrics.officialnessPassCount += 1;
    if (!official && pipelineMetrics.rejectionSamples.length < 3) pipelineMetrics.rejectionSamples.push(Object.freeze({
      url: source.requestedUrl,
      canonicalUrl: page.finalUrl,
      hostname: (() => { try { return new URL(page.finalUrl).hostname; } catch { return undefined; } })(),
      title: source.title,
      rejectionStage: "officialness",
      rejectionCode: authority.diagnosticCode ?? "official_source_rejected",
      reason: authority.diagnosticCode ?? "Claim-context source authority rejected the page",
    }));
    if (official) {
      pipelineMetrics.relevanceEvaluatedCount += 1;
      if (evaluateApprovalSourceRelevance({
        profileId: input.snapshot.profileId,
        opportunity: input.opportunity,
        page,
        additionalScope: sourceRelevanceScope(input.opportunity, source.claims),
        ...(authority.authorityKinds.includes("entity_product")
          ? { minimumClaimCoverage: 0.5 }
          : {}),
      }).status === "passed") pipelineMetrics.relevancePassCount += 1;
      else if (pipelineMetrics.rejectionSamples.length < 3) pipelineMetrics.rejectionSamples.push(Object.freeze({
        url: source.requestedUrl,
        canonicalUrl: page.finalUrl,
        title: source.title,
        rejectionStage: "relevance",
        rejectionCode: "source_topic_relevance_unverified",
        reason: "Claim/source relevance verifier rejected the page",
      }));
    }
    pipelineMetrics.evidenceAnchorEvaluatedCount += 1;
    if (evidenceExcerptMatches(page.text, source.evidenceExcerpt)) pipelineMetrics.evidenceAnchorPassCount += 1;
    const rejection = preflightPageRejection(
      input.snapshot,
      page,
      source.evidenceExcerpt,
      input.opportunity,
      sourceRelevanceScope(input.opportunity, source.claims),
      authorityClaims,
    );
    if (rejection) {
      if (pipelineMetrics.rejectionSamples.length < 3) pipelineMetrics.rejectionSamples.push(Object.freeze({
        url: source.requestedUrl,
        canonicalUrl: page.finalUrl,
        title: source.title,
        status: page.status,
        contentType: page.contentType,
        documentFormat: page.documentFormat,
        extractionStatus: page.extractionStatus,
        rejectionStage: rejection.includes("relevance") ? "relevance" : "evidence",
        rejectionCode: rejection,
        reason: rejection,
        ...(page.text ? { extractedSample: page.text.replace(/\s+/g, " ").trim().slice(0, 300) } : {}),
      }));
      accepted.push({
        ...source,
        finalUrl: page.finalUrl,
        pageText: page.text,
        role: "independentCorroborating",
        authoritative: false,
        fresh: false,
        diagnostics: [rejection],
      });
      continue;
    }
    accepted.push({
      ...source,
      finalUrl: page.finalUrl,
      pageText: page.text,
      publisherId: page.publisher,
      authoritative: official,
      diagnostics: [],
    });
  }
  const orderedAccepted = [...accepted].sort((left, right) =>
    (left.finalUrl ?? left.requestedUrl).localeCompare(
      right.finalUrl ?? right.requestedUrl,
    ),
  );
  const classifiedAccepted = orderedAccepted.map((source) => Object.freeze({
    ...source,
    // Authority is Claim-owned. Every accepted authoritative source is the
    // primary official source for the Claim IDs attached to that source; array
    // order must never demote another Claim's only authority.
    role: source.authoritative && source.diagnostics?.length === 0
      ? "primaryOfficial" as const
      : "independentCorroborating" as const,
  }));
  pipelineMetrics.policyRetainedCount = classifiedAccepted.filter((source) =>
    source.authoritative === true && source.diagnostics?.length === 0).length;
  const assessments = assessmentsFromExplicitDiscovery({
    claims: plan.claims,
    sources: classifiedAccepted,
  });
  const semanticSources = classifiedAccepted.filter((source) =>
    source.diagnostics?.length === 0,
  );
  const semanticAssessments = assessmentsFromExplicitDiscovery({
    claims: plan.claims,
    sources: semanticSources,
  });
  const results = plan.claims.map((claim) => {
    const claimAssessments = assessments.filter((assessment) =>
      assessment.diagnostics.includes(`claim:${claim.claimId}`));
    const usable = claimAssessments.filter((assessment) =>
      assessment.supports && assessment.normalizedValue);
    return {
      claimId: claim.claimId,
      ...(usable[0]?.normalizedValue
        ? { normalizedValue: usable[0].normalizedValue }
        : {}),
      sourceAssessments: claimAssessments,
      unresolvedConflict: false,
      freshnessPassed: usable.length > 0
        && usable.every((assessment) => assessment.fresh),
      diagnostics: claimAssessments.flatMap((assessment) =>
        assessment.diagnostics.filter((diagnostic) =>
          !diagnostic.startsWith("claim:"))),
    };
  });
  const verificationSnapshot = createVerificationSnapshot({
    plan,
    assessments,
    results,
  });
  pipelineMetrics.semanticVerificationEvaluatedCount = semanticAssessments.length;
  pipelineMetrics.semanticVerificationPassCount = semanticAssessments.filter((assessment) => assessment.supports).length;
  for (const assessment of semanticAssessments.filter((item) => !item.supports)) {
    if (pipelineMetrics.rejectionSamples.length >= 3) break;
    const claimDiagnostic = assessment.diagnostics.find((item) => item.startsWith("claim:"));
    const rejectionCode = assessment.diagnostics.find((item) => !item.startsWith("claim:"))
      ?? "semantic_verification_failed";
    pipelineMetrics.rejectionSamples.push(Object.freeze({
      ...(assessment.canonicalUrl ? { url: assessment.canonicalUrl, canonicalUrl: assessment.canonicalUrl } : {}),
      ...(claimDiagnostic ? { claimId: claimDiagnostic.slice("claim:".length) } : {}),
      rejectionStage: "coverage",
      rejectionCode,
      reason: rejectionCode,
    }));
  }
  const claimSources = explicitClaimSources(
    plan.claims,
    classifiedAccepted,
    verificationSnapshot,
  );
  /**
   * 통과 조건은 인정 범위 안의 출처가 실제로 열렸는가이다 (D-045).
   *
   * 여기는 생성 앞단이라 D-045 로 걷어낸 것과 같은 관문이 그대로 남아 있었다.
   * 주제 적합성·앵커·의미 검증을 모두 통과한 출처가 하나도 없으면 생성 자체를
   * 시작하지 못했다. 2026-08-19 실측: "전월세 신고 대상 확인 방법" 이 여기서
   * 막혀 원고가 만들어지지 않았고, 진단도 저장되지 않아 이유를 볼 수 없었다.
   *
   * 가져오지 못한 출처(fetch·추출 실패)는 여전히 쓸 수 없다. 그건 범위 문제가
   * 아니라 그 페이지가 존재하지 않는다는 뜻이다.
   */
  const reachableAuthoritative = classifiedAccepted.filter((source) =>
    source.authoritative === true
    && !source.diagnostics?.includes("source_fetch_failed")
    && !source.diagnostics?.includes("source_document_extraction_failed"));
  if (profileSourceRequirementApplicable && !reachableAuthoritative.length) {
    const relevanceFailure = classifiedAccepted.find((source) =>
      source.diagnostics?.includes("source_topic_relevance_unverified"));
    const anchorFailure = classifiedAccepted.find((source) =>
      source.diagnostics?.includes("evidence_anchor_unverified"));
    const evidenceFailure = classifiedAccepted.find((source) =>
      source.diagnostics?.includes("source_document_extraction_failed")
      || source.diagnostics?.includes("source_fetch_failed"));
    const semanticFailure = classifiedAccepted.find((source) =>
      source.diagnostics?.includes("semantic_verification_failed"));
    const rejectionCode = pipelineMetrics.relevancePassCount > 0
      && pipelineMetrics.evidenceAnchorPassCount === 0
      ? "evidence_anchor_unverified"
      : pipelineMetrics.evidenceAnchorPassCount > 0
        && pipelineMetrics.semanticVerificationPassCount === 0
        ? "semantic_verification_failed"
        : relevanceFailure && pipelineMetrics.relevancePassCount === 0
          ? "source_topic_relevance_unverified"
          : semanticFailure
            ? "semantic_verification_failed"
            : anchorFailure
              ? "evidence_anchor_unverified"
              : evidenceFailure?.diagnostics?.includes("source_document_extraction_failed")
                ? "source_document_extraction_failed"
                : evidenceFailure?.diagnostics?.includes("source_fetch_failed")
                  ? "source_fetch_failed"
                  : "official_source_missing";
    const failureSource = rejectionCode === "evidence_anchor_unverified"
      ? anchorFailure
      : rejectionCode === "semantic_verification_failed"
        ? semanticFailure
        : rejectionCode === "source_topic_relevance_unverified"
          ? relevanceFailure
          : evidenceFailure;
    const failureStage = rejectionCode === "source_topic_relevance_unverified"
      ? "relevance" as const
      : rejectionCode === "official_source_missing"
        ? "source" as const
        : rejectionCode === "semantic_verification_failed"
          ? "coverage" as const
          : "evidence" as const;
    const diagnostic = createPreflightDiagnostic(input, {
      rejectionCode,
      rejectionStage: failureStage,
      sourcePolicyCompliance: "failed",
      ...(failureSource ? {
        canonicalSourceUrl: failureSource.finalUrl ?? failureSource.requestedUrl,
        sourceTitle: failureSource.title,
        evidenceExcerpt: failureSource.evidenceExcerpt,
        relevanceStatus: "rejected" as const,
      } : {}),
      ...preflightDiagnosticMetadata(response),
      ...preflightPipelineMetadata(response, pipelineMetrics),
    });
    if (diagnostic) {
      throw new ApprovalSourcePreflightError(
        "사용 가능한 공식 출처를 확인하지 못했습니다.",
        diagnostic,
      );
    }
    throw new ApprovalSourcePreflightError(
      "사용 가능한 공식 출처를 확인하지 못했습니다.",
    );
  }
  const profileCoverage = profileSourceRequirementApplicable
    ? evaluateExplicitApprovalSourcePreflightCoverage({
      requiredClaims: profileRequiredClaims,
      snapshot: verificationSnapshot,
      sources: classifiedAccepted
        .filter((source) => source.diagnostics?.length === 0)
        .map((source) => Object.freeze({
          page: Object.freeze({
            requestedUrl: source.requestedUrl,
            finalUrl: source.finalUrl ?? source.requestedUrl,
            status: 200,
            contentType: "text/html",
            title: source.title ?? "",
            publisher: source.publisherId ?? source.finalUrl ?? source.requestedUrl,
            text: source.pageText ?? "",
            documentFormat: "html" as const,
            extractionStatus: "extracted" as const,
            contentLength: (source.pageText ?? "").length,
          }),
          claims: source.claims.flatMap((claim) => {
            const spec = plan.claims.find((item) => item.claimId === claim.claimId);
            return spec
              ? [{ claimId: claim.claimId, field: spec.field, value: claim.value, evidenceExcerpt: claim.evidenceExcerpt }]
              : [];
          }),
        })),
    })
    : evaluateApprovalSourcePreflightCoverage({
      profileId: input.snapshot.profileId,
      opportunity: input.opportunity,
      requiredClaims: [],
      sources: [],
    });
  /**
   * 사실 커버리지는 진단으로 남기고 생성을 막지 않는다 (D-045).
   *
   * 필수 Claim 중 근거를 못 찾은 것이 있으면 여기서 생성을 시작하지 않았다.
   * 출처의 내용 대조를 하지 않기로 한 이상 "근거를 찾았다"의 기준이 없고,
   * 통과할 수 없는 관문은 없느니만 못하다. 무엇이 비었는지는 진단으로 남아
   * 나중에 볼 수 있다.
   */
  return Object.freeze({
    sources: Object.freeze(classifiedAccepted.map((source) => Object.freeze({
      url: source.finalUrl ?? source.requestedUrl,
      title: source.title,
      excerpt: source.evidenceExcerpt,
      provenance: "citation" as const,
    }))),
    claimSources,
    coverage: profileCoverage,
    sourcePolicyCompliance: profileSourceRequirementApplicable ? "passed" : "not_required",
    verificationSnapshot,
    ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
  });
}

function explicitClaimSources(
  claims: readonly import("../approval").VerificationClaimSpec[],
  sources: readonly ExplicitDiscoveredSource[],
  snapshot: import("../approval").VerificationSnapshot,
): readonly ApprovalSourcePreflightClaimSource[] {
  const compatibility = explicitCompatibilityClaimSources(
    claims,
    sources,
    snapshot,
  );
  const canonical = createVerificationGenerationClaimSources({
    claims,
    snapshot,
    sources,
  });
  const compatibilityByUrl = new Map(compatibility.map((source) => [
    canonicalizeApprovalEvidenceUrl(source.url),
    source,
  ]));
  const canonicalByUrl = new Map(canonical.map((source) => [
    canonicalizeApprovalEvidenceUrl(source.url),
    source,
  ]));
  const urls = new Set([
    ...compatibilityByUrl.keys(),
    ...canonicalByUrl.keys(),
  ]);
  const projected = [...urls].map((url) => {
    const legacyClaims = compatibilityByUrl.get(url)?.claims ?? [];
    const verificationClaims = canonicalByUrl.get(url)?.claims ?? [];
    return Object.freeze({
      url,
      claims: Object.freeze([...legacyClaims]),
      ...(verificationClaims.length
        ? { verificationClaims: Object.freeze([...verificationClaims]) }
        : {}),
    });
  });
  return Object.freeze(projected.filter((source) =>
    source.claims.length || source.verificationClaims?.length));
}

/** Compatibility projection only; VerificationSnapshot remains explicit canonical truth. */
function explicitCompatibilityClaimSources(
  claims: readonly import("../approval").VerificationClaimSpec[],
  sources: readonly ExplicitDiscoveredSource[],
  snapshot: import("../approval").VerificationSnapshot,
): readonly ApprovalSourcePreflightClaimSource[] {
  const verified = new Set(snapshot.results
    .filter((result) => result.status === "verified")
    .map((result) => result.claimId));
  const projected = sources.map((source) => {
    const claimsForSource = source.claims.flatMap((claim) => {
      const spec = claims.find((item) => item.claimId === claim.claimId);
      const result = snapshot.results.find((item) => item.claimId === claim.claimId);
      const assessment = result?.sourceAssessments.find((item) =>
        item.canonicalUrl === (source.finalUrl ?? source.requestedUrl)
        && item.supports
        && item.fresh);
      return spec && verified.has(claim.claimId) && assessment
        ? [{
            field: spec.field,
            value: claim.value,
            evidenceExcerpt: claim.evidenceExcerpt,
          }]
        : [];
    });
    return Object.freeze({
      url: source.finalUrl ?? source.requestedUrl,
      claims: Object.freeze(claimsForSource),
    });
  });
  return Object.freeze(projected.filter((source) => source.claims.length));
}

function explicitPreflightInstruction(
  snapshot: ApprovalPolicySnapshot,
  opportunity: ConfirmedContentOpportunity,
  rejectedSourceFeedback?: readonly ApprovalSourceRejectionNote[],
  uncoveredClaimFeedback?: readonly ApprovalSourceClaimGapNote[],
): string {
  const criticalClaims = opportunity.verificationPlan!.claims.filter(isCriticalVerificationClaim);
  const retryRule = rejectedSourceFeedback?.length
    ? ` A previous discovery attempt on this same topic was rejected by the server. Do not submit these URLs again.${rejectedSourceFeedback.map((item) => ` REJECTED ${item.url} (${item.rejectionCode})${item.extractedSample ? ` — the entire text the server read from that page began: "${item.extractedSample}"` : ""}.`).join("")} source_url_script_rendered_view means the address itself is a viewer or popup endpoint that returns no body text, so replace it with the static page that states the fact. evidence_anchor_unverified means your quoted passage was nowhere in that text. source_topic_relevance_unverified means that text never named the subject. Both happen when a page renders its content with JavaScript or holds it inside images, so what you saw is not what the server received. Pick a page whose subject matter is present in the raw HTML.`
    : "";
  const coverageRule = uncoveredClaimFeedback?.length
    ? ` A previous attempt submitted no source at all for these required Claims, so they remain uncovered and Generation stays blocked until each one is supported:${uncoveredClaimFeedback.map((item) => ` ${item.claimId} (${item.field})`).join(",")}. Search again for those specific Claims on the site of the institution that administers the subject itself, not only the statute or portal space already searched. The statute article that establishes a scheme is not a substitute for the administering body's own guidance page that states the requirement, and that guidance page is often the only one whose raw HTML contains the numbers.`
    : "";
  return `Perform explicit source discovery only. Use each claimId exactly as provided. Search within the confirmed topic scope and do not substitute an adjacent topic. Topic: ${opportunity.selectedTopic}. Primary keyword: ${opportunity.primaryKeyword}. Reader problem: ${opportunity.readerProblem}. Search intent: ${opportunity.searchIntent}. Required Claims: ${JSON.stringify(criticalClaims)}. These are CRITICAL Claims only. Profile: ${snapshot.profileDisplayName}. Every required CRITICAL Claim must be deliberately searched and supported by its authoritative primary source. Determine authority from the Claim context: laws from the official law or responsible government authority; taxes from the tax authority, applicable law, or responsible authority; government benefits from the actual administering public body; financial regulation from the responsible regulator; and a named bank, card, insurance, or other entity's product terms from that same entity's official product page, disclosure, description, or terms. A government domain is not automatically authoritative for an entity-owned product Claim, and an official entity page must not be used for another entity's Claim. A single source may support multiple Claims, and multiple sources may divide Claim coverage; do not stop after finding one source. Prefer directly readable HTML pages. Use a PDF only when it has a directly readable text layer and the required passage can be quoted from it. Each returned source must include at least one claims item with an exact canonical required claimId; omit any source that supports no required Claim. For each source, attach only the Claim fields that the exact page supports. Every attached claim must include its exact provided claimId. If a required Claim cannot be supported, omit unsupported evidence; the server will deterministically return its missing Claim ID and block Generation. Each source evidenceExcerpt must be a contiguous verbatim passage from the canonical extracted text of that fetched document body, including visible headings but excluding page title, metadata, search snippets, navigation, scripts, and styles. Do not paraphrase, summarize, or synthesize separate passages into a new sentence. Each claim value should be the shortest verbatim factual phrase contained inside its claim evidenceExcerpt; do not use a paraphrase as value. For a money, ratio, date, dateRange, or duration Claim, that phrase must contain the numeral and its unit exactly as the page writes them. A page that discusses the subject without stating the figure does not support such a Claim: attach the Claim only to a page whose raw HTML carries the figure, and omit the Claim from every other page instead of quoting the surrounding explanation. A newsroom article, policy briefing, or press release that reports a figure is a second-hand copy of it, so when the administering body's own notice, statute, or terms page states the same figure, submit that page as well. If the source has no directly quotable supporting passage, omit that source instead of inventing or rewriting evidence. Choose the shortest passage that is sufficient to support the source relevance. Return every official page you inspected that supports a required Claim, not only the single best one: the server re-fetches and re-validates each page and may reject one for reasons you cannot observe from here, so a single submitted page means one rejection blocks the whole article. Prefer the institution that administers the subject on its own site over a portal, newsroom, or promotional page that only republishes the rule, and when both exist submit both. Know what the server does with your URL, because it is not what your browsing tool does: it issues one plain HTTP GET and reads text out of the HTML that comes back. It does not run JavaScript, does not wait for a client-rendered view, and cannot read words inside images or inside a PDF with no text layer. Your excerpt and the Claim subject must both be present in that raw HTML. So never submit a promotional or campaign page such as a 카드뉴스, 홍보자료, infographic, poster, or scanned notice, and never submit an application shell, mobile portal, dashboard, or personalized "my page" view whose content arrives after load — those return navigation menus and nothing else. Submit the static detail, guidance, notice, or statute page that states the fact in its own HTML. On the Korean legal portals this is a specific URL shape: a law.go.kr link popup (lsLinkCommonInfo.do) and an easylaw.go.kr viewer path (.laf) both return menus only, and the server rejects them before fetching. Submit the statute's own article page on law.go.kr instead, and never submit a URL carrying a popup parameter such as popMenu or a /popup path.${retryRule}${coverageRule} Return JSON with sources containing url,title,evidenceExcerpt and claims containing claimId,value,evidenceExcerpt.`;
}

type SourcePipelineMetrics = {
  assistantDeclaredSourceCount: number;
  parsedSourceCount: number;
  normalizedSourceCount: number;
  canonicalUrlValidCount: number;
  officialnessEvaluatedCount: number;
  officialnessPassCount: number;
  policyRetainedCount: number;
  relevanceEvaluatedCount: number;
  relevancePassCount: number;
  fetchAttemptedCount: number;
  fetchSucceededCount: number;
  extractionAttemptedCount: number;
  extractionSucceededCount: number;
  evidenceAnchorEvaluatedCount: number;
  evidenceAnchorPassCount: number;
  semanticVerificationEvaluatedCount: number;
  semanticVerificationPassCount: number;
  rejectionSamples: Array<NonNullable<ApprovalSourcePreflightDiagnostic["rejectionSamples"]>[number]>;
};

function parseExplicitSources(
  raw: string,
  requiredClaimIds: ReadonlySet<string>,
): Readonly<{
  sources: readonly ExplicitDiscoveredSource[];
  metrics: Pick<SourcePipelineMetrics, "assistantDeclaredSourceCount" | "parsedSourceCount" | "normalizedSourceCount" | "canonicalUrlValidCount" | "rejectionSamples">;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    throw new ApprovalSourcePreflightError(
      "Explicit source discovery response is not valid JSON.",
    );
  }
  const values = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).sources
    : undefined;
  if (!Array.isArray(values)) {
    throw new ApprovalSourcePreflightError(
      "Explicit source discovery response requires sources.",
    );
  }
  const metrics = {
    assistantDeclaredSourceCount: values.length,
    parsedSourceCount: 0,
    normalizedSourceCount: 0,
    canonicalUrlValidCount: 0,
    rejectionSamples: [] as SourcePipelineMetrics["rejectionSamples"],
  };
  const sources = values.slice(0, maximumPreflightSources).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      if (metrics.rejectionSamples.length < 3) metrics.rejectionSamples.push(Object.freeze({ rejectionStage: "parse", rejectionCode: "source_shape_invalid", reason: "Source item was not an object." }));
      return [];
    }
    metrics.parsedSourceCount += 1;
    const value = item as Record<string, unknown>;
    const rawUrl = typeof value.url === "string" ? value.url.trim() : "";
    const safety = evaluateApprovalSourceUrlSafety(rawUrl);
    if (!safety.safe || !safety.normalizedUrl) {
      if (metrics.rejectionSamples.length < 3) metrics.rejectionSamples.push(Object.freeze({ url: rawUrl || undefined, rejectionStage: "normalize", rejectionCode: "source_url_unsafe", reason: safety.reason }));
      return [];
    }
    metrics.normalizedSourceCount += 1;
    const requestedUrl = canonicalizeApprovalEvidenceUrl(safety.normalizedUrl);
    const canonicalSafety = evaluateApprovalSourceUrlSafety(requestedUrl);
    if (!canonicalSafety.safe || !canonicalSafety.normalizedUrl) {
      if (metrics.rejectionSamples.length < 3) metrics.rejectionSamples.push(Object.freeze({ url: rawUrl, canonicalUrl: requestedUrl, rejectionStage: "normalize", rejectionCode: "canonical_url_invalid", reason: canonicalSafety.reason }));
      return [];
    }
    // 뷰어·팝업 주소는 GET 으로 본문이 오지 않는다. 여기서 이름을 붙여 거절해야
    // 재시도가 "이 주소는 안 된다"를 듣고 정적 조문 페이지를 찾는다.
    const scriptRenderedView = approvalSourceScriptRenderedView(requestedUrl);
    if (scriptRenderedView) {
      if (metrics.rejectionSamples.length < 3) metrics.rejectionSamples.push(Object.freeze({ url: rawUrl, canonicalUrl: requestedUrl, rejectionStage: "normalize", rejectionCode: "source_url_script_rendered_view", reason: scriptRenderedView }));
      return [];
    }
    metrics.canonicalUrlValidCount += 1;
    const rawClaims = Array.isArray(value.claims) ? value.claims : [];
    const claims = rawClaims.flatMap((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const claim = item as Record<string, unknown>;
          return typeof claim.claimId === "string"
            && claim.claimId.trim().length > 0
            && typeof claim.value === "string"
            && claim.value.trim().length > 0
            && typeof claim.evidenceExcerpt === "string"
            && claim.evidenceExcerpt.trim().length > 0
            ? [{
                claimId: claim.claimId.trim(),
                value: claim.value.trim(),
                evidenceExcerpt: claim.evidenceExcerpt.trim(),
              }]
            : [];
        });
    const malformedClaim = rawClaims.some((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return true;
        const claim = item as Record<string, unknown>;
        return typeof claim.claimId !== "string"
          || !claim.claimId.trim()
          || typeof claim.value !== "string"
          || !claim.value.trim()
          || typeof claim.evidenceExcerpt !== "string"
          || !claim.evidenceExcerpt.trim();
      });
    const unknownClaim = claims.some((claim) => !requiredClaimIds.has(claim.claimId));
    const linkageFailure = !rawClaims.length || malformedClaim || unknownClaim;
    if (linkageFailure && metrics.rejectionSamples.length < 3) {
      metrics.rejectionSamples.push(Object.freeze({
        url: requestedUrl,
        canonicalUrl: requestedUrl,
        rejectionStage: "parse",
        rejectionCode: unknownClaim ? "source_claim_id_unknown" : "source_claim_linkage_missing",
        reason: unknownClaim
          ? "A source claim contained a Claim ID outside the confirmed required Claim set."
          : "A source must contain at least one valid claimId, value, and evidenceExcerpt.",
      }));
    }
    return [{
      requestedUrl,
      title: typeof value.title === "string" ? value.title.trim() : "",
      evidenceExcerpt: typeof value.evidenceExcerpt === "string"
        ? value.evidenceExcerpt.trim()
        : "",
      claims: linkageFailure ? [] : claims,
      ...(linkageFailure
        ? { diagnostics: Object.freeze([unknownClaim ? "source_claim_id_unknown" : "source_claim_linkage_missing"]) }
        : {}),
    }];
  });
  return Object.freeze({ sources: Object.freeze(sources), metrics: Object.freeze(metrics) });
}

export function withApprovalSourcePreflightInstruction(
  instruction: string,
  sources: readonly AIWebSource[],
  claimSources: readonly ApprovalSourcePreflightClaimSource[] = [],
): string {
  if (!sources.length) return instruction;

  const canonicalProjections = claimSources.flatMap((source) =>
    source.verificationClaims ?? []);
  if (canonicalProjections.length) {
    const canonicalClaims = groupVerificationGenerationClaimEvidence(
      canonicalProjections,
    );
    return `${instruction}\n\nExplicit verification Generation bundle (mandatory, server-verified, Claim-ID owned):
${JSON.stringify(canonicalClaims)}
- The Claim-ID-owned normalizedValue is the authoritative factual value and semantics for Generation.
- State the value in the sentence itself. A sentence that describes the existence of the value instead of naming it — that the scope is set by the operator, that the amount follows the notice, that the rate is determined by law — does not use the Claim and leaves the reader without the fact it came for: write the institutions, the amount, the rate, the threshold, or the period exactly as the Claim states them.
- Preserve the Claim kind, qualifiers, basis, comparator, scope, subject, and temporal requirement exactly as represented in the canonical Claim contract.
- Use only the trusted source entries attached to that same claimId. Do not transfer evidence between Claims merely because the field names look similar.
- Do not use web search during Generation and do not add, replace, or invent another source URL.
- When a canonical Claim does not support a factual assertion, omit it rather than guessing.
- Write an unverified number — an example, a cadence, an approximation, or an illustrative period — as descriptive prose instead of a compressed numeral-and-unit form, including in a title, heading, list label, or table cell: write "일주일 동안 이어서 점검하는" rather than "1주". This never applies to a Claim-ID-owned normalizedValue, which must stay exactly as the canonical Claim contract represents it.
- Do not create a reader-visible source section. Bright Studio projects verified sources after deterministic Claim review.`;
  }

  const claimsByUrl = new Map(claimSources.map((source) => [
    canonicalizeApprovalEvidenceUrl(source.url),
    source.claims,
  ]));
  const evidence = sources.map((source, index) => {
    const claims = claimsByUrl.get(canonicalizeApprovalEvidenceUrl(source.url))
      ?? [];
    const claimEvidence = claims.length
      ? claims.map((claim) => [
        `Claim field: ${claim.field}`,
        `Verified value: ${claim.value}`,
        `Verified Claim evidence: ${claim.evidenceExcerpt}`,
      ].join("\n")).join("\n\n")
      : "No factual Claim was required by confirmed Planning.";
    return [
      `${index + 1}. ${source.title?.trim() || sourcePublisher(source.url)}`,
      `URL: ${source.url}`,
      `Verified extracted source evidence: ${source.excerpt ?? ""}`,
      claimEvidence,
    ].join("\n");
  }).join("\n\n");
  return `${instruction}\n\nApproval source preflight bundle (mandatory, server-verified before Generation):
${evidence}
- The attached bundle is the complete factual source boundary for this manuscript.
- Do not use web search during Generation and do not add, replace, or invent another source URL.
- Write each external factual assertion only from the verified Claim value and Claim evidence attached above.
- State the value in the sentence itself. A sentence that describes the existence of the value instead of naming it — that the scope is set by the operator, that the amount follows the notice, that the rate is determined by law — does not use the Claim and leaves the reader without the fact it came for: write the institutions, the amount, the rate, the threshold, or the period exactly as the Claim states them.
- Do not change a verified date, amount, percentage, duration, unit, institution, artwork metadata value, eligibility rule, threshold, quotation, or legal requirement.
- When the bundle does not support a factual assertion, omit it rather than guessing.
- Write an unverified number — an example, a cadence, an approximation, or an illustrative period — as descriptive prose instead of a compressed numeral-and-unit form, including in a title, heading, list label, or table cell: write "일주일 동안 이어서 점검하는" rather than "1주". This never applies to a verified Claim value, which must stay exactly as attached above.
- Do not create a reader-visible source section. Bright Studio projects verified sources after deterministic Claim review.`;
}

function approvalSourceDiscoveryInstruction(
  snapshot: ApprovalPolicySnapshot,
  opportunity: ConfirmedContentOpportunity,
  requiredClaims: readonly ApprovalSourcePreflightRequirement[],
): string {
  const domains = approvalOfficialDomains(snapshot.profileId);
  const plannedScope = {
    selectedTopic: opportunity.selectedTopic,
    primaryKeyword: opportunity.primaryKeyword,
    secondaryKeywords: opportunity.secondaryKeywords,
    searchIntent: opportunity.searchIntent,
    audience: opportunity.audience,
    readerProblem: opportunity.readerProblem,
    expectedCoverage: opportunity.expectedCoverage,
    requiredContentElements: opportunity.qualityTarget.requiredContentElements,
    coreQuestions: opportunity.qualityTarget.coreQuestions,
    decisionCriteria: opportunity.qualityTarget.decisionCriteria,
    warningsOrExceptions: opportunity.qualityTarget.warningsOrExceptions,
    scopeBoundaries: opportunity.qualityTarget.scopeBoundaries,
  };
  const requiredClaimContract = requiredClaims.map((claim) => ({
    ...(claim.claimId ? { claimId: claim.claimId } : {}),
    field: claim.field,
    ...(claim.statement ? { statement: claim.statement } : {}),
    ...(claim.kind ? { kind: claim.kind } : {}),
    ...(claim.qualifiers ? { qualifiers: claim.qualifiers } : {}),
    ...(claim.temporalRequirement ? { temporalRequirement: claim.temporalRequirement } : {}),
    ...(claim.required !== undefined ? { required: claim.required } : {}),
    ...(claim.plannedValue ? { plannedValue: claim.plannedValue } : {}),
  }));
  return `Perform source discovery and Claim submission only. Do not write, outline, or draft the article.
Find 1-6 direct official primary-source pages that can support every factual Claim required by this confirmed Content Opportunity.
Content Opportunity: ${JSON.stringify(plannedScope)}
Required factual Claims: ${JSON.stringify(requiredClaimContract)}
Approval profile: ${snapshot.profileDisplayName}. Content domain: ${snapshot.contentDomain}.
${domains?.length ? `Allowed official domains: ${domains.join(", ")}. Cite only these. A public-sector page owns statutes, tax rules, and government programmes; a financial institution page owns its own product terms, rates, and fees. A personal blog, community post, aggregator, or news article is out of scope and cannot become a source by any route (D-045), so do not propose one even when it states the same fact.` : "Use only a clearly identifiable official museum, archive, government, public institution, or rights-holder page accepted by the active profile."}
Rules:
- Open or inspect each proposed page during this call.
- Return a direct detail, guidance, law, notice, application, collection, or institutional record page; never return a search-result page, navigation page, copied article, community post, or secondary blog.
- Every URL must be HTTPS and must appear in the web-search sources from this same response.
- Source evidenceExcerpt must be one short contiguous verbatim factual passage from the canonical extracted text of that fetched document body, including visible headings but excluding title, metadata, search snippets, navigation, scripts, and styles. Do not paraphrase, invent, or combine text from another page.
- For every required Claim ID, attach the same claimId to at least one source in claims.
- Every Claim must contain the exact required claimId, value, and evidenceExcerpt; never substitute a field name or another Claim ID.
- Claim value must be a concise exact factual value or sentence proved by that same page.
- Claim evidenceExcerpt must be a short contiguous verbatim passage from that same canonical extracted document text containing or directly proving the Claim value.
- Do not attach a Claim field that the page does not support.
- Several official sources may divide the Claims, but the complete sources array must cover every required Claim.
- Return every official page you inspected that supports a required Claim, not only the single best one. The server re-fetches and re-validates each page and may reject one for reasons you cannot observe from here, so when you submit a single page one rejection blocks the whole article. Where two or more official pages support the same Claim, submit them all.
- Prefer the institution that administers the subject on its own site over a portal that only republishes the rule, and when both exist submit both.
- If a required Claim cannot be verified, return the usable sources and omit the unsupported Claim. The server will block Generation.
- If no usable official page exists, return {"sources":[]}.
Return JSON only as {"sources":[{"url":"https://...","title":"...","evidenceExcerpt":"verbatim source passage","claims":[{"field":"required field","value":"exact concise fact","evidenceExcerpt":"verbatim passage from this exact page"}]}]}.`;
}

type DiscoveredSource = Readonly<{
  url: string;
  title: string;
  evidenceExcerpt: string;
  claims: readonly ApprovalSourcePreflightClaim[];
}>;

type AcceptedPreflightSource = Readonly<{
  source: DiscoveredSource;
  page: ApprovalSourcePage;
  finalUrl: string;
}>;

function parseDiscoveredSources(raw: string): readonly DiscoveredSource[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    throw new ApprovalSourcePreflightError(
      "공식 출처 탐색 응답을 구조화된 JSON으로 해석하지 못했습니다.",
    );
  }
  const values = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>).sources
    : undefined;
  if (!Array.isArray(values)) {
    throw new ApprovalSourcePreflightError(
      "공식 출처 탐색 응답에 sources 배열이 없습니다.",
    );
  }

  const sources = new Map<string, DiscoveredSource>();
  for (const item of values.slice(0, maximumPreflightSources)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = item as Record<string, unknown>;
    const rawUrl = typeof value.url === "string" ? value.url.trim() : "";
    const excerpt = typeof value.evidenceExcerpt === "string"
      ? normalizeExcerpt(value.evidenceExcerpt)
      : "";
    const safety = evaluateApprovalSourceUrlSafety(rawUrl);
    if (
      !safety.safe
      || !safety.normalizedUrl
      || excerpt.length < minimumEvidenceExcerptLength
    ) {
      continue;
    }
    const claims = Array.isArray(value.claims)
      ? value.claims.flatMap((claim) => parseClaim(claim))
        .slice(0, approvalSourcePreflightMaximumClaimsPerSource)
      : [];
    const url = canonicalizeApprovalEvidenceUrl(safety.normalizedUrl);
    sources.set(url, Object.freeze({
      url,
      title: typeof value.title === "string"
        ? value.title.trim().slice(0, 500)
        : "",
      evidenceExcerpt: excerpt,
      claims: Object.freeze(claims),
    }));
  }
  return Object.freeze([...sources.values()]);
}

function parseClaim(value: unknown): readonly ApprovalSourcePreflightClaim[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const claim = value as Record<string, unknown>;
  const claimId = typeof claim.claimId === "string"
    ? claim.claimId.trim().slice(0, maximumClaimFieldLength)
    : "";
  const field = typeof claim.field === "string"
    ? claim.field.trim().slice(0, maximumClaimFieldLength)
    : "";
  const factValue = typeof claim.value === "string"
    ? normalizeClaimText(claim.value).slice(0, maximumClaimValueLength)
    : "";
  const evidenceExcerpt = typeof claim.evidenceExcerpt === "string"
    ? normalizeClaimText(claim.evidenceExcerpt)
      .slice(0, maximumClaimEvidenceLength)
    : "";
  return claimId && field && factValue && evidenceExcerpt
    ? [Object.freeze({ claimId, field, value: factValue, evidenceExcerpt })]
    : [];
}

async function fetchPreflightPages(
  urls: readonly string[],
  fetcher: SiteApprovalReadinessFetch,
): Promise<readonly ApprovalSourcePage[]> {
  const pages: ApprovalSourcePage[] = [];
  for (const url of urls) pages.push(await fetchPreflightPage(url, fetcher));
  return Object.freeze(pages);
}

export async function fetchPreflightPage(
  requestedUrl: string,
  fetcher: SiteApprovalReadinessFetch,
): Promise<ApprovalSourcePage> {
  const initial = evaluateApprovalSourceUrlSafety(requestedUrl);
  if (!initial.safe || !initial.normalizedUrl) {
    return failedPage(
      requestedUrl,
      initial.reason ?? "안전한 공개 HTTPS URL이 아닙니다.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sourcePreflightTimeoutMs);
  try {
    const fetched = await fetchWithSafeRedirects(
      initial.normalizedUrl,
      fetcher,
      controller.signal,
    );
    const contentType = fetched.response.headers.get("content-type") ?? "";
    const body = await readBoundedBody(
      fetched.response,
      sourcePreflightMaximumBytes,
    );
    const extracted = normalizeApprovalSourceDocumentServer({
      requestedUrl,
      finalUrl: fetched.finalUrl,
      status: fetched.response.status,
      contentType,
      bytes: body.bytes,
      tooLarge: body.tooLarge,
    });
    return Object.freeze({
      requestedUrl,
      finalUrl: fetched.finalUrl,
      status: fetched.response.status,
      contentType,
      title: extracted.title,
      publisher: extracted.publisher,
      text: extracted.text,
      documentFormat: extracted.format,
      extractionStatus: extracted.extractionStatus,
      ...(extracted.extractionReason
        ? { extractionReason: extracted.extractionReason }
        : {}),
      contentLength: body.contentLength,
    });
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "AbortError"
      ? `요청 시간이 ${sourcePreflightTimeoutMs}ms를 초과했습니다.`
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    return failedPage(requestedUrl, reason);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithSafeRedirects(
  requestedUrl: string,
  fetcher: SiteApprovalReadinessFetch,
  signal: AbortSignal,
): Promise<Readonly<{ response: Response; finalUrl: string }>> {
  let currentUrl = requestedUrl;
  for (
    let redirectCount = 0;
    redirectCount <= sourcePreflightMaximumRedirects;
    redirectCount += 1
  ) {
    const safety = evaluateApprovalSourceUrlSafety(currentUrl);
    if (!safety.safe || !safety.normalizedUrl) {
      throw new Error(
        safety.reason ?? "리다이렉트 URL 안전성 검사에 실패했습니다.",
      );
    }
    currentUrl = safety.normalizedUrl;
    const response = await fetcher(currentUrl, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,text/csv,text/xml,application/json,application/xml,application/pdf;q=0.9,*/*;q=0.5",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        "User-Agent": "BrightStudioApprovalSourcePreflight/1.0",
      },
    });
    if (!redirectStatus(response.status)) {
      return Object.freeze({
        response,
        finalUrl: response.url || currentUrl,
      });
    }
    const location = response.headers.get("location");
    if (!location) {
      return Object.freeze({
        response,
        finalUrl: response.url || currentUrl,
      });
    }
    try {
      await response.body?.cancel();
    } catch {
      // Redirect response bodies may already be closed.
    }
    if (redirectCount === sourcePreflightMaximumRedirects) {
      throw new Error(
        `출처 리다이렉트가 ${sourcePreflightMaximumRedirects}회를 초과했습니다.`,
      );
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error("출처 리다이렉트 검사를 완료하지 못했습니다.");
}

async function readBoundedBody(
  response: Response,
  maximumBytes: number,
): Promise<Readonly<{
  bytes: Uint8Array;
  contentLength: number;
  tooLarge: boolean;
}>> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    try {
      await response.body?.cancel();
    } catch {
      // The response body may already be closed.
    }
    return Object.freeze({
      bytes: new Uint8Array(),
      contentLength: declaredLength,
      tooLarge: true,
    });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > maximumBytes
    ? Object.freeze({
      bytes: bytes.slice(0, maximumBytes),
      contentLength: bytes.byteLength,
      tooLarge: true,
    })
    : Object.freeze({
      bytes,
      contentLength: bytes.byteLength,
      tooLarge: false,
    });
}

function preflightPageRejection(
  snapshot: ApprovalPolicySnapshot,
  page: ApprovalSourcePage,
  evidenceExcerpt: string,
  opportunity: ConfirmedContentOpportunity,
  additionalScope: readonly string[] = [],
  authorityClaims?: readonly import("../approval").VerificationClaimSpec[],
): string | undefined {
  if (page.fetchError) return `페이지 요청 실패: ${page.fetchError}`;
  if (page.status < 200 || page.status >= 400) {
    return `정상 HTTP 응답이 아닙니다 (${page.status}).`;
  }
  if (page.extractionStatus !== "extracted") {
    return page.extractionReason
      || `본문 추출 상태가 ${page.extractionStatus ?? "unknown"}입니다.`;
  }
  if (page.text.trim().length < minimumExtractedPageLength) {
    return "추출된 본문이 사실 확인에 사용하기에는 너무 짧습니다.";
  }
  const authority = authorityClaims
    ? evaluateApprovalSourceAuthority({
      profileId: snapshot.profileId,
      page,
      claims: authorityClaims,
    })
    : undefined;
  if (authority ? authority.status !== "passed" : !officialSourceAllowed(snapshot.profileId, page)) {
    return authority?.diagnosticCode
      ?? "활성 승인 프로필의 공식 출처로 확인되지 않았습니다.";
  }
  const relevance = evaluateApprovalSourceRelevance({
    profileId: snapshot.profileId,
    opportunity,
    page,
    additionalScope,
    ...(authority?.authorityKinds.includes("entity_product")
      ? { minimumClaimCoverage: 0.5 }
      : {}),
  });
  if (relevance.status !== "passed") {
    return relevance.diagnosticCode;
  }
  if (!evidenceExcerptMatches(page.text, evidenceExcerpt)) {
    return "evidence_anchor_unverified";
  }
  return undefined;
}

/**
 * The excerpt is the model's verbatim quote of the page it read. The page text
 * is this server's own fetch and extraction of the same URL, performed
 * separately. Requiring the quote to be an exact substring therefore required
 * two independent extractions of a live page to agree character for character,
 * and a 국세청 page carrying the required evidence word for word was rejected
 * because the two renderings differed somewhere inside the quote.
 *
 * The anchoring rule itself lives in `evidenceExcerptAnchored` because Coverage
 * applies the same rule to the same excerpt at `ApprovalSourcePreflightCoverage`.
 * The two ran their own exact-substring checks, so relaxing one alone left the
 * other rejecting the source with `coverage_incomplete` instead.
 */
function evidenceExcerptMatches(pageText: string, excerpt: string): boolean {
  const candidate = normalizeComparableText(excerpt);
  if (candidate.length < minimumEvidenceExcerptLength) return false;
  return evidenceExcerptAnchored(normalizeComparableText(pageText), candidate);
}

function sourceRelevanceScope(
  opportunity: ConfirmedContentOpportunity,
  claims: readonly Readonly<{
    field?: string;
    claimId?: string;
    value: string;
    evidenceExcerpt: string;
  }>[],
): readonly string[] {
  const fields = new Set(claims.flatMap((claim) => claim.field ? [claim.field] : []));
  const claimIds = new Set(claims.flatMap((claim) => claim.claimId ? [claim.claimId] : []));
  const plannedClaims = opportunity.verificationPlan?.claims
    .filter((claim) => fields.has(claim.field) || claimIds.has(claim.claimId))
    .flatMap((claim) => [
      claim.field,
      claim.statement,
      claim.rawValue ?? "",
      claim.qualifiers.subject,
      claim.qualifiers.scope,
      claim.qualifiers.basis,
    ]) ?? [];
  const contractClaims = opportunity.requiredEvidenceContract?.requiredClaims
    .filter((claim) => fields.has(claim.field) || opportunity.verificationPlan?.claims.some((planned) =>
      claimIds.has(planned.claimId) && planned.field === claim.field))
    .flatMap((claim) => [claim.field, claim.plannedValue ?? ""]) ?? [];
  return Object.freeze([
    ...plannedClaims,
    ...contractClaims,
  ].filter((value): value is string => Boolean(value)));
}

function explicitSourceAuthorityClaims(
  plannedClaims: readonly import("../approval").VerificationClaimSpec[],
  sourceClaims: readonly Readonly<{ claimId: string }>[],
): readonly import("../approval").VerificationClaimSpec[] {
  const claimIds = new Set(sourceClaims.map((claim) => claim.claimId));
  return Object.freeze(plannedClaims.filter((claim) => claimIds.has(claim.claimId)));
}

function createPreflightDiagnostic(
  input: Readonly<Parameters<typeof runApprovalSourcePreflight>[0]>,
  values: Pick<ApprovalSourcePreflightDiagnostic, "rejectionCode" | "rejectionStage">
    & Partial<Omit<ApprovalSourcePreflightDiagnostic, "schemaVersion" | "rejectionCode" | "rejectionStage">>,
): ApprovalSourcePreflightDiagnostic {
  const scope = [
    input.opportunity.selectedTopic,
    input.opportunity.primaryKeyword,
    ...input.opportunity.secondaryKeywords,
  ].join("|");
  let hash = 2166136261;
  for (let index = 0; index < scope.length; index += 1) {
    hash ^= scope.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const { rejectionCode, rejectionStage, ...optionalValues } = values;
  return createApprovalSourcePreflightDiagnostic({
    preflightExecutionId: `preflight-${input.opportunity.opportunityId}`,
    contractId: input.opportunity.requiredEvidenceContract?.contractId,
    contractVersion: input.opportunity.requiredEvidenceContract?.schemaVersion,
    topicScopeFingerprint: `topic-${(hash >>> 0).toString(16).padStart(8, "0")}`,
    selectedTopic: input.opportunity.selectedTopic,
    primaryKeyword: input.opportunity.primaryKeyword,
    profileId: input.snapshot.profileId,
    rejectionCode,
    rejectionStage,
    ...optionalValues,
  });
}

function preflightDiagnosticMetadata(
  response: AIResponse,
): Partial<Pick<ApprovalSourcePreflightDiagnostic, "preflightResponseId" | "webSearchCalls" | "webSourceCount">> {
  const diagnostics = response.diagnostics;
  return {
    ...(diagnostics?.responseId ? { preflightResponseId: diagnostics.responseId } : {}),
    ...(typeof diagnostics?.webSearchCalls === "number" ? { webSearchCalls: diagnostics.webSearchCalls } : {}),
    ...(diagnostics?.webSources ? { webSourceCount: diagnostics.webSources.length } : {}),
  };
}

function preflightPipelineMetadata(
  response: AIResponse,
  metrics: SourcePipelineMetrics,
): Partial<Pick<ApprovalSourcePreflightDiagnostic,
  | "rawWebSourceCount"
  | "assistantDeclaredSourceCount"
  | "parsedSourceCount"
  | "normalizedSourceCount"
  | "canonicalUrlValidCount"
  | "officialnessEvaluatedCount"
  | "officialnessPassCount"
  | "policyRetainedCount"
  | "relevanceEvaluatedCount"
  | "relevancePassCount"
  | "fetchAttemptedCount"
  | "fetchSucceededCount"
  | "extractionAttemptedCount"
  | "extractionSucceededCount"
  | "evidenceAnchorEvaluatedCount"
  | "evidenceAnchorPassCount"
  | "semanticVerificationEvaluatedCount"
  | "semanticVerificationPassCount"
  | "rejectionSamples"
>> {
  return {
    rawWebSourceCount: response.diagnostics?.webSources?.length ?? 0,
    assistantDeclaredSourceCount: metrics.assistantDeclaredSourceCount,
    parsedSourceCount: metrics.parsedSourceCount,
    normalizedSourceCount: metrics.normalizedSourceCount,
    canonicalUrlValidCount: metrics.canonicalUrlValidCount,
    officialnessEvaluatedCount: metrics.officialnessEvaluatedCount,
    officialnessPassCount: metrics.officialnessPassCount,
    policyRetainedCount: metrics.policyRetainedCount,
    relevanceEvaluatedCount: metrics.relevanceEvaluatedCount,
    relevancePassCount: metrics.relevancePassCount,
    fetchAttemptedCount: metrics.fetchAttemptedCount,
    fetchSucceededCount: metrics.fetchSucceededCount,
    extractionAttemptedCount: metrics.extractionAttemptedCount,
    extractionSucceededCount: metrics.extractionSucceededCount,
    evidenceAnchorEvaluatedCount: metrics.evidenceAnchorEvaluatedCount,
    evidenceAnchorPassCount: metrics.evidenceAnchorPassCount,
    semanticVerificationEvaluatedCount: metrics.semanticVerificationEvaluatedCount,
    semanticVerificationPassCount: metrics.semanticVerificationPassCount,
    ...(metrics.rejectionSamples.length
      ? { rejectionSamples: Object.freeze(metrics.rejectionSamples.slice(0, 3)) }
      : {}),
  };
}


function normalizeComparableText(value: string): string {
  return value.normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]+/gu, "")
    .trim();
}

function normalizeExcerpt(value: string): string {
  return normalizeClaimText(value).slice(0, maximumEvidenceExcerptLength);
}

function normalizeClaimText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function failedPage(
  requestedUrl: string,
  fetchError: string,
): ApprovalSourcePage {
  return Object.freeze({
    requestedUrl,
    finalUrl: requestedUrl,
    status: 0,
    contentType: "",
    title: "",
    publisher: sourcePublisher(requestedUrl),
    text: "",
    fetchError,
    documentFormat: "unknown",
    extractionStatus: "unavailable",
    extractionReason: fetchError,
    contentLength: 0,
  });
}

function sourcePublisher(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./iu, "");
  } catch {
    return "공식 출처";
  }
}

function stripFence(value: string): string {
  return value.trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
}

function redirectStatus(status: number): boolean {
  return status === 301
    || status === 302
    || status === 303
    || status === 307
    || status === 308;
}

function uniqueClaims(
  claims: readonly ApprovalSourcePreflightClaim[],
): readonly ApprovalSourcePreflightClaim[] {
  const found = new Map<string, ApprovalSourcePreflightClaim>();
  for (const claim of claims) {
    const key = [
      claim.field,
      claim.value.normalize("NFKC"),
      claim.evidenceExcerpt.normalize("NFKC"),
    ].join("\u0000");
    if (!found.has(key)) found.set(key, claim);
  }
  return Object.freeze([...found.values()]);
}

const maximumPreflightSources = 6;
const maximumClaimFieldLength = 200;
const maximumClaimValueLength = 500;
const maximumClaimEvidenceLength = 1_200;
const minimumEvidenceExcerptLength = 20;
const maximumEvidenceExcerptLength = 1_200;
const minimumExtractedPageLength = 200;
const sourcePreflightTimeoutMs = 12_000;
const sourcePreflightMaximumBytes = 1_500_000;
const sourcePreflightMaximumRedirects = 5;
