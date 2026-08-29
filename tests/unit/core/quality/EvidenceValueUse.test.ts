import { describe, expect, it } from "vitest";

import type { ContentDocument } from "../../../../core/content";
import { evidenceValueUseScore, measureEvidenceValueUse, QualityEngine, qualityDimensionWeights } from "../../../../core/quality";

describe("EvidenceValueUse", () => {
  it("counts a figure the manuscript wrote with different spacing as used", () => {
    // 2026-08-28: 본문 `2,200만 원` 과 발췌 `2,200만원` 이 다른 값으로 세어져 오탐이 났다.
    const measurement = measureEvidenceValueUse(document({
      excerpts: ["단독가구 2,200만원, 홑벌이가구 3,200만원"],
      paragraphs: ["기준금액은 단독가구 2,200만 원 미만, 홑벌이가구 3,200만 원 미만입니다."],
    }));

    expect(measurement.evidenceValues).toBe(2);
    expect(measurement.unusedValues).toEqual([]);
    expect(evidenceValueUseScore(measurement)).toBe(100);
  });

  it("finds a figure the manuscript wrote inside a table", () => {
    // 첫 측정은 문단만 봐서 표 안의 금액을 놓쳤다.
    const measurement = measureEvidenceValueUse(document({
      excerpts: ["총소득 기준금액 4,400만원"],
      paragraphs: ["가구 유형별 기준은 아래와 같습니다."],
      table: { headers: ["가구", "기준금액"], rows: [["맞벌이", "4,400만 원"]] },
    }));

    expect(measurement.unusedValues).toEqual([]);
  });

  it("reports a stored figure the manuscript never states", () => {
    const measurement = measureEvidenceValueUse(document({
      excerpts: ["기준소득월액은 최저 41만원에서 최고 659만원까지의 범위로 결정합니다."],
      paragraphs: ["보험료는 기준소득월액에 보험료율을 곱해 산정합니다."],
    }));

    expect(measurement.evidenceValues).toBe(2);
    expect(measurement.usedValues).toBe(0);
    expect([...measurement.unusedValues].sort()).toEqual(["41만원", "659만원"]);
    expect(evidenceValueUseScore(measurement)).toBe(0);
  });

  it("ignores a statute citation number", () => {
    const measurement = measureEvidenceValueUse(document({
      excerpts: ["국민연금법 제13조 제1항 제1호 및 법률 제21065호"],
      paragraphs: ["임의계속가입은 신청으로 시작합니다."],
    }));

    expect(measurement.unusedValues).not.toContain("1호");
    expect(measurement.unusedValues).not.toContain("21065호");
  });

  it("treats a manuscript with no stored evidence as fully covered", () => {
    const measurement = measureEvidenceValueUse(document({ excerpts: [], paragraphs: ["출처 없이 쓴 원고입니다."] }));
    expect(measurement.evidenceValues).toBe(0);
    expect(evidenceValueUseScore(measurement)).toBe(100);
  });
});

describe("QualityEngine evidenceUse dimension", () => {
  it("stays display-only like the other reader-value metrics", () => {
    expect(qualityDimensionWeights.evidenceUse).toBe(0);
    const report = new QualityEngine().review(document({
      excerpts: ["최저 41만원에서 최고 659만원"],
      paragraphs: ["보험료는 기준소득월액으로 정합니다."],
    }));
    const added = report.dimensions.find((item) => item.category === "evidenceUse")!;

    expect(added.status).not.toBe("blocked");
    expect(added.evaluation).toBe("not_evaluated");
    const legacy = report.dimensions.filter((item) => qualityDimensionWeights[item.category] > 0);
    expect(report.overallScore).toBe(Math.round(
      legacy.reduce((sum, item) => sum + item.score * qualityDimensionWeights[item.category], 0)
      / legacy.reduce((sum, item) => sum + qualityDimensionWeights[item.category], 0)));
  });

  it("lists the unused figures as an improvement task", () => {
    const report = new QualityEngine().review(document({
      excerpts: ["최저 41만원에서 최고 659만원"],
      paragraphs: ["보험료는 기준소득월액으로 정합니다."],
    }));
    const task = report.tasks.find((item) => item.category === "evidenceUse");

    expect(task?.message).toContain("41만원");
    expect(task?.message).toContain("659만원");
    expect(task?.status).toBe("action_required");
  });
});

function document(input: Readonly<{
  excerpts: readonly string[];
  paragraphs: readonly string[];
  table?: Readonly<{ headers: readonly string[]; rows: readonly (readonly string[])[] }>;
}>): ContentDocument {
  return {
    id: "evidence-use",
    title: "근거 활용 측정",
    blocks: [
      ...input.paragraphs.map((text, index) => ({ id: `p-${index + 1}`, type: "paragraph" as const, text })),
      ...(input.table ? [{ id: "t-1", type: "table" as const, headers: [...input.table.headers], rows: input.table.rows.map((row) => [...row]) }] : []),
    ],
    metadata: {
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
      version: 1,
      ...(input.excerpts.length ? {
        approvalEvidence: {
          version: 1,
          status: "verified",
          coverageStatus: "covered",
          sources: input.excerpts.map((citationExcerpt, index) => ({
            sourceId: `source-${index + 1}`,
            url: `https://www.nps.or.kr/${index + 1}`,
            publisher: "국민연금공단",
            citationExcerpt,
          })),
        },
      } : {}),
    },
  } as unknown as ContentDocument;
}
