import { describe, expect, it } from "vitest";

import {
  isTistoryMediaMarkerText,
  replaceTistoryMediaPlaceholdersWithMarkers,
  tistoryMediaMarkerText,
} from "../../../../apps/tistory/workflows/tistory-media-marker.mjs";

const firstPlaceholder = "https://bright-studio.invalid/tistory-media/image-first";
const secondPlaceholder = "https://bright-studio.invalid/tistory-media/image-second";

describe("Tistory media markers", () => {
  it("replaces each renderer image position with a deterministic marker", () => {
    const html = `<p>도입</p><figure><img src="${firstPlaceholder}" alt="첫 이미지"></figure><p>중간</p><figure><img src="${secondPlaceholder}" alt="두 번째 이미지"></figure>`;
    const result = replaceTistoryMediaPlaceholdersWithMarkers(html, [
      { blockId: "image-first", placeholderUrl: firstPlaceholder },
      { blockId: "image-second", placeholderUrl: secondPlaceholder },
    ]);

    expect(result).not.toContain("bright-studio.invalid");
    expect(result).toContain(tistoryMediaMarkerText("image-first"));
    expect(result).toContain(tistoryMediaMarkerText("image-second"));
    expect(result.indexOf("도입")).toBeLessThan(result.indexOf("image-first"));
    expect(result.indexOf("image-first")).toBeLessThan(result.indexOf("중간"));
    expect(result.indexOf("중간")).toBeLessThan(result.indexOf("image-second"));
  });

  it("recognizes only complete Bright Studio marker text", () => {
    expect(isTistoryMediaMarkerText("[[BRIGHT_TISTORY_MEDIA:image-first]]")).toBe(true);
    expect(isTistoryMediaMarkerText("BRIGHT_TISTORY_MEDIA:image-first")).toBe(false);
  });

  it("fails when a local placeholder cannot be resolved", () => {
    expect(() => replaceTistoryMediaPlaceholdersWithMarkers("<p>본문</p>", [
      { blockId: "image-first", placeholderUrl: firstPlaceholder },
    ])).toThrow(/Placeholder/);
  });
});
