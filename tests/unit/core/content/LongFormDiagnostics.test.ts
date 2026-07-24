import { describe, expect, it } from "vitest";

import {
  analyzeLongFormDocument,
  assertLongFormDocument,
  assertLongFormSafetyTarget,
  LongFormValidationError,
  type ContentDocument,
} from "../../../../core/content";

describe("LongFormDiagnostics", () => {
  it("keeps introduction and conclusion outside section prose", () => {
    const document = structuredDocument(4_800, 5);
    const diagnostic = analyzeLongFormDocument(document);
    expect(diagnostic).toMatchObject({
      totalProseCharacters: 4_800,
      headingCount: 5,
      introductionCharacters: 400,
      conclusionCharacters: 400,
    });
    expect(diagnostic.sections.every((section) => section.proseCharacters === 800)).toBe(true);
    expect(diagnostic.violations).toEqual([]);
  });

  it("returns the heading and measured value for a 449-character section", () => {
    const document = structuredDocument(5_500, 5, 2);
    const diagnostic = analyzeLongFormDocument(document);
    expect(diagnostic.violations).toContainEqual({
      code: "LONG_FORM_SHALLOW_SECTION",
      heading: "섹션 3",
      minimum: 450,
      actual: 449,
    });
    expect(() => assertLongFormDocument(document)).toThrow(LongFormValidationError);
  });

  it("separates the 4,800 hard floor from the 5,500 generation target", () => {
    expect(() => assertLongFormDocument(structuredDocument(4_799, 5))).toThrow("LONG_FORM_TOTAL_BELOW_HARD_FLOOR");
    expect(assertLongFormDocument(structuredDocument(4_800, 5)).totalProseCharacters).toBe(4_800);
    expect(() => assertLongFormSafetyTarget(structuredDocument(5_499, 6))).toThrow("LONG_FORM_BELOW_SAFETY_TARGET");
    expect(assertLongFormSafetyTarget(structuredDocument(5_500, 6)).totalProseCharacters).toBe(5_500);
  });
});

function structuredDocument(total: number, sectionCount: number, shallowIndex?: number): ContentDocument {
  const introduction = 400;
  const conclusion = 400;
  const sectionLengths = Array.from({ length: sectionCount }, () => Math.floor((total - introduction - conclusion) / sectionCount));
  sectionLengths[sectionCount - 1] += total - introduction - conclusion - sectionLengths.reduce((sum, value) => sum + value, 0);
  if (typeof shallowIndex === "number") {
    const moved = sectionLengths[shallowIndex] - 449;
    sectionLengths[shallowIndex] = 449;
    sectionLengths[(shallowIndex + 1) % sectionCount] += moved;
  }
  const blocks: ContentDocument["blocks"][number][] = [{ id: "intro", type: "paragraph", text: "가".repeat(introduction) }];
  const sections = sectionLengths.map((length, index) => {
    const headingBlockId = `h-${index}`;
    const paragraphBlockIds = [`p-${index}`];
    blocks.push({ id: headingBlockId, type: "heading", level: 2, text: `섹션 ${index + 1}` });
    blocks.push({ id: paragraphBlockIds[0], type: "paragraph", text: "나".repeat(length) });
    return { headingBlockId, paragraphBlockIds };
  });
  blocks.push({ id: "conclusion", type: "paragraph", text: "다".repeat(conclusion) });
  return {
    id: "document",
    title: "진단 문서",
    blocks,
    metadata: {
      buttonCount: 0,
      createdAt: "now",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "now",
      version: 1,
      videoCount: 0,
      wordCount: 1,
      longFormStructure: {
        introductionBlockIds: ["intro"],
        sections,
        conclusionBlockIds: ["conclusion"],
      },
    },
  };
}
