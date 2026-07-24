import type { ContentDocument } from "./ContentDocument";

export const longFormHardFloor = 4_800;
export const longFormSafetyTarget = 5_500;
export const longFormSectionFloor = 450;

export type LongFormViolationCode =
  | "LONG_FORM_TOTAL_BELOW_HARD_FLOOR"
  | "LONG_FORM_BELOW_SAFETY_TARGET"
  | "LONG_FORM_INVALID_H2_COUNT"
  | "LONG_FORM_SHALLOW_SECTION";

export type LongFormSectionDiagnostic = Readonly<{
  heading: string;
  proseCharacters: number;
}>;

export type LongFormDiagnostic = Readonly<{
  code?: LongFormViolationCode;
  totalProseCharacters: number;
  headingCount: number;
  introductionCharacters: number;
  conclusionCharacters: number;
  sections: readonly LongFormSectionDiagnostic[];
  violations: readonly Readonly<{
    code: LongFormViolationCode;
    heading?: string;
    minimum?: number;
    maximum?: number;
    actual: number;
  }>[];
}>;

export class LongFormValidationError extends Error {
  readonly code: LongFormViolationCode;

  constructor(readonly diagnostic: LongFormDiagnostic) {
    const violation = diagnostic.violations[0];
    const code = violation?.code ?? diagnostic.code ?? "LONG_FORM_TOTAL_BELOW_HARD_FLOOR";
    super(formatLongFormDiagnostic(diagnostic));
    this.name = "LongFormValidationError";
    this.code = code;
  }
}

export function analyzeLongFormDocument(document: ContentDocument): LongFormDiagnostic {
  const boundaries = document.metadata?.longFormStructure;
  const byId = new Map(document.blocks.map((block) => [block.id, block]));
  const introductionCharacters = boundaries
    ? proseForIds(boundaries.introductionBlockIds, byId)
    : proseBeforeFirstH2(document);
  const conclusionCharacters = boundaries
    ? proseForIds(boundaries.conclusionBlockIds, byId)
    : 0;
  const sections = boundaries
    ? boundaries.sections.map((section) => ({
      heading: headingForId(section.headingBlockId, byId),
      proseCharacters: proseForIds(section.paragraphBlockIds, byId),
    }))
    : inferSections(document);
  const totalProseCharacters = document.blocks
    .filter((block) => block.type === "paragraph")
    .reduce((sum, block) => sum + withoutWhitespace(block.text), 0);
  const violations: Array<LongFormDiagnostic["violations"][number]> = [];
  if (totalProseCharacters < longFormHardFloor) {
    violations.push({ code: "LONG_FORM_TOTAL_BELOW_HARD_FLOOR", minimum: longFormHardFloor, actual: totalProseCharacters });
  }
  if (sections.length < 5 || sections.length > 6) {
    violations.push({ code: "LONG_FORM_INVALID_H2_COUNT", minimum: 5, maximum: 6, actual: sections.length });
  }
  for (const section of sections.filter((item) => item.proseCharacters < longFormSectionFloor)) {
    violations.push({
      code: "LONG_FORM_SHALLOW_SECTION",
      heading: section.heading,
      minimum: longFormSectionFloor,
      actual: section.proseCharacters,
    });
  }
  return Object.freeze({
    ...(violations[0] ? { code: violations[0].code } : {}),
    totalProseCharacters,
    headingCount: sections.length,
    introductionCharacters,
    conclusionCharacters,
    sections: Object.freeze(sections.map((section) => Object.freeze(section))),
    violations: Object.freeze(violations.map((violation) => Object.freeze(violation))),
  });
}

export function requiresLongFormValidation(document: ContentDocument): boolean {
  return Boolean(document.metadata?.longFormStructure)
    || document.blocks.filter((block) => block.type === "heading" && block.level === 2).length >= 5;
}

export function assertLongFormDocument(document: ContentDocument): LongFormDiagnostic {
  const diagnostic = analyzeLongFormDocument(document);
  if (diagnostic.violations.length) throw new LongFormValidationError(diagnostic);
  return diagnostic;
}

export function assertLongFormSafetyTarget(document: ContentDocument): LongFormDiagnostic {
  const diagnostic = analyzeLongFormDocument(document);
  if (diagnostic.violations.length) throw new LongFormValidationError(diagnostic);
  if (diagnostic.totalProseCharacters < longFormSafetyTarget) {
    throw new LongFormValidationError(Object.freeze({
      ...diagnostic,
      code: "LONG_FORM_BELOW_SAFETY_TARGET",
      violations: Object.freeze([Object.freeze({
        code: "LONG_FORM_BELOW_SAFETY_TARGET" as const,
        minimum: longFormSafetyTarget,
        actual: diagnostic.totalProseCharacters,
      })]),
    }));
  }
  return diagnostic;
}

export function formatLongFormDiagnostic(diagnostic: LongFormDiagnostic): string {
  const violation = diagnostic.violations[0];
  if (!violation) return "Long-form document passed structural validation.";
  if (violation.code === "LONG_FORM_SHALLOW_SECTION") {
    return `LONG_FORM_SHALLOW_SECTION: "${violation.heading ?? "제목 없음"}" prose ${violation.actual} characters; minimum ${violation.minimum}. Total prose ${diagnostic.totalProseCharacters}; H2 ${diagnostic.headingCount}.`;
  }
  if (violation.code === "LONG_FORM_INVALID_H2_COUNT") {
    return `LONG_FORM_INVALID_H2_COUNT: H2 ${violation.actual}; expected 5 to 6. Total prose ${diagnostic.totalProseCharacters}.`;
  }
  if (violation.code === "LONG_FORM_BELOW_SAFETY_TARGET") {
    return `LONG_FORM_BELOW_SAFETY_TARGET: total prose ${violation.actual}; required generation target ${violation.minimum}. H2 ${diagnostic.headingCount}.`;
  }
  return `LONG_FORM_TOTAL_BELOW_HARD_FLOOR: total prose ${violation.actual}; minimum ${violation.minimum}. H2 ${diagnostic.headingCount}.`;
}

function inferSections(document: ContentDocument): LongFormSectionDiagnostic[] {
  const sections: Array<{ heading: string; proseCharacters: number }> = [];
  let current: { heading: string; proseCharacters: number } | undefined;
  for (const block of document.blocks) {
    if (block.type === "heading" && block.level === 2) {
      current = { heading: block.text, proseCharacters: 0 };
      sections.push(current);
    } else if (current && block.type === "paragraph") {
      current.proseCharacters += withoutWhitespace(block.text);
    }
  }
  return sections;
}

function proseBeforeFirstH2(document: ContentDocument): number {
  let total = 0;
  for (const block of document.blocks) {
    if (block.type === "heading" && block.level === 2) break;
    if (block.type === "paragraph") total += withoutWhitespace(block.text);
  }
  return total;
}

function proseForIds(ids: readonly string[], byId: Map<string, ContentDocument["blocks"][number]>): number {
  return ids.reduce((sum, id) => {
    const block = byId.get(id);
    return sum + (block?.type === "paragraph" ? withoutWhitespace(block.text) : 0);
  }, 0);
}

function headingForId(id: string, byId: Map<string, ContentDocument["blocks"][number]>): string {
  const block = byId.get(id);
  return block?.type === "heading" ? block.text : "제목 없음";
}

function withoutWhitespace(value: string): number {
  return value.replace(/\s/gu, "").length;
}
