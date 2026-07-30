import { describe, expect, it } from "vitest";

import { rankRelatedPosts } from "../../../../core/content";

const document = {
  id: "current",
  title: "통장 쪼개기",
  blocks: [{ id: "h", type: "heading" as const, level: 2 as const, text: "생활비 관리" }],
};

describe("WordPress related post URL safety", () => {
  it("accepts a public HTTPS WordPress article in the selected category", () => {
    const ranked = rankRelatedPosts(document, [{
      externalPostId: "10",
      title: "생활비 절약 방법",
      publishedUrl: "https://brightjaetech.kr/living-cost/",
      categoryId: "12",
      categoryName: "생활경제",
    }], { categoryId: "12", categoryName: "생활경제" });
    expect(ranked.map((item) => item.externalPostId)).toEqual(["10"]);
  });

  it("rejects WordPress admin, login, local, and credentialed URLs", () => {
    const candidates = [
      "https://brightjaetech.kr/wp-admin/post.php?post=10",
      "https://brightjaetech.kr/wp-login.php",
      "https://localhost/article/",
      "https://[::1]/article/",
      "https://[fd00::1]/article/",
      "https://user:password@brightjaetech.kr/article/",
    ].map((publishedUrl, index) => ({
      externalPostId: String(index),
      title: `후보 ${index}`,
      publishedUrl,
      categoryId: "12",
      categoryName: "생활경제",
    }));
    expect(rankRelatedPosts(document, candidates, {
      categoryId: "12",
      categoryName: "생활경제",
    })).toEqual([]);
  });
});
