import {
  assertConfirmedContentOpportunity,
  contentOpportunityKeywords,
  normalizeSeoKeyword,
  type ConfirmedContentOpportunity,
} from "../../core/content";

export type ConfirmedGenerationContent = Readonly<{
  id?: string;
  workspaceId?: string;
  projectId?: string;
  primaryKeyword?: string;
  relatedKeywords?: readonly string[];
  searchIntent?: string;
  opportunity?: ConfirmedContentOpportunity;
}>;

export type ConfirmedGenerationContract = Readonly<{
  opportunity: ConfirmedContentOpportunity;
  keywords: readonly string[];
}>;

type ConfirmedGenerationRequest = {
  workspaceId: string;
  projectId: string;
  contentId: string;
  opportunityId?: unknown;
  opportunityVersion?: unknown;
  opportunityFingerprint?: unknown;
  primaryKeyword?: unknown;
  topic?: unknown;
  searchIntent?: unknown;
  secondaryKeywords?: unknown;
  keywords?: unknown;
};

export function resolveConfirmedGenerationOpportunity(
  content: ConfirmedGenerationContent,
  request: ConfirmedGenerationRequest,
): ConfirmedGenerationContract {
  let opportunity: ConfirmedContentOpportunity;
  try {
    opportunity = assertConfirmedContentOpportunity(content.opportunity, {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      contentId: request.contentId,
      opportunityId: request.opportunityId,
      opportunityVersion: request.opportunityVersion,
      opportunityFingerprint: request.opportunityFingerprint,
      primaryKeyword: request.primaryKeyword,
      selectedTopic: request.topic,
      searchIntent: request.searchIntent,
      secondaryKeywords: request.secondaryKeywords,
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("선택한 콘텐츠 전략이 현재 원고와 일치하지 않습니다")) {
      throw error;
    }

    const stored = content.opportunity;
    if (!stored || !isWholeStoredSnapshotRecovery(stored, request)) {
      // The route still contains a legacy same-identity recovery fallback. Clear
      // the request fingerprint so a partial field mismatch cannot pass that
      // fallback and reach the AI provider.
      request.opportunityFingerprint = undefined;
      throw new Error("선택한 콘텐츠 전략이 요청한 현재 원고와 일치하지 않습니다. 주제와 대표 키워드를 다시 확인해 주세요.");
    }

    opportunity = assertConfirmedContentOpportunity(stored, {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      contentId: request.contentId,
      opportunityId: stored.opportunityId,
      opportunityVersion: stored.version,
      opportunityFingerprint: stored.fingerprint,
      primaryKeyword: stored.primaryKeyword,
      selectedTopic: stored.selectedTopic,
      searchIntent: stored.searchIntent,
      secondaryKeywords: stored.secondaryKeywords,
    });
    request = {
      ...request,
      keywords: contentOpportunityKeywords(stored),
    };
  }

  const mirroredPrimary = normalizeSeoKeyword(content.primaryKeyword ?? "");
  const mirroredRelated = (content.relatedKeywords ?? []).map(normalizeSeoKeyword);
  if (mirroredPrimary.toLocaleLowerCase("ko-KR") !== opportunity.primaryKeyword.toLocaleLowerCase("ko-KR")
    || normalizeSeoKeyword(content.searchIntent ?? "").toLocaleLowerCase("ko-KR") !== normalizeSeoKeyword(opportunity.searchIntent).toLocaleLowerCase("ko-KR")
    || JSON.stringify(mirroredRelated) !== JSON.stringify(opportunity.secondaryKeywords.map(normalizeSeoKeyword))) {
    throw new Error("Content의 canonical SEO 필드가 확정된 콘텐츠 전략 snapshot과 일치하지 않습니다.");
  }
  const keywords = resolveConfirmedGenerationKeywords({
    primaryKeyword: opportunity.primaryKeyword,
    relatedKeywords: opportunity.secondaryKeywords,
  }, request.keywords);
  const canonicalKeywords = contentOpportunityKeywords(opportunity);
  if (JSON.stringify(keywords) !== JSON.stringify(canonicalKeywords)) {
    throw new Error("선택한 콘텐츠 전략의 키워드 구성이 저장된 값과 일치하지 않습니다.");
  }
  return Object.freeze({ opportunity, keywords: canonicalKeywords });
}

function isWholeStoredSnapshotRecovery(
  stored: ConfirmedContentOpportunity,
  request: ConfirmedGenerationRequest,
): boolean {
  const sameIdentity = typeof request.opportunityId === "string"
    && request.opportunityId === stored.opportunityId
    && String(request.opportunityVersion) === String(stored.version)
    && typeof request.opportunityFingerprint === "string"
    && request.opportunityFingerprint === stored.fingerprint;
  if (!sameIdentity) return false;

  const primaryChanged = normalizedText(request.primaryKeyword) !== normalizedText(stored.primaryKeyword);
  const topicChanged = normalizedText(request.topic) !== normalizedText(stored.selectedTopic);
  const intentChanged = normalizedText(request.searchIntent) !== normalizedText(stored.searchIntent);
  const secondaryChanged = JSON.stringify(normalizedList(request.secondaryKeywords)) !== JSON.stringify(stored.secondaryKeywords.map(normalizeSeoKeyword));

  return primaryChanged && topicChanged && intentChanged && secondaryChanged;
}

function normalizedText(value: unknown): string {
  return normalizeSeoKeyword(typeof value === "string" ? value : "").toLocaleLowerCase("ko-KR");
}

function normalizedList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map((item) => normalizeSeoKeyword(String(item))) : [];
}

/**
 * Resolves the only keyword list that may enter editorial generation.
 * Planning candidates are intentionally excluded: Content.primaryKeyword is
 * the durable confirmation boundary.
 */
export function resolveConfirmedGenerationKeywords(
  content: ConfirmedGenerationContent,
  requestedKeywords: unknown,
): readonly string[] {
  const confirmed = normalizeSeoKeyword(content.primaryKeyword ?? "");
  if (!confirmed) throw new Error("대표 키워드를 먼저 선택해 주세요.");

  const requested = Array.isArray(requestedKeywords)
    ? normalizeSeoKeyword(String(requestedKeywords[0] ?? ""))
    : "";
  if (!requested) throw new Error("대표 키워드를 먼저 선택해 주세요.");
  if (requested.toLocaleLowerCase("ko-KR") !== confirmed.toLocaleLowerCase("ko-KR")) {
    throw new Error("확정된 대표 키워드와 생성 요청의 대표 키워드가 일치하지 않습니다. 키워드를 다시 확인해 주세요.");
  }

  const related = (content.relatedKeywords ?? [])
    .map(normalizeSeoKeyword)
    .filter((keyword) => keyword && keyword.toLocaleLowerCase("ko-KR") !== confirmed.toLocaleLowerCase("ko-KR"));
  return Object.freeze([confirmed, ...new Set(related)]);
}
