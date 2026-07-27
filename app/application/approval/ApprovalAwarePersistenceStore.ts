import type { PersistenceMutation, PersistenceStore } from "../../../core/data";
import { normalizeContentPurpose } from "../../../core/approval";
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

  return next;
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
      return {
        ...sanitized,
        contentPurpose: "adsense_approval",
        ...(prior.approvalPolicyId ? { approvalPolicyId: prior.approvalPolicyId } : {}),
        ...(prior.approvalPolicyVersion ? { approvalPolicyVersion: prior.approvalPolicyVersion } : {}),
        ...(prior.approvalProfileId ? { approvalProfileId: prior.approvalProfileId } : {}),
        ...(prior.approvalProfileVersion ? { approvalProfileVersion: prior.approvalProfileVersion } : {}),
      } as UserContent;
    }),
  };
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
