import {
  canonicalizeApprovalEvidenceUrl,
  deriveApprovalReadinessReport,
  verifyApprovalEvidence,
  type ApprovalEvidencePack,
  type ApprovalEvidenceSource,
  type ApprovalPolicyProfileId,
  type ApprovalSourcePage,
} from "../../../core/approval";
import type { ContentDocument } from "../../../core/content";
import {
  editorialRevisionId,
  isStandardQualityApproved,
  standardQualityBlockingReasons,
  type QualityReport,
} from "../../../core/quality";
import type { UserContent } from "../../user-flow/user-data";
import type { ApprovalReadinessExecutionResult, ApprovalReadinessFetch } from "./ApprovalReadinessApplicationServiceBase";
import { fetchApprovalSourcePages } from "./ApprovalSourceFetchService";
import { searchCorroborationCandidates } from "./CorroborationSearchService";

/**
 * Runs the free web corroboration pass only for unofficial Evidence that the
 * first deterministic verification marked as needing corroboration.
 *
 * This is an application-layer orchestration step: the Core verifier remains
 * deterministic and receives the resulting Evidence candidates as ordinary
 * system-verified sources. No LLM or paid search API is introduced.
 */
export async function corroborateApprovalReadinessResult(
  result: ApprovalReadinessExecutionResult,
  content: UserContent,
  profileId: ApprovalPolicyProfileId,
  fetcher: ApprovalReadinessFetch,
  checkedAt: string,
): Promise<ApprovalReadinessExecutionResult> {
  const existingPack = result.document.metadata?.approvalEvidence;
  const sourcesNeedingCorroboration = existingPack?.sources.filter((source) =>
    source.official !== true
    && source.verificationStatus === "needs_corroboration",
  ) ?? [];
  if (!sourcesNeedingCorroboration.length) return result;

  const candidateSources: ApprovalEvidenceSource[] = [];
  const candidatePages: ApprovalSourcePage[] = [];
  const seenCandidateIds = new Set<string>();

  for (const source of sourcesNeedingCorroboration) {
    const search = await searchCorroborationCandidates(source, fetcher, new Date(checkedAt));
    for (const candidate of search.candidates) {
      if (seenCandidateIds.has(candidate.sourceId)) continue;
      seenCandidateIds.add(candidate.sourceId);
      candidateSources.push(Object.freeze({
        sourceId: candidate.sourceId,
        url: candidate.url,
        title: candidate.title,
        publisher: candidate.publisher,
        sourceType: source.sourceType,
        retrievedAt: checkedAt,
        verified: false,
        facts: candidate.facts,
        provenance: "system_verified",
        originalUrl: source.url,
        official: false,
        selected: false,
        verificationStatus: "needs_corroboration",
      }));
      candidatePages.push(Object.freeze({
        requestedUrl: candidate.url,
        finalUrl: candidate.page.finalUrl ?? candidate.url,
        status: 200,
        contentType: "text/html; charset=utf-8",
        title: candidate.page.title,
        publisher: candidate.page.publisher,
        text: candidate.page.text,
        documentFormat: "html",
        extractionStatus: "extracted",
        contentLength: candidate.page.text.length,
      }));
    }
  }

  if (!candidateSources.length) return result;

  const allSources = dedupeSources([
    ...(existingPack?.sources ?? []),
    ...candidateSources,
  ]);
  const documentWithCandidates: ContentDocument = Object.freeze({
    ...result.document,
    metadata: Object.freeze({
      ...result.document.metadata!,
      approvalEvidence: Object.freeze({
        ...(existingPack ?? {
          version: "1.0" as const,
          status: "needs_review" as const,
          sources: Object.freeze([]),
        }),
        sources: Object.freeze(allSources),
      }),
    }),
  });

  const sourceUrls = allSources
    .map((source) => canonicalizeApprovalEvidenceUrl(source.url))
    .filter(Boolean);
  const originalPages = await fetchApprovalSourcePages([...new Set(sourceUrls)], fetcher);
  const pages = mergePages(originalPages, candidatePages);
  const verification = verifyApprovalEvidence(
    documentWithCandidates,
    profileId,
    pages,
    checkedAt,
  );
  const effectiveVerification = applyCorroborationPolicy(verification, checkedAt);

  const document: ContentDocument = Object.freeze({
    ...documentWithCandidates,
    metadata: Object.freeze({
      ...documentWithCandidates.metadata!,
      approvalEvidence: effectiveVerification.pack,
      updatedAt: checkedAt,
    }),
  });
  const approvalReadiness = deriveApprovalReadinessReport({
    document,
    ...(content.opportunity ? { opportunity: content.opportunity } : {}),
    standardQualityApproved: content.quality
      ? isStandardQualityApproved(content.quality)
      : false,
    supersededQualityReview: content.quality?.reviewedRevisionId !== undefined
      && content.quality.reviewedRevisionId !== editorialRevisionId(document),
    standardQualityBlockingReasons: standardQualityBlockingReasons(content.quality),
  });
  const quality = Object.freeze({
    ...result.quality,
    ...(approvalReadiness ? { approvalReadiness } : {}),
  }) as QualityReport;
  const nextContent: UserContent = Object.freeze({
    ...content,
    document,
    quality,
    updatedAt: checkedAt,
  });
  const data = Object.freeze({
    ...result.data,
    contents: result.data.contents.map((item) => item.id === content.id ? nextContent : item),
    qualityReports: [
      ...(result.data.qualityReports ?? []).filter((item) => item.contentId !== content.id),
      { contentId: content.id, report: quality },
    ],
  });

  return Object.freeze({
    ...result,
    data,
    document,
    quality,
    evidence: effectiveVerification,
  });
}

/**
 * Corroboration has a deliberately narrower approval rule than the ordinary
 * official-source route: two distinct unofficial URLs that independently
 * verify the same Claim are sufficient. It must not be downgraded merely
 * because another optional/required fact field has no corroborating source.
 *
 * The Core verifier still performs access, extraction, Claim matching and
 * official-source checks. This application-layer override only changes the
 * aggregate pack verdict for the explicitly corroborated route; it never
 * changes an official-source verdict.
 */
function applyCorroborationPolicy(
  verification: ReturnType<typeof verifyApprovalEvidence>,
  reviewedAt: string,
): ReturnType<typeof verifyApprovalEvidence> {
  const corroboratedSources = verification.pack.sources.filter((source) =>
    source.verified
    && source.trustRoute === "external_corroborated"
    && source.verificationStatus === "verified",
  );
  if (corroboratedSources.length < 2) return verification;

  const pack: ApprovalEvidencePack = Object.freeze({
    ...verification.pack,
    status: "verified",
    coverageStatus: "verified",
    sourcePolicyCompliance: "passed",
    reviewedAt,
  });
  return Object.freeze({
    ...verification,
    pack,
  });
}

function dedupeSources(sources: readonly ApprovalEvidenceSource[]): ApprovalEvidenceSource[] {
  const seen = new Set<string>();
  const result: ApprovalEvidenceSource[] = [];
  for (const source of sources) {
    const canonical = canonicalizeApprovalEvidenceUrl(source.url);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(source);
  }
  return result;
}

function mergePages(
  originalPages: readonly ApprovalSourcePage[],
  candidatePages: readonly ApprovalSourcePage[],
): readonly ApprovalSourcePage[] {
  const result = new Map<string, ApprovalSourcePage>();
  for (const page of [...originalPages, ...candidatePages]) {
    const key = canonicalizeApprovalEvidenceUrl(page.requestedUrl);
    if (!result.has(key)) result.set(key, page);
    const finalKey = canonicalizeApprovalEvidenceUrl(page.finalUrl);
    if (!result.has(finalKey)) result.set(finalKey, page);
  }
  return Object.freeze([...result.values()]);
}
