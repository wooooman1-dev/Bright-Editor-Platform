import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { verifyCategoryEvidence } from "../../../../apps/tistory/workflows/tistory-body-editor.mjs";

const tagWorkflowSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-tags.mjs"),
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

  it("accepts the visible category name when no stable id carrier is available", () => {
    expect(verifyCategoryEvidence({ controlText: "건강정보" }, "1038988", "건강정보")).toEqual({
      passed: true,
      idVerified: false,
      nameVerified: true,
    });
  });

  it("rejects unrelated category evidence", () => {
    expect(verifyCategoryEvidence({ hiddenValues: ["999999"], controlText: "도움되는정보" }, "1038988", "건강정보")).toEqual({
      passed: false,
      code: "category_id_mismatch",
    });
  });

  it("prepares a category control carrier from the reopened editor structure", () => {
    expect(tagWorkflowSource).toContain("const structuralCandidates");
    expect(tagWorkflowSource).toContain('carrierSource = namedCarrier ? "matched_name" : structuralCarrier ? "category_structure" : "none"');
    expect(tagWorkflowSource).toContain('carrier.setAttribute("data-bright-category-verification", "observed")');
  });
});
