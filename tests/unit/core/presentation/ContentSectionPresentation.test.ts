import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentSectionType } from "../../../../core/content";
import { resolveContentSectionPresentations, resolveTablePresentation } from "../../../../core/presentation";

describe("Content section presentation policy", () => {
  it("derives restrained cards only from useful existing section semantics", () => {
    const document = fixture([
      section("explanation", [{ id: "explanation-copy", type: "paragraph", text: "Plain explanation." }]),
      section("checklist", [{ id: "checklist-items", type: "list", style: "unordered", items: ["Check one", "Check two"] }]),
      section("warning", [{ id: "warning-copy", type: "paragraph", text: "Confirm this condition first." }]),
      section("summary", [{ id: "summary-copy", type: "paragraph", text: "The main decision in one sentence." }]),
      section("comparison", [{ id: "comparison-table", type: "table", headers: ["Option", "Difference"], rows: [["A", "First"]] }]),
    ]);

    const presentations = resolveContentSectionPresentations(document);

    expect(presentations.map((value) => [value.sectionType, value.treatment])).toEqual([
      ["explanation", "standard"],
      ["checklist", "card"],
      ["warning", "card"],
      ["summary", "card"],
      ["comparison", "standard"],
    ]);
    expect(presentations[1]).toMatchObject({ componentId: "bright.checklist", badgeLabel: "체크리스트", semanticRole: "checklist" });
    expect(presentations[2]).toMatchObject({ componentId: "bright.warning", badgeLabel: "주의·확인", semanticRole: "warning" });
    expect(presentations[3]).toMatchObject({ componentId: "bright.summary-card", badgeLabel: "핵심 요약", semanticRole: "summary" });
  });

  it("does not create a decorative card for plain content, a prose-only checklist, or a table section", () => {
    const legacy: ContentDocument = { id: "legacy", title: "Legacy", blocks: [{ id: "plain", type: "paragraph", text: "Enough as prose." }] };
    expect(resolveContentSectionPresentations(legacy)).toEqual([]);

    const document = fixture([
      section("checklist", [{ id: "not-a-list", type: "paragraph", text: "This was labelled as a checklist but is only prose." }]),
      section("warning", [{ id: "warning-table", type: "table", headers: ["Label", "Meaning"], rows: [["A", "B"]] }]),
    ]);
    expect(resolveContentSectionPresentations(document).every((value) => value.treatment === "standard")).toBe(true);
  });

  it("distinguishes a compact label column from a prose column", () => {
    expect(resolveTablePresentation({
      id: "labels", type: "table", headers: ["확인 기준", "설명"], rows: [["결제 방식", "Details"]],
    })).toMatchObject({ firstColumnRole: "label", firstColumnMinimumWidth: expect.any(Number) });
    expect(resolveTablePresentation({
      id: "prose", type: "table", headers: ["Long explanation", "Meaning"], rows: [["This first column contains a complete explanatory sentence", "Details"]],
    })).toEqual({ firstColumnRole: "content" });
  });
});

type SectionFixture = Readonly<{
  sectionType: ContentSectionType;
  headingId: string;
  blocks: ContentDocument["blocks"];
}>;

function section(sectionType: ContentSectionType, blocks: ContentDocument["blocks"]): SectionFixture {
  return { sectionType, headingId: `${sectionType}-heading`, blocks };
}

function fixture(sections: readonly SectionFixture[]): ContentDocument {
  const blocks = sections.flatMap((value) => [
    { id: value.headingId, type: "heading" as const, level: 2 as const, text: `${value.sectionType} heading` },
    ...value.blocks,
  ]);
  return {
    id: "presentation-fixture",
    title: "Presentation fixture",
    blocks,
    metadata: {
      buttonCount: 0,
      createdAt: "2026-08-09",
      generator: "fixture",
      imageCount: 0,
      language: "en",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-08-09",
      version: 1,
      videoCount: 0,
      wordCount: 20,
      longFormStructure: {
        introductionBlockIds: [],
        sections: sections.map((value) => ({
          headingBlockId: value.headingId,
          paragraphBlockIds: value.blocks.map((block) => block.id),
          sectionType: value.sectionType,
        })),
        conclusionBlockIds: [],
      },
    },
  };
}
