import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("editor operation progress style", () => {
  it("keeps both operation notices and quality feedback fixed in the viewport", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");
    const noticeRule = css.match(/\.bright-operation-notice,\s*\[aria-live="polite"\]\.bg-blue-50\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(noticeRule).toContain("position: fixed");
    expect(noticeRule).toContain("left: 50%");
    expect(noticeRule).toContain("z-index: 100");
    expect(css).toContain('[aria-live="polite"].bg-blue-50::after');
    expect(css).toContain('[aria-live="polite"].bg-blue-50::before');
    expect(css).toContain("animation: bright-operation-progress");
    expect(css).toContain("animation: bright-operation-spin");
  });
});
