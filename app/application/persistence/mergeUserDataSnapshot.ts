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
