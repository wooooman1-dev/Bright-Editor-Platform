import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { withStoredEvidencePassagesInstruction } from "../../../../core/approval";

describe("StoredEvidencePassages", () => {
  it("supplies the stored passages the approval policy already tells the model to rely on", () => {
    const result = withStoredEvidencePassagesInstruction("Revise the document.", document([
      "기준소득월액은 최저 41만원에서 최고 659만원까지의 범위로 결정하게 됩니다.",
    ]));

    expect(result).toContain("Revise the document.");
    expect(result).toContain("Stored official source passages");
    expect(result).toContain("최저 41만원에서 최고 659만원");
    expect(result).toContain("국민연금공단");
    expect(result).toContain("https://www.nps.or.kr/1");
  });

  it("states the rules that keep a figure tied to a passage", () => {
    const result = withStoredEvidencePassagesInstruction("Revise.", document(["가입기간이 10년 이상이면"]));

    expect(result).toContain("only when it appears verbatim in a passage above");
    expect(result).toContain("Never write one from your own knowledge");
    expect(result).toContain("stating that value is an improvement");
    expect(result).toContain("Do not add or change a source URL");
  });

  it("leaves the instruction untouched when nothing was stored", () => {
    expect(withStoredEvidencePassagesInstruction("Revise.", document([]))).toBe("Revise.");
    expect(withStoredEvidencePassagesInstruction("Revise.", document(["   "]))).toBe("Revise.");
  });
});

function document(excerpts: readonly string[]): ContentDocument {
  return {
    id: "stored-evidence",
    title: "국민연금 임의계속가입 조건",
    blocks: [{ id: "p-1", type: "paragraph", text: "보험료는 기준소득월액으로 정합니다." }],
    metadata: {
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
      version: 1,
      approvalEvidence: {
        version: 1,
        status: "verified",
        coverageStatus: "covered",
        sources: excerpts.map((citationExcerpt, index) => ({
          sourceId: `source-${index + 1}`,
          url: `https://www.nps.or.kr/${index + 1}`,
          publisher: "국민연금공단",
          citationExcerpt,
        })),
      },
    },
  } as unknown as ContentDocument;
}
