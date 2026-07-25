import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const tagsSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-tags.mjs"),
  "utf8",
);

describe("Tistory reopened media and category contract", () => {
  it("verifies native media persistence before a reopened draft can pass", () => {
    expect(tagsSource).toContain("verifyPersistedTistoryMedia");
    expect(tagsSource).toContain("media_persistence_count_mismatch");
    expect(tagsSource).toContain("media_persistence_alt_missing");
    expect(tagsSource).toContain("media_persistence_native_metadata_missing");
  });

  it("uses the command media count rather than marker-only HTML image count", () => {
    expect(tagsSource).toContain("mediaCount: Array.isArray(command.media) ? command.media.length : 0");
    expect(tagsSource).toContain("workflow.mediaCount");
  });

  it("prepares a category verification carrier only from observed DOM evidence", () => {
    expect(tagsSource).toContain("prepareObservedCategoryCarrier");
    expect(tagsSource).toContain("const passed = idMatched || nameMatched");
    expect(tagsSource).toContain('data-bright-category-verification", "observed"');
    expect(tagsSource).toContain('carrier.id = "category-btn"');
  });

  it("excludes article editor content from category-name evidence", () => {
    expect(tagsSource).toContain("body#tinymce, .mce-content-body");
    expect(tagsSource).toContain('[contenteditable="true"]');
  });
});
