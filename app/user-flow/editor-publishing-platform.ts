import {
  resolveProjectStrategy,
  type UserContent,
  type UserProject,
  type WorkspacePlatform,
} from "./user-data";

export type EditorPublishingPlatform = "tistory" | "wordpress";

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
