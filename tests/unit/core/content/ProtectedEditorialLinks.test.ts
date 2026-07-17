import { describe, expect, it } from "vitest";

import { restoreVerifiedEditorialLinks, type ContentDocument } from "../../../../core/content";

const base: ContentDocument = {
  id: "content",
  title: "기존 원고",
  blocks: [
    { id: "intro", type: "paragraph", text: "도입 문단입니다. 두 번째 문장으로 설명을 이어갑니다." },
    { id: "heading", type: "heading", level: 2, text: "핵심 설명" },
    { id: "body", type: "paragraph", text: "본문 설명입니다. 독자가 이해할 수 있도록 내용을 구체적으로 이어갑니다." },
    { id: "internal", type: "button", purpose: "internal_link", label: "검증된 본문 링크", targetUrl: "https://bright-health.tistory.com/entry/contextual", target: "_self", sourceExternalPostId: "contextual" },
    { id: "conclusion", type: "paragraph", text: "결론 문단입니다. 핵심 내용을 정리하고 다음 행동을 안내합니다." },
    ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `검증된 관련 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}`, target: "_self" as const, sourceExternalPostId: `related-${index + 1}` })),
  ],
};

describe("restoreVerifiedEditorialLinks", () => {
  it("removes AI-created empty placeholders and restores exact verified links", () => {
    const candidate: ContentDocument = {
      id: "content",
      title: "개선 원고",
      blocks: [
        { id: "intro", type: "paragraph", text: "개선된 도입 문단입니다. 문장을 자연스럽게 연결합니다." },
        { id: "heading", type: "heading", level: 2, text: "핵심 설명" },
        { id: "body", type: "paragraph", text: "개선된 본문 설명입니다. 더 쉽게 읽을 수 있도록 정리했습니다." },
        { id: "ai-placeholder", type: "button", purpose: "internal_link", label: "AI가 추천한 빈 링크", targetUrl: "", target: "_self" },
        { id: "conclusion", type: "paragraph", text: "개선된 결론입니다. 핵심 내용을 다시 정리합니다." },
      ],
    };

    const restored = restoreVerifiedEditorialLinks(base, candidate);
    const mandatory = restored.blocks.filter((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post"));

    expect(mandatory).toEqual(base.blocks.filter((block) => block.type === "button"));
    expect(restored.blocks.findIndex((block) => block.id === "internal")).toBe(restored.blocks.findIndex((block) => block.id === "body") + 1);
    expect(restored.blocks.slice(-3).map((block) => block.id)).toEqual(["related-0", "related-1", "related-2"]);
    expect(restored.blocks.some((block) => block.id === "ai-placeholder")).toBe(false);
  });

  it("does not preserve invalid or management links from the original document", () => {
    const invalidBase: ContentDocument = { ...base, blocks: [
      ...base.blocks.filter((block) => block.type !== "button"),
      { id: "empty", type: "button", purpose: "internal_link", label: "빈 링크", targetUrl: "", target: "_self" },
      { id: "manage", type: "button", purpose: "related_post", label: "관리 링크", targetUrl: "https://bright-health.tistory.com/manage/posts", target: "_self" },
    ] };
    const restored = restoreVerifiedEditorialLinks(invalidBase, { ...invalidBase, blocks: invalidBase.blocks });
    expect(restored.blocks.some((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post"))).toBe(false);
  });
});
