import type { ContentBlock, ContentDocument, ImageBlock, ImageBlockPurpose } from "../content";

const freeBodyPurposes = new Set<ImageBlockPurpose>([
  "comparison",
  "checklist",
  "infographic",
  "summary",
  "warning",
]);

type FreeBodyVisualPurpose = Exclude<ImageBlockPurpose, "hero" | "inline">;

export type BrightBodyVisualContent = Readonly<{
  items: readonly string[];
  label: string;
  purpose: FreeBodyVisualPurpose;
  title: string;
}>;

export type FreeBodyVisualImageBlock = ImageBlock & Readonly<{
  purpose: FreeBodyVisualPurpose;
}>;

export function isFreeBodyVisualBlock(block: ContentBlock): block is FreeBodyVisualImageBlock {
  return block.type === "image" && Boolean(block.purpose && freeBodyPurposes.has(block.purpose));
}

/**
 * Keeps explicitly stored visual blocks and related-post ordering stable.
 * Bright Studio no longer synthesizes cards from editorial paragraphs because
 * that projection duplicated and truncated user-authored instructions.
 */
export function ensureFreeBodyVisuals(document: ContentDocument): ContentDocument {
  return relatedPostsLast(document);
}

export function brightBodyVisualContent(block: ImageBlock): BrightBodyVisualContent {
  const purpose = freeBodyPurposes.has(block.purpose ?? "inline")
    ? block.purpose as FreeBodyVisualPurpose
    : "infographic";
  const raw = block.caption?.trim() || block.alt.trim() || block.prompt?.trim() || "핵심 내용";
  const lines = raw.split(/\n+/).map(cleanItem).filter(Boolean).slice(0, 4);
  const title = block.alt.trim() || lines.shift() || "핵심 내용";
  const items = lines.length ? lines : [title];
  return Object.freeze({
    items: Object.freeze(items),
    label: purposeLabel(purpose),
    purpose,
    title,
  });
}

export function renderBrightBodyVisualHtml(block: ImageBlock): string {
  const content = brightBodyVisualContent(block);
  const palette = visualPalette(content.purpose);
  const items = content.items
    .map((item) => `<li style="margin:8px 0;line-height:1.7;">${escapeHtml(item)}</li>`)
    .join("");
  return `<aside class="bright-body-visual bright-body-visual-${content.purpose}" style="margin:30px 0;padding:22px 24px;border:1px solid ${palette.border};border-radius:18px;background:${palette.background};color:#25252b;"><span style="display:inline-block;margin-bottom:10px;padding:5px 10px;border-radius:999px;background:${palette.badge};font-size:12px;font-weight:700;color:${palette.text};">${escapeHtml(content.label)}</span><strong style="display:block;margin-bottom:12px;font-size:20px;line-height:1.45;color:#17171b;">${escapeHtml(content.title)}</strong><ul style="margin:0;padding-left:20px;">${items}</ul></aside>`;
}

function cleanItem(value: string): string {
  return value.replace(/^\s*(?:[-*•✓✔]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim();
}

function purposeLabel(purpose: FreeBodyVisualPurpose): string {
  return ({
    comparison: "한눈에 비교",
    checklist: "체크리스트",
    infographic: "핵심 안내",
    summary: "핵심 요약",
    warning: "주의사항",
  })[purpose];
}

function visualPalette(purpose: FreeBodyVisualPurpose) {
  if (purpose === "warning") return { background: "#fff8e8", border: "#f2cf72", badge: "#fff0bf", text: "#8a5400" };
  if (purpose === "checklist") return { background: "#f1fbf5", border: "#9ed8b5", badge: "#dcf6e6", text: "#17623a" };
  if (purpose === "summary") return { background: "#f7f3ff", border: "#cdbcf1", badge: "#ece4ff", text: "#594099" };
  return { background: "#f3f7ff", border: "#aac5ee", badge: "#e3edff", text: "#244f91" };
}

function relatedPostsLast(document: ContentDocument): ContentDocument {
  const related = document.blocks.filter(
    (block) => block.type === "button" && block.purpose === "related_post",
  );
  if (!related.length) return document;
  const trailing = document.blocks.slice(-related.length);
  if (trailing.every((block) => block.type === "button" && block.purpose === "related_post")) return document;
  const body = document.blocks.filter(
    (block) => !(block.type === "button" && block.purpose === "related_post"),
  );
  return Object.freeze({ ...document, blocks: Object.freeze([...body, ...related]) });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[character]!);
}
