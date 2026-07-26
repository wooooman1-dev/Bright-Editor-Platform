import type { ButtonBlock } from "./blocks/ButtonBlock";
import type { HeadingBlock } from "./blocks/HeadingBlock";
import type { ImageBlock } from "./blocks/ImageBlock";
import type { ParagraphBlock } from "./blocks/ParagraphBlock";
import type { TableBlock } from "./blocks/TableBlock";
import type { VideoBlock } from "./blocks/VideoBlock";

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | TableBlock
  | ImageBlock
  | VideoBlock
  | ButtonBlock;
