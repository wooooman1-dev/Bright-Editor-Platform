import { describe, expect, it } from "vitest";

import { placeRecommendedPosts, rankRelatedPosts } from "../../../../core/content";

const document = { id: "current", title: "건강검진 혈당 관리", blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "공복혈당 관리 방법" }] };
const context = { primaryKeyword: "공복혈당", categoryName: "건강정보" };

function post(externalPostId: string, title: string, publishedUrl: string, categoryName: string) {
  return { externalPostId, title, publishedUrl, categoryName };
}

describe("rankRelatedPosts", () => {
  it("ranks semantic relevance first inside the same category", () => {
    const ranked = rankRelatedPosts(document, [
      { externalPostId: "other", title: "건강한 수면 습관", publishedUrl: "https://blog.tistory.com/entry/other", categoryName: "건강정보" },
      { externalPostId: "sugar", title: "공복혈당 관리 체크리스트", publishedUrl: "https://blog.tistory.com/entry/sugar", categoryName: "건강정보" },
    ], context);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["sugar", "other"]);
  });

  it("keeps low-relevance posts as fallback only inside the same category", () => {
    const ranked = rankRelatedPosts(document, [
      { externalPostId: "travel", title: "2026 최신 항공권 예약 방법 정리", publishedUrl: "https://blog.tistory.com/entry/travel", categoryName: "도움되는정보" },
      { externalPostId: "sleep", title: "숙면을 위한 저녁 습관", publishedUrl: "https://blog.tistory.com/entry/sleep", categoryName: "건강정보", viewCount: 1200 },
      { externalPostId: "health", title: "건강검진 공복혈당 점검 체크리스트", publishedUrl: "https://blog.tistory.com/entry/health", categoryName: "건강정보" },
    ], context);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["health", "sleep"]);
  });

  it("does not fall back to the whole catalog when category is unavailable", () => {
    const ranked = rankRelatedPosts(document, [
      { externalPostId: "health", title: "건강 글", publishedUrl: "https://blog.tistory.com/entry/health", categoryName: "건강정보" },
    ]);
    expect(ranked).toEqual([]);
  });

  it("excludes used, duplicate, non-public, and different-category URLs", () => {
    const used = { ...document, blocks: [...document.blocks, { id: "link", type: "button" as const, purpose: "internal_link" as const, label: "used", targetUrl: "https://blog.tistory.com/entry/used" }] };
    const ranked = rankRelatedPosts(used, [
      { externalPostId: "used", title: "used", publishedUrl: "https://blog.tistory.com/entry/used", categoryName: "건강정보" },
      { externalPostId: "admin", title: "admin", publishedUrl: "https://blog.tistory.com/manage/posts", categoryName: "건강정보" },
      { externalPostId: "fresh-a", title: "새 글", publishedUrl: "https://blog.tistory.com/entry/fresh", categoryName: "건강정보" },
      { externalPostId: "fresh-b", title: "중복 새 글", publishedUrl: "https://blog.tistory.com/entry/fresh#section", categoryName: "건강정보" },
      { externalPostId: "travel", title: "여행 글", publishedUrl: "https://blog.tistory.com/entry/travel", categoryName: "도움되는정보" },
    ], context);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["fresh-a"]);
  });
  it("matches the same category after normalizing whitespace and category paths", () => {
    const ranked = rankRelatedPosts(document, [
      post("1", "혈압 기록", "https://bright-health.tistory.com/entry/one", " 건강 정보 > 혈압 관리 "),
      post("2", "운동", "https://bright-health.tistory.com/entry/two", "건강운동"),
    ], { categoryName: "혈압관리" });
    expect(ranked.map((item) => item.externalPostId)).toEqual(["1"]);
  });

  it("prefers category id when both sides provide one", () => {
    const ranked = rankRelatedPosts(document, [
      { ...post("1", "혈압", "https://bright-health.tistory.com/entry/one", "다른 표기"), categoryId: "10" },
      { ...post("2", "혈압", "https://bright-health.tistory.com/entry/two", "혈압관리"), categoryId: "20" },
    ], { categoryId: "10", categoryName: "혈압관리" });
    expect(ranked.map((item) => item.externalPostId)).toEqual(["1"]);
  });

});

describe("placeRecommendedPosts", () => {
  it("places one contextual internal link and at most three related posts without URL reuse", () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ externalPostId: String(index), title: `공복혈당 관련 글 ${index}`, publishedUrl: `https://blog.tistory.com/entry/${index}`, categoryName: "건강정보" }));
    const placed = placeRecommendedPosts(document, candidates);
    const links = placed.blocks.filter((block) => block.type === "button");
    expect(links.filter((block) => block.type === "button" && block.purpose === "internal_link")).toHaveLength(1);
    expect(links.filter((block) => block.type === "button" && block.purpose === "related_post")).toHaveLength(3);
    expect(new Set(links.map((block) => block.type === "button" ? block.targetUrl : "")).size).toBe(4);
  });

  it("uses only the available candidates when fewer than four exist", () => {
    const candidates = [
      { externalPostId: "one", title: "도움 글 1", publishedUrl: "https://blog.tistory.com/entry/one", categoryName: "건강정보" },
      { externalPostId: "two", title: "도움 글 2", publishedUrl: "https://blog.tistory.com/entry/two", categoryName: "건강정보" },
    ];
    const placed = placeRecommendedPosts(document, candidates);
    const links = placed.blocks.filter((block) => block.type === "button" && block.sourceExternalPostId);
    expect(links.map((block) => block.type === "button" ? block.sourceExternalPostId : undefined)).toEqual(["one", "two"]);
    expect(new Set(links.map((block) => block.type === "button" ? block.targetUrl : "")).size).toBe(2);
  });

  it("does not invent links when no candidates remain", () => {
    expect(placeRecommendedPosts(document, []).blocks).toEqual(document.blocks);
  });
});
