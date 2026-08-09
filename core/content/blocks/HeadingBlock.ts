import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type HeadingBlock = Readonly<{
  id: string;
  ownership?: ContentBlockOwnership;
  level: HeadingLevel;
  text: string;
  type: "heading";
}>;
