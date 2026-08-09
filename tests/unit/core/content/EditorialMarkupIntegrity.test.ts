import { describe, expect, it } from "vitest";

import {
  analyzeEditorialMarkupIntegrity,
  ContentNormalizer,
  EditorialMarkupIntegrityError,
  normalizeEditorialMarkupText,
  type ContentDocument,
} from "../../../../core/content";

describe("EditorialMarkupIntegrity", () => {
  it("converts a complete Markdown link to reader-visible plain text without another AI call", () => {
    expect(normalizeEditorialMarkupText(
      "자세한 기준은 [금융위원회 공식 안내](https://fsc.go.kr/example)에서 확인할 수 있습니다.",
    )).toBe("자세한 기준은 금융위원회 공식 안내에서 확인할 수 있습니다.");
  });

  it("normalizes links before Markdown tables are converted to canonical table blocks", () => {
    const document: ContentDocument = {
      id: "content-1",
      title: "신용점수 관리 방법",
      blocks: [{
        id: "paragraph-1",
        type: "paragraph",
        text: "- 먼저 거래 내역을 확인합니다.\n\n| 기준 | 확인 위치 |\n|---|---|\n| 연체 | [공식 안내](https://fsc.go.kr/example) |",
      }],
    };

    const normalized = new ContentNormalizer().normalize(document);
    expect(normalized.blocks[0]).toMatchObject({
      type: "paragraph",
      text: "- 먼저 거래 내역을 확인합니다.",
    });
    expect(normalized.blocks[1]).toMatchObject({
      type: "table",
      headers: ["기준", "확인 위치"],
      rows: [["연체", "공식 안내"]],
    });
  });

  it("allows a complete supported HTML table to reach canonical table normalization", () => {
    const table = "<table><caption>선택 기준</caption><tr><th>조건</th><th>해석</th></tr><tr><td>A &amp; B</td><td>&lt;주의&gt;</td></tr></table>";
    expect(normalizeEditorialMarkupText(table)).toBe(table);

    const normalized = new ContentNormalizer().normalize({
      id: "content-html-table",
      title: "HTML 표",
      blocks: [{ id: "html-table", type: "paragraph", text: table }],
    });
    expect(normalized.blocks).toEqual([{
      id: "html-table",
      type: "table",
      caption: "선택 기준",
      headers: ["조건", "해석"],
      rows: [["A & B", "<주의>"]],
    }]);
  });

  it("rejects malformed or unsupported reader-visible markup instead of guessing", () => {
    expect(() => normalizeEditorialMarkupText("[금융위원회](https://fsc.go.kr/example")).toThrow(EditorialMarkupIntegrityError);
    expect(() => normalizeEditorialMarkupText("![설명](https://example.com/image.png)")).toThrow(EditorialMarkupIntegrityError);
    expect(() => normalizeEditorialMarkupText("<a href=\"https://example.com\">링크</a>")).toThrow(EditorialMarkupIntegrityError);
    expect(() => normalizeEditorialMarkupText("<table><tr><td>닫히지 않은 표</td></tr>")).toThrow(EditorialMarkupIntegrityError);
    expect(() => normalizeEditorialMarkupText("```html\n<p>본문</p>\n```")).toThrow(EditorialMarkupIntegrityError);
  });

  it("reports the exact canonical locations that still contain unsupported markup", () => {
    const document: ContentDocument = {
      id: "content-1",
      title: "신용점수 관리 방법",
      blocks: [
        { id: "p1", type: "paragraph", text: "[금융위원회](https://fsc.go.kr/example)" },
        { id: "p2", type: "paragraph", text: "일반적인 [대괄호]와 (괄호)는 허용됩니다." },
      ],
    };

    expect(analyzeEditorialMarkupIntegrity(document)).toEqual([
      { code: "markdown_link", location: "blocks[0].text" },
    ]);
  });
});
