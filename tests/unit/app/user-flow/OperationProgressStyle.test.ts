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

  it("stops the schedule notice animation after the schedule request finishes", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf-8");
    const completedScheduleRule = css.match(/section:has\(#tistory-schedule-title\):has\(button\[aria-label="닫기"\]:not\(:disabled\)\)[\s\S]*?\{([^}]*)\}/)?.[1] ?? "";

    expect(completedScheduleRule).toContain("display: none");
    expect(completedScheduleRule).toContain("animation: none");
  });
});
