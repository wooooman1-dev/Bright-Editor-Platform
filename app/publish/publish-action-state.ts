export const publishUnavailableNotice = "발행 기능은 아직 연결되지 않았습니다. 아직 어떤 콘텐츠도 발행되지 않았습니다.";

export type PublishActionState = Readonly<{
  notice: string | null;
}>;

export function createPublishActionState(): PublishActionState {
  return { notice: null };
}

export function showPublishUnavailableNotice(): PublishActionState {
  return { notice: publishUnavailableNotice };
}
