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

  it("creates a stable carrier only after actual reopened evidence matches", () => {
    expect(categoryPersistenceSource).toContain("if (evidence.passed)");
    expect(categoryPersistenceSource).toContain("installSyntheticCarrier(page, categoryId, categoryName)");
    expect(categoryPersistenceSource).toContain('carrier.setAttribute("data-category-id", String(expectedId))');
    expect(categoryPersistenceSource).toContain('carrierSource: "verified_reopened_category"');
  });

  it("does not fail tag verification when category evidence is unavailable", () => {
    expect(tagWorkflowSource).toContain("evidence.categoryObservation = await prepareReopenedTistoryCategoryEvidence(");
    expect(tagWorkflowSource).not.toContain("if (!category.skipped && !category.uncategorized && !category.passed)");
    expect(tagWorkflowSource).not.toContain('message: "다시 연 Tistory 편집기에서 저장된 카테고리 값을 확인하지 못했습니다."');
  });

  it("waits for a late-mounted category control and supports accessible non-button controls", () => {
    expect(draftWorkerSource).toContain("const CATEGORY_CONTROL_TIMEOUT_MS = 15000");
    expect(draftWorkerSource).toContain("const deadline = Date.now() + timeoutMs");
    expect(draftWorkerSource).toContain("await targetPage.waitForTimeout(200)");
    expect(draftWorkerSource).toContain('targetPage.getByRole("combobox"');
    expect(categoryLocatorSource).toContain("[role=\"button\"][aria-controls*=\"category\" i]");
    expect(categoryLocatorSource).toContain("[role=\"combobox\"]");
  });
});
