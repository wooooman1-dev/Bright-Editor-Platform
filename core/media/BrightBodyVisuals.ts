import type {
  BrightVisualDatum,
  BrightVisualShape,
  ContentBlock,
  ContentDocument,
  ImageBlock,
  ImageBlockPurpose,
} from "../content";

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

/**
 * 무료 본문 시각물을 HTML 로 그린다. **SVG 도 자바스크립트도 쓰지 않는다.**
 *
 * 2026-08-29 실측: 발행된 글에서 인라인 style 82개가 살아남았고 우리 카드도 그대로
 * 그려졌지만, 같은 카드의 `box-sizing` 은 잘려 나갔다. 워드프레스가 CSS 속성을
 * 허용 목록으로 거른다는 뜻이다. 그래서 여기서는 실제로 살아남는 것이 확인된
 * 속성만 쓴다 — margin, padding, border, border-radius, background, color,
 * font-size, font-weight, line-height, width, max-width, text-align,
 * display(block/inline-block), vertical-align, overflow.
 *
 * flex, grid, transform, box-shadow, box-sizing 은 쓰지 않는다. 확인되지 않았고,
 * 잘리면 레이아웃이 조용히 무너진다.
 */
export function renderBrightBodyVisualHtml(block: ImageBlock): string {
  const content = brightBodyVisualContent(block);
  const palette = visualPalette(content.purpose);
  const shape = resolveShape(block);
  const body = renderShape(shape, block.data ?? [], content.items, palette);
  return `<aside class="bright-body-visual bright-body-visual-${content.purpose} bright-visual-${shape}" style="margin:30px 0;padding:22px 24px;border:1px solid ${palette.border};border-radius:18px;background:${palette.background};color:#25252b;"><span style="display:inline-block;margin-bottom:10px;padding:5px 10px;border-radius:999px;background:${palette.badge};font-size:12px;font-weight:700;color:${palette.text};">${escapeHtml(content.label)}</span><strong style="display:block;margin-bottom:14px;font-size:20px;line-height:1.45;color:#17171b;">${escapeHtml(content.title)}</strong>${body}</aside>`;
}

/**
 * 자료가 없으면 모양을 요구해도 그릴 것이 없다. 그때는 목록으로 떨어뜨린다 —
 * 빈 상자를 내보내는 것보다 낫다.
 */
function resolveShape(block: ImageBlock): BrightVisualShape {
  const requested = block.visual ?? "list";
  if (requested === "list") return "list";
  const data = block.data ?? [];
  if (!data.length) return "list";
  if ((requested === "bar" || requested === "ratio" || requested === "stat")
    && !data.some((item) => typeof item.value === "number")) return "list";
  return requested;
}

function renderShape(
  shape: BrightVisualShape,
  data: readonly BrightVisualDatum[],
  items: readonly string[],
  palette: VisualPalette,
): string {
  if (shape === "bar") return renderBar(data, palette);
  if (shape === "ratio") return renderRatio(data, palette);
  if (shape === "steps") return renderSteps(data, palette);
  if (shape === "timeline") return renderTimeline(data, palette);
  if (shape === "compare") return renderCompare(data, palette);
  if (shape === "stat") return renderStat(data, palette);
  return renderList(items);
}

function renderList(items: readonly string[]): string {
  const rows = items
    .map((item) => `<li style="margin:8px 0;line-height:1.7;">${escapeHtml(item)}</li>`)
    .join("");
  return `<ul style="margin:0;padding-left:20px;">${rows}</ul>`;
}

/** 가로 막대. 가장 큰 값을 100% 로 두고 나머지를 비율로 그린다. */
function renderBar(data: readonly BrightVisualDatum[], palette: VisualPalette): string {
  const numeric = data.filter((item) => typeof item.value === "number");
  const largest = Math.max(...numeric.map((item) => Math.abs(item.value!)), 0);
  if (!largest) return renderList(numeric.map((item) => item.label));
  const rows = numeric.map((item) => {
    const ratio = Math.max(4, Math.round((Math.abs(item.value!) / largest) * 100));
    const note = item.note ? `<span style="color:#5f5f68;font-size:14px;"> ${escapeHtml(item.note)}</span>` : "";
    return `<div style="margin:0 0 14px;"><div style="margin-bottom:6px;font-size:15px;line-height:1.5;color:#25252b;"><strong style="font-weight:700;">${escapeHtml(item.label)}</strong>${note}</div><div style="width:100%;height:14px;border-radius:999px;background:${palette.track};overflow:hidden;"><div style="width:${ratio}%;height:14px;border-radius:999px;background:${palette.fill};"></div></div></div>`;
  }).join("");
  return `<div style="margin:0;">${rows}</div>`;
}

/** 비율 띠. 값의 합을 100% 로 나눠 한 줄에 이어 붙인다. */
function renderRatio(data: readonly BrightVisualDatum[], palette: VisualPalette): string {
  const numeric = data.filter((item) => typeof item.value === "number" && item.value! > 0);
  const total = numeric.reduce((sum, item) => sum + item.value!, 0);
  if (!total) return renderList(data.map((item) => item.label));
  const shades = ratioShades(palette);
  const segments = numeric.map((item, index) => {
    const width = Math.max(3, Math.round((item.value! / total) * 100));
    return `<span style="display:inline-block;width:${width}%;height:18px;background:${shades[index % shades.length]};"></span>`;
  }).join("");
  const legend = numeric.map((item, index) => {
    const percent = Math.round((item.value! / total) * 100);
    return `<span style="display:inline-block;margin:0 14px 6px 0;font-size:14px;line-height:1.6;color:#3f3f46;"><span style="display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:999px;background:${shades[index % shades.length]};"></span>${escapeHtml(item.label)} ${percent}%</span>`;
  }).join("");
  return `<div style="margin:0;"><div style="width:100%;border-radius:999px;overflow:hidden;background:${palette.track};font-size:0;">${segments}</div><div style="margin-top:10px;">${legend}</div></div>`;
}

/** 단계 흐름. 번호 원과 설명을 한 줄씩 쌓는다. */
function renderSteps(data: readonly BrightVisualDatum[], palette: VisualPalette): string {
  const rows = data.map((item, index) => {
    const note = item.note ? `<div style="margin-top:4px;font-size:14px;line-height:1.7;color:#5f5f68;">${escapeHtml(item.note)}</div>` : "";
    return `<div style="margin:0 0 14px;"><span style="display:inline-block;width:26px;height:26px;margin-right:10px;border-radius:999px;background:${palette.fill};color:#ffffff;font-size:14px;font-weight:700;line-height:26px;text-align:center;vertical-align:top;">${index + 1}</span><span style="display:inline-block;width:85%;vertical-align:top;"><strong style="font-size:16px;line-height:1.6;color:#25252b;font-weight:700;">${escapeHtml(item.label)}</strong>${note}</span></div>`;
  }).join("");
  return `<div style="margin:0;">${rows}</div>`;
}

/** 타임라인. 왼쪽 세로선에 시점을 걸어 둔다. */
function renderTimeline(data: readonly BrightVisualDatum[], palette: VisualPalette): string {
  const rows = data.map((item) => {
    const note = item.note ? `<div style="margin-top:2px;font-size:14px;line-height:1.7;color:#5f5f68;">${escapeHtml(item.note)}</div>` : "";
    return `<div style="margin:0 0 16px;padding-left:18px;border-left:3px solid ${palette.fill};"><strong style="font-size:16px;line-height:1.6;color:#25252b;font-weight:700;">${escapeHtml(item.label)}</strong>${note}</div>`;
  }).join("");
  return `<div style="margin:0;">${rows}</div>`;
}

/** 좌우 비교. 두 칸씩 나란히 놓는다. 좁은 화면에서는 자연히 아래로 내려간다. */
function renderCompare(data: readonly BrightVisualDatum[], palette: VisualPalette): string {
  const cells = data.slice(0, 4).map((item) => {
    const note = item.note ? `<div style="margin-top:6px;font-size:14px;line-height:1.7;color:#5f5f68;">${escapeHtml(item.note)}</div>` : "";
    return `<div style="display:inline-block;width:46%;max-width:46%;margin:0 1% 12px;padding:14px 16px;border:1px solid ${palette.border};border-radius:14px;background:#ffffff;vertical-align:top;"><strong style="font-size:16px;line-height:1.5;color:#17171b;font-weight:700;">${escapeHtml(item.label)}</strong>${note}</div>`;
  }).join("");
  return `<div style="margin:0;">${cells}</div>`;
}

/** 수치 강조 타일. 숫자를 크게 보여 준다. */
function renderStat(data: readonly BrightVisualDatum[], palette: VisualPalette): string {
  const cells = data.slice(0, 3).map((item) => {
    const value = typeof item.value === "number" ? formatNumber(item.value) : "";
    const unit = item.note ? `<span style="font-size:14px;font-weight:400;color:#5f5f68;"> ${escapeHtml(item.note)}</span>` : "";
    return `<div style="display:inline-block;width:30%;max-width:30%;margin:0 1% 10px;padding:14px 10px;border-radius:14px;background:#ffffff;text-align:center;vertical-align:top;"><div style="font-size:24px;font-weight:700;line-height:1.3;color:${palette.text};">${escapeHtml(value)}${unit}</div><div style="margin-top:6px;font-size:14px;line-height:1.5;color:#3f3f46;">${escapeHtml(item.label)}</div></div>`;
  }).join("");
  return `<div style="margin:0;">${cells}</div>`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString("ko-KR") : String(value);
}

function ratioShades(palette: VisualPalette): readonly string[] {
  return [palette.fill, palette.text, palette.border, palette.badge];
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

type VisualPalette = Readonly<{
  background: string;
  badge: string;
  border: string;
  fill: string;
  text: string;
  track: string;
}>;

function visualPalette(purpose: FreeBodyVisualPurpose): VisualPalette {
  if (purpose === "warning") return { background: "#fff8e8", border: "#f2cf72", badge: "#fff0bf", fill: "#e0a52c", text: "#8a5400", track: "#f6e6bf" };
  if (purpose === "checklist") return { background: "#f1fbf5", border: "#9ed8b5", badge: "#dcf6e6", fill: "#2f9e63", text: "#17623a", track: "#d7efe1" };
  if (purpose === "summary") return { background: "#f7f3ff", border: "#cdbcf1", badge: "#ece4ff", fill: "#7a5bc4", text: "#594099", track: "#e5dcf8" };
  return { background: "#f3f7ff", border: "#aac5ee", badge: "#e3edff", fill: "#3a72c8", text: "#244f91", track: "#dbe6f8" };
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
