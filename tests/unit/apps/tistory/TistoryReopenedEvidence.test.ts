import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { reopenedRepresentativeLooksSelected } from "../../../../apps/tistory/workflows/tistory-reopened-evidence.mjs";

const reopenedEvidenceSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-reopened-evidence.mjs"),
  "utf8",
);
const tagWorkflowSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-tags.mjs"),
  "utf8",
);

describe("Tistory reopened evidence", () => {
  it("recognizes the persisted active representative control state", () => {
    expect(reopenedRepresentativeLooksSelected({ className: "mce-represent-image-btn active" })).toBe(true);
    expect(reopenedRepresentativeLooksSelected({ ariaPressed: "true" })).toBe(true);
    expect(reopenedRepresentativeLooksSelected({ dataState: "selected" })).toBe(true);
    expect(reopenedRepresentativeLooksSelected({ className: "mce-represent-image-btn" })).toBe(false);
  });

  it("selects only a native TinyMCE image and reads the exact Tistory control", () => {
    expect(reopenedEvidenceSource).toContain("body#tinymce figure.imageblock img");
    expect(reopenedEvidenceSource).toContain('const representativeControlSelector = ".mce-represent-image-btn"');
    expect(reopenedEvidenceSource).toContain("const target = await firstReopenedNativeImage(page)");
    expect(reopenedEvidenceSource).toContain("waitForRepresentativeControl(page)");
  });

  it("checks actual reopened native content even when diagnostic media upload items are empty", () => {
    const targetIndex = reopenedEvidenceSource.indexOf("const target = await firstReopenedNativeImage(page)");
    const zeroExpectedIndex = reopenedEvidenceSource.indexOf("if (!(expectedMediaCount > 0))");
    expect(targetIndex).toBeGreaterThan(-1);
    expect(zeroExpectedIndex).toBeGreaterThan(targetIndex);
    expect(reopenedEvidenceSource).toContain("nativeImageFound: true");
  });

  it("does not click the representative control during read-only verification", () => {
    expect(reopenedEvidenceSource).not.toContain("located.locator.click");
    expect(reopenedEvidenceSource).toContain("representative_persistence_not_selected");
  });

  it("keeps reopened media, representative, and category checks out of pre-save tag verification", () => {
    const fillStart = tagWorkflowSource.indexOf("export async function fillTistoryTags");
    const reopenedStart = tagWorkflowSource.indexOf("export async function verifyTistoryTags");
    const fillSection = tagWorkflowSource.slice(fillStart, reopenedStart);
    expect(fillSection).toContain("verifyTagValues(page, expected, input)");
    expect(fillSection).not.toContain("verifyReopenedTistoryRepresentativeImage");
    expect(fillSection).not.toContain("prepareObservedCategoryCarrier");
    expect(fillSection).not.toContain("verifyPersistedTistoryMedia");
  });

  it("runs representative persistence verification before reopened category preparation", () => {
    const representativeIndex = tagWorkflowSource.indexOf(
      "const representative = await verifyReopenedTistoryRepresentativeImage(page, workflow.mediaCount)",
    );
    const categoryIndex = tagWorkflowSource.indexOf(
      "const category = await prepareObservedCategoryCarrier(",
    );
    expect(representativeIndex).toBeGreaterThan(-1);
    expect(categoryIndex).toBeGreaterThan(representativeIndex);
    expect(tagWorkflowSource).toContain("evidence.representative = representative.evidence");
  });
});
