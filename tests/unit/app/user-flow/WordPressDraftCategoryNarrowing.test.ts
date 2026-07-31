import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "app/user-flow/WordPressDraftOverlay.tsx"),
  "utf8",
);

describe("WordPress Draft category confirmation narrowing", () => {
  it("reads categoryNames only after the valid discriminant is true", () => {
    expect(source).toContain(
      'readiness?.categorySelection.valid === true ? readiness.categorySelection.categoryNames.join(", ") : "선택 필요"',
    );
    expect(source).not.toContain(
      'readiness?.categorySelection.categoryNames.join(", ")',
    );
  });
});