import type { MediaAsset } from "../../../core/media";
import type { UserData } from "../../user-flow/user-data";

export function mergeUserDataSnapshot(current: UserData | undefined, input: unknown): UserData {
  const incoming = assertUserDataSnapshot(input);
  if (!current) return incoming;

  const contents = incoming.contents.map((content) => {
    const serverContent = current.contents.find((item) => item.id === content.id);
    if (serverContent?.quality) return Object.freeze({ ...content, quality: serverContent.quality });
    const { quality: _clientQuality, ...withoutClientQuality } = content;
    void _clientQuality;
    return Object.freeze(withoutClientQuality);
  });

  return Object.freeze({
    ...incoming,
    contents: Object.freeze(contents),
    history: frozenCopy(current.history ?? incoming.history),
    mediaMetadata: frozenCopy(current.mediaMetadata ?? incoming.mediaMetadata),
    publishingRecords: frozenCopy(current.publishingRecords ?? incoming.publishingRecords),
    qualityReports: frozenCopy(current.qualityReports ?? incoming.qualityReports),
    scheduledPublishing: frozenCopy(current.scheduledPublishing ?? incoming.scheduledPublishing),
  });
}

export function mergeServerMutationSnapshot(current: UserData | undefined, base: UserData, next: UserData): UserData {
  if (!current) return next;
  return Object.freeze({
    ...next,
    history: mergeChangedByKey(current.history, base.history, next.history, (item) => item.id),
    mediaMetadata: mergeChangedMediaAssets(current.mediaMetadata, base.mediaMetadata, next.mediaMetadata),
    publishingRecords: mergeChangedByKey(current.publishingRecords, base.publishingRecords, next.publishingRecords, (item) => item.id),
    qualityReports: mergeChangedByKey(current.qualityReports, base.qualityReports, next.qualityReports, (item) => item.contentId),
    scheduledPublishing: mergeChangedByKey(current.scheduledPublishing, base.scheduledPublishing, next.scheduledPublishing, (item) => `${item.contentId}:${item.platform}`),
  });
}

function assertUserDataSnapshot(input: unknown): UserData {
  if (!input || typeof input !== "object") throw new Error("Application state is required.");
  const candidate = input as Partial<UserData>;
  if (!Array.isArray(candidate.brands) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.contents)) {
    throw new Error("Application state is invalid.");
  }
  return input as UserData;
}

function frozenCopy<T>(values: readonly T[] | undefined): readonly T[] {
  return Object.freeze([...(values ?? [])]);
}

function mergeChangedByKey<T>(
  current: readonly T[] | undefined,
  base: readonly T[] | undefined,
  next: readonly T[] | undefined,
  keyOf: (item: T) => string,
): readonly T[] {
  const currentMap = new Map((current ?? []).map((item) => [keyOf(item), item]));
  const baseMap = new Map((base ?? []).map((item) => [keyOf(item), item]));
  const nextMap = new Map((next ?? []).map((item) => [keyOf(item), item]));

  for (const key of baseMap.keys()) {
    if (!nextMap.has(key)) currentMap.delete(key);
  }
  for (const [key, item] of nextMap) {
    if (!sameValue(baseMap.get(key), item)) currentMap.set(key, item);
  }
  return Object.freeze([...currentMap.values()]);
}

function mergeChangedMediaAssets(
  current: readonly MediaAsset[] | undefined,
  base: readonly MediaAsset[] | undefined,
  next: readonly MediaAsset[] | undefined,
): readonly MediaAsset[] {
  const merged = [...mergeChangedByKey(current, base, next, (item) => item.id)];
  const bySource = new Map<string, MediaAsset>();
  for (const asset of merged) bySource.set(asset.source, asset);
  return Object.freeze([...bySource.values()]);
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
