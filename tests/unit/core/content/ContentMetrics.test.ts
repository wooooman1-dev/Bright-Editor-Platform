import { describe, expect, it } from "vitest";

import { calculateContentMetrics, type ContentDocument } from "../../../../core/content";

function document(blocks: ContentDocument["blocks"]): ContentDocument { return { id: "content", title: "제목", blocks }; }

describe("canonical ContentDocument metrics", () => {
  it("counts Korean text, spaces, paragraphs, and headings", () => {
    const metrics = calculateContentMetrics(document([{ id: "h", type: "heading", level: 2, text: "건강 관리" }, { id: "p1", type: "paragraph", text: "오늘은 건강을 관리합니다." }, { id: "p2", type: "paragraph", text: "매일 기록합니다." }]));
    expect(metrics.koreanCharacterCount).toBeGreaterThan(10);
    expect(metrics.charactersWithSpaces).toBeGreaterThan(metrics.charactersWithoutSpaces);
    expect(metrics.paragraphCount).toBe(2);
    expect(metrics.headingCount).toBe(1);
    expect(metrics.estimatedReadingMinutes).toBe(1);
  });

  it("counts mixed Korean, English, numbers as word-like units", () => {
    const metrics = calculateContentMetrics(document([{ id: "p", type: "paragraph", text: "Bright Studio는 2026 content workflow를 지원합니다." }]));
    expect(metrics.wordUnits).toBe(8);
  });

  it("excludes HTML markup from all character metrics", () => {
    const plain = calculateContentMetrics(document([{ id: "p", type: "paragraph", text: "안녕 world" }]));
    const markup = calculateContentMetrics(document([{ id: "p", type: "paragraph", text: "<p>안녕</p> <strong>world</strong>" }]));
    expect(markup.charactersWithoutSpaces).toBe(plain.charactersWithoutSpaces);
    expect(markup.wordUnits).toBe(plain.wordUnits);
  });

  it("uses 500 Korean syllables or 200 Latin words per reading minute", () => {
    expect(calculateContentMetrics(document([{ id: "p", type: "paragraph", text: "가".repeat(501) }])).estimatedReadingMinutes).toBe(2);
    expect(calculateContentMetrics(document([{ id: "p", type: "paragraph", text: Array.from({ length: 201 }, () => "word").join(" ") }])).estimatedReadingMinutes).toBe(2);
  });
});
