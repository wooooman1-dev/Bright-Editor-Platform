export const platformIds = [
  "tistory",
  "wordpress",
  "youtube",
  "naver_cafe",
  "blog",
  "shopping",
] as const;

export type PlatformId = (typeof platformIds)[number];

export const brightSemanticRoles = [
  "standard_content",
  "notice",
  "warning",
  "summary",
  "checklist",
  "comparison",
  "call_to_action",
  "related_content",
  "faq",
  "data_table",
  "image_figure",
  "video_embed",
  "quote",
  "key_takeaway",
] as const;

export type BrightSemanticRole = (typeof brightSemanticRoles)[number];

export type ThemeReference = Readonly<{
  themeProfileId: string;
  themeProfileVersion: number;
}>;

export type ComponentFallbackPolicy =
  | Readonly<{ mode: "component"; fallbackComponentId: string }>
  | Readonly<{ mode: "semantic"; fallbackElement: SemanticFallbackElement }>
  | Readonly<{ mode: "error" }>;

export const semanticFallbackElements = [
  "section",
  "aside",
  "figure",
  "blockquote",
  "table",
  "ul",
  "ol",
  "div",
] as const;

export type SemanticFallbackElement = (typeof semanticFallbackElements)[number];

export type ComponentPresentationNode = Readonly<{
  id: string;
  nodeType: "component";
  componentId: string;
  componentSchemaVersion: number;
  semanticRole: BrightSemanticRole;
  variant: string;
  sourceBlockIds: readonly string[];
  props: Readonly<Record<string, unknown>>;
  fallbackPolicy: ComponentFallbackPolicy;
}>;

export type SemanticFallbackNode = Readonly<{
  id: string;
  nodeType: "semantic_fallback";
  semanticRole: BrightSemanticRole;
  sourceBlockIds: readonly string[];
  fallbackElement: SemanticFallbackElement;
  reason: string;
}>;

export type PresentationNode = ComponentPresentationNode | SemanticFallbackNode;

export type PresentationWarningSeverity = "info" | "warning";

export type PresentationWarning = Readonly<{
  code: string;
  message: string;
  severity: PresentationWarningSeverity;
  sourceBlockId?: string;
  componentId?: string;
  recoverable: boolean;
}>;

export type PresentationDocument = Readonly<{
  id: string;
  schemaVersion: number;
  workspaceId: string;
  projectId: string;
  sourceContentId: string;
  sourceContentVersion: number;
  targetPlatform: PlatformId;
  themeReference: ThemeReference;
  resolvedThemeHash: string;
  nodes: readonly PresentationNode[];
  presentationPolicyVersion: number;
  componentRegistryVersion: number;
  themeTokenVersion: number;
  htmlContractVersion: number;
  warnings: readonly PresentationWarning[];
  createdAt: string;
}>;
