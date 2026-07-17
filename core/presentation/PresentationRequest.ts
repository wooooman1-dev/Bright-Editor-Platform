import type { ContentDocument } from "../content/ContentDocument";
import type { PlatformId, ThemeReference } from "./PresentationModel";

export type UnsupportedComponentPolicy = "error" | "fallback" | "warning";

export type PresentationResolutionOptions = Readonly<{
  unsupportedComponentPolicy: UnsupportedComponentPolicy;
  preserveSourceOrder: boolean;
  includeTableOfContents: boolean;
  includeRelatedContent: boolean;
  includeImagePlaceholders: boolean;
  accessibilityLevel: "required";
}>;

export type PresentationResolutionRequest = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  sourceContentVersion: number;
  contentDocument: ContentDocument;
  targetPlatform: PlatformId;
  themeReference?: ThemeReference;
  presentationPolicyVersion: number;
  requestedComponentRegistryVersion?: number;
  options: PresentationResolutionOptions;
}>;
