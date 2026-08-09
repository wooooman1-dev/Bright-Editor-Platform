import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type ButtonBlock = Readonly<{
  id: string;
  ownership?: ContentBlockOwnership;
  label: string;
  description?: string;
  affiliate?: boolean;
  purpose?: "cta" | "internal_link" | "monetization" | "related_post" | "source";
  target?: "_self" | "_blank";
  targetUrl: string;
  /** Stable platform identifier retained with links selected from a public post catalog. */
  sourceExternalPostId?: string;
  type: "button";
}>;
