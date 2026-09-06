/**
 * The one definition of what counts as a fact this platform must source.
 *
 * D-039 Write-time Fact Constraint. Three subsystems used to answer this
 * question separately and disagreed, which is how a finished article could be
 * stripped of the sentences one of them matched and then blocked forever on a
 * word another one matched. `criticalSurfacePattern` caught `우대 조건` and
 * `자격 요건` but not `2년`; `detectHighRiskScalarTokens` caught `2년` but not
 * `우대 조건`. Nothing in the pipeline could satisfy both, so regeneration
 * reproduced the same block in the same place.
 *
 * Measured over the 48 surfaces the withdrawal sweep recorded, 39 (81%) carry
 * no value at all — lead sentences, checklist rows, reader instructions, and
 * the "check the official 상품설명서" advice the approval policy itself asks
 * for. Naming a condition is not asserting its value.
 */
import type { ContentBlock, ContentDocument } from "../content";

export type FactualSurfaceClass =
  /** A value with a unit, predicated of something that publishes it. Needs a source. */
  | "external_fact"
  /** A value with a unit and no identifiable owner. Reported, never blocking. */
  | "unattributed_value"
  /** A figure derived from assumptions the article prints beside it. */
  | "illustrative"
  /** `정보 기준일` / `최종 검토일` — publication metadata the policy requires. */
  | "publication_meta"
  /** Prose that names, explains or instructs without asserting a value. */
  | "editorial_frame";

export type FactualSurfaceContext = Readonly<{
  /**
   * Text that says what the surface is about when the surface itself cannot.
   *
   * A table cell reading `500,000원` carries no subject; its subject is the row
   * label and the caption. Judging the cell alone made every measured value in
   * a comparison table permanently unattributable.
   */
  attribution?: readonly string[];
  /** The enclosing section states the assumptions its figures rest on. */
  sectionDisclosesAssumptions?: boolean;
}>;

export type FactualSurfaceCandidate = Readonly<{
  surface: string;
  classification: FactualSurfaceClass;
}>;

/** Classes that name a value the reader is expected to rely on. */
export function statesAValue(classification: FactualSurfaceClass): boolean {
  return classification === "external_fact" || classification === "unattributed_value";
}

/** Only an attributed value can be checked against an external document. */
export function requiresExternalEvidence(classification: FactualSurfaceClass): boolean {
  return classification === "external_fact";
}

export function classifyFactualSurface(
  surface: string,
  context: FactualSurfaceContext = {},
): FactualSurfaceClass {
  const text = normalize(surface);
  if (!text) return "editorial_frame";
  if (publicationMetaPattern.test(text)) return "publication_meta";

  const values = valueOccurrences(text);
  if (!values.length) return "editorial_frame";
  if (context.sectionDisclosesAssumptions) return "illustrative";

  const attribution = (context.attribution ?? []).map(normalize).filter(Boolean);
  const attributed = values.some((value) =>
    subjectAdjoins(text, value) || attribution.some((item) => subjectPattern.test(item)));
  return attributed ? "external_fact" : "unattributed_value";
}

/**
 * Every reader-visible surface of a document, paired with what it is about.
 *
 * Table cells are emitted with their caption, column header and row label so
 * `classifyFactualSurface` can see the subject the cell itself omits.
 */
export function factualSurfaceCandidates(
  document: ContentDocument,
): readonly FactualSurfaceCandidate[] {
  const candidates: FactualSurfaceCandidate[] = [];
  for (const section of documentSections(document)) {
    const sectionDisclosesAssumptions = section.some((block) =>
      plainSurfaces(block).some((value) => calculationDisclosurePattern.test(normalize(value))));
    for (const block of section) {
      for (const entry of blockSurfaceEntries(block)) {
        for (const sentence of sentenceSurfaces(entry.text)) {
          candidates.push(Object.freeze({
            surface: sentence,
            classification: classifyFactualSurface(sentence, {
              attribution: entry.attribution,
              sectionDisclosesAssumptions,
            }),
          }));
        }
      }
    }
  }
  for (const value of [document.title, document.metadata?.seoTitle ?? "", document.metadata?.metaDescription ?? ""]) {
    for (const sentence of sentenceSurfaces(value)) {
      candidates.push(Object.freeze({ surface: sentence, classification: classifyFactualSurface(sentence) }));
    }
  }
  return Object.freeze(candidates);
}

/**
 * Splits a reader-visible value into the units a reviewer is asked to look at.
 *
 * A terminator only ends a sentence when whitespace or the end of the value
 * follows it, so decimal figures such as `12.5%` are never split in half.
 */
export function sentenceSurfaces(value: string): readonly string[] {
  const text = normalize(value);
  if (!text) return Object.freeze([]);
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!".!?。".includes(text[index]!)) continue;
    const next = text[index + 1];
    if (next !== undefined && next !== " ") continue;
    sentences.push(text.slice(start, index + 1));
    start = index + 1;
  }
  if (start < text.length) sentences.push(text.slice(start));
  const cleaned = sentences.map(normalize).filter(Boolean);
  return Object.freeze(cleaned.length > 1 ? cleaned : [text]);
}

type ValueOccurrence = Readonly<{ start: number; end: number }>;

/**
 * A number only becomes a claim when it carries a unit that fixes its meaning.
 *
 * A bare period is included, but on its own it decides nothing: `24개월` is a
 * programme term in `주거 지원 기간은 24개월입니다` and the reader's own filing
 * window in `최근 3개월 사용 내역`. Attribution separates them, which is the
 * whole point of asking for a subject rather than matching harder.
 */
const valuePatterns: readonly RegExp[] = Object.freeze([
  /\d[\d,]*(?:\.\d+)?\s*(?:조원|억원|만원|원)/gu,
  /\d+(?:\.\d+)?\s*(?:%|퍼센트)/gu,
  /\d{4}\s*[년.\-]\s*\d{1,2}(?:\s*[월.\-]\s*\d{1,2})?/gu,
  /제\s*\d+\s*조(?:의\s*\d+)?/gu,
  /\d+(?:\.\d+)?\s*(?:개월|일|주|년)/gu,
  // An age bound is how benefit rules state who qualifies — `만 19세 이상`.
  // The lookahead keeps `1세대` out, where 세 is part of another word.
  /\d+\s*세(?![가-힣])/gu,
]);

/**
 * A window the article asks the reader to look back over is not a value.
 *
 * No institution publishes "최근 1년", so requiring a source for it is a
 * demand nothing can satisfy — which is exactly how two finished articles
 * scoring 100 ended up blocked on `1년` and `2년` with no way out. A threshold
 * cancels the suppression, because `최근 6개월 이내에 폐업한 사업자` is an
 * eligibility rule someone does publish.
 */
const recencyWindowPattern =
  /(?:최근|지난)\s*\d+(?:\.\d+)?\s*(?:개월|일|주|년)(?!\s*(?:이내|이상|이하|미만|초과|안에|내에|까지))/gu;

function valueOccurrences(text: string): readonly ValueOccurrence[] {
  const suppressed: ValueOccurrence[] = [];
  for (const match of text.matchAll(recencyWindowPattern)) {
    if (typeof match.index !== "number") continue;
    suppressed.push(Object.freeze({ start: match.index, end: match.index + match[0].length }));
  }
  const occurrences: ValueOccurrence[] = [];
  for (const pattern of valuePatterns) {
    for (const match of text.matchAll(pattern)) {
      if (typeof match.index !== "number" || !match[0]) continue;
      const start = match.index;
      const end = start + match[0].length;
      if (suppressed.some((span) => start >= span.start && end <= span.end)) continue;
      occurrences.push(Object.freeze({ start, end }));
    }
  }
  return Object.freeze(occurrences.sort((a, b) => a.start - b.start));
}

/**
 * Whether something that publishes this value is named next to it.
 *
 * Korean puts the owner on either side depending on the construction —
 * `주거 지원 기간은 24개월` names it first, `6개월 이내에 폐업한 사업자만 신청할
 * 수 있습니다` names it after — so both sides are read.
 *
 * What matters is that it is *next to* the value. Accepting the subject
 * anywhere in the sentence read `보유 목돈이 있어도 1년 안에 쓸 가능성이
 * 크다면 … 해지 조건을 우선 점검해야` as a statutory claim because a topic noun
 * appears twenty characters later, when it is the reader's own judgement call.
 */
const attributionWindow = 22;

function subjectAdjoins(text: string, value: ValueOccurrence): boolean {
  const before = text.slice(Math.max(0, value.start - attributionWindow), value.start);
  const after = text.slice(value.end, value.end + attributionWindow);
  return subjectPattern.test(before) || subjectPattern.test(after);
}

/**
 * Things that own a published value: benefits, levies, products, institutions
 * and the documents that state their terms.
 *
 * `기간`, `기준` and `조건` carry a lookbehind because they also live inside
 * words that own nothing — `장기간`, `판단기준` — and one of those was enough to
 * turn the sentence above into a sourced claim.
 */
const subjectPattern =
  /(?:급여|공제|지원금|보조금|수당|연금|보험료|보험금|세액|세율|과세|환급금|가산세|한도|보장|이율|금리|원금|이자|잔액|납입액|납입금|수수료|위약금|연회비|보증금|월세|전세|임대료|통장|예금|적금|대출|카드|요금제|청약|사업자|공단|국세청|관세청|금융감독원|금융위원회|건강보험|고용보험|국민연금|산재보험|법령|시행령|시행규칙|고시|약관|상품설명서|공고문|모집공고|계약|신고|신청|접수|지급|납부|(?<![가-힣])(?:기간|기한|기준|조건))/u;

const publicationMetaPattern = /(?:정보\s*기준일|최종\s*검토일)\s*[:：]/u;

/**
 * A paragraph that both names its assumptions and disclaims that the figures
 * stand for real amounts. All three parts are required: a sentence that merely
 * contains `예시` states nothing about where its numbers came from.
 */
const calculationDisclosurePattern =
  /(?=.*(?:계산\s*예시|예시\s*계산|가정))(?=.*(?:산출|계산))(?=.*(?:대신하지\s*않|반영하지\s*않|다를\s*수\s*있))/u;

/** Whether a section's text states where its calculated figures came from. */
export function satisfiesCalculationDisclosure(text: string): boolean {
  return calculationDisclosurePattern.test(normalize(text));
}

/**
 * What a calculation disclosure has to say, in the words generation must use.
 *
 * The exemption and the instruction that asks for it have to describe the same
 * sentence or the article loses the exemption it was written to earn. A live
 * generation stopped after the second clause — `대출원금 1억원, 연 4.8%, 3년,
 * 매월 납부라는 동일한 가정을 둔 계산 예시입니다` — and every amount in its
 * comparison table was then read as an unsourced external claim, because
 * nothing said the figures do not stand for a real charge.
 *
 * Exported so the generation instruction is built from the same contract the
 * classifier enforces, instead of a paraphrase that can drift away from it.
 */
export const calculationDisclosureContract = Object.freeze({
  clauses: Object.freeze([
    "the assumptions the figures rest on, named explicitly (가정 / 계산 예시)",
    "that the figures were derived from those assumptions (산출 / 계산)",
    "that they do not stand for an actual charged or paid amount and can differ (대신하지 않습니다 / 반영하지 않았습니다 / 다를 수 있습니다)",
  ]),
  example: "아래 계산 예시는 대출원금 1억원, 연 4.8%, 3년, 매월 납부라는 가정만 놓고 산출했습니다. 수수료와 금리 변동은 반영하지 않았으므로 실제 계약상 청구액을 대신하지 않습니다.",
});

type SurfaceEntry = Readonly<{ text: string; attribution: readonly string[] }>;

function blockSurfaceEntries(block: ContentBlock): readonly SurfaceEntry[] {
  if (block.type === "heading" || block.type === "paragraph") {
    return [{ text: block.text, attribution: [] }];
  }
  if (block.type === "list") {
    return block.items.map((item) => ({ text: item, attribution: [] }));
  }
  if (block.type === "table") {
    const caption = block.caption ?? "";
    const entries: SurfaceEntry[] = [{ text: caption, attribution: [] }];
    block.headers.forEach((header) => entries.push({ text: header, attribution: [caption] }));
    for (const row of block.rows) {
      const label = row[0] ?? "";
      row.forEach((cell, column) => entries.push({
        text: cell,
        attribution: [caption, block.headers[column] ?? "", label],
      }));
    }
    return entries;
  }
  if (block.type === "image") {
    return [{ text: block.alt, attribution: [] }, { text: block.caption ?? "", attribution: [] }];
  }
  if (block.type === "button") {
    return [{ text: block.label, attribution: [] }, { text: block.description ?? "", attribution: [] }];
  }
  return [];
}

function plainSurfaces(block: ContentBlock): readonly string[] {
  return blockSurfaceEntries(block).map((entry) => entry.text);
}

function documentSections(document: ContentDocument): readonly (readonly ContentBlock[])[] {
  const sections: ContentBlock[][] = [];
  let start = 0;
  document.blocks.forEach((block, index) => {
    if (block.type === "heading" && index > start) {
      sections.push(document.blocks.slice(start, index));
      start = index;
    }
  });
  sections.push(document.blocks.slice(start));
  return Object.freeze(sections);
}

function normalize(value: string): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}
