import type { PersistenceMutation, PersistenceStore } from "../../../core/data";
import {
  canonicalizeApprovalEvidenceUrl,
  createNotRequiredApprovalEvidencePack,
  deriveApprovalReadinessReport,
  evaluateApprovalDuplicateRisk,
  extractProfileApprovalFactsFromText,
  normalizeContentPurpose,
  resolveApprovalEvidenceRequirement,
  type ApprovalDuplicateCheckSnapshot,
  type ApprovalEvidencePack,
  type ApprovalEvidenceProvenance,
  type ApprovalEvidenceSource,
  type ApprovalEvidenceSourceType,
  type ApprovalReadinessReport,
} from "../../../core/approval";
import { contentBlockOwnership, serializeStructuredList, type ContentDocument } from "../../../core/content";
import { editorialRevisionId, isStandardQualityApproved } from "../../../core/quality";
import type { UserContent, UserData } from "../../user-flow/user-data";
import { internalLinkCatalogContextKey } from "../publishing/InternalLinkCatalogPolicy";
import {
  snapshotApprovalPolicyForPlanning,
  type ApprovalAwareContent,
} from "./ApprovalContentPolicy";
import { approvalEvidenceFingerprint } from "./ApprovalReadinessExecutionIdentity";
import { canonicalSources } from "./ApprovalEvidenceCandidateNormalization";

const USER_DATA_COLLECTION = "application";
const USER_DATA_ID = "user-data";

/**
 * Canonical persistence boundary for approval-preparation state.
 *
 * A new Planning Content receives one policy snapshot from its Project. Once the
 * Content exists, stale UI writes may omit the snapshot but cannot replace it
 * with a different purpose, policy, profile, or version.
 *
 * Approval-mode canonical documents also receive deterministic Evidence
 * candidates and duplicate-risk snapshots. Neither process uses another AI
 * call and neither applies to standard content.
 */
export class ApprovalAwarePersistenceStore implements PersistenceStore {
  constructor(private readonly delegate: PersistenceStore) {}

  async batch(mutations: readonly PersistenceMutation[]): Promise<void> {
    const normalized: PersistenceMutation[] = [];
    for (const mutation of mutations) {
      if (mutation.type === "set" && isUserDataKey(mutation.collection, mutation.id)) {
        const current = await this.delegate.get<UserData>(mutation.collection, mutation.id);
        normalized.push({
          ...mutation,
          value: applyApprovalPersistencePolicy(current, mutation.value as UserData),
        });
      } else {
        normalized.push(mutation);
      }
    }
    await this.delegate.batch(normalized);
  }

  delete(collection: string, id: string): Promise<void> {
    return this.delegate.delete(collection, id);
  }

  get<T>(collection: string, id: string): Promise<T | undefined> {
    return this.delegate.get<T>(collection, id);
  }

  list<T>(collection: string): Promise<readonly T[]> {
    return this.delegate.list<T>(collection);
  }

  async set<T>(collection: string, id: string, value: T): Promise<void> {
    if (!isUserDataKey(collection, id)) {
      await this.delegate.set(collection, id, value);
      return;
    }
    await this.delegate.update<UserData>(collection, id, (current) =>
      applyApprovalPersistencePolicy(current, value as UserData));
  }

  async update<T>(collection: string, id: string, update: (current: T | undefined) => T): Promise<T> {
    if (!isUserDataKey(collection, id)) {
      return this.delegate.update(collection, id, update);
    }
    return this.delegate.update<UserData>(collection, id, (current) => {
      const candidate = update(current as T | undefined) as UserData;
      return applyApprovalPersistencePolicy(current, candidate);
    }) as Promise<T>;
  }
}

export function applyApprovalPersistencePolicy(
  current: UserData | undefined,
  candidate: UserData,
): UserData {
  if (!candidate || !Array.isArray(candidate.projects) || !Array.isArray(candidate.contents)) {
    throw new Error("저장할 Workspace 데이터가 올바르지 않습니다.");
  }

  const previousById = new Map((current?.contents ?? []).map((content) => [content.id, content]));
  let next = candidate;

  for (const content of candidate.contents) {
    const previous = previousById.get(content.id);
    if (previous) {
      next = preserveExistingSnapshot(next, previous, content);
      continue;
    }
    if (content.planningWorkflow) {
      next = snapshotApprovalPolicyForPlanning(next, content.projectId, content.id);
    }
  }

  next = attachApprovalEvidenceCandidatePacks(next);
  next = attachApprovalDuplicateSnapshots(next);
  return reconcileApprovalReadinessAggregates(next);
}

type ReadinessAwareQuality = NonNullable<UserContent["quality"]>
  & Readonly<{ approvalReadiness?: ApprovalReadinessReport }>;

function readinessAwareQuality(
  quality: UserContent["quality"],
): ReadinessAwareQuality | undefined {
  return quality as ReadinessAwareQuality | undefined;
}

/**
 * Recomputes the approval-readiness aggregate from the snapshots that are
 * actually being stored, and writes the same answer into both persisted copies.
 *
 * The aggregate is derived state with two historical writers (Quality Review
 * and the readiness service) and two storage locations
 * (`contents[].quality.approvalReadiness` and
 * `qualityReports[].report.approvalReadiness`). Reconciling here — after the
 * Evidence candidate packs and the duplicate snapshot for this save have been
 * attached — means the persisted verdict always matches the persisted evidence,
 * and the two copies cannot describe the same article differently.
 *
 * Absence is meaningful and is preserved: a Content that has never been
 * inspected, or whose publishing context was deliberately invalidated, keeps no
 * aggregate rather than gaining a freshly invented one.
 */
function reconcileApprovalReadinessAggregates(data: UserData): UserData {
  const derivedByContentId = new Map<string, ApprovalReadinessReport>();
  let contentsChanged = false;

  const contents = data.contents.map((content) => {
    const aware = content as ApprovalAwareContent;
    if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval") return content;
    const quality = readinessAwareQuality(content.quality);
    if (!quality || !content.document?.metadata?.approvalPolicy) return content;

    const derived = deriveApprovalReadinessReport({
      document: content.document,
      ...(content.opportunity ? { opportunity: content.opportunity } : {}),
      standardQualityApproved: isStandardQualityApproved(quality),
      supersededQualityReview: quality.reviewedRevisionId !== undefined
        && quality.reviewedRevisionId !== editorialRevisionId(content.document),
    });
    if (!derived) return content;
    derivedByContentId.set(content.id, derived);

    if (!quality.approvalReadiness) return content;
    if (sameReadinessReport(quality.approvalReadiness, derived)) return content;
    contentsChanged = true;
    return { ...content, quality: { ...quality, approvalReadiness: derived } } as UserContent;
  });

  const reports = data.qualityReports ?? [];
  let reportsChanged = false;
  const qualityReports = reports.map((entry) => {
    const derived = derivedByContentId.get(entry.contentId);
    const report = readinessAwareQuality(entry.report);
    if (!derived || !report?.approvalReadiness) return entry;
    if (sameReadinessReport(report.approvalReadiness, derived)) return entry;
    reportsChanged = true;
    return { contentId: entry.contentId, report: { ...report, approvalReadiness: derived } as UserContent["quality"] as NonNullable<UserContent["quality"]> };
  });

  if (!contentsChanged && !reportsChanged) return data;
  return {
    ...data,
    ...(contentsChanged ? { contents } : {}),
    ...(reportsChanged ? { qualityReports } : {}),
  };
}

function sameReadinessReport(
  left: ApprovalReadinessReport | undefined,
  right: ApprovalReadinessReport,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function preserveExistingSnapshot(
  data: UserData,
  previous: UserContent,
  candidate: UserContent,
): UserData {
  const prior = previous as ApprovalAwareContent;
  const incoming = candidate as ApprovalAwareContent;
  const priorPurpose = normalizeContentPurpose(prior.contentPurpose);
  const incomingPurpose = incoming.contentPurpose === undefined
    ? priorPurpose
    : normalizeContentPurpose(incoming.contentPurpose);

  if (incomingPurpose !== priorPurpose) {
    throw new Error("Planning이 시작된 Content의 콘텐츠 목적은 변경할 수 없습니다. 현재 작업을 취소하고 새 Content로 시작해 주세요.");
  }

  assertUnchanged("approvalPolicyId", prior.approvalPolicyId, incoming.approvalPolicyId);
  assertUnchanged("approvalPolicyVersion", prior.approvalPolicyVersion, incoming.approvalPolicyVersion);
  assertUnchanged("approvalProfileId", prior.approvalProfileId, incoming.approvalProfileId);
  assertUnchanged("approvalProfileVersion", prior.approvalProfileVersion, incoming.approvalProfileVersion);

  return {
    ...data,
    contents: data.contents.map((item) => {
      if (item.id !== candidate.id) return item;
      const sanitized = omitApprovalSnapshot(item as ApprovalAwareContent);
      if (priorPurpose === "standard") {
        return { ...sanitized, contentPurpose: "standard" } as UserContent;
      }
      const restored = {
        ...sanitized,
        contentPurpose: "adsense_approval",
        ...(prior.approvalPolicyId ? { approvalPolicyId: prior.approvalPolicyId } : {}),
        ...(prior.approvalPolicyVersion ? { approvalPolicyVersion: prior.approvalPolicyVersion } : {}),
        ...(prior.approvalProfileId ? { approvalProfileId: prior.approvalProfileId } : {}),
        ...(prior.approvalProfileVersion ? { approvalProfileVersion: prior.approvalProfileVersion } : {}),
      } as UserContent;
      return preserveCurrentApprovalCheckSnapshots(previous, restored);
    }),
  };
}

function preserveCurrentApprovalCheckSnapshots(
  previous: UserContent,
  candidate: UserContent,
): UserContent {
  if (!previous.document?.metadata || !candidate.document?.metadata) return candidate;
  const revisionId = editorialRevisionId(candidate.document);
  if (editorialRevisionId(previous.document) !== revisionId
    || internalLinkCatalogContextKey(previous) !== internalLinkCatalogContextKey(candidate)) {
    return candidate;
  }

  const previousEvidence = previous.document.metadata.approvalEvidence;
  const candidateEvidence = candidate.document.metadata.approvalEvidence;
  const approvalEvidence = candidateEvidence?.reviewedRevisionId === revisionId
    ? candidateEvidence
    : previousEvidence?.reviewedRevisionId === revisionId
      ? previousEvidence
      : candidateEvidence;
  const siteApprovalReadiness = candidate.document.metadata.siteApprovalReadiness
    ?? previous.document.metadata.siteApprovalReadiness;
  const evidenceIdentityIsCurrent = !candidateEvidence
    || approvalEvidenceFingerprint(previous.document) === approvalEvidenceFingerprint(candidate.document);
  const approvalReadinessExecution = candidate.document.metadata.approvalReadinessExecution
    ?? (evidenceIdentityIsCurrent ? previous.document.metadata.approvalReadinessExecution : undefined);
  const previousQuality = readinessAwareQuality(previous.quality);
  const candidateQuality = readinessAwareQuality(candidate.quality);

  return {
    ...candidate,
    document: {
      ...candidate.document,
      metadata: {
        ...candidate.document.metadata,
        ...(approvalEvidence ? { approvalEvidence } : {}),
        ...(siteApprovalReadiness ? { siteApprovalReadiness } : {}),
        ...(approvalReadinessExecution ? { approvalReadinessExecution } : {}),
      },
    },
    /**
     * A stale UI write may omit the readiness aggregate; that must not erase it.
     * It may never *replace* it, though: this used to restore the previously
     * stored aggregate unconditionally, so the readiness service's own write
     * was reverted in `contents[].quality` while the fresher answer survived in
     * `qualityReports[]`. That is how the two copies came to disagree.
     */
    ...(candidateQuality
      && !candidateQuality.approvalReadiness
      && previousQuality?.approvalReadiness
      && evidenceIdentityIsCurrent
      ? { quality: { ...candidateQuality, approvalReadiness: previousQuality.approvalReadiness } as UserContent["quality"] }
      : {}),
  };
}

function attachApprovalEvidenceCandidatePacks(data: UserData): UserData {
  let changed = false;
  const contents = data.contents.map((content) => {
    const aware = content as ApprovalAwareContent;
    if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval" || !content.document?.metadata) return content;

    const existing = content.document.metadata.approvalEvidence;
    const requirement = resolveApprovalEvidenceRequirement(content.opportunity);
    if (requirement === "not_required") {
      const pack = existing && !emptyMissingEvidencePack(existing)
        ? existing
        : createNotRequiredApprovalEvidencePack();
      if (JSON.stringify(existing) === JSON.stringify(pack)) return content;
      changed = true;
      return {
        ...content,
        document: {
          ...content.document,
          metadata: { ...content.document.metadata, approvalEvidence: pack },
        },
      } as UserContent;
    }
    if (existing?.reviewedRevisionId === editorialRevisionId(content.document)) return content;

    const visibleCandidates = collectEvidenceCandidates(content.document, aware.approvalProfileId);
    const retrievedAt = latestDocumentTimestamp([content], content.updatedAt);
    const sourceType = approvalEvidenceSourceType(aware.approvalProfileId);
    const pack = mergeApprovalEvidenceCandidatePack(
      existing,
      visibleCandidates,
      sourceType,
      retrievedAt,
    );

    if (JSON.stringify(existing) === JSON.stringify(pack)) return content;
    changed = true;
    return {
      ...content,
      document: {
        ...content.document,
        metadata: {
          ...content.document.metadata,
          approvalEvidence: pack,
        },
      },
    } as UserContent;
  });

  return changed ? { ...data, contents } : data;
}

function mergeApprovalEvidenceCandidatePack(
  existing: ApprovalEvidencePack | undefined,
  visibleCandidates: readonly Readonly<{
    url: string;
    title: string;
    publisher: string;
    context: string;
    blockId: string;
    linkedBlockIds: readonly string[];
    provenance: ApprovalEvidenceProvenance;
  }>[],
  defaultSourceType: ApprovalEvidenceSourceType,
  retrievedAt: string,
): ApprovalEvidencePack {
  const sources = new Map<string, ApprovalEvidenceSource>();

  for (const source of existing?.sources ?? []) {
    const url = normalizeSourceUrl(source.url);
    if (!url) continue;
    const normalized = resetEvidenceCandidate(source, url);
    sources.set(url, mergeEvidenceSources(sources.get(url), normalized));
  }

  for (const candidate of visibleCandidates) {
    const next = Object.freeze({
      sourceId: evidenceSourceId(candidate.url),
      url: candidate.url,
      originalUrl: candidate.url,
      canonicalUrl: candidate.url,
      title: candidate.title,
      publisher: candidate.publisher,
      sourceType: defaultSourceType,
      retrievedAt,
      verified: false,
      provenance: candidate.provenance,
      cited: candidate.provenance === "citation",
      selected: candidate.provenance === "citation" || candidate.provenance === "user_selected",
      citationExcerpt: candidate.context,
      linkedBlockIds: candidate.linkedBlockIds,
      facts: Object.freeze([Object.freeze({ field: "citedContext", value: candidate.context })]),
      rights: Object.freeze({ status: "unknown" as const }),
    } satisfies ApprovalEvidenceSource);
    sources.set(candidate.url, mergeEvidenceSources(sources.get(candidate.url), next));
  }

  const values = canonicalSources([...sources.values()]);
  return values.length
      ? Object.freeze({
        version: "1.0",
        status: "needs_review",
        coverageStatus: "needs_review",
        sources: values,
      })
      : Object.freeze({
        version: "1.0",
        status: "missing",
        coverageStatus: "missing",
        sources: Object.freeze([]),
      });
}

function resetEvidenceCandidate(
  source: ApprovalEvidenceSource,
  url: string,
): ApprovalEvidenceSource {
  const provenance = source.provenance
    ?? (source.cited === true ? "citation" : source.selected === true ? "user_selected" : "search_candidate");
  return Object.freeze({
    ...source,
    url,
    canonicalUrl: url,
    provenance,
    verified: false,
    cited: provenance === "citation",
    selected: provenance === "citation" || provenance === "user_selected",
    verificationStatus: undefined,
    accessVerificationStatus: "not_evaluated",
    officialDomainVerificationStatus: "not_evaluated",
    claimVerificationStatus: "not_evaluated",
    failureReason: undefined,
    matchedFacts: undefined,
    checkedAt: undefined,
  });
}

function mergeEvidenceSources(
  previous: ApprovalEvidenceSource | undefined,
  next: ApprovalEvidenceSource,
): ApprovalEvidenceSource {
  if (!previous) return next;
  const provenance = preferredProvenance(previous.provenance, next.provenance);
  const preferred = provenance === next.provenance ? next : previous;
  const alternate = preferred === next ? previous : next;
  const facts = new Map<string, ApprovalEvidenceSource["facts"][number]>();
  for (const fact of [...previous.facts, ...next.facts]) {
    const key = `${fact.field}:${fact.value.normalize("NFKC").trim()}`;
    if (!facts.has(key)) facts.set(key, fact);
  }
  return Object.freeze({
    ...alternate,
    ...preferred,
    sourceId: previous.sourceId || next.sourceId,
    url: next.canonicalUrl ?? next.url,
    canonicalUrl: next.canonicalUrl ?? next.url,
    originalUrl: preferred.originalUrl ?? alternate.originalUrl ?? preferred.url,
    title: usefulSourceLabel(preferred.title, preferred.publisher) ? preferred.title : alternate.title,
    publisher: usefulSourceLabel(preferred.publisher) ? preferred.publisher : alternate.publisher,
    provenance,
    cited: previous.cited === true || next.cited === true || provenance === "citation",
    selected: provenance === "citation" || provenance === "user_selected",
    citationExcerpt: preferred.citationExcerpt ?? alternate.citationExcerpt,
    linkedBlockIds: Object.freeze([...new Set([
      ...(previous.linkedBlockIds ?? []),
      ...(next.linkedBlockIds ?? []),
    ])]),
    facts: Object.freeze([...facts.values()]),
  });
}

function preferredProvenance(
  first: ApprovalEvidenceProvenance | undefined,
  second: ApprovalEvidenceProvenance | undefined,
): ApprovalEvidenceProvenance {
  const fallback = first ?? second ?? "search_candidate";
  return provenancePriority(second) > provenancePriority(first) ? second! : fallback;
}

function provenancePriority(value: ApprovalEvidenceProvenance | undefined): number {
  if (value === "citation") return 4;
  if (value === "user_selected") return 3;
  if (value === "document_link") return 2;
  if (value === "search_candidate") return 1;
  return 0;
}

function usefulSourceLabel(value: string | undefined, publisher?: string): boolean {
  const label = value?.trim();
  if (!label) return false;
  return publisher ? label !== publisher.trim() : !/^www\.|\.[a-z]{2,}$/i.test(label);
}

function collectEvidenceCandidates(
  document: ContentDocument,
  profileId: ApprovalAwareContent["approvalProfileId"],
): readonly Readonly<{
  url: string;
  title: string;
  publisher: string;
  context: string;
  blockId: string;
  linkedBlockIds: readonly string[];
  provenance: ApprovalEvidenceProvenance;
}>[] {
  const found = new Map<string, { url: string; title: string; publisher: string; context: string; blockId: string; linkedBlockIds: readonly string[]; provenance: ApprovalEvidenceProvenance }>();
  for (const [blockIndex, block] of document.blocks.entries()) {
    const texts = block.type === "paragraph" || block.type === "heading"
      ? [block.text]
      : block.type === "list"
        ? [serializeStructuredList(block)]
      : block.type === "table"
        ? [block.caption ?? "", ...block.headers, ...block.rows.flat()]
        : [];
    if (block.type === "button" && block.purpose === "source") {
      texts.push(block.targetUrl);
    }
    for (const text of texts) {
    for (const match of text.matchAll(/https:\/\/[^\s<>)"'\]}]+/gi)) {
      const normalized = normalizeSourceUrl(match[0]);
      if (!normalized) continue;
      const url = new URL(normalized);
      const context = text.replace(/\s+/g, " ").trim().slice(0, 800);
      const previous = found.get(normalized);
      const linkedBlockIds = linkedClaimBlockIds(document, blockIndex, block.id, text, profileId);
      const provenance: ApprovalEvidenceProvenance = block.type === "button"
        && block.purpose === "source"
        && contentBlockOwnership(block) === "user_manual"
        ? "user_selected"
        : "document_link";
      found.set(normalized, {
        url: normalized,
        title: previous?.title ?? url.hostname,
        publisher: previous?.publisher ?? url.hostname,
        context: previous?.context && previous.context.length >= context.length ? previous.context : context,
        blockId: previous?.blockId ?? block.id,
        linkedBlockIds: Object.freeze([...new Set([
          ...(previous?.linkedBlockIds ?? []),
          ...linkedBlockIds,
        ])]),
        provenance: preferredProvenance(previous?.provenance, provenance),
      });
    }
    }
  }
  return Object.freeze([...found.values()]);
}

function emptyMissingEvidencePack(pack: ApprovalEvidencePack): boolean {
  return pack.status === "missing"
    && pack.sources.length === 0
    && !pack.reviewedAt
    && !pack.reviewedRevisionId;
}

function linkedClaimBlockIds(
  document: ContentDocument,
  blockIndex: number,
  sourceBlockId: string,
  sourceText: string,
  profileId: ApprovalAwareContent["approvalProfileId"],
): readonly string[] {
  const ids = [sourceBlockId];
  if (!profileId || !/(?:^|\n)\s*(?:출처|공식\s*(?:출처|확인처))\s*:/u.test(sourceText)) {
    return Object.freeze(ids);
  }
  const previous = document.blocks[blockIndex - 1];
  if (previous?.type !== "paragraph") return Object.freeze(ids);
  if (!extractProfileApprovalFactsFromText(previous.text, profileId).length) return Object.freeze(ids);
  ids.unshift(previous.id);
  return Object.freeze(ids);
}

function approvalEvidenceSourceType(profileId: ApprovalAwareContent["approvalProfileId"]): ApprovalEvidenceSourceType {
  return profileId === "wordpress_life_economy_v1" ? "public_agency" : "official_institution";
}

function normalizeSourceUrl(value: string): string | undefined {
  const canonical = canonicalizeApprovalEvidenceUrl(value.replace(/[.,;:!?]+$/g, ""));
  return canonical.startsWith("https://") ? canonical : undefined;
}

function evidenceSourceId(url: string): string {
  let hash = 2166136261;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `approval-source-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function attachApprovalDuplicateSnapshots(data: UserData): UserData {
  const documentsByProject = new Map<string, UserContent[]>();
  for (const content of data.contents) {
    if (!content.document) continue;
    documentsByProject.set(content.projectId, [
      ...(documentsByProject.get(content.projectId) ?? []),
      content,
    ]);
  }

  let changed = false;
  const contents = data.contents.map((content) => {
    const aware = content as ApprovalAwareContent;
    if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval" || !content.document?.metadata) return content;

    const projectDocuments = documentsByProject.get(content.projectId) ?? [];
    const checkedAt = latestDocumentTimestamp(projectDocuments, content.updatedAt);
    const duplicateCandidates = projectDocuments.flatMap((candidate) => candidate.id === content.id || !candidate.document
      ? []
      : [{ contentId: candidate.id, document: candidate.document }]);
    const existing = content.document.metadata.approvalDuplicateCheck;
    const stableSnapshot = evaluateApprovalDuplicateRisk(
      content.document,
      duplicateCandidates,
      existing?.checkedAt ?? checkedAt,
    );
    if (sameDuplicateSnapshot(existing, stableSnapshot)) return content;
    const snapshot = existing?.checkedAt === checkedAt
      ? stableSnapshot
      : evaluateApprovalDuplicateRisk(content.document, duplicateCandidates, checkedAt);
    changed = true;
    return {
      ...content,
      document: {
        ...content.document,
        metadata: {
          ...content.document.metadata,
          approvalDuplicateCheck: snapshot,
        },
      },
    } as UserContent;
  });

  return changed ? { ...data, contents } : data;
}

function latestDocumentTimestamp(contents: readonly UserContent[], fallback: string): string {
  const timestamps = contents
    .flatMap((content) => [content.updatedAt, content.document?.metadata?.updatedAt])
    .filter((value): value is string => typeof value === "string" && Boolean(value));
  if (!timestamps.length) return fallback;
  return timestamps.sort().at(-1) ?? fallback;
}

function sameDuplicateSnapshot(
  left: ApprovalDuplicateCheckSnapshot | undefined,
  right: ApprovalDuplicateCheckSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function omitApprovalSnapshot(content: ApprovalAwareContent): Partial<ApprovalAwareContent> {
  const sanitized: Record<string, unknown> = { ...content };
  for (const field of [
    "approvalPolicyId",
    "approvalPolicyVersion",
    "approvalProfileId",
    "approvalProfileVersion",
  ] as const) {
    Reflect.deleteProperty(sanitized, field);
  }
  return sanitized as Partial<ApprovalAwareContent>;
}

function assertUnchanged(label: string, previous: unknown, incoming: unknown): void {
  if (previous !== undefined && incoming !== undefined && incoming !== previous) {
    throw new Error(`Planning이 시작된 Content의 승인 정책 snapshot은 변경할 수 없습니다. (${label})`);
  }
}

function isUserDataKey(collection: string, id: string): boolean {
  return collection === USER_DATA_COLLECTION && id === USER_DATA_ID;
}
