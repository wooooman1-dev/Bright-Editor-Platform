export const contentBlockTypes = [
  "heading",
  "paragraph",
  "table",
  "image",
  "video",
  "button",
] as const;

export type ContentBlockType = (typeof contentBlockTypes)[number];
