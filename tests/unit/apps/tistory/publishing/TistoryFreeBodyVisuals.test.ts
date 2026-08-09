import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../../core/content";
import { TistoryHtmlRenderer } from "../../../../../apps/tistory/publishing/TistoryHtmlRenderer";

describe("Tistory free body visuals", () => {
  it("does not synthesize public cards by copying canonical prose", () => {
    const prose = "운동 강도는 몸의 반응을 확인하며 조절해야 합니다. 숨이 너무 차면 속도를 낮추고 자세가 무너지면 즉시 쉬어야 합니다. 다음 운동에서는 기록을 참고해 강도를 다시 선택합니다.";
    const document: ContentDocument = {
      id: "visual-draft",
      title: "운동 강도",
      blocks: [
        { id: "intro", type: "paragraph", text: prose },
        ...["운동 목표", "강도 조절", "심박수 활용", "중단해야 하는 신호"].flatMap((heading, index) => [
          { id: `h-${index}`, type: "heading" as const, level: 2 as const, text: heading },
          { id: `p-${index}`, type: "paragraph" as const, text: prose },
        ]),
      ],
    };

    const html = new TistoryHtmlRenderer().render(document);

    expect(html).not.toContain('data-free-visual="true"');
    expect(html).toContain("중단해야 하는 신호");
    expect(html).not.toContain('class="bright-image-placeholder"');
  });

  it("omits a source-empty planned image from public HTML", () => {
    const document: ContentDocument = {
      id: "generic-image",
      title: "일반 이미지",
      blocks: [{ id: "image", type: "image", source: "", alt: "업로드가 필요한 이미지" }],
    };

    const html = new TistoryHtmlRenderer().render(document);

    expect(html).toBe("");
    expect(html).not.toContain('data-free-visual="true"');
  });
});
