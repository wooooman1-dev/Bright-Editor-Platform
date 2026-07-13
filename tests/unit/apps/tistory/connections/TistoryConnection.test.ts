import { describe, expect, it } from "vitest";
import { parseTistoryBlogAddress } from "../../../../../apps/tistory";
describe("Tistory address parsing", () => {
  it("accepts full URL and identifier", () => { expect(parseTistoryBlogAddress("https://bright-healthy.tistory.com").blogId).toBe("bright-healthy"); expect(parseTistoryBlogAddress("bright-healthy").blogUrl).toBe("https://bright-healthy.tistory.com"); });
  it("rejects invalid or foreign URLs", () => { expect(() => parseTistoryBlogAddress("https://example.com")).toThrow("valid Tistory"); });
});
