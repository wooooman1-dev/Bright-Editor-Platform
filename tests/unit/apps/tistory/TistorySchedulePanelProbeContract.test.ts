import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(
    process.cwd(),
    "apps/tistory/workflows/tistory-schedule-panel-probe.mjs",
  ),
  "utf8",
);

describe("Tistory schedule panel probe worker contract", () => {
  it("contains exactly one Playwright click and only for the verified opener", () => {
    expect(source.match(/\.click\s*\(/g) ?? []).toHaveLength(1);
    expect(source).toContain('page.locator("#publish-layer-btn")');
    expect(source).toContain("await opener.click");
    expect(source).not.toMatch(/\.fill\s*\(/);
    expect(source).not.toMatch(/\.selectOption\s*\(/);
    expect(source).not.toContain("keyboard.press");
    expect(source).not.toContain("dispatchEvent(new MouseEvent");
  });

  it("requires one allowed open click and zero restricted clicks", () => {
    expect(source).toContain("clickCounts.total !== 1");
    expect(source).toContain("clickCounts.allowedOpen !== 1");
    expect(source).toContain("clickCounts.restricted !== 0");
    expect(source).toContain('clickCounts.targets[0]?.id !== "publish-layer-btn"');
    expect(source).toContain('probeStage: "publication-panel"');
    expect(source).toContain("readOnly: true");
  });

  it("captures only bounded panel evidence and unchanged editor state", () => {
    expect(source).toContain("newlyVisibleControlCount");
    expect(source).toContain("changedVisibleControlCount");
    expect(source).toContain("ancestorCandidates");
    expect(source).toContain("commonAncestorCandidate");
    expect(source).toContain("panelRoot");
    expect(source).toContain("characterSet");
    expect(source).toContain("textBase64");
    expect(source).toContain("titleValueLengthBefore");
    expect(source).toContain("bodyTextLengthBefore");
    expect(source).toContain("await context.close()");
    expect(source).not.toContain("activeEditor?.getContent");
    expect(source).not.toContain("innerHTML");
  });

  it("preserves click, state, and bounded DOM evidence when isolation fails", () => {
    expect(source).toContain("let failureEvidence");
    expect(source).toContain("...(failureEvidence ?? {})");
    expect(source).toContain("newlyVisibleControls");
    expect(source).toContain("changedVisibleControls");
    expect(source).toContain("panelLikeContainers");
    expect(source).toContain("openerAfter");
  });
});
