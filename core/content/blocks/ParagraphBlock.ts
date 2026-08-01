import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type ParagraphBlock = Readonly<{
  id: string;
  ownership?: ContentBlockOwnership;
  text: string;
  type: "paragraph";
}>;
