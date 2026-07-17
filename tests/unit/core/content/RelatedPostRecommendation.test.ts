import { describe, expect, it } from "vitest";

import { placeRecommendedPosts, rankRelatedPosts } from "../../../../core/content";

const document = { id: "current", title: "건강검진 혈당 관리", blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "공복혈당 관리 방법" }] };

describe("rankRelatedPosts", () => {
  it("ranks title relevance and same category ahead of fallback candidates", () => {
    const ranked = rankRelatedPosts(document, [
      { externalPostId: "other", title: "최신 운동 소식", publishedUrl: "https://blog.tistory.com/entry/other", categoryName: "운동" },
      { externalPostId: "sugar", title: "공복혈당 관리 체크리스트", publishedUrl: "https://blog.tistory.com/entry/sugar", categoryName: "건강" },
    ], { primaryKeyword: "공복혈당", categoryName: "건강" });
    expect(ranked.map((item) => item.externalPostId)).toEqual(["sugar", "other"]);
  });

  it("excludes already used, duplicate, and non-public URLs", () => {
    const used = { ...document, blocks: [...document.blocks, { id: "link", type: "button" as const, purpose: "internal_link" as const, label: "used", targetUrl: "https://blog.tistory.com/entry/used" }] };
    const ranked = rankRelatedPosts(used, [
      { externalPostId: "used", title: "used", publishedUrl: "https://blog.tistory.com/entry/used" },
      { externalPostId: "admin", title: "admin", publishedUrl: "https://blog.tistory.com/manage/posts" },
      { externalPostId: "draft", title: "draft", publishedUrl: "" },
      { externalPostId: "fresh-a", title: "새 글", publishedUrl: "https://blog.tistory.com/entry/fresh" },
      { externalPostId: "fresh-b", title: "중복 새 글", publishedUrl: "https://blog.tistory.com/entry/fresh#section" },
    ]);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["fresh-a"]);
  });

  it("keeps low-score public posts as helpful fallback candidates", () => {
    const ranked = rankRelatedPosts(document, [
      { externalPostId: "travel", title: "2026 최신 항공권 예약 방법 정리", publishedUrl: "https://blog.tistory.com/entry/travel" },
      { externalPostId: "health", title: "건강검진 공복혈당 점검 체크리스트", publishedUrl: "https://blog.tistory.com/entry/health" },
    ]);
    expect(ranked.map((item) => item.externalPostId)).toEqual(["health", "travel"]);
  });
});

describe("placeRecommendedPosts", () => {
  it("automatically places one contextual internal link and three final related posts", () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ externalPostId: String(index), title: `공복혈당 관련 글 ${index}`, publishedUrl: `https://blog.tistory.com/entry/${index}` }));
    const placed = placeRecommendedPosts(document, candidates);
    const links = placed.blocks.filter((block) => block.type === "button");
    expect(links.filter((block) => block.type === "button" && block.purpose === "internal_link")).toHaveLength(1);
    expect(links.filter((block) => block.type === "button" && block.purpose === "related_post")).toHaveLength(3);
    expect(links.every((block) => block.type === "button" && block.target === "_self")).toBe(true);
    expect(links.map((block) => block.type === "button" ? block.sourceExternalPostId : undefined)).toEqual(["0", "1", "2", "3"]);
  });

  it("fills missing related-post slots instead of stopping when one already exists", () => {
    const partial = { ...document, blocks: [...document.blocks, { id: "existing-related", type: "button" as const, purpose: "related_post" as const, label: "기존 관련 글", targetUrl: "https://blog.tistory.com/entry/existing", target: "_self" as const, sourceExternalPostId: "existing" }] };
    const candidates = Array.from({ length: 4 }, (_, index) => ({ externalPostId: String(index), title: `도움이 되는 글 ${index}`, publishedUrl: `https://blog.tistory.com/entry/help-${index}` }));
    const placed = placeRecommendedPosts(partial, candidates);
    const links = placed.blocks.filter((block) => block.type === "button");
    expect(links.filter((block) => block.type === "button" && block.purpose === "internal_link" && block.sourceExternalPostId)).toHaveLength(1);
    expect(links.filter((block) => block.type === "button" && block.purpose === "related_post" && block.targetUrl.startsWith("https://blog.tistory.com/entry/"))).toHaveLength(3);
  });

  it("removes invalid mandatory placeholders before filling verified links", () => {
    const invalid = { ...document, blocks: [...document.blocks,
      { id: "empty-internal", type: "button" as const, purpose: "internal_link" as const, label: "빈 링크", targetUrl: "", target: "_self" as const },
      { id: "manage-related", type: "button" as const, purpose: "related_post" as const, label: "관리 링크", targetUrl: "https://blog.tistory.com/manage/posts", target: "_self" as const },
    ] };
    const candidates = Array.from({ length: 4 }, (_, index) => ({ externalPostId: String(index), title: `검증된 공개 글 ${index}`, publishedUrl: `https://blog.tistory.com/entry/verified-${index}` }));
    const placed = placeRecommendedPosts(invalid, candidates);
    const mandatory = placed.blocks.filter((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post"));
    expect(mandatory).toHaveLength(4);
    expect(mandatory.every((block) => block.type === "button" && block.targetUrl.startsWith("https://blog.tistory.com/entry/"))).toBe(true);
    expect(mandatory.some((block) => block.id === "empty-internal" || block.id === "manage-related")).toBe(false);
  });

  it("deduplicates existing related posts and fills three unique final links", () => {
    const duplicate = { ...document, blocks: [...document.blocks,
      { id: "related-a", type: "button" as const, purpose: "related_post" as const, label: "같은 글 A", targetUrl: "https://blog.tistory.com/entry/same", target: "_self" as const },
      { id: "related-b", type: "button" as const, purpose: "related_post" as const, label: "같은 글 B", targetUrl: "https://blog.tistory.com/entry/same#fragment", target: "_self" as const },
    ] };
    const candidates = Array.from({ length: 3 }, (_, index) => ({ externalPostId: String(index), title: `추가 글 ${index}`, publishedUrl: `https://blog.tistory.com/entry/add-${index}` }));
    const placed = placeRecommendedPosts(duplicate, candidates);
    const related = placed.blocks.filter((block) => block.type === "button" && block.purpose === "related_post");
    expect(related).toHaveLength(3);
    expect(new Set(related.map((block) => block.type === "button" ? new URL(block.targetUrl).pathname : "")).size).toBe(3);
  });

  it("uses every available verified post without inventing duplicates when fewer than four exist", () => {
    const candidates = [
      { externalPostId: "one", title: "도움 글 1", publishedUrl: "https://blog.tistory.com/entry/one" },
      { externalPostId: "two", title: "도움 글 2", publishedUrl: "https://blog.tistory.com/entry/two" },
    ];
    const placed = placeRecommendedPosts(document, candidates);
    const links = placed.blocks.filter((block) => block.type === "button" && block.sourceExternalPostId);
    expect(links.map((block) => block.type === "button" ? block.sourceExternalPostId : undefined)).toEqual(["one", "two"]);
    expect(new Set(links.map((block) => block.type === "button" ? block.targetUrl : "")).size).toBe(2);
  });
});
