import type { PersistenceMutation, PersistenceStore } from "../../../core/data";
import {
  evaluateApprovalDuplicateRisk,
  normalizeContentPurpose,
  type ApprovalDuplicateCheckSnapshot,
  type ApprovalEvidencePack,
  type ApprovalEvidenceSourceType,
} from "../../../core/approval";
import type { ContentDocument } from "../../../core/content";
import { contentRevisionId } from "../../../core/quality";
import type { UserContent, UserData } from "../../user-flow/user-data";
import {
  snapshotApprovalPolicyForPlanning,
  type ApprovalAwareContent,
} from "./ApprovalContentPolicy";

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
  return attachApprovalDuplicateSnapshots(next);
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
  const revisionId = contentRevisionId(candidate.document);
  if (contentRevisionId(previous.document) !== revisionId) return candidate;

  const previousEvidence = previous.document.metadata.approvalEvidence;
  const candidateEvidence = candidate.document.metadata.approvalEvidence;
  if (candidateEvidence?.reviewedRevisionId === revisionId) return candidate;
  if (previousEvidence?.reviewedRevisionId !== revisionId) return candidate;

  const previousQuality = previous.quality as (NonNullable<UserContent["quality"]> & Readonly<{
    approvalReadiness?: unknown;
  }>) | undefined;
  const candidateQuality = candidate.quality;
  return {
    ...candidate,
    document: {
      ...candidate.document,
      metadata: {
        ...candidate.document.metadata,
        approvalEvidence: previousEvidence,
        ...(previous.document.metadata.siteApprovalReadiness
          ? { siteApprovalReadiness: previous.document.metadata.siteApprovalReadiness }
          : {}),
      },
    },
    ...(candidateQuality && previousQuality?.approvalReadiness
      ? {
          quality: {
            ...candidateQuality,
            approvalReadiness: previousQuality.approvalReadiness,
          } as UserContent["quality"],
        }
      : {}),
  };
}

function attachApprovalEvidenceCandidatePacks(data: UserData): UserData {
  let changed = false;
  const contents = data.contents.map((content) => {
    const aware = content as ApprovalAwareContent;
    if (normalizeContentPurpose(aware.contentPurpose) !== "adsense_approval" || !content.document?.metadata) return content;

    const candidates = collectEvidenceCandidates(content.document);
    const existing = content.document.metadata.approvalEvidence;
    if (existing?.reviewedRevisionId === contentRevisionId(content.document)) return content;
    const sourceUrls = candidates.map((candidate) => candidate.url).sort();
    const existingUrls = existing?.sources.map((source) => normalizeSourceUrl(source.url)).filter(Boolean).sort() ?? [];
    if (existing?.status === "verified" && JSON.stringify(sourceUrls) === JSON.stringify(existingUrls)) return content;

    const retrievedAt = latestDocumentTimestamp([content], content.updatedAt);
    const sourceType = approvalEvidenceSourceType(aware.approvalProfileId);
    const pack: ApprovalEvidencePack = candidates.length
      ? Object.freeze({
          version: "1.0",
          status: "needs_review",
          sources: Object.freeze(candidates.map((candidate) => Object.freeze({
            sourceId: evidenceSourceId(candidate.url),
            url: candidate.url,
            title: candidate.title,
            publisher: candidate.publisher,
            sourceType,
            retrievedAt,
            verified: false,
            facts: Object.freeze([Object.freeze({
              field: "citedContext",
              value: candidate.context,
            })]),
            rights: Object.freeze({ status: "unknown" as const }),
          }))),
        })
      : Object.freeze({
          version: "1.0",
          status: "missing",
          sources: Object.freeze([]),
        });

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

function collectEvidenceCandidates(document: ContentDocument): readonly Readonly<{
  url: string;
  title: string;
  publisher: string;
  context: string;
}>[] {
  const found = new Map<string, { url: string; title: string; publisher: string; context: string }>();
  const texts = document.blocks.flatMap((block) => {
    if (block.type === "paragraph" || block.type === "heading") return [block.text];
    if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
    return [];
  });

  for (const text of texts) {
    for (const match of text.matchAll(/https:\/\/[^\s<>)"'\]}]+/gi)) {
      const normalized = normalizeSourceUrl(match[0]);
      if (!normalized) continue;
      const url = new URL(normalized);
      const context = text.replace(/\s+/g, " ").trim().slice(0, 800);
      const previous = found.get(normalized);
      found.set(normalized, {
        url: normalized,
        title: previous?.title ?? url.hostname,
        publisher: previous?.publisher ?? url.hostname,
        context: previous?.context && previous.context.length >= context.length ? previous.context : context,
      });
    }
  }
  return Object.freeze([...found.values()]);
}

function approvalEvidenceSourceType(profileId: ApprovalAwareContent["approvalProfileId"]): ApprovalEvidenceSourceType {
  return profileId === "wordpress_life_economy_v1" ? "public_agency" : "official_institution";
}

function normalizeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value.replace(/[.,;:!?]+$/g, ""));
    if (url.protocol !== "https:") return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
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
    const snapshot = evaluateApprovalDuplicateRisk(
      content.document,
      projectDocuments.flatMap((candidate) => candidate.id === content.id || !candidate.document
        ? []
        : [{ contentId: candidate.id, document: candidate.document }]),
      checkedAt,
    );
    if (sameDuplicateSnapshot(content.document.metadata.approvalDuplicateCheck, snapshot)) return content;
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
