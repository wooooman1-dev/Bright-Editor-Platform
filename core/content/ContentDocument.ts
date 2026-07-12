import type { ContentBlock } from "./ContentBlock";

export type ContentDocument = Readonly<{
  blocks: readonly ContentBlock[];
  id: string;
  title: string;
}>;
