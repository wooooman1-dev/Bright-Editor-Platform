import {
  resolveProjectStrategy,
  type UserContent,
  type UserProject,
  type WorkspacePlatform,
} from "./user-data";

export type EditorPublishingPlatform = "tistory" | "wordpress";

export function publishingDraftDestinationLabel(
  platform: EditorPublishingPlatform | undefined,
): string {
  if (platform === "wordpress") return "WordPress 임시저장";
  if (platform === "tistory") return "Tistory 임시저장";
  return "외부 임시저장";
}

export type EditorPublishingPlatformVisibility = Readonly<{
  activePlatform?: EditorPublishingPlatform;
  tistoryEnabled: boolean;
  wordpressEnabled: boolean;
}>;

export function editorPublishingPlatformVisibility(input: Readonly<{
  enabledPlatforms: readonly WorkspacePlatform[] | undefined;
  project: UserProject;
  content: UserContent;
}>): EditorPublishingPlatformVisibility {
  const activePlatform = resolveEditorPublishingPlatform(input.project, input.content);
  const enabledPlatforms = input.enabledPlatforms
    ?? (activePlatform ? [activePlatform] : []);
  return Object.freeze({
    ...(activePlatform ? { activePlatform } : {}),
    tistoryEnabled: activePlatform === "tistory" && enabledPlatforms.includes("tistory"),
    wordpressEnabled: activePlatform === "wordpress" && enabledPlatforms.includes("wordpress"),
  });
}

export function resolveEditorPublishingPlatform(
  project: UserProject,
  content: UserContent,
): EditorPublishingPlatform | undefined {
  const hasTistoryPreparation = Boolean(content.publishingPreparation?.tistory);
  const hasWordPressPreparation = Boolean(content.publishingPreparation?.wordpress);

  if (hasTistoryPreparation !== hasWordPressPreparation) {
    return hasWordPressPreparation ? "wordpress" : "tistory";
  }

  const contentPlatform = supportedEditorPlatform(content.platform);
  if (contentPlatform) return contentPlatform;

  return supportedEditorPlatform(resolveProjectStrategy(project).defaultPlatform);
}

function supportedEditorPlatform(value: string | undefined): EditorPublishingPlatform | undefined {
  return value === "tistory" || value === "wordpress" ? value : undefined;
}
