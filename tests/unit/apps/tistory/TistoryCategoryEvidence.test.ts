import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { verifyCategoryEvidence } from "../../../../apps/tistory/workflows/tistory-body-editor.mjs";

const categoryPersistenceSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-category-persistence.mjs"),
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
const categoryLocatorSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-category-locators.mjs"),
  "utf8",
);

describe("Tistory category evidence", () => {
  it("accepts the stable category id after a draft is reopened even when the visible name is unavailable", () => {
    expect(verifyCategoryEvidence({ hiddenValues: ["1038988"] }, "1038988", "건강정보")).toEqual({
      passed: true,
      idVerified: true,
      nameVerified: false,
    });
  });

  it("accepts the visible category name only when no stable id carrier is available", () => {
    expect(verifyCategoryEvidence({ controlText: "건강정보" }, "1038988", "건강정보")).toEqual({
      passed: true,
      idVerified: false,
      nameVerified: true,
    });
  });

  it("rejects a mismatched stable id even when the visible name looks correct", () => {
    expect(verifyCategoryEvidence({ hiddenValues: ["999999"], controlText: "건강정보" }, "1038988", "건강정보")).toEqual({
      passed: false,
      code: "category_id_mismatch",
    });
  });

  it("opens the actual category control when static reopened evidence is absent", () => {
    expect(categoryPersistenceSource).toContain("waitForStaticCategoryEvidence(page, categoryId, categoryName)");
    expect(categoryPersistenceSource).toContain("inspectCategoryThroughControl(page, categoryId, categoryName)");
    expect(categoryPersistenceSource).toContain("collectOpenCategoryEvidence(page, categoryId, categoryName)");
    expect(categoryPersistenceSource).toContain('page.keyboard.press("Escape")');
  });

  it("returns actual reopened evidence without injecting a synthetic category control", () => {
    expect(categoryPersistenceSource).toContain("return evidence");
    expect(categoryPersistenceSource).not.toContain("installSyntheticCarrier");
    expect(categoryPersistenceSource).not.toContain("data-bright-synthetic");
  });

  it("keeps reopened category verification in the draft worker instead of tag verification", () => {
    expect(tagWorkflowSource).not.toContain("prepareReopenedTistoryCategoryEvidence");
    expect(draftWorkerSource).toContain("const evidence = await prepareReopenedTistoryCategoryEvidence(targetPage, categoryId, categoryName)");
    expect(draftWorkerSource).toContain('fail("category_reverified", category.code, category.message)');
  });

  it("waits for a late-mounted category control and supports accessible non-button controls", () => {
    expect(draftWorkerSource).toContain("const CATEGORY_CONTROL_TIMEOUT_MS = 15000");
    expect(draftWorkerSource).toContain("const deadline = Date.now() + timeoutMs");
    expect(draftWorkerSource).toContain("await targetPage.waitForTimeout(200)");
    expect(draftWorkerSource).toContain('targetPage.getByRole("combobox"');
    expect(categoryLocatorSource).toContain("[role=\"button\"][aria-controls*=\"category\" i]");
    expect(categoryLocatorSource).toContain("[role=\"combobox\"]");
  });

  it("dismisses a no-match draft list before category selection", () => {
    const existingDraftInspection = draftWorkerSource.indexOf("const existing = existingDraftCount ? await reopenExistingDraft");
    const dismissal = draftWorkerSource.indexOf("await dismissDraftListAfterExistingDraftInspection(page)");
    const categorySelection = draftWorkerSource.indexOf("const category = await selectCategory(page, command.categoryId, command.categoryName)", dismissal);
    expect(existingDraftInspection).toBeGreaterThan(-1);
    expect(dismissal).toBeGreaterThan(existingDraftInspection);
    expect(categorySelection).toBeGreaterThan(dismissal);
    expect(draftWorkerSource).toContain('getByRole("button", { name: "취소", exact: true })');
    expect(draftWorkerSource).toContain('dialog.waitFor({ state: "hidden", timeout: 3000 })');
    expect(draftWorkerSource).toContain('fail("draft_preflight", dismissed.code, dismissed.message)');
  });
});
