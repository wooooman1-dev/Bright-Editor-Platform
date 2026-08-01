export const contentBlockTypes = [
  "heading",
  "paragraph",
  "list",
  "table",
  "image",
  "video",
  "button",
] as const;

export type ContentBlockType = (typeof contentBlockTypes)[number];
