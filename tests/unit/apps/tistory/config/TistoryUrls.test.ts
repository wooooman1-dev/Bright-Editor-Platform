import { describe, expect, it } from "vitest";

import {
  createTistoryUrls,
  type TistoryUrls,
} from "../../../../../apps/tistory";

describe("createTistoryUrls", () => {
  it("creates the v0.1 Tistory URLs from a blog identifier", () => {
    expect(createTistoryUrls("bright-editor-01")).toEqual({
      admin: "https://bright-editor-01.tistory.com/manage",
      editor: "https://bright-editor-01.tistory.com/manage/newpost",
      login: "https://www.tistory.com/auth/login",
    });
  });

  it("trims surrounding whitespace", () => {
    const urls = createTistoryUrls("  bright-editor  ");

    expect(urls.admin).toBe("https://bright-editor.tistory.com/manage");
  });

  it.each([
    "",
    "   ",
    "https://sample.tistory.com",
    "sample.tistory.com",
    "sample/blog",
    "Sample",
    "-sample",
    "sample-",
    "sample_blog",
  ])("rejects the invalid blog identifier %j", (blogName) => {
    expect(() => createTistoryUrls(blogName)).toThrow(TypeError);
  });

  it("returns an immutable URL configuration", () => {
    const urls: TistoryUrls = createTistoryUrls("bright-editor");

    expect(Object.isFrozen(urls)).toBe(true);
  });
});
