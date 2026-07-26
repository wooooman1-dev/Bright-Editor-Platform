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
const draftWorkerSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-draft-worker.mjs"),
  "utf8",
);

describe("Tistory reopened evidence", () => {
  it("recognizes the persisted active representative control state", () => {
    expect(reopenedRepresentativeLooksSelected({ className: "mce-represent-image-btn active" })).toBe(true);
    expect(reopenedRepresentativeLooksSelected({ ariaPressed: "true" })).toBe(false);
    expect(reopenedRepresentativeLooksSelected({ dataState: "selected" })).toBe(false);
    expect(reopenedRepresentativeLooksSelected({ className: "mce-represent-image-btn" })).toBe(false);
  });

  it("selects only a native TinyMCE image and reads the exact Tistory control", () => {
    expect(reopenedEvidenceSource).toContain("body#tinymce figure.imageblock img");
    expect(reopenedEvidenceSource).toContain('const representativeControlSelector = ".mce-represent-image-btn"');
    expect(reopenedEvidenceSource).toContain("const target = await firstReopenedNativeImage(page)");
    expect(reopenedEvidenceSource).toContain("waitForRepresentativeControl(page)");
    expect(reopenedEvidenceSource).toContain('stateSource: "representative_control_dom"');
    expect(reopenedEvidenceSource).toContain("readStableRepresentativeControlState(page, located.locator)");
    expect(reopenedEvidenceSource).toContain("outerHTML: element.outerHTML");
    expect(reopenedEvidenceSource).toContain("captureReopenedRepresentativeScreenshot(page)");
    expect(reopenedEvidenceSource).not.toContain("draft?.thumbnail");
    expect(reopenedEvidenceSource).not.toContain("page.context().request.get(detailUrl");
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
    expect(reopenedEvidenceSource).toContain("tistory_representative_ui_not_rehydrated");
    expect(reopenedEvidenceSource).toContain('uiDiagnosticCode: "representative_persistence_not_selected"');
  });

  it("keeps reopened media, representative, and category checks out of pre-save tag verification", () => {
    const fillStart = tagWorkflowSource.indexOf("export async function fillTistoryTags");
    const reopenedStart = tagWorkflowSource.indexOf("export async function verifyTistoryTags");
    const fillSection = tagWorkflowSource.slice(fillStart, reopenedStart);
    expect(fillSection).toContain("verifyTagValues(page, expected, input)");
    expect(fillSection).not.toContain("verifyReopenedTistoryRepresentativeImage");
    expect(fillSection).not.toContain("prepareReopenedTistoryCategoryEvidence");
    expect(fillSection).not.toContain("verifyPersistedTistoryMedia");
  });

  it("verifies category after reopened media, representative, and tags without synthetic DOM evidence", () => {
    const representativeIndex = tagWorkflowSource.indexOf(
      "const representative = await verifyReopenedTistoryRepresentativeImage(page, workflow.mediaCount)",
    );
    expect(representativeIndex).toBeGreaterThan(-1);
    expect(tagWorkflowSource).toContain("evidence.representative = {");
    expect(tagWorkflowSource).toContain("verified: representative.verified === true");
    expect(tagWorkflowSource).toContain("representativeUi: representative");
    expect(tagWorkflowSource).not.toContain("if (!representative.passed)");
    expect(tagWorkflowSource).not.toContain("prepareReopenedTistoryCategoryEvidence");
    expect(draftWorkerSource).toContain("const reopenedTags = await verifyTistoryTags(page, command.tags)");
    expect(draftWorkerSource).toContain("const reopenedCategory = await verifyReopenedCategory(page, command.categoryId, command.categoryName)");
    expect(draftWorkerSource).toContain('warningStep(\n    "representative_reverified"');
    expect(draftWorkerSource).toContain('"tistory_representative_ui_not_rehydrated"');
  });
});
