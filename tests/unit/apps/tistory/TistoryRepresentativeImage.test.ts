import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { representativeControlLooksSelected } from "../../../../apps/tistory/workflows/tistory-representative-image.mjs";

const sameEditorSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-same-editor-media.mjs"),
  "utf8",
);
const representativeSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-representative-image.mjs"),
  "utf8",
);

describe("Tistory representative image", () => {
  it("recognizes explicit selected control states", () => {
    expect(representativeControlLooksSelected({ ariaPressed: "true" })).toBe(true);
    expect(representativeControlLooksSelected({ ariaChecked: "true" })).toBe(true);
    expect(representativeControlLooksSelected({ ariaSelected: "true" })).toBe(true);
    expect(representativeControlLooksSelected({ checked: true })).toBe(true);
    expect(representativeControlLooksSelected({ dataState: "selected" })).toBe(true);
    expect(representativeControlLooksSelected({ className: "toolbar-button selected" })).toBe(true);
    expect(representativeControlLooksSelected({ label: "대표 이미지 해제" })).toBe(true);
  });

  it("does not treat an unselected representative control as selected", () => {
    expect(representativeControlLooksSelected({ label: "대표 이미지", ariaPressed: "false" })).toBe(false);
    expect(representativeControlLooksSelected(undefined)).toBe(false);
  });

  it("sets the representative image only for the first uploaded media item", () => {
    expect(sameEditorSource).toContain("if (currentIndex === 0)");
    expect(sameEditorSource).toContain("ensureFirstTistoryImageRepresentative(editorPage, uploaded.remoteUrl)");
    expect(sameEditorSource).toContain("representativeCandidate: currentIndex === 0");
    expect(sameEditorSource).toContain("representativeVerified");
  });

  it("uses a real Playwright image click before resolving the representative control", () => {
    expect(representativeSource).toContain("clickRepresentativeCandidate(page, remoteUrl)");
    expect(representativeSource).toContain("image.click({ force: true, timeout: 5000 })");
    expect(representativeSource).toContain("trusted: true");
    expect(representativeSource).toContain('data-tooltip-content*="대표"');
  });

  it("blocks draft save when representative selection cannot be verified", () => {
    expect(representativeSource).not.toContain("function representativeWarning");
    expect(representativeSource).toContain("function representativeFailure");
    expect(representativeSource).toContain("passed: false");
    expect(representativeSource).toContain("verified: false");
    expect(representativeSource).toContain("representative_control_not_found");
    expect(representativeSource).toContain("representative_control_not_clickable");
    expect(representativeSource).toContain("representative_selection_not_verified");
  });
});
