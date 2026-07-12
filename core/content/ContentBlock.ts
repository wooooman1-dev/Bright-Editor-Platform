import type { ButtonBlock } from "./blocks/ButtonBlock";
import type { HeadingBlock } from "./blocks/HeadingBlock";
import type { ImageBlock } from "./blocks/ImageBlock";
import type { ParagraphBlock } from "./blocks/ParagraphBlock";
import type { VideoBlock } from "./blocks/VideoBlock";

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | ImageBlock
  | VideoBlock
  | ButtonBlock;
