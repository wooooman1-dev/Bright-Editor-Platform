import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const preparationWorkerSource = readFileSync(join(process.cwd(), "apps/tistory/workflows/tistory-media-preparation-worker.mjs"), "utf8");
const sameEditorSource = readFileSync(join(process.cwd(), "apps/tistory/workflows/tistory-same-editor-media.mjs"), "utf8");
const tagSource = readFileSync(join(process.cwd(), "apps/tistory/workflows/tistory-tags.mjs"), "utf8");
const serviceSource = readFileSync(join(process.cwd(), "app/application/publishing/TistoryDraftApplicationService.ts"), "utf8");

describe("Tistory same-editor media preparation contract", () => {
  it("prepares deterministic markers without opening a second Tistory editor", () => {
    expect(preparationWorkerSource).toContain("replaceTistoryMediaPlaceholdersWithMarkers");
    expect(preparationWorkerSource).toContain('mediaPreparationMode: "same_editor_markers"');
    expect(preparationWorkerSource).not.toContain("chromium.launch");
    expect(preparationWorkerSource).not.toContain("uploadSingleTistoryImage");
  });

  it("uploads every local image in the active Draft editor and replaces its marker", () => {
    expect(sameEditorSource).toContain("uploadTistoryMediaSequentially");
    expect(sameEditorSource).toContain("focusMediaMarker");
    expect(sameEditorSource).toContain("placeUploadedImageAtMarker");
    expect(sameEditorSource).toContain("verifySameEditorMedia");
  });

  it("keeps the first active-editor upload as the representative candidate", () => {
    expect(sameEditorSource).toContain("representativeCandidate: currentIndex === 0");
    expect(sameEditorSource).toContain("representativeMedia: resolved[0]");
  });

  it("runs active-editor media placement before writing tags", () => {
    expect(tagSource.indexOf("prepareTistoryMediaInCurrentEditor(page)")).toBeLessThan(tagSource.indexOf("const expected = normalizeTistoryTags(values)"));
  });

  it("keeps marker preparation inside the registered Permission Gate workflow", () => {
    expect(serviceSource.indexOf("await this.executeMediaWorker(commandPath)")).toBeLessThan(serviceSource.indexOf("await this.executeWorker(commandPath)"));
  });
});
