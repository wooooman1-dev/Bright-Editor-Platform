import { isSystemProjectionBlock } from "./ContentBlockOwnership";
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

export type RecentEditorialHeadingForms = Readonly<{
  declarative: number;
  question: number;
  nominal: number;
}>;

export type RecentEditorialRhythm = Readonly<{
  paragraphs: number;
  averageSentences: number;
}>;

export type RecentEditorialPattern = Readonly<{
  title: string;
  headings: readonly string[];
  headingForms: RecentEditorialHeadingForms;
  sectionTypes: readonly string[];
  rhythm: RecentEditorialRhythm;
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
  const headings = document.blocks.flatMap((block) =>
    block.type === "heading" && block.level === 2 && block.text.trim()
      ? [block.text.trim()]
      : []);
  return Object.freeze({
    title: document.title.trim(),
    headings: Object.freeze(headings.slice(0, maximumSummarizedHeadings)),
    headingForms: countHeadingForms(headings),
    sectionTypes: Object.freeze((document.metadata?.longFormStructure?.sections ?? [])
      .flatMap((section) => section.sectionType ? [String(section.sectionType)] : [])
      .slice(0, maximumSummarizedHeadings)),
    rhythm: paragraphRhythm(document),
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
    headingFormRule(recent),
    sectionCompositionRule(recent),
    paragraphRhythmRule(recent),
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

/**
 * 소제목이 한 문형으로만 나오는 것을 본다.
 *
 * `headingEchoRule` 은 첫 H2 가 제목을 되풀이하는지만 보았다. 그래서 H2 전부가
 * 같은 문형이어도 아무 신호가 나가지 않았다. 2026-08-20 밝은재테크 실측: 최근
 * 6편의 H2 41개 중 질문형이 하나도 없었고, 대부분이 "~습니다"로 끝나는 완결형
 * 서술문이었다. 사람이 쓴 목차는 명사형과 질문형을 섞는다.
 *
 * 문형을 바꾸라고만 하고 무엇으로 바꾸라고 지정하지 않는다. 하나를 지정하면
 * 그것이 다음 반복이 된다.
 */
function headingFormRule(recent: readonly RecentEditorialPattern[]): string {
  const forms = recent.map((pattern) => pattern.headingForms);
  if (forms.length < 2) return "";
  const total = forms.reduce((sum, form) => sum + form.declarative + form.question + form.nominal, 0);
  if (total < 6) return "";
  const declarative = forms.reduce((sum, form) => sum + form.declarative, 0);
  const question = forms.reduce((sum, form) => sum + form.question, 0);
  if (question > 0 && declarative * 10 < total * 7) return "";
  return `최근 글의 H2 ${total}개 중 ${declarative}개가 완결형 서술문이고 질문형은 ${question}개다. 이번 글은 소제목 문형을 한 가지로 통일하지 말고 명사형·질문형을 함께 섞을 것. 다만 소제목에서 주제어 자체를 빼지는 말 것.`;
}

/**
 * 매번 같은 섹션 종류가 함께 등장하는 것을 본다.
 *
 * `repeatedShapeRule` 은 기획의 contentDepth 만 보는데, 그것이 같지 않아도
 * 완성된 글의 섹션 구성은 같을 수 있다. 2026-08-20 실측: 최근 6편이 모두
 * comparison 과 warning 을 포함했고 5편이 steps 와 explanation 을 포함했다.
 * 독자에게 보이는 반복은 contentDepth 가 아니라 이 조합이다.
 */
function sectionCompositionRule(recent: readonly RecentEditorialPattern[]): string {
  const compositions = recent.map((pattern) => pattern.sectionTypes).filter((types) => types.length);
  if (compositions.length < 2) return "";
  const shared = [...new Set(compositions[0])]
    .filter((type) => compositions.every((types) => types.includes(type)));
  if (shared.length < 2) return "";
  return `최근 글이 모두 ${shared.join(", ")} 섹션을 함께 사용했다. 이번 글은 주제가 실제로 요구하지 않는 섹션 종류를 넣지 말고, 필요한 종류만 다른 조합과 다른 순서로 구성할 것.`;
}

/**
 * 문단 길이가 글마다 같은 것을 본다.
 *
 * 2026-08-20 실측: 최근 6편의 문단당 평균 문장 수가 2.4~2.8 로 폭이 0.4 였다.
 * 문장 하나짜리 문단이 한 번도 나오지 않았다. 읽는 사람이 "기계적"이라고
 * 느끼는 지점이 여기다.
 */
function paragraphRhythmRule(recent: readonly RecentEditorialPattern[]): string {
  const averages = recent.map((pattern) => pattern.rhythm.averageSentences).filter((value) => value > 0);
  if (averages.length < 2) return "";
  const lowest = Math.min(...averages);
  const highest = Math.max(...averages);
  if (highest - lowest > 0.6) return "";
  return `최근 글의 문단이 모두 평균 ${lowest.toFixed(1)}~${highest.toFixed(1)}문장으로 같은 길이였다. 문단 길이를 고르게 맞추지 말고 짧은 문단과 긴 문단을 섞을 것. 문장 끝맺음도 한 가지 어미로 반복하지 말 것.`;
}

/** 질문형은 물음표로, 서술문은 종결어미로 끝난다. 나머지는 명사로 끝나는 제목이다. */
function headingForm(text: string): "question" | "declarative" | "nominal" {
  const value = text.trim().replace(/[.·]+$/u, "");
  if (/[?？]$/u.test(value)) return "question";
  if (/(?:다|요|죠|까)$/u.test(value)) return "declarative";
  return "nominal";
}

function countHeadingForms(headings: readonly string[]): RecentEditorialHeadingForms {
  let declarative = 0;
  let question = 0;
  let nominal = 0;
  for (const heading of headings) {
    const form = headingForm(heading);
    if (form === "question") question += 1;
    else if (form === "declarative") declarative += 1;
    else nominal += 1;
  }
  return Object.freeze({ declarative, question, nominal });
}

function paragraphRhythm(document: ContentDocument): RecentEditorialRhythm {
  const texts = document.blocks.flatMap((block) => block.type === "paragraph"
    && !isSystemProjectionBlock(block)
    && block.text.trim().length >= 40
    ? [block.text.trim()]
    : []);
  if (!texts.length) return Object.freeze({ paragraphs: 0, averageSentences: 0 });
  const sentences = texts.reduce((sum, text) => sum + sentenceCount(text), 0);
  return Object.freeze({
    paragraphs: texts.length,
    averageSentences: Math.round((sentences / texts.length) * 10) / 10,
  });
}

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?])\s+/u).filter((part) => part.trim()).length;
}
