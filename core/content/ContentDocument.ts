import type { ContentBlock } from "./ContentBlock";
import type { ContentMetadata } from "./ContentMetadata";

export type ContentDocument = Readonly<{
  blocks: readonly ContentBlock[];
  id: string;
  metadata?: ContentMetadata;
  title: string;
}>;
