import { describe, expect, it } from "vitest";

import { evaluateHtmlIntegrity } from "../../../../core/quality";
import type { ContentDocument } from "../../../../core/content";

const document: ContentDocument = {
  id: "content",
  title: "검증",
  blocks: [{ id: "table", type: "table", headers: ["항목", "설명"], rows: [["A", "B"]] }],
};

describe("HTML Integrity", () => {
  it("passes semantic responsive HTML independently from Standard Quality", () => {
    const html = '<figure style="overflow-x:auto"><table><thead><tr><th>항목</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table></figure>';
    expect(evaluateHtmlIntegrity(document, html)).toEqual({ passed: true, issues: [] });
  });

  it("reports public placeholders, fake lists, unsafe links, and missing table contracts", () => {
    const html = '<p>공식 확인 자료<br>- 금융위원회 (fsc.go.kr)<br>- 법령 (law.go.kr)</p><a href=""></a><!-- image: planned --><table><tr><td>A</td></tr></table>';
    const codes = evaluateHtmlIntegrity(document, html).issues.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining([
      "raw_source_placeholder",
      "source_section_without_links",
      "paragraph_break_list",
      "image_comment_placeholder",
      "empty_href",
      "table_semantics_missing",
      "mobile_table_wrapper_missing",
    ]));
  });

  it("reports a duplicated system card and internal-only public attributes", () => {
    const prose = "상품설명서에서 예금보험관계 성립 여부와 보호 한도를 확인합니다.";
    const html = `<p>${prose} ${prose}</p><aside class="bright-body-visual" data-free-visual="true"><ul><li>${prose}</li><li>${prose}</li></ul></aside>`;
    const codes = evaluateHtmlIntegrity({ ...document, blocks: [] }, html).issues.map((item) => item.code);
    expect(codes).toContain("system_card_body_duplicate");
    expect(codes).toContain("internal_system_placeholder");
  });
});
