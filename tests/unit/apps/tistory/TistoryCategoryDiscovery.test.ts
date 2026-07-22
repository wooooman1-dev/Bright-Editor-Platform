import { describe, expect, it } from "vitest";

import { resolveCategoryIdByName } from "../../../../apps/tistory/workflows/TistoryCategoryDiscovery.mjs";

const categories = [
  { id: "1038988", name: "건강정보", depth: 0 },
  { id: "1057542", name: "건강운동", depth: 0 },
];

describe("Tistory category identity resolution", () => {
  it("maps a public post category name to the numeric platform category id", () => {
    expect(resolveCategoryIdByName(" 건강정보 ", categories)).toBe("1038988");
  });

  it("does not return a name or a non-numeric value as category id", () => {
    expect(resolveCategoryIdByName("건강정보", [{ id: "건강정보", name: "건강정보", depth: 0 }])).toBeUndefined();
  });

  it("does not guess when duplicate category names map to different ids", () => {
    expect(resolveCategoryIdByName("건강정보", [...categories, { id: "9999999", name: "건강정보", depth: 1 }])).toBeUndefined();
  });
});
