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

export function mergeServerMutationSnapshot(current: UserData | undefined, next: UserData): UserData {
  if (!current) return next;
  return Object.freeze({
    ...next,
    history: mergeByKey(current.history, next.history, (item) => item.id),
    mediaMetadata: mergeMediaAssets(current.mediaMetadata, next.mediaMetadata),
    publishingRecords: mergeByKey(current.publishingRecords, next.publishingRecords, (item) => item.id),
    qualityReports: mergeByKey(current.qualityReports, next.qualityReports, (item) => item.contentId),
    scheduledPublishing: mergeByKey(current.scheduledPublishing, next.scheduledPublishing, (item) => `${item.contentId}:${item.platform}`),
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

function mergeByKey<T>(current: readonly T[] | undefined, next: readonly T[] | undefined, keyOf: (item: T) => string): readonly T[] {
  const merged = new Map<string, T>();
  for (const item of current ?? []) merged.set(keyOf(item), item);
  for (const item of next ?? []) merged.set(keyOf(item), item);
  return Object.freeze([...merged.values()]);
}

function mergeMediaAssets(current: readonly MediaAsset[] | undefined, next: readonly MediaAsset[] | undefined): readonly MediaAsset[] {
  const merged = [...(current ?? [])];
  for (const asset of next ?? []) {
    const withoutDuplicate = merged.filter((item) => item.id !== asset.id && item.source !== asset.source);
    merged.splice(0, merged.length, ...withoutDuplicate, asset);
  }
  return Object.freeze(merged);
}
