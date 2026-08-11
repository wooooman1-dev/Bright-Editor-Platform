import type { ContentDocument } from "./ContentDocument";

/**
 * The planned shape of an article, as opposed to its surface wording. Repeating
 * this is what makes bodies look identical: the same depth produces the same
 * required elements, which produce the same component order.
 */
export type RecentEditorialShape = Readonly<{
  contentDepth: string;
  tableNeeds: boolean;
  checklistNeeds: boolean;
  requiredContentElements: readonly string[];
}>;

export type RecentEditorialPattern = Readonly<{
  title: string;
  headings: readonly string[];
  openingSentence: string;
  shape?: RecentEditorialShape;
}>;

export type EditorialRepetitionContext = Readonly<{
  recent: readonly RecentEditorialPattern[];
  instruction: string;
}>;

/**
 * Quality review scores one article at a time, so nothing in the pipeline can
 * see that consecutive articles share a title shape, a heading pattern and an
 * opening move. This summarises the most recent articles so the single
 * generation call can avoid repeating them. It adds no AI call of its own.
 */
export const defaultRecentEditorialPatternCount = 3;

export function buildEditorialRepetitionContext(
  documents: readonly ContentDocument[],
  limit = defaultRecentEditorialPatternCount,
): EditorialRepetitionContext | undefined {
  const recent = documents
    .slice(0, Math.max(0, limit))
    .map(recentEditorialPattern)
    .filter((pattern) => Boolean(pattern.title));
  if (!recent.length) return undefined;
  return Object.freeze({
    recent: Object.freeze(recent),
    instruction: repetitionInstruction(recent),
  });
}

/**
 * This summary is attached to every planning and generation prompt, so each
 * field is bounded. Without a cap a long article would grow the prompt of every
 * later article.
 */
const maximumSummarizedHeadings = 6;
const maximumSummarizedRequiredElements = 5;

export function recentEditorialPattern(document: ContentDocument): RecentEditorialPattern {
  const shape = recentEditorialShape(document);
  return Object.freeze({
    title: document.title.trim(),
    headings: Object.freeze(document.blocks.flatMap((block) =>
      block.type === "heading" && block.level === 2 && block.text.trim()
        ? [block.text.trim()]
        : []).slice(0, maximumSummarizedHeadings)),
    openingSentence: openingSentence(document),
    ...(shape ? { shape } : {}),
  });
}

function recentEditorialShape(document: ContentDocument): RecentEditorialShape | undefined {
  const target = document.metadata?.qualityTarget;
  if (!target) return undefined;
  return Object.freeze({
    contentDepth: target.contentDepth,
    tableNeeds: target.tableNeeds,
    checklistNeeds: target.checklistNeeds,
    requiredContentElements: Object.freeze(
      [...target.requiredContentElements].slice(0, maximumSummarizedRequiredElements),
    ),
  });
}

function openingSentence(document: ContentDocument): string {
  const paragraph = document.blocks.find((block) => block.type === "paragraph" && block.text.trim());
  if (!paragraph || paragraph.type !== "paragraph") return "";
  const [first] = paragraph.text.trim().split(/(?<=[.!?])\s+|(?<=다\.)\s*/u);
  return (first ?? "").trim().slice(0, 120);
}

/**
 * States the constraint in terms of the observable patterns rather than naming
 * a forbidden template, so the model is not steered toward one replacement
 * shape that would become the next repeated pattern.
 */
function repetitionInstruction(recent: readonly RecentEditorialPattern[]): string {
  const titleShapes = [...new Set(recent
    .map((pattern) => titleShape(pattern.title))
    .filter(Boolean))];
  return [
    "아래는 이 사이트에 최근 발행한 글들의 제목, H2 소제목, 도입부 첫 문장과 기획된 글 형태이다.",
    "새 글은 이들과 제목 문형, 소제목 문형, 도입부 화법이 겹치지 않아야 한다.",
    titleShapes.length
      ? `특히 최근 제목이 반복적으로 사용한 형태(${titleShapes.join(", ")})를 그대로 따르지 말 것.`
      : "",
    repeatedShapeRule(recent),
    "같은 주제를 다루더라도 독자에게 접근하는 각도와 글의 뼈대를 다르게 구성한다.",
    "다양성을 위해 사실을 바꾸거나 근거 없는 내용을 추가하지 않는다.",
    "필수 정보 요소와 완결성 기준은 낮추지 않는다. 무엇을 필수로 삼을지를 다르게 정하되 정한 것은 반드시 충족한다.",
  ].filter(Boolean).join(" ");
}

/**
 * Names the repeated plan shape only when it actually repeats, and asks for a
 * different angle rather than for fewer required elements. Dropping required
 * elements would fail the completeness gate instead of producing variety.
 */
function repeatedShapeRule(recent: readonly RecentEditorialPattern[]): string {
  const depths = recent.map((pattern) => pattern.shape?.contentDepth).filter(Boolean);
  if (depths.length < 2 || new Set(depths).size !== 1) return "";
  return `최근 글이 연속으로 같은 기획 형태(contentDepth=${depths[0]})를 사용했다. 주제가 허용한다면 이번에는 다른 접근 각도로 기획해 필수 정보 요소 구성이 달라지게 할 것.`;
}

function titleShape(title: string): string {
  if (/:/.test(title)) return "‘핵심어: 부연 설명’ 형태의 콜론 분리 제목";
  if (/\?$/.test(title)) return "질문형 제목";
  if (/\d+\s*(?:가지|개|단계)/.test(title)) return "숫자 나열형 제목";
  return "";
}
