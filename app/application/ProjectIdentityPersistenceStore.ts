import type { PersistenceMutation, PersistenceStore } from "../../core/data";
import type { UserData } from "../user-flow/user-data";

const userDataCollection = "application";
const userDataId = "user-data";

/**
 * Prevents a new duplicate Project identity from crossing the canonical UserData
 * persistence boundary. Existing legacy duplicates may still be saved unchanged
 * or reduced so that the verified merge command can repair them safely.
 */
export class ProjectIdentityPersistenceStore implements PersistenceStore {
  constructor(private readonly delegate: PersistenceStore) {}

  async batch(mutations: readonly PersistenceMutation[]): Promise<void> {
    const validated: PersistenceMutation[] = [];
    for (const mutation of mutations) {
      if (mutation.type === "set" && isUserDataKey(mutation.collection, mutation.id)) {
        const current = await this.delegate.get<UserData>(mutation.collection, mutation.id);
        assertProjectIdentityMutation(current, mutation.value as UserData);
      }
      validated.push(mutation);
    }
    await this.delegate.batch(validated);
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
    await this.delegate.update<UserData>(collection, id, (current) => {
      assertProjectIdentityMutation(current, value as UserData);
      return value as UserData;
    });
  }

  async update<T>(collection: string, id: string, update: (current: T | undefined) => T): Promise<T> {
    if (!isUserDataKey(collection, id)) return this.delegate.update(collection, id, update);
    return this.delegate.update<UserData>(collection, id, (current) => {
      const candidate = update(current as T | undefined) as UserData;
      assertProjectIdentityMutation(current, candidate);
      return candidate;
    }) as Promise<T>;
  }
}

export function assertProjectIdentityMutation(current: UserData | undefined, candidate: UserData): void {
  if (!candidate || !Array.isArray(candidate.projects)) throw new Error("저장할 Project 데이터가 올바르지 않습니다.");

  const duplicateIds = duplicateProjectIds(candidate.projects.map((project) => project.id));
  if (duplicateIds.length) throw new Error(`동일한 Project ID를 중복 저장할 수 없습니다: ${duplicateIds.join(", ")}`);

  const currentGroups = projectNameGroups(current?.projects ?? []);
  const candidateGroups = projectNameGroups(candidate.projects);
  for (const [normalizedName, candidateIds] of candidateGroups) {
    if (candidateIds.length < 2) continue;
    const previousIds = currentGroups.get(normalizedName) ?? [];
    const previousSet = new Set(previousIds);
    const introducesNewDuplicate = candidateIds.length > previousIds.length
      || candidateIds.some((projectId) => !previousSet.has(projectId));
    if (!introducesNewDuplicate) continue;
    const visibleName = candidate.projects.find((project) => project.id === candidateIds[0])?.name ?? normalizedName;
    throw new Error(`같은 Workspace에 동일한 Project 이름을 중복 저장할 수 없습니다: ${visibleName}`);
  }
}

function projectNameGroups(projects: UserData["projects"]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const project of projects) {
    const normalizedName = normalizeProjectName(project.name);
    if (!normalizedName) continue;
    groups.set(normalizedName, [...(groups.get(normalizedName) ?? []), project.id]);
  }
  return groups;
}

function duplicateProjectIds(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Object.freeze([...duplicates]);
}

function normalizeProjectName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

function isUserDataKey(collection: string, id: string): boolean {
  return collection === userDataCollection && id === userDataId;
}
