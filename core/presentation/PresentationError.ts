export const presentationErrorCategories = [
  "validation",
  "unsupported_component",
  "unsupported_variant",
  "schema_version",
  "registry_version",
  "theme",
  "theme_token",
  "capability",
  "fallback",
  "accessibility",
  "html_contract",
  "sanitization",
  "rendering",
  "checksum",
  "unknown",
] as const;

export type PresentationErrorCategory = (typeof presentationErrorCategories)[number];

export type PresentationError = Readonly<{
  category: PresentationErrorCategory;
  code: string;
  message: string;
  retryable: boolean;
  requiresUserAction: boolean;
  sourceBlockId?: string;
  componentId?: string;
  safeDetails?: Readonly<Record<string, string | number | boolean | null>>;
}>;
