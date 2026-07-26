import type { ContentBlock, ContentDocument, ContentSectionType, ImageBlock, ImageBlockPurpose } from "../content";

const freeBodyPurposes = new Set<ImageBlockPurpose>([
  "comparison",
  "checklist",
  "infographic",
  "summary",
  "warning",
]);

const bodyVisualLimit = 2;

export type BrightBodyVisualContent = Readonly<{
  items: readonly string[];
  label: string;
  purpose: Exclude<ImageBlockPurpose, "hero" | "inline">;
  title: string;
}>;

export function isFreeBodyVisualBlock(block: ContentBlock): block is ImageBlock {
  return block.type === "image" && Boolean(block.purpose && freeBodyPurposes.has(block.purpose));
}

/**
 * Adds up to two deterministic, zero-API-cost body visual cards from the article's
 * own H2 sections. Existing body images or cards count toward the limit and are
 * never replaced.
 */
export function ensureFreeBodyVisuals(document: ContentDocument): ContentDocument {
  const existingBodyVisuals = document.blocks.filter(
    (block) => block.type === "image" && block.purpose !== "hero",
  );
  const remaining = Math.max(0, bodyVisualLimit - existingBodyVisuals.length);
  if (!remaining) return document;

  const sections = collectSections(document);
  if (sections.length < 3) return document;

  const existingIds = new Set(document.blocks.map((block) => block.id));
  const candidates = sections
    .filter((section) => section.paragraphs.length > 0)
    .filter((section) => !section.blocks.some((block) => block.type === "image" && block.purpose !== "hero"))
    .map((section) => ({
      ...section,
      score: sectionScore(section.sectionType, section.blocks.some((block) => block.type === "table")),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selected = candidates.slice(0, remaining);
  if (!selected.length) return document;

  const insertions = new Map<number, ImageBlock[]>();
  for (const section of selected) {
    const purpose = purposeForSection(section.sectionType);
    const items = keySentences(section.paragraphs);
    if (!items.length) continue;

    const baseId = `${document.id}-bright-visual-${section.heading.id}`;
    const id = uniqueId(baseId, existingIds);
    existingIds.add(id);

    const block: ImageBlock = Object.freeze({
      id,
      type: "image",
      source: "",
      sourceType: "planned",
      purpose,
      alt: section.heading.text.trim(),
      caption: items.join("\n"),
      prompt: `Bright 무료 ${purposeLabel(purpose)} 컴포넌트`,
    });
    insertions.set(section.insertAfter, [...(insertions.get(section.insertAfter) ?? []), block]);
  }

  if (!insertions.size) return document;

  const blocks = document.blocks.flatMap((block, index) => [block, ...(insertions.get(index) ?? [])]);
  return Object.freeze({
    ...document,
    blocks: Object.freeze(blocks),
    ...(document.metadata
      ? {
        metadata: Object.freeze({
          ...document.metadata,
          imageCount: blocks.filter((block) => block.type === "image").length,
        }),
      }
      : {}),
  });
}

export function brightBodyVisualContent(block: ImageBlock): BrightBodyVisualContent {
  const purpose = freeBodyPurposes.has(block.purpose ?? "inline")
    ? block.purpose as BrightBodyVisualContent["purpose"]
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
  return `<aside class="bright-body-visual bright-body-visual-${content.purpose}" data-free-visual="true" style="margin:30px 0;padding:22px 24px;border:1px solid ${palette.border};border-radius:18px;background:${palette.background};color:#25252b;"><span style="display:inline-block;margin-bottom:10px;padding:5px 10px;border-radius:999px;background:${palette.badge};font-size:12px;font-weight:700;color:${palette.text};">${escapeHtml(content.label)}</span><strong style="display:block;margin-bottom:12px;font-size:20px;line-height:1.45;color:#17171b;">${escapeHtml(content.title)}</strong><ul style="margin:0;padding-left:20px;">${items}</ul></aside>`;
}

type Section = Readonly<{
  blocks: readonly ContentBlock[];
  heading: Extract<ContentBlock, { type: "heading" }>;
  index: number;
  insertAfter: number;
  paragraphs: readonly string[];
  sectionType: ContentSectionType;
}>;

function collectSections(document: ContentDocument): readonly Section[] {
  const starts = document.blocks.flatMap((block, index) =>
    block.type === "heading" && block.level === 2 ? [index] : [],
  );
  const declared = new Map(
    (document.metadata?.longFormStructure?.sections ?? []).map((section) =>
      [section.headingBlockId, section.sectionType] as const,
    ),
  );

  return Object.freeze(starts.flatMap((start, index) => {
    const heading = document.blocks[start];
    if (heading.type !== "heading") return [];

    const end = starts[index + 1] ?? document.blocks.length;
    const blocks = document.blocks.slice(start + 1, end);
    const paragraphs = blocks.flatMap((block) =>
      block.type === "paragraph" && block.text.trim() ? [block.text] : [],
    );

    return [Object.freeze({
      blocks: Object.freeze(blocks),
      heading,
      index,
      insertAfter: Math.max(start, end - 1),
      paragraphs: Object.freeze(paragraphs),
      sectionType: declared.get(heading.id) ?? inferSectionType(heading.text),
    })];
  }));
}

function keySentences(paragraphs: readonly string[]): readonly string[] {
  return Object.freeze(paragraphs
    .flatMap((paragraph) => paragraph.replace(/\r/g, "").split(/(?:\n+|(?<=[.!?。！？])\s+)/))
    .map(cleanItem)
    .filter((value) => value.length >= 12)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 3)
    .map((value) => value.length > 110 ? `${value.slice(0, 107).trim()}…` : value));
}

function cleanItem(value: string): string {
  return value.replace(/^\s*(?:[-*•✓✔]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim();
}

function sectionScore(type: ContentSectionType, hasTable: boolean): number {
  if (type === "warning") return 100;
  if (type === "checklist") return 95;
  if (type === "steps") return 90;
  if (type === "summary") return 85;
  if (type === "comparison") return hasTable ? 45 : 92;
  if (type === "case_example") return 75;
  return 60;
}

function purposeForSection(type: ContentSectionType): BrightBodyVisualContent["purpose"] {
  if (type === "warning") return "warning";
  if (type === "checklist") return "checklist";
  if (type === "summary") return "summary";
  if (type === "comparison") return "comparison";
  return "infographic";
}

function inferSectionType(heading: string): ContentSectionType {
  if (/주의|위험|경고|중단|피해야|예외/.test(heading)) return "warning";
  if (/체크|목록|준비|확인/.test(heading)) return "checklist";
  if (/단계|순서|방법|실천|사용/.test(heading)) return "steps";
  if (/요약|정리|결론/.test(heading)) return "summary";
  if (/비교|차이|장단점/.test(heading)) return "comparison";
  if (/사례|예시|상황/.test(heading)) return "case_example";
  return "explanation";
}

function purposeLabel(purpose: BrightBodyVisualContent["purpose"]): string {
  return ({
    comparison: "한눈에 비교",
    checklist: "체크리스트",
    infographic: "핵심 안내",
    summary: "핵심 요약",
    warning: "주의사항",
  })[purpose];
}

function visualPalette(purpose: BrightBodyVisualContent["purpose"]) {
  if (purpose === "warning") return { background: "#fff8e8", border: "#f2cf72", badge: "#fff0bf", text: "#8a5400" };
  if (purpose === "checklist") return { background: "#f1fbf5", border: "#9ed8b5", badge: "#dcf6e6", text: "#17623a" };
  if (purpose === "summary") return { background: "#f7f3ff", border: "#cdbcf1", badge: "#ece4ff", text: "#594099" };
  return { background: "#f3f7ff", border: "#aac5ee", badge: "#e3edff", text: "#244f91" };
}

function uniqueId(base: string, existing: ReadonlySet<string>): string {
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[character]!);
}
