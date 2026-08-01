import type { ContentBlockOwnership } from "../ContentBlockOwnership";

export type TableBlock = Readonly<{
  caption?: string;
  headers: readonly string[];
  id: string;
  ownership?: ContentBlockOwnership;
  rows: readonly (readonly string[])[];
  type: "table";
}>;
