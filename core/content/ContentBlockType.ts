export const contentBlockTypes = [
  "heading",
  "paragraph",
  "image",
  "video",
  "button",
] as const;

export type ContentBlockType = (typeof contentBlockTypes)[number];
