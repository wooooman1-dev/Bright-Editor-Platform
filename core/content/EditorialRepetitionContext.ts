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
  const repeatedTitleShapes = [...new Set(recent.flatMap((pattern) => titleShapes(pattern.title)))];
  return [
    "아래는 이 사이트에 최근 발행한 글들의 제목, H2 소제목, 도입부 첫 문장과 기획된 글 형태이다.",
    "새 글은 이들과 제목 문형, 소제목 문형, 도입부 화법이 겹치지 않아야 한다.",
    repeatedTitleShapes.length
      ? `특히 최근 제목이 반복적으로 사용한 형태(${repeatedTitleShapes.join(", ")})를 그대로 따르지 말 것. 구분자만 다른 기호로 바꾸는 것은 다른 문형이 아니다.`
      : "",
    headingEchoRule(recent),
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

/**
 * Names the structure a title uses, not the punctuation it uses to express it.
 * The first version of this named the colon, and generation satisfied that
 * literally: it moved the separator to a comma and kept
 * `<핵심어> + 구분자 + 설명절` intact, so the instruction stopped describing what
 * was actually repeating. A title can match more than one structure, so all
 * matches are reported rather than the first.
 */
function titleShapes(title: string): readonly string[] {
  return [
    splitTitleClause(title) ? "‘핵심어 + 구분자 + 설명절’ 형태의 두 도막 제목(콜론·쉼표·붙임표 등 구분자 종류와 무관)" : "",
    /\?\s*$/u.test(title) ? "질문형 제목" : "",
    /\d+\s*(?:가지|개|단계)/u.test(title) ? "숫자 나열형 제목" : "",
  ].filter(Boolean);
}

/**
 * Any separator that can carry a title's head phrase into a trailing
 * description. A bare hyphen needs surrounding spaces so hyphenated words and
 * ranges are not read as a split.
 */
const titleClauseSeparator = /\s*[:︰]\s*|\s*[,;]\s+|\s+[-–—~|]\s+/u;

function splitTitleClause(title: string): Readonly<{ head: string; tail: string }> | undefined {
  const match = titleClauseSeparator.exec(title);
  if (!match || match.index === 0) return undefined;
  const head = title.slice(0, match.index).trim();
  const tail = title.slice(match.index + match[0].length).trim();
  /**
   * A trailing fragment of one word is a tag, not the 설명절 half of the shape.
   * Requiring two words keeps `제목 - 요약` style suffixes out of the signal.
   */
  if (!head || wordCount(tail) < 2) return undefined;
  return Object.freeze({ head, tail });
}

/**
 * The other half of the same repetition: the title names the subject, then the
 * first H2 names it again, so the opening section is spent restating rather
 * than answering.
 *
 * This matches the head *phrase* being repeated, not the presence of the
 * topic's terms. `ContentOpportunityAlignment` passes heading anchoring only
 * when every H2 and H3 carries a core term, so an instruction to keep the
 * subject out of the headings would trade a repetition problem for a blocked
 * article. What is asked for is a different first section, not a heading
 * stripped of its subject.
 */
function headingEchoRule(recent: readonly RecentEditorialPattern[]): string {
  const echoed = recent.filter(firstHeadingRestatesTitle).map((pattern) => pattern.headings[0]);
  if (echoed.length < 2) return "";
  return `최근 글의 첫 H2가 제목 앞머리를 거의 그대로 되풀이했다(${echoed.join(", ")}). 첫 섹션은 제목을 다시 말하는 자리가 아니라 독자가 가장 먼저 판단해야 할 것을 다루는 자리로 잡을 것. 다만 소제목에서 주제어 자체를 빼지는 말 것.`;
}

function firstHeadingRestatesTitle(pattern: RecentEditorialPattern): boolean {
  const [heading] = pattern.headings;
  if (!heading) return false;
  const terms = distinctiveHeadTerms(splitTitleClause(pattern.title)?.head ?? pattern.title);
  if (terms.length < 2) return false;
  const normalizedHeading = normalizeForComparison(heading);
  /**
   * The whole head phrase, not most of it. Carrying some of the title's terms
   * is the anchoring `ContentOpportunityAlignment` requires of every heading,
   * and a looser bar flagged `신용카드 결제일을 정하기 전, 달력에 적을 4가지` under the
   * title `신용카드 결제일 설정 방법` — a heading that already does what this rule
   * asks for. These headings are quoted to the model as patterns to avoid, so a
   * heading wrongly named as a fault teaches the wrong lesson; missing a
   * restatement only leaves the rule quiet.
   */
  return terms.every((term) => normalizedHeading.includes(term));
}

/**
 * Terms that carry the subject of the head phrase. The task modifiers are
 * dropped because they appear in almost every life-economy heading, so leaving
 * them in would report a restatement whenever two headings both said 방법.
 */
const genericHeadTerms = new Set([
  "방법", "기준", "순서", "확인", "정리", "총정리", "가이드", "정보", "핵심", "관리", "안내", "이해", "관련", "위한", "대한",
]);

function distinctiveHeadTerms(head: string): readonly string[] {
  return [...new Set(normalizeForComparison(head)
    .split(/\s+/u)
    .map(stripParticle)
    .filter((term) => term.length >= 2 && !genericHeadTerms.has(term)))];
}

function stripParticle(value: string): string {
  const suffixes = ["으로는", "에서는", "까지는", "부터는", "으로", "에서", "까지", "부터", "이란", "라는", "을", "를", "은", "는", "이", "가", "의"];
  for (const suffix of suffixes) {
    if (value.endsWith(suffix) && value.length - suffix.length >= 2) return value.slice(0, -suffix.length);
  }
  return value;
}

function normalizeForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function wordCount(value: string): number {
  return value.split(/\s+/u).filter(Boolean).length;
}
