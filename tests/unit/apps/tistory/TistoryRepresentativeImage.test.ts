import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { representativeControlLooksSelected, verifyTistoryRepresentativePersistence } from "../../../../apps/tistory/workflows/tistory-representative-image.mjs";

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
}

const sameEditorSource = readSource("apps/tistory/workflows/tistory-same-editor-media.mjs");
const representativeSource = readSource("apps/tistory/workflows/tistory-representative-image.mjs");
const draftWorkerSource = readSource("apps/tistory/workflows/tistory-draft-worker.mjs");

describe("Tistory representative image", () => {
  it("recognizes the actual Tistory active representative control state", () => {
    expect(representativeControlLooksSelected({ className: "mce-represent-image-btn active" })).toBe(true);
    expect(representativeControlLooksSelected({ className: "active mce-represent-image-btn" })).toBe(true);
  });

  it("does not infer selection from inactive or unobserved attributes", () => {
    expect(representativeControlLooksSelected({ className: "mce-represent-image-btn" })).toBe(false);
    expect(representativeControlLooksSelected({ ariaPressed: "true" })).toBe(false);
    expect(representativeControlLooksSelected({ ariaChecked: "true" })).toBe(false);
    expect(representativeControlLooksSelected({ ariaSelected: "true" })).toBe(false);
    expect(representativeControlLooksSelected({ checked: true })).toBe(false);
    expect(representativeControlLooksSelected({ dataState: "selected" })).toBe(false);
    expect(representativeControlLooksSelected(undefined)).toBe(false);
  });

  it("verifies the saved Tistory thumbnail against the selected image including its query", () => {
    const selected = "https://blog.kakaocdn.net/dna/abc123/def456/media/image.png?credential=value&expires=1";
    const persisted = "kage@abc123/def456/media/image.png?credential=value&expires=1";
    expect(verifyTistoryRepresentativePersistence(persisted, selected)).toMatchObject({
      passed: true,
      verified: true,
      evidence: { exactMatch: true, persistedHasQuery: true, expectedHasQuery: true },
    });
  });

  it("fails when the saved representative thumbnail is missing or mismatched", () => {
    const selected = "https://blog.kakaocdn.net/dna/abc123/def456/media/image.png?credential=value";
    expect(verifyTistoryRepresentativePersistence(undefined, selected)).toMatchObject({
      passed: false,
      verified: false,
      code: "representative_persisted_thumbnail_missing",
    });
    expect(verifyTistoryRepresentativePersistence("kage@abc123/def456/media/other.png?credential=value", selected)).toMatchObject({
      passed: false,
      verified: false,
      code: "representative_persisted_thumbnail_mismatch",
    });
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
    expect(representativeSource).toContain('captureRepresentativeScreenshot(page, "active-before-save")');
    expect(representativeSource).toContain("outerHTML: element.outerHTML");
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
    expect(representativeSource).toContain("stateTimeline");
    expect(draftWorkerSource).toContain("!representativeBeforeSave.passed || representativeBeforeSave.verified !== true");
  });

  it("reactivates an existing active selection so the real Tistory callback runs before save", () => {
    expect(representativeSource).toContain("waitForRepresentativeDeselection(page, located.locator)");
    expect(representativeSource).toContain('action: selected.verified');
    expect(representativeSource).toContain('"selection_reactivated_and_verified"');
    expect(representativeSource).toContain("clickExecuted: true");
    expect(representativeSource).toContain("const controlClick = await located.locator.click");
  });

  it("reselects and verifies the first image immediately before draft save", () => {
    const finalBodyIndex = draftWorkerSource.indexOf("const finalBody = await verifyRenderedHtml(page, command.html)");
    const representativeIndex = draftWorkerSource.indexOf("const representativeBeforeSave = await ensureFirstTistoryImageRepresentative(page, tags.representativeRemoteUrl)");
    const saveButtonIndex = draftWorkerSource.indexOf("const saveButton = await visibleDraftButton(page)");
    expect(representativeIndex).toBeGreaterThan(finalBodyIndex);
    expect(saveButtonIndex).toBeGreaterThan(representativeIndex);
    expect(draftWorkerSource).toContain('step("representative_image_verified"');
  });

  it("requires explicit persisted-thumbnail verification after reopening the saved draft", () => {
    const reopenIndex = draftWorkerSource.indexOf("const reopened = await reopenExistingDraft(page, command.title)", draftWorkerSource.indexOf("const saveButton = await visibleDraftButton(page)"));
    const persistedIndex = draftWorkerSource.indexOf("const representativePersistence = verifyTistoryRepresentativePersistence", reopenIndex);
    const reopenedTagsIndex = draftWorkerSource.indexOf("const reopenedTags = await verifyTistoryTags(page, command.tags)", reopenIndex);
    expect(persistedIndex).toBeGreaterThan(reopenIndex);
    expect(reopenedTagsIndex).toBeGreaterThan(persistedIndex);
    expect(draftWorkerSource).toContain('fail(\n        "representative_persisted_verified"');
    expect(draftWorkerSource).toContain('step(\n      "representative_persisted_verified"');
    expect(draftWorkerSource).toContain("response.request().method() !== \"GET\"");
    expect(draftWorkerSource).toContain("readDraftThumbnail(draftDetail)");
  });
});
