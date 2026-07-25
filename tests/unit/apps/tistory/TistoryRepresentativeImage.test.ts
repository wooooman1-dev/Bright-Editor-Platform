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
  it("recognizes the actual Tistory active representative control state", () => {
    expect(representativeControlLooksSelected({ className: "mce-represent-image-btn active" })).toBe(true);
    expect(representativeControlLooksSelected({ ariaPressed: "true" })).toBe(true);
    expect(representativeControlLooksSelected({ ariaChecked: "true" })).toBe(true);
    expect(representativeControlLooksSelected({ ariaSelected: "true" })).toBe(true);
    expect(representativeControlLooksSelected({ checked: true })).toBe(true);
    expect(representativeControlLooksSelected({ dataState: "selected" })).toBe(true);
  });

  it("does not treat an inactive icon-only representative control as selected", () => {
    expect(representativeControlLooksSelected({ className: "mce-represent-image-btn" })).toBe(false);
    expect(representativeControlLooksSelected(undefined)).toBe(false);
  });

  it("sets the representative image only for the first uploaded media item", () => {
    const uploadIndex = sameEditorSource.indexOf("const resolved = await uploadTistoryMediaSequentially");
    const representativeIndex = sameEditorSource.indexOf("const representative = await ensureFirstTistoryImageRepresentative(page, resolved[0].remoteUrl)");
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(representativeIndex).toBeGreaterThan(uploadIndex);
    expect(sameEditorSource).not.toContain("if (currentIndex === 0)");
    expect(sameEditorSource).toContain("representativeCandidate: currentIndex === 0");
    expect(sameEditorSource).toContain("representativeVerified");
  });

  it("sets the representative image after every native image upload and before final media verification", () => {
    const representativeIndex = sameEditorSource.indexOf("const representative = await ensureFirstTistoryImageRepresentative(page, resolved[0].remoteUrl)");
    const verificationIndex = sameEditorSource.indexOf("const verification = await verifySameEditorMedia(page, media.length)");
    expect(representativeIndex).toBeGreaterThan(-1);
    expect(verificationIndex).toBeGreaterThan(representativeIndex);
  });

  it("targets Tistory's exact icon-only representative control in the main document", () => {
    expect(representativeSource).toContain('const representativeControlSelector = ".mce-represent-image-btn"');
    expect(representativeSource).toContain("page.locator(representativeControlSelector)");
    expect(representativeSource).toContain('context: "main"');
    expect(representativeSource).not.toContain("representativeLabelPattern");
  });

  it("uses a trusted editor image click and waits for the asynchronous control", () => {
    expect(representativeSource).toContain('frame.locator("figure img, [data-ke-type=\\"image\\"] img")');
    expect(representativeSource).toContain("image.click({ timeout: 5000 })");
    expect(representativeSource).not.toContain("image.click({ force: true");
    expect(representativeSource).toContain("waitForRepresentativeControl(page)");
    expect(representativeSource).toContain("await page.waitForTimeout(100)");
  });

  it("captures the original click failure and visual obstruction evidence", () => {
    expect(representativeSource).toContain("serializeError(error)");
    expect(representativeSource).toContain("inspectRepresentativeImageTarget");
    expect(representativeSource).toContain("document.elementFromPoint(centerX, centerY)");
    expect(representativeSource).toContain("document.elementsFromPoint(centerX, centerY)");
    expect(representativeSource).toContain("frameBox");
    expect(representativeSource).toContain("tinyMceSelection");
    expect(representativeSource).toContain("representativeControls");
  });

  it("writes a structured diagnostic and screenshot path without changing save behavior", () => {
    expect(representativeSource).toContain("[tistory-representative-diagnostic]");
    expect(representativeSource).toContain("captureRepresentativeScreenshot");
    expect(representativeSource).toContain('page.screenshot({ path: screenshotPath, fullPage: false })');
    expect(representativeSource).toContain("representative_image_click_failed");
  });

  it("blocks draft save until the active state is verified", () => {
    expect(representativeSource).toContain("waitForRepresentativeSelection(page, located.locator)");
    expect(representativeSource).toContain("function representativeFailure");
    expect(representativeSource).toContain("passed: false");
    expect(representativeSource).toContain("verified: false");
    expect(representativeSource).toContain("representative_control_not_found");
    expect(representativeSource).toContain("representative_control_not_clickable");
    expect(representativeSource).toContain("representative_selection_not_verified");
  });
});
