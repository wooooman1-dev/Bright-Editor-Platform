import type { UserData } from "../../user-flow/user-data";

const serverOwnedCollections = [
  "history",
  "mediaMetadata",
  "publishingRecords",
  "qualityReports",
  "scheduledPublishing",
] as const;

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

  const merged: UserData = { ...incoming, contents: Object.freeze(contents) };
  for (const key of serverOwnedCollections) {
    const serverValue = current[key];
    const incomingValue = incoming[key];
    Object.assign(merged, { [key]: Object.freeze([...(serverValue ?? incomingValue ?? [])]) });
  }
  return Object.freeze(merged);
}

function assertUserDataSnapshot(input: unknown): UserData {
  if (!input || typeof input !== "object") throw new Error("Application state is required.");
  const candidate = input as Partial<UserData>;
  if (!Array.isArray(candidate.brands) || !Array.isArray(candidate.projects) || !Array.isArray(candidate.contents)) {
    throw new Error("Application state is invalid.");
  }
  return input as UserData;
}
