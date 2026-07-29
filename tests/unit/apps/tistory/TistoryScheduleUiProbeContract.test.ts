import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-schedule-ui-probe.mjs"),
  "utf8",
);

describe("Tistory schedule UI probe worker contract", () => {
  it("does not contain interaction APIs that can change editor state", () => {
    expect(source).not.toMatch(/\.click\s*\(/);
    expect(source).not.toMatch(/\.fill\s*\(/);
    expect(source).not.toMatch(/\.selectOption\s*\(/);
    expect(source).not.toContain("dispatchEvent(new MouseEvent");
    expect(source).not.toContain("keyboard.press");
  });

  it("records zero-click and editor-state evidence before reporting success", () => {
    expect(source).toContain("clickCounts.total !== 0");
    expect(source).toContain("clickCounts.restricted !== 0");
    expect(source).toContain("titleValueLengthBefore");
    expect(source).toContain("bodyTextLengthBefore");
    expect(source).toContain('status: "diagnosed"');
    expect(source).toContain('readOnly: true');
  });

  it("collects labels and accessibility attributes without reading article content", () => {
    expect(source).toContain("ariaLabel");
    expect(source).toContain("ariaHaspopup");
    expect(source).toContain("ariaExpanded");
    expect(source).toContain("ariaControls");
    expect(source).toContain("scheduleCandidates");
    expect(source).not.toContain("activeEditor?.getContent");
  });
});
