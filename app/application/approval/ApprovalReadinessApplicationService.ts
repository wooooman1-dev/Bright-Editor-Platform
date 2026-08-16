import {
  deriveApprovalReadinessReport,
  ensureRequiredApprovalEvidenceCandidates,
  normalizeApprovalDateOwnership,
  type ApprovalEvidenceSource,
  type ApprovalPolicyProfileId,
} from "../../../core/approval";
import { editorialRevisionId, isStandardQualityApproved, standardQualityBlockingReasons } from "../../../core/quality";
import type { ContentDocument } from "../../../core/content";
import type { UserContent, UserData } from "../../user-flow/user-data";
import {
  approvalReadinessExecutionIdentity,
  approvalReadinessInspectionVersion,
} from "./ApprovalReadinessExecutionIdentity";
import {
  ApprovalReadinessApplicationService as BaseApprovalReadinessApplicationService,
  type ApprovalReadinessExecutionResult,
} from "./ApprovalReadinessApplicationServiceBase";
import { searchCorroborationCandidates } from "./CorroborationSearchService";

export * from "./ApprovalReadinessApplicationServiceBase";

export class ApprovalReadinessApplicationService extends BaseApprovalReadinessApplicationService {
  override async execute(input: Parameters<BaseApprovalReadinessApplicationService["execute"]>[0]): Promise<ApprovalReadinessExecutionResult> {
    const content = input.data.contents.find((item) => item.id === input.contentId);
    const source = content?.document;
    let effectiveInput = input;
    if (content && source) {
      const approvalProfileId = (content as UserContent & {
        approvalProfileId?: ApprovalPolicyProfileId;
      }).approvalProfileId;
      let document = normalizeApprovalDateOwnership(source);
      if (approvalProfileId) {
        document = ensureRequiredApprovalEvidenceCandidates(document, approvalProfileId);
      }
      if (document !== source) effectiveInput = { ...input, data: withNormalizedDocument(input.data, content, document) };
    }
    const result = await super.execute(effectiveInput);
    if (!result.inspectionPerformed) return result;

    const corroborated = await enrichWithCorroboration(result, fetch);
    return withCurrentInspectionIdentity(corroborated, input.connection?.id);
  }
}

async function enrichWithCorroboration(
  result: ApprovalReadinessExecutionResult,
  fetcher: typeof fetch,
): Promise<ApprovalReadinessExecutionResult> {
  const content = result.data.contents.find((item) => item.id === result.document.id)
    ?? result.data.contents.find((item) => item.document?.id === result.document.id);
  const profileId = content?.approvalProfileId;
  if (!content || !profileId) return result;

  const sources = result.evidence.pack.sources;
  const targets = sources.filter((source) =>
    source.official !== true
    && source.verificationStatus === "needs_corroboration"
    && !source.corroborated,
  );
  if (!targets.length) return result;

  const nextSources = [...sources];
  let changed = false;
  const searchedAt = new Date().toISOString();

  for (const source of targets) {
    const search = await searchCorroborationCandidates(source, fetcher, new Date(searchedAt));
    const candidate = search.candidates[0];
    if (!candidate) continue;

    const originalIndex = nextSources.findIndex((item) => item.sourceId === source.sourceId);
    if (originalIndex < 0) continue;

    const supportedFields = new Set(candidate.facts.map((fact) => fact.field));
    const original = nextSources[originalIndex]!;
    const originalSupported = (original.matchedFacts ?? original.facts)
      .filter((fact) => supportedFields.has(fact.field));
    if (!originalSupported.length) continue;

    const corroboratingSource: ApprovalEvidenceSource = Object.freeze({
      sourceId: candidate.sourceId,
      url: candidate.url,
      title: candidate.title,
      publisher: candidate.publisher,
      sourceType: original.sourceType,
      retrievedAt: searchedAt,
      verified: true,
      facts: candidate.facts,
      provenance: "system_verified",
      linkedBlockIds: original.linkedBlockIds,
      originalUrl: original.url,
      canonicalUrl: candidate.url,
      finalUrl: candidate.page.finalUrl,
      httpStatus: 200,
      contentType: "text/html",
      official: false,
      selected: true,
      verificationStatus: "verified",
      accessVerificationStatus: "verified",
      officialDomainVerificationStatus: "failed",
      claimVerificationStatus: "verified",
      matchedFacts: candidate.facts,
      trustRoute: "external_corroborated",
      corroborated: true,
      corroborationSourceIds: Object.freeze([original.sourceId]),
      checkedAt: searchedAt,
    });

    const updatedOriginal: ApprovalEvidenceSource = Object.freeze({
      ...original,
      verified: true,
      selected: true,
      provenance: "system_verified",
      verificationStatus: "verified",
      official: false,
      claimVerificationStatus: "verified",
      trustRoute: "external_corroborated",
      corroborated: true,
      corroborationSourceIds: Object.freeze([candidate.sourceId]),
      checkedAt: searchedAt,
    });

    nextSources[originalIndex] = updatedOriginal;
    if (!nextSources.some((item) => item.sourceId === candidate.sourceId)) {
      nextSources.push(corroboratingSource);
    }
    changed = true;
  }

  if (!changed) return result;

  const oldPack = result.evidence.pack;
  const verifiedFactFields = new Set(oldPack.verifiedFactFields ?? []);
  for (const source of nextSources) {
    if (!source.verified) continue;
    for (const fact of source.matchedFacts ?? []) verifiedFactFields.add(fact.field);
  }
  const unverifiedFactFields = (oldPack.requiredFactFields ?? []).filter((field) => !verifiedFactFields.has(field));
  const pack = Object.freeze({
    ...oldPack,
    status: unverifiedFactFields.length ? "needs_review" as const : "verified" as const,
    coverageStatus: unverifiedFactFields.length ? "needs_review" as const : "verified" as const,
    sourcePolicyCompliance: "passed" as const,
    reviewedAt: searchedAt,
    verifiedFactFields: Object.freeze([...verifiedFactFields]),
    unverifiedFactFields: Object.freeze(unverifiedFactFields),
    sources: Object.freeze(nextSources),
  });

  const document: ContentDocument = Object.freeze({
    ...result.document,
    metadata: Object.freeze({
      ...result.document.metadata!,
      approvalEvidence: pack,
      updatedAt: searchedAt,
    }),
  });
  const currentContent = result.data.contents.find((item) => item.id === content.id) ?? content;
  const approvalReadiness = deriveApprovalReadinessReport({
    document,
    ...(currentContent.opportunity ? { opportunity: currentContent.opportunity } : {}),
    standardQualityApproved: isStandardQualityApproved(currentContent.quality),
    supersededQualityReview: currentContent.quality?.reviewedRevisionId !== undefined
      && currentContent.quality.reviewedRevisionId !== editorialRevisionId(document),
    standardQualityBlockingReasons: standardQualityBlockingReasons(currentContent.quality),
  });
  const quality = Object.freeze({
    ...result.quality,
    ...(approvalReadiness ? { approvalReadiness } : {}),
  });
  const data = withCorroboratedQuality(result.data, currentContent, document, quality, searchedAt);

  return Object.freeze({
    ...result,
    data,
    document,
    quality,
    evidence: Object.freeze({
      ...result.evidence,
      pack,
      verifiedSourceCount: nextSources.filter((source) => source.verified).length,
      rejectedSourceCount: nextSources.filter((source) => source.verificationStatus !== "verified").length,
      reasons: Object.freeze([
        ...result.evidence.reasons,
        `비공식 출처 보강 검색을 실행했습니다 (${nextSources.filter((source) => source.provenance === "system_verified").length}개 보강 출처).`,
      ]),
    }),
  });
}

function withCorroboratedQuality(
  data: UserData,
  content: UserContent,
  document: ContentDocument,
  quality: UserContent["quality"],
  updatedAt: string,
): UserData {
  const nextContent: UserContent = { ...content, document, quality, updatedAt };
  return {
    ...data,
    contents: data.contents.map((item) => item.id === content.id ? nextContent : item),
    qualityReports: [
      ...(data.qualityReports ?? []).filter((item) => item.contentId !== content.id),
      { contentId: content.id, report: quality },
    ],
  };
}

function withNormalizedDocument(data: UserData, content: UserContent, document: ContentDocument): UserData {
  const normalizedAt = new Date().toISOString();
  const quality = content.quality
    ? Object.freeze({
      ...content.quality,
      ...(content.quality.approved ? { reviewedRevisionId: editorialRevisionId(document) } : {}),
    })
    : undefined;
  const nextContent: UserContent = {
    ...content,
    document,
    ...(quality ? { quality } : {}),
    updatedAt: normalizedAt,
  };
  return {
    ...data,
    contents: data.contents.map((item) => item.id === content.id ? nextContent : item),
    ...(quality ? {
      qualityReports: [
        ...(data.qualityReports ?? []).filter((item) => item.contentId !== content.id),
        { contentId: content.id, report: quality },
      ],
    } : {}),
  };
}

function withCurrentInspectionIdentity(
  result: ApprovalReadinessExecutionResult,
  connectionId?: string,
): ApprovalReadinessExecutionResult {
  const content = result.data.contents.find((item) => item.document?.id === result.document.id)
    ?? result.data.contents.find((item) => item.id === result.document.id);
  if (!content) return result;

  const identity = approvalReadinessExecutionIdentity(
    { ...content, document: result.document },
    connectionId,
  );
  const execution = result.document.metadata?.approvalReadinessExecution;
  if (execution
    && execution.version === approvalReadinessInspectionVersion
    && execution.key === identity.key
    && execution.editorialRevisionId === identity.editorialRevisionId
    && execution.publishingContextKey === identity.publishingContextKey
    && execution.evidenceFingerprint === identity.evidenceFingerprint) {
    return result;
  }

  const checkedAt = execution?.checkedAt ?? new Date().toISOString();
  const document: ContentDocument = Object.freeze({
    ...result.document,
    metadata: Object.freeze({
      ...result.document.metadata!,
      approvalReadinessExecution: Object.freeze({
        version: approvalReadinessInspectionVersion,
        key: identity.key,
        editorialRevisionId: identity.editorialRevisionId,
        publishingContextKey: identity.publishingContextKey,
        evidenceFingerprint: identity.evidenceFingerprint,
        status: "completed" as const,
        checkedAt,
      }),
    }),
  });
  const data: UserData = {
    ...result.data,
    contents: result.data.contents.map((item) => item.id === content.id ? { ...item, document } : item),
  };
  return Object.freeze({ ...result, document, data });
}
