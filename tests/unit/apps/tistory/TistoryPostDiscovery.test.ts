import { describe, expect, it } from "vitest";

import { extractCategoryFromPostHtml } from "../../../../apps/tistory/workflows/TistoryPostDiscovery.mjs";

const origin = "https://bright-healthy.tistory.com";

describe("Tistory post category discovery", () => {
  it("extracts a decoded category id and name from a public post category link", () => {
    expect(extractCategoryFromPostHtml(`
      <html><body>
        <a class="category" href="${origin}/category/%EA%B1%B4%EA%B0%95%EC%A0%95%EB%B3%B4">건강정보</a>
      </body></html>
    `, origin)).toEqual({ categoryId: "건강정보", categoryName: "건강정보" });
  });

  it("falls back to article section metadata when the skin has no category link", () => {
    expect(extractCategoryFromPostHtml(
      '<meta property="article:section" content="건강운동">',
      origin,
    )).toEqual({ categoryName: "건강운동" });
  });

  it("does not accept a category link from another blog", () => {
    expect(extractCategoryFromPostHtml(
      '<a href="https://other.tistory.com/category/건강정보">건강정보</a>',
      origin,
    )).toBeUndefined();
  });
});
