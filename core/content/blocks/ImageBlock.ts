import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type ImageBlockPurpose =
  | "hero"
  | "comparison"
  | "checklist"
  | "infographic"
  | "summary"
  | "warning"
  | "inline";

export type ImageBlockSourceType = "planned" | "upload" | "ai_generated" | "external";

export type ImageBlock = Readonly<{
  alt: string;
  assetId?: string;
  caption?: string;
  fileName?: string;
  id: string;
  ownership?: ContentBlockOwnership;
  mimeType?: string;
  prompt?: string;
  purpose?: ImageBlockPurpose;
  source: string;
  sourceType?: ImageBlockSourceType;
  type: "image";
}>;
