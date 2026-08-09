import { describe, expect, it } from "vitest";

import { TistoryHtmlRenderer } from "../../../apps/tistory/publishing/TistoryHtmlRenderer";
import { WordPressHtmlRenderer } from "../../../apps/wordpress/WordPressHtmlRenderer";
import type { ContentDocument } from "../../../core/content";

const document: ContentDocument = {
  id: "content-1",
  title: "신용점수 관리 방법",
  blocks: [{
    id: "paragraph-1",
    type: "paragraph",
    text: "세부 기준은 [금융위원회 공식 안내](https://fsc.go.kr/example)에서 확인할 수 있습니다.",
  }],
};

describe("platform renderer editorial markup normalization", () => {
  it("does not expose Markdown link syntax in WordPress HTML", () => {
    const html = new WordPressHtmlRenderer().render(document);
    expect(html).toContain("금융위원회 공식 안내");
    expect(html).not.toContain("[금융위원회 공식 안내]");
    expect(html).not.toContain("https://fsc.go.kr/example");
  });

  it("does not expose Markdown link syntax in Tistory HTML", () => {
    const html = new TistoryHtmlRenderer().render(document);
    expect(html).toContain("금융위원회 공식 안내");
    expect(html).not.toContain("[금융위원회 공식 안내]");
    expect(html).not.toContain("https://fsc.go.kr/example");
  });
});
