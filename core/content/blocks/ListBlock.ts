import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type ListBlockStyle = "ordered" | "unordered";

export type ListBlock = Readonly<{
  id: string;
  type: "list";
  style: ListBlockStyle;
  items: readonly string[];
  ownership?: ContentBlockOwnership;
}>;
