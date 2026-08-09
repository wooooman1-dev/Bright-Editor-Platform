import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type VideoBlock = Readonly<{
  caption?: string;
  id: string;
  ownership?: ContentBlockOwnership;
  source: string;
  type: "video";
}>;
