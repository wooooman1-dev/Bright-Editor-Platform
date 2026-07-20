import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ContentDocumentEditor } from "../../../../app/user-flow/ContentDocumentEditor";
import { createContentOutline, type ContentDocument } from "../../../../core/content";

const document: ContentDocument = {
  id: "content-outline",
  title: "집 근력운동 초보 가이드",
  blocks: [
    { id: "intro", type: "paragraph", text: "초보자가 바로 시작할 수 있는 안내입니다." },
    { id: "h2-1", type: "heading", level: 2, text: "준비와 안전" },
    { id: "p-1", type: "paragraph", text: "공간과 도구를 확인합니다." },
    { id: "h3-1", type: "heading", level: 3, text: "운동 전 확인" },
    { id: "empty", type: "heading", level: 2, text: "   " },
  ],
};

describe("ContentDocumentEditor derived table of contents", () => {
  it("uses the same H2/H3 outline as publishing without storing a TOC block", () => {
    expect(createContentOutline(document)).toEqual([
      { id: "h2-1", level: 2, text: "준비와 안전" },
      { id: "h3-1", level: 3, text: "운동 전 확인" },
    ]);
    const html = renderToStaticMarkup(<ContentDocumentEditor candidates={[]} disabled={false} document={document} onChange={vi.fn()} />);
    const tocStart = html.indexOf('aria-label="원고 자동 목차"');
    const tocEnd = html.indexOf("</nav>", tocStart);
    const toc = html.slice(tocStart, tocEnd);
    expect(tocStart).toBeGreaterThan(0);
    expect(toc).toContain("목차");
    expect(toc).toContain("H2/H3에서 자동 생성 · 미리보기와 동일");
    expect(toc).toContain("준비와 안전");
    expect(toc).toContain("운동 전 확인");
    expect(document.blocks.some((block) => (block as { type: string }).type === "toc")).toBe(false);
  });
});
