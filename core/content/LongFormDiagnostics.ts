import type { ContentDocument } from "./ContentDocument";
import {
  determineContentPlanQualityTarget,
  type ContentPlanQualityTarget,
  type ContentSectionType,
  type ContentTargetRange,
} from "./ContentDepthPolicy";
import {
  normalizeStructuredText,
  serializeStructuredList,
  serializeStructuredTable,
  structuredListItems,
  structuredProseText,
  structuredTableCount,
} from "./StructuredText";

export type InformationSufficiencyStatus = "missing" | "mentioned" | "sufficient";

export type LongFormViolationCode =
  | "CONTENT_INCOMPLETE_SECTION"
  | "CONTENT_REQUIRED_ELEMENT_MISSING"
  | "CONTENT_REQUIRED_ELEMENT_INSUFFICIENT"
  | "CONTENT_REPETITION_DETECTED"
  /** Legacy diagnostic codes remain readable but are never newly generated. */
  | "CONTENT_TOTAL_BELOW_SAFETY_FLOOR"
  | "CONTENT_BELOW_PLANNING_TARGET"
  | "CONTENT_ABOVE_PLANNING_TARGET"
  | "CONTENT_INVALID_SECTION_COUNT";

export type LongFormSectionDiagnostic = Readonly<{
  heading: string;
  sectionType: ContentSectionType;
  /** Telemetry only. Never used for quality or approval. */
  proseCharacters: number;
  listItemCount: number;
  tableCount: number;
  informationElementCount: number;
  completeness: InformationSufficiencyStatus;
  expectedGuidance: string;
}>;

export type RequiredContentElementDiagnostic = Readonly<{
  element: string;
  status: InformationSufficiencyStatus;
  /** Backward-compatible convenience field. True only for sufficient coverage. */
  satisfied: boolean;
}>;

export type LongFormDiagnostic = Readonly<{
  code?: LongFormViolationCode;
  /** Telemetry only. */
  actualTotalProseCharacters: number;
  /** Backward-compatible telemetry alias. */
  totalProseCharacters: number;
  actualSectionCount: number;
  /** Backward-compatible telemetry alias. */
  headingCount: number;
  introductionCharacters: number;
  conclusionCharacters: number;
  sections: readonly LongFormSectionDiagnostic[];
  requiredContentElements: readonly RequiredContentElementDiagnostic[];
  repetitionWarnings: readonly string[];
  warningCodes: readonly LongFormViolationCode[];
  violations: readonly Readonly<{
    code: LongFormViolationCode;
    heading?: string;
    requiredElement?: string;
    minimum?: number;
    maximum?: number;
    actual: number;
  }>[];
  /** Legacy fields may be present when older persisted diagnostics are read. */
  targetLengthRange?: ContentTargetRange;
  targetSectionCount?: ContentTargetRange;
}>;

export class LongFormValidationError extends Error {
  readonly code: LongFormViolationCode;
  constructor(readonly diagnostic: LongFormDiagnostic) {
    const code = diagnostic.violations[0]?.code ?? diagnostic.code ?? "CONTENT_REQUIRED_ELEMENT_MISSING";
    super(formatLongFormDiagnostic(diagnostic));
    this.name = "LongFormValidationError";
    this.code = code;
  }
}

type SectionWithText = Readonly<{ diagnostic: LongFormSectionDiagnostic; text: string }>;

export function analyzeLongFormDocument(document: ContentDocument, requestedTarget?: ContentPlanQualityTarget): LongFormDiagnostic {
  const target = requestedTarget ?? document.metadata?.qualityTarget ?? determineContentPlanQualityTarget({ contentType: "article" });
  const boundaries = document.metadata?.longFormStructure;
  const byId = new Map(document.blocks.map((block) => [block.id, block]));
  const introductionText = normalizeStructuredText(boundaries ? textForIds(boundaries.introductionBlockIds, byId) : textBeforeFirstH2(document));
  const conclusionText = normalizeStructuredText(boundaries ? textForIds(boundaries.conclusionBlockIds, byId) : "");
  const sectionDetails = boundaries
    ? boundaries.sections.map((section) => {
      const text = normalizeStructuredText(textForIds(section.paragraphBlockIds, byId));
      return Object.freeze({
        text,
        diagnostic: sectionDiagnostic(
          headingForId(section.headingBlockId, byId),
          section.sectionType ?? "explanation",
          text,
          target,
        ),
      });
    })
    : inferSections(document, target);
  const sections = sectionDetails.map((item) => item.diagnostic);
  const paragraphs = document.blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => normalizeStructuredText(block.text));
  const contentTexts = document.blocks.flatMap((block) => {
    if (block.type === "paragraph") return [normalizeStructuredText(block.text)];
    if (block.type === "list") return [serializeStructuredList(block)];
    if (block.type === "table") return [serializeStructuredTable(block)];
    return [];
  });
  const total = contentTexts.reduce((sum, text) => sum + withoutWhitespace(text), 0);
  const fullText = document.blocks.map(blockStructuredText).filter(Boolean).join("\n");
  const requiredContentElements = target.requiredContentElements.map((element) => {
    const status = requirementStatus(element, fullText, introductionText, conclusionText, sectionDetails);
    return Object.freeze({ element, status, satisfied: status === "sufficient" });
  });
  const repetitionWarnings = repetitionSignals(paragraphs);
  const violations: Array<LongFormDiagnostic["violations"][number]> = [];

  for (const section of sections) {
    if (section.completeness !== "sufficient") {
      violations.push({ code: "CONTENT_INCOMPLETE_SECTION", heading: section.heading, actual: section.informationElementCount });
    }
  }
  for (const item of requiredContentElements) {
    if (item.status === "missing") violations.push({ code: "CONTENT_REQUIRED_ELEMENT_MISSING", requiredElement: item.element, actual: 0 });
    if (item.status === "mentioned") violations.push({ code: "CONTENT_REQUIRED_ELEMENT_INSUFFICIENT", requiredElement: item.element, actual: 1 });
  }
  if (repetitionWarnings.length) violations.push({ code: "CONTENT_REPETITION_DETECTED", actual: repetitionWarnings.length });

  return Object.freeze({
    ...(violations[0] ? { code: violations[0].code } : {}),
    actualTotalProseCharacters: total,
    totalProseCharacters: total,
    actualSectionCount: sections.length,
    headingCount: sections.length,
    introductionCharacters: withoutWhitespace(introductionText),
    conclusionCharacters: withoutWhitespace(conclusionText),
    sections: Object.freeze(sections),
    requiredContentElements: Object.freeze(requiredContentElements),
    repetitionWarnings: Object.freeze(repetitionWarnings),
    warningCodes: Object.freeze([]),
    violations: Object.freeze(violations.map((item) => Object.freeze(item))),
  });
}

/**
 * Generation-provided sectionType is an untrusted semantic hint until the
 * normalized blocks actually support that role. Reconcile only structurally
 * defined roles; rich but shallow content remains incomplete instead of being
 * silently downgraded.
 */
export function normalizeGeneratedSectionSemantics(
  document: ContentDocument,
  requestedTarget?: ContentPlanQualityTarget,
): ContentDocument {
  const structure = document.metadata?.longFormStructure;
  if (!structure || !document.metadata) return document;
  const target = requestedTarget ?? document.metadata.qualityTarget
    ?? determineContentPlanQualityTarget({ contentType: "article" });
  const byId = new Map(document.blocks.map((block) => [block.id, block]));
  let changed = false;
  const sections = structure.sections.map((section) => {
    const declared = section.sectionType ?? "explanation";
    if (!structuralSectionTypes.has(declared)) return section;
    const heading = headingForId(section.headingBlockId, byId);
    const blocks = section.paragraphBlockIds.flatMap((id) => {
      const block = byId.get(id);
      return block ? [block] : [];
    });
    const text = normalizeStructuredText(blocks.map(blockStructuredText).filter(Boolean).join("\n"));
    if (sectionDiagnostic(heading, declared, text, target).completeness === "sufficient") return section;
    const candidates: ContentSectionType[] = [
      ...(blocks.some((block) => block.type === "list" && block.style === "ordered") ? ["steps" as const] : []),
      ...(blocks.some((block) => block.type === "list" && block.style === "unordered") ? ["checklist" as const] : []),
      ...(blocks.some((block) => block.type === "table") ? ["comparison" as const] : []),
      "explanation",
    ];
    const resolved = candidates.find((candidate) =>
      candidate !== declared
      && sectionDiagnostic(heading, candidate, text, target).completeness === "sufficient");
    if (!resolved) return section;
    changed = true;
    return Object.freeze({ ...section, sectionType: resolved });
  });
  if (!changed) return document;
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata,
      longFormStructure: Object.freeze({
        ...structure,
        sections: Object.freeze(sections),
      }),
    }),
  });
}

export function requiresLongFormValidation(document: ContentDocument): boolean {
  return Boolean(document.metadata?.qualityTarget || document.metadata?.longFormStructure)
    || document.blocks.some((block) => block.type === "heading" && block.level === 2);
}

export function assertLongFormDocument(document: ContentDocument, target?: ContentPlanQualityTarget): LongFormDiagnostic {
  const diagnostic = analyzeLongFormDocument(document, target);
  if (diagnostic.violations.length) throw new LongFormValidationError(diagnostic);
  return diagnostic;
}

/** Kept as a source-compatible alias; it no longer checks a character safety floor. */
export function assertLongFormSafetyTarget(document: ContentDocument, target?: ContentPlanQualityTarget): LongFormDiagnostic {
  return assertLongFormDocument(document, target);
}

export function formatLongFormDiagnostic(diagnostic: LongFormDiagnostic): string {
  const item = diagnostic.violations[0];
  if (!item) return "Content document passed its information sufficiency checks.";
  if (item.code === "CONTENT_INCOMPLETE_SECTION") return `CONTENT_INCOMPLETE_SECTION: "${item.heading ?? "제목 없음"}" does not sufficiently fulfill its section role.`;
  if (item.code === "CONTENT_REQUIRED_ELEMENT_MISSING") return `CONTENT_REQUIRED_ELEMENT_MISSING: ${item.requiredElement ?? "required element"}.`;
  if (item.code === "CONTENT_REQUIRED_ELEMENT_INSUFFICIENT") return `CONTENT_REQUIRED_ELEMENT_INSUFFICIENT: ${item.requiredElement ?? "required element"} was only mentioned.`;
  if (item.code === "CONTENT_REPETITION_DETECTED") return `CONTENT_REPETITION_DETECTED: ${item.actual} repeated paragraph pattern(s).`;
  return `${item.code}: legacy length diagnostic.`;
}

function sectionDiagnostic(heading: string, sectionType: ContentSectionType, text: string, target: ContentPlanQualityTarget): LongFormSectionDiagnostic {
  const normalizedText = normalizeStructuredText(text);
  const listItemCount = structuredListItems(normalizedText).length;
  const tableCount = structuredTableCount(text);
  const sentenceElements = informationSentenceCount(structuredProseText(normalizedText));
  const informationElementCount = sentenceElements + listItemCount + tableCount * 3;
  const guidance = target.sectionGuidance[sectionType];
  const structureSatisfied =
    (sectionType === "checklist" ? listItemCount >= guidance.minimumListItems || informationElementCount >= guidance.minimumInformationElements + 1 : true)
    && (sectionType === "steps" ? orderedListItemCount(normalizedText) >= guidance.minimumListItems || orderedActionSignals(normalizedText) >= 3 : true)
    && (sectionType === "comparison" ? tableCount > 0 || comparisonSignals(normalizedText) >= 3 : true)
    && (sectionType === "faq" ? questionAnswerSignals(normalizedText) >= 2 : true);
  const completeness: InformationSufficiencyStatus = !normalizedText
    ? "missing"
    : informationElementCount >= guidance.minimumInformationElements && structureSatisfied ? "sufficient" : "mentioned";
  return Object.freeze({
    heading,
    sectionType,
    proseCharacters: withoutWhitespace(normalizedText),
    listItemCount,
    tableCount,
    informationElementCount,
    completeness,
    expectedGuidance: guidance.expectedRole,
  });
}

function inferSections(document: ContentDocument, target: ContentPlanQualityTarget): SectionWithText[] {
  const result: SectionWithText[] = [];
  let heading = "";
  let text: string[] = [];
  const flush = () => {
    if (!heading) return;
    const joined = normalizeStructuredText(text.join("\n"));
    result.push(Object.freeze({ text: joined, diagnostic: sectionDiagnostic(heading, inferSectionType(heading), joined, target) }));
  };
  for (const block of document.blocks) {
    if (block.type === "heading" && block.level === 2) {
      flush();
      heading = normalizeStructuredText(block.text);
      text = [];
    } else if (heading && (block.type === "paragraph" || block.type === "list" || block.type === "table")) {
      text.push(blockStructuredText(block));
    }
  }
  flush();
  return result;
}

function inferSectionType(heading: string): ContentSectionType {
  if (/체크|목록|준비물/.test(heading)) return "checklist";
  if (/비교|차이|장단점/.test(heading)) return "comparison";
  if (/단계|순서|방법|실천/.test(heading)) return "steps";
  if (/주의|위험|경고|예외/.test(heading)) return "warning";
  if (/질문|FAQ|궁금/.test(heading)) return "faq";
  if (/요약|정리|결론/.test(heading)) return "summary";
  if (/사례|예시|상황/.test(heading)) return "case_example";
  return "explanation";
}

function requirementStatus(
  requirement: string,
  fullText: string,
  introductionText: string,
  conclusionText: string,
  sections: readonly SectionWithText[],
): InformationSufficiencyStatus {
  if (/직접 답/.test(requirement)) return roleStatus(introductionText, 2);
  if (/다음 행동|최종 판단|추천 기준/.test(requirement)) return roleStatus(conclusionText || fullText, 2, /다음|실행|시작|확인|상담|선택|권장|추천|판단/);
  const signal = requirementSignal(requirement);
  const matching = sections.filter((section) => {
    const sectionText = `${section.diagnostic.heading}\n${section.text}`;
    return signal.test(sectionText) || termCoverage(requirement, sectionText);
  });
  if (!matching.length) return signal.test(fullText) || termCoverage(requirement, fullText) ? "mentioned" : "missing";
  return matching.some((section) => section.diagnostic.completeness === "sufficient")
    ? "sufficient"
    : "mentioned";
}

function requirementSignal(requirement: string): RegExp {
  if (/배경|원인|관계/.test(requirement)) return /원인|배경|관계|영향|때문|작용/;
  if (/판단|기준|구분/.test(requirement)) return /판단|기준|구분|조건|확인|경우/;
  if (/사례|예시|적용/.test(requirement)) return /사례|예시|상황|적용|가령/;
  if (/주의|위험|예외|오해/.test(requirement)) return /주의|위험|예외|오해|피해야|상담|확인/;
  if (/실행|방법|단계/.test(requirement)) return /실행|방법|단계|순서|먼저|다음/;
  if (/비교|차이|장단점|선택 조건/.test(requirement)) return /비교|차이|장점|단점|조건|선택/;
  if (/배경 설명|개념/.test(requirement)) return /개념|배경|원리|이유|의미/;
  return new RegExp(semanticTerms(requirement).slice(0, 3).map(escapeRegExp).join("|") || "a^", "i");
}

function roleStatus(text: string, minimumElements: number, signal?: RegExp): InformationSufficiencyStatus {
  const normalizedText = normalizeStructuredText(text);
  if (!normalizedText) return "missing";
  if (signal && !signal.test(normalizedText)) return "mentioned";
  const elements = informationSentenceCount(structuredProseText(normalizedText))
    + structuredListItems(normalizedText).length
    + structuredTableCount(text) * 3;
  return elements >= minimumElements ? "sufficient" : "mentioned";
}

function termCoverage(requirement: string, text: string): boolean {
  const terms = semanticTerms(requirement);
  const searchable = semanticTerms(text);
  return terms.length > 0
    && terms.filter((term) => searchable.some((candidate) => candidate.includes(term) || term.includes(candidate))).length
      >= Math.max(1, Math.ceil(terms.length / 2));
}

function semanticTerms(value: string): string[] {
  const particles = /(?:에게서|으로부터|에서부터|에게|께서|보다|처럼|까지|부터|으로|에서|하고|이며|이고|와|과|을|를|은|는|이|가|의|에|도|만)$/u;
  return normalizeStructuredText(value).toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣\s]/gi, " ")
    .split(/\s+/)
    .map((term) => term.replace(particles, ""))
    .filter((term) => term.length >= 2);
}

function informationSentenceCount(text: string): number {
  return normalizeStructuredText(text).split(/(?:[.!?。！？]+|\n+)/).filter((item) => item.trim().length >= 12).length;
}
function orderedActionSignals(text: string): number {
  const normalized = normalizeStructuredText(text);
  return count(normalized, /(?:^|\n)\s*\d+[.)]\s+\S/gm)
    + count(normalized, /먼저|다음(?:으로)?|마지막(?:으로)?|첫째|둘째|셋째/g);
}
function orderedListItemCount(text: string): number {
  return [...normalizeStructuredText(text).matchAll(/(?:^|\n)\s*\d+[.)]\s+[^\n]+/gm)].length;
}
function comparisonSignals(text: string): number { return count(text, /비교|차이|장점|단점|반면|기준|선택|적합/g); }
function questionAnswerSignals(text: string): number { return count(text, /\?|질문|답변|Q[:.]|A[:.]/gi); }

function repetitionSignals(paragraphs: readonly string[]): string[] {
  const normalized = paragraphs.map((item) => normalizeStructuredText(item).replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, ""));
  const warnings: string[] = [];
  for (let left = 0; left < normalized.length; left += 1) {
    if (normalized[left].length < 40) continue;
    for (let right = left + 1; right < normalized.length; right += 1) {
      if (normalized[left] === normalized[right]) {
        warnings.push(`paragraphs ${left + 1} and ${right + 1} are identical`);
        break;
      }
      const a = new Set(chunks(normalized[left], 18));
      const b = new Set(chunks(normalized[right], 18));
      const overlap = [...a].filter((item) => b.has(item)).length;
      if (a.size && b.size && overlap / Math.min(a.size, b.size) >= 0.8) {
        warnings.push(`paragraphs ${left + 1} and ${right + 1} are substantially duplicated`);
        break;
      }
    }
  }
  return [...new Set(warnings)].slice(0, 20);
}

function chunks(value: string, size: number): string[] {
  const result: string[] = [];
  for (let index = 0; index + size <= value.length; index += size) result.push(value.slice(index, index + size));
  return result;
}
function textForIds(ids: readonly string[], blocks: ReadonlyMap<string, ContentDocument["blocks"][number]>): string {
  return ids.flatMap((id) => {
    const block = blocks.get(id);
    return block ? [blockStructuredText(block)].filter(Boolean) : [];
  }).join("\n");
}
function headingForId(id: string, blocks: ReadonlyMap<string, ContentDocument["blocks"][number]>): string {
  const block = blocks.get(id);
  return block?.type === "heading" ? normalizeStructuredText(block.text) : "제목 없음";
}
function textBeforeFirstH2(document: ContentDocument): string {
  const index = document.blocks.findIndex((block) => block.type === "heading" && block.level === 2);
  return document.blocks.slice(0, index < 0 ? document.blocks.length : index)
    .map(blockStructuredText)
    .filter(Boolean)
    .join("\n");
}
function blockStructuredText(block: ContentDocument["blocks"][number]): string {
  if (block.type === "heading" || block.type === "paragraph") return normalizeStructuredText(block.text);
  if (block.type === "list") return serializeStructuredList(block);
  if (block.type === "table") return serializeStructuredTable(block);
  return "";
}
function withoutWhitespace(value: string): number { return value.replace(/\s/g, "").length; }
function count(value: string, pattern: RegExp): number { return [...value.matchAll(pattern)].length; }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

const structuralSectionTypes = new Set<ContentSectionType>(["steps", "comparison", "faq"]);
