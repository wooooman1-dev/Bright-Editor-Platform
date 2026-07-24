import { describe, expect, it, vi } from "vitest";

import { EditorialQualityPipeline } from "../../../../app/application/EditorialQualityPipeline";
import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";
import type { AIProvider, AIRequest } from "../../../../core/ai";

type TestQualityReport = {
  overallScore: number;
  approved: boolean;
  approvalType: "standard" | "exception" | "none";
  reviewedAt: string;
  revisionId: string;
  dimensions: Array<{ category: string; score: number; status: string; reasons: string[]; evidence: never[] }>;
  tasks: Array<{ category: string; message: string; status: string }>;
  findings: never[];
};

function rawDocument(title = "초기 원고") {
  const prose = "독자가 바로 실행할 수 있도록 기준과 순서, 예시, 주의사항을 구체적인 문장으로 설명합니다. ".repeat(11);
  return {
    title,
    metaDescription: "독자가 필요한 실행 기준과 순서, 주의사항을 확인할 수 있는 실용 안내입니다.",
    blocks: [
      { type: "paragraph", text: prose },
      ...Array.from({ length: 5 }, (_, index) => [
        { type: "heading", level: 2, text: `실행 단계 ${index + 1}` },
        { type: "paragraph", text: prose },
        { type: "paragraph", text: prose },
      ]).flat(),
      { type: "paragraph", text: prose },
    ],
  };
}

function report(overallScore: number, approved: boolean, readability = approved ? 96 : 88, approvalType: TestQualityReport["approvalType"] = approved ? "standard" : "none"): TestQualityReport {
  const scores = {
    searchIntent: approved ? 97 : 90,
    seo: approved ? 98 : 92,
    readability,
    structure: 90,
    completeness: approved ? 96 : 85,
    usefulness: 90,
    html: 100,
    imageStrategy: 100,
    internalLinks: 100,
    cta: 100,
  } as const;
  return {
    overallScore,
    approved,
    approvalType,
    reviewedAt: "2026-07-19T00:00:00.000Z",
    revisionId: "rev-test",
    dimensions: Object.entries(scores).map(([category, score]) => ({ category, score, status: "passed", reasons: [], evidence: [] })),
    tasks: approved ? [] : [{ category: "completeness", message: "설명을 보강하세요.", status: "warning" }],
    findings: [],
  };
}

function parseInput() {
  return { contentId: "content-1", contentType: "article" as never, keywords: ["실용 안내"], platform: "canonical" as never, projectId: "project-1" };
}

describe("EditorialQualityPipeline", () => {
  it("uses exactly one final quality-edit call", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const final = JSON.stringify(rawDocument("승인 원고"));
    const generate = vi.fn(async (request: AIRequest) => { void request; return { content: final, model: "review" }; });
    const reviews = [report(90, false), report(96, true)];
    const qualityEngine = { review: vi.fn(() => reviews.shift() ?? report(96, true)) };

    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: initial,
      finalReviewInstruction: () => "final review",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.automaticImprovementCount).toBe(0);
    expect(result.reachedTarget).toBe(true);
    expect(result.document.title).toBe("승인 원고");
  });

  it("accepts a standard-approved candidate even when a non-blocking score is lower", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const generate = vi.fn(async () => ({ content: JSON.stringify(rawDocument("최종 승인")), model: "review" }));
    const reviews = [report(94, false, 99), report(95, true, 95)];
    const qualityEngine = { review: vi.fn(() => reviews.shift() ?? report(95, true, 95)) };
    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({ document: initial, finalReviewInstruction: () => "final", parseInput: parseInput(), qualityContext: {} });
    expect(result.reachedTarget).toBe(true);
    expect(result.document.title).toBe("최종 승인");
  });

  it("does not treat exception approval as publish-ready", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const generate = vi.fn(async () => ({ content: JSON.stringify(rawDocument("예외 승인 원고")), model: "review" }));
    const exceptionReport = report(96, true, 95, "exception");
    exceptionReport.dimensions = exceptionReport.dimensions.map((dimension) =>
      dimension.category === "completeness" ? { ...dimension, score: 93 } :
      dimension.category === "readability" ? { ...dimension, score: 95 } :
      dimension.category === "searchIntent" ? { ...dimension, score: 96 } :
      dimension.category === "seo" ? { ...dimension, score: 97 } : dimension,
    );
    const reviews = [report(90, false), exceptionReport];
    const qualityEngine = { review: vi.fn(() => reviews.shift() ?? exceptionReport) };

    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: initial,
      finalReviewInstruction: () => "final",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(result.reachedTarget).toBe(false);
    expect(result.quality.approvalType).toBe("exception");
    expect(result.document.title).toBe("예외 승인 원고");
  });

  it("keeps the recovery manuscript when the final candidate is still unapproved", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const generate = vi.fn(async () => ({ content: JSON.stringify(rawDocument("미달 후보")), model: "review" }));
    const reviews = [report(90, false), report(93, false)];
    const qualityEngine = { review: vi.fn(() => reviews.shift() ?? report(93, false)) };
    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({ document: initial, finalReviewInstruction: () => "final", parseInput: parseInput(), qualityContext: {} });
    expect(result.reachedTarget).toBe(false);
    expect(result.document.title).toBe("미달 후보");
  });

  it("passes the complete approval contract and diagnostics in the single review prompt", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    let instruction = "";
    const generate = vi.fn(async (request: AIRequest) => { instruction = request.instruction; return { content: JSON.stringify(rawDocument("승인 원고")), model: "review" }; });
    const qualityEngine = { review: vi.fn(() => report(96, true)) };
    await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({ document: initial, finalReviewInstruction: () => "base instruction", parseInput: parseInput(), qualityContext: {}, requiredInformation: ["실행 예시"] });
    expect(instruction).toContain("second and final AI call");
    expect(instruction).toContain("standard approval only");
    expect(instruction).toContain("overallScore >= 95");
    expect(instruction).toContain("readability >= 95");
    expect(instruction).toContain("usefulness >= 90");
    expect(instruction).toContain("final body >= 5,500");
    expect(instruction).toContain("preferred target of 6,000–6,500");
    expect(instruction).toContain("repeated core advice = 0");
    expect(instruction).toContain("at least three useful observable criteria");
    expect(instruction).toContain("Current prose length is");
    expect(instruction).toContain("Manuscript diagnostics");
    expect(instruction).toContain("according to the topic and confirmed search intent");
    expect(instruction).toContain("only where the section and reader intent genuinely require them");
    expect(instruction).toContain("Keyword placement is mandatory");
    expect(instruction).toContain("every confirmed secondary keyword naturally");
    expect(instruction).toContain("Reader usefulness is a mandatory final-edit contract");
    expect(instruction).toContain("Do not respond to a low usefulness score by merely adding sentences");
    expect(instruction).toContain("Every H2 must provide distinct new information");
    expect(instruction).toContain("fulfillment of its heading and editorial purpose, the new information, the section-appropriate concrete value");
    expect(instruction).toContain("Evidence integrity is a mandatory final-edit contract");
    expect(instruction).toContain("unsupportedClaimSignal");
    expect(instruction).toContain("fabricatedExperienceRisk");
    expect(instruction).toContain("Never solve this by inventing a citation, source, number, or personal story");
  });

  it("preserves the current manuscript when the response is invalid", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const qualityEngine = { review: vi.fn(() => report(90, false)) };
    const result = await new EditorialQualityPipeline({ generate: async () => ({ content: "not-json", model: "review" }) } as AIProvider, undefined, qualityEngine as never).run({ document: initial, finalReviewInstruction: () => "final", parseInput: parseInput(), qualityContext: {} });
    expect(result.reachedTarget).toBe(false);
    expect(result.document.title).toBe("초기 원고");
    expect(result.attemptHistory[0]?.rejectionReason).toBe("invalid_content_document");
  });
});
