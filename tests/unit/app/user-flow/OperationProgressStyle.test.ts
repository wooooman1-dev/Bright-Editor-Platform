import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("editor operation progress style", () => {
  it("keeps the active operation notice fixed in the viewport", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");
    const noticeRule = css.match(/\.bright-operation-notice\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(noticeRule).toContain("position: fixed");
    expect(noticeRule).toContain("left: 50%");
    expect(noticeRule).toContain("z-index: 100");
    expect(css).toContain(".bright-operation-notice::after");
    expect(css).toContain("animation: bright-operation-progress");
  });
});
