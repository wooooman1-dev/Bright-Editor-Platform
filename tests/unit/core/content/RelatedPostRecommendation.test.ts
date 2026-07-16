import { describe, expect, it } from "vitest";

import { placeRecommendedPosts, rankRelatedPosts } from "../../../../core/content";

describe("rankRelatedPosts", () => {
  const document = { id: "current", title: "건강검진 혈당 관리", blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "공복혈당 관리 방법" }] };
  it("ranks title relevance and same category ahead of recency", () => {
    const ranked = rankRelatedPosts(document, [
      { externalPostId: "other", title: "최신 운동 소식", publishedUrl: "https://blog.tistory.com/entry/other", categoryName: "운동" },
      { externalPostId: "sugar", title: "공복혈당 관리 체크리스트", publishedUrl: "https://blog.tistory.com/entry/sugar", categoryName: "건강" },
    ], { primaryKeyword: "공복혈당", categoryName: "건강" });
    expect(ranked[0].externalPostId).toBe("sugar");
  });
  it("excludes already used, duplicate-risk, non-public URLs", () => {
    const used = { ...document, blocks: [...document.blocks, { id: "link", type: "button" as const, purpose: "internal_link" as const, label: "used", targetUrl: "https://blog.tistory.com/entry/used" }] };
    const ranked = rankRelatedPosts(used, [
      { externalPostId: "used", title: "used", publishedUrl: "https://blog.tistory.com/entry/used" },
      { externalPostId: "admin", title: "admin", publishedUrl: "https://blog.tistory.com/manage/posts" },
      { externalPostId: "draft", title: "draft", publishedUrl: "" },
    ]);
    expect(ranked).toEqual([]);
  });
  it("automatically places one contextual internal link and at most three final related posts", () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ externalPostId: String(index), title: `공복혈당 관련 글 ${index}`, publishedUrl: `https://blog.tistory.com/entry/${index}` }));
    const placed = placeRecommendedPosts(document, candidates);
    const links = placed.blocks.filter((block) => block.type === "button");
    expect(links.filter((block) => block.type === "button" && block.purpose === "internal_link")).toHaveLength(1);
    expect(links.filter((block) => block.type === "button" && block.purpose === "related_post")).toHaveLength(3);
    expect(links.every((block) => block.type === "button" && block.target === "_self")).toBe(true);
    expect(links.map((block) => block.type === "button" ? block.sourceExternalPostId : undefined)).toEqual(["0", "1", "2", "3"]);
  });
});
