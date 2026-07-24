import { describe, expect, it } from "vitest";

import { placeRecommendedPosts, rankRelatedPosts } from "../../../../core/content";

const document = { id: "current", title: "건강검진 혈당 관리", blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "공복혈당 관리 방법" }] };
const context = { primaryKeyword: "공복혈당", categoryId: "1038988", categoryName: "건강정보" };

function post(externalPostId: string, title: string, publishedUrl: string, categoryName: string, categoryId = "1038988") {
  return { externalPostId, title, publishedUrl, categoryId, categoryName };
}

describe("rankRelatedPosts", () => {
  it("matches the same numeric category id", () => {
    const ranked = rankRelatedPosts(document, [post("one", "건강 글", "https://blog.tistory.com/entry/one", "건강정보")], context);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["one"]);
  });

  it("rejects a different numeric category id even when the name is the same", () => {
    const ranked = rankRelatedPosts(document, [post("other", "건강 글", "https://blog.tistory.com/entry/other", "건강정보", "9999999")], context);
    expect(ranked).toEqual([]);
  });

  it("temporarily matches a legacy name-shaped category id when categoryName agrees", () => {
    const ranked = rankRelatedPosts(document, [{ ...post("legacy", "기존 캐시 글", "https://blog.tistory.com/entry/legacy", "건강정보"), categoryId: "건강정보" }], context);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["legacy"]);
  });

  it("rejects a legacy name-shaped category id when categoryName differs", () => {
    const ranked = rankRelatedPosts(document, [{ ...post("legacy", "다른 글", "https://blog.tistory.com/entry/legacy", "도움되는정보"), categoryId: "도움되는정보" }], context);
    expect(ranked).toEqual([]);
  });

  it("does not match a candidate without numeric category id when the expected id is numeric", () => {
    const ranked = rankRelatedPosts(document, [{ externalPostId: "missing", title: "건강 글", publishedUrl: "https://blog.tistory.com/entry/missing", categoryName: "건강정보" }], context);
    expect(ranked).toEqual([]);
  });

  it("sorts by views, then latest publish time, then a stable title order without relevance", () => {
    const ranked = rankRelatedPosts(document, [
      { ...post("semantic", "공복혈당 관리 체크리스트", "https://blog.tistory.com/entry/semantic", "건강정보"), viewCount: 10, publishedAt: "2026-07-20T00:00:00.000Z" },
      { ...post("popular", "숙면 습관", "https://blog.tistory.com/entry/popular", "건강정보"), viewCount: 100, publishedAt: "2026-07-01T00:00:00.000Z" },
      { ...post("latest", "운동 습관", "https://blog.tistory.com/entry/latest", "건강정보"), publishedAt: "2026-07-21T00:00:00.000Z" },
      { ...post("older", "영양 습관", "https://blog.tistory.com/entry/older", "건강정보"), publishedAt: "2026-07-10T00:00:00.000Z" },
    ], context);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["popular", "semantic", "latest", "older"]);
  });

  it("excludes current, duplicate, invalid, and different-category URLs", () => {
    const used = { ...document, blocks: [...document.blocks, { id: "link", type: "button" as const, purpose: "internal_link" as const, label: "used", targetUrl: "https://blog.tistory.com/entry/used" }] };
    const ranked = rankRelatedPosts(used, [
      post("used", "used", "https://blog.tistory.com/entry/used", "건강정보"),
      post("admin", "admin", "https://blog.tistory.com/manage/posts", "건강정보"),
      post("fresh-a", "새 글", "https://blog.tistory.com/entry/fresh", "건강정보"),
      post("fresh-b", "중복 새 글", "https://blog.tistory.com/entry/fresh#section", "건강정보"),
      post("travel", "여행 글", "https://blog.tistory.com/entry/travel", "도움되는정보", "1057542"),
    ], context);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["fresh-a"]);
  });

  it("does not fall back to the whole catalog when category is unavailable", () => {
    expect(rankRelatedPosts(document, [post("health", "건강 글", "https://blog.tistory.com/entry/health", "건강정보")])).toEqual([]);
  });
});

describe("placeRecommendedPosts", () => {
  it("places one contextual internal link and at most three related posts without URL reuse", () => {
    const candidates = Array.from({ length: 86 }, (_, index) => post(String(index), `관련 글 ${index}`, `https://blog.tistory.com/entry/${index}`, "건강정보"));
    const placed = placeRecommendedPosts(document, candidates);
    const links = placed.blocks.filter((block) => block.type === "button");
    expect(links.filter((block) => block.type === "button" && block.purpose === "internal_link")).toHaveLength(1);
    expect(links.filter((block) => block.type === "button" && block.purpose === "related_post")).toHaveLength(3);
    expect(new Set(links.map((block) => block.type === "button" ? block.targetUrl : "")).size).toBe(4);
  });

  it("moves existing related posts after the final content block while preserving contextual internal links", () => {
    const existing = {
      ...document,
      blocks: [
        { id: "intro", type: "paragraph" as const, text: "도입 문단" },
        { id: "context", type: "button" as const, purpose: "internal_link" as const, label: "본문 링크", targetUrl: "https://blog.tistory.com/entry/context" },
        { id: "related-one", type: "button" as const, purpose: "related_post" as const, label: "기존 관련 글", targetUrl: "https://blog.tistory.com/entry/related-one" },
        { id: "last-heading", type: "heading" as const, level: 2 as const, text: "마지막 판단 기준" },
        { id: "conclusion", type: "paragraph" as const, text: "마지막 결론 문단" },
      ],
    };
    const placed = placeRecommendedPosts(existing, [post("related-two", "새 관련 글", "https://blog.tistory.com/entry/related-two", "건강정보")]);
    expect(placed.blocks.map((block) => block.id)).toEqual(["intro", "context", "last-heading", "conclusion", "related-one", "auto-related-post"]);
    const previous = placed.blocks.at(-2);
    const last = placed.blocks.at(-1);
    expect(previous?.type === "button" && previous.purpose).toBe("related_post");
    expect(last?.type === "button" && last.purpose).toBe("related_post");
  });

  it("uses only the available candidates when fewer than four exist", () => {
    const candidates = [
      post("one", "도움 글 1", "https://blog.tistory.com/entry/one", "건강정보"),
      post("two", "도움 글 2", "https://blog.tistory.com/entry/two", "건강정보"),
    ];
    const placed = placeRecommendedPosts(document, candidates);
    const links = placed.blocks.filter((block) => block.type === "button" && block.sourceExternalPostId);
    expect(links.map((block) => block.type === "button" ? block.sourceExternalPostId : undefined)).toEqual(["one", "two"]);
    expect(new Set(links.map((block) => block.type === "button" ? block.targetUrl : "")).size).toBe(2);
  });

  it("uses the single available candidate without inventing more", () => {
    const placed = placeRecommendedPosts(document, [post("one", "도움 글 1", "https://blog.tistory.com/entry/one", "건강정보")]);
    const links = placed.blocks.filter((block) => block.type === "button" && block.sourceExternalPostId);
    expect(links.map((block) => block.type === "button" ? block.sourceExternalPostId : undefined)).toEqual(["one"]);
  });

  it("does not invent links when no candidates remain", () => {
    expect(placeRecommendedPosts(document, []).blocks).toEqual(document.blocks);
  });
});
