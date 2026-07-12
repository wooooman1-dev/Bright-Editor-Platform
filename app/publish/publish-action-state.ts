export const publishUnavailableNotice = "Publishing is not connected yet. No content was published.";

export type PublishActionState = Readonly<{
  notice: string | null;
}>;

export function createPublishActionState(): PublishActionState {
  return { notice: null };
}

export function showPublishUnavailableNotice(): PublishActionState {
  return { notice: publishUnavailableNotice };
}
