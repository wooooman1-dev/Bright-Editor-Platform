import { describe, expect, it, vi } from "vitest";

import { contentDocumentAIContext, detectEditorialReviewRegression, EditorialQualityPipeline } from "../../../../app/application/EditorialQualityPipeline";
import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";
import type { AIProvider, AIRequest } from "../../../../core/ai";
import { applyGeneratedFactualClaimInventory, resolveApprovalPolicySnapshot, type GeneratedFactualClaimInventoryDraft } from "../../../../core/approval";
import { determineContentPlanQualityTarget, type ContentDocument, type ContentPlanQualityTarget } from "../../../../core/content";

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
  const prose = "독자가 바로 실행할 수 있도록 기준과 순서, 예시, 주의사항을 구체적인 문장으로 설명합니다. ".repeat(16);
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
  it("uses the single Quality call but rejects a newly introduced factual Claim", async () => {
    const verifySurface = "취소 처리와 청구 반영은 서로 다른 단계일 수 있습니다.";
    const verifyDraft: GeneratedFactualClaimInventoryDraft = {
      claimId: "claim-verify", planningClaimId: "", origin: "generation", risk: "verify",
      surfaceText: verifySurface, statement: verifySurface, kind: "general", normalizedValueJson: "{}",
      qualifiers: { subject: "", scope: "", basis: "", note: "" }, temporalRequirementJson: "null",
      evidenceUrl: "https://www.fss.or.kr/card", evidenceExcerpt: verifySurface,
    };
    const source = rawDocument("초기 원고");
    source.blocks.push({ type: "paragraph", text: verifySurface });
    const parsed = new EditorialGenerationStrategy().parse(JSON.stringify(source), parseInput());
    const initial = applyGeneratedFactualClaimInventory({
      document: parsed, drafts: [verifyDraft], decisions: [{ retained: true, evidenceStatus: "verify_verified" }], fallbackTitle: parsed.title,
    }).document;
    const criticalSurface = "이 상품의 실제 금리는 7%입니다.";
    const candidate = rawDocument("검토 후보");
    candidate.blocks.push({ type: "paragraph", text: verifySurface }, { type: "paragraph", text: criticalSurface });
    const criticalDraft = { ...verifyDraft, claimId: "quality-critical", origin: "quality_review" as const, risk: "critical" as const, surfaceText: criticalSurface, statement: criticalSurface, evidenceUrl: "", evidenceExcerpt: "" };
    const generate = vi.fn(async (request: AIRequest) => {
      void request;
      return { content: JSON.stringify({ ...candidate, verificationClaimsUsed: [verifyDraft, criticalDraft] }), model: "review" };
    });
    const qualityEngine = { review: vi.fn(() => report(96, true)) };
    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: initial, finalReviewInstruction: () => "final", parseInput: parseInput(), qualityContext: {},
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].metadata).toMatchObject({ factualInventoryMode: "structured_claims_v2" });
    expect(result.attemptHistory[0]?.rejectionReason).toBe("quality_new_factual_claim_added");
    expect(result.document.title).toBe("초기 원고");
    expect(JSON.stringify(result.document.blocks)).not.toContain("7%");
  });

  it("projects the public profile label into Quality prompts without exposing the stable profile ID", () => {
    const approvalPolicy = {
      ...resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!,
      siteIdentity: "복잡한 제도 설명이라는 과거 저장값",
    };
    const document: ContentDocument = {
      id: "content-identity",
      title: "예금자보호 확인 방법",
      blocks: [
        { id: "p1", type: "paragraph", text: "보호 대상과 한도를 공식 자료에서 확인합니다." },
        { id: "image1", type: "image", source: "", alt: "예금자보호 확인 순서", prompt: "공식 확인 화면과 점검표" },
      ],
      metadata: {
        buttonCount: 0,
        createdAt: "2026-08-01T00:00:00.000Z",
        generator: "test",
        imageCount: 1,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: "2026-08-01T00:00:00.000Z",
        version: 1,
        videoCount: 0,
        wordCount: 20,
        metaDescription: "예금자보호 대상과 한도를 확인하는 순서를 안내합니다.",
        tags: ["예금자보호"],
        approvalPolicy,
      },
    };

    const projected = contentDocumentAIContext(document);
    const serialized = JSON.stringify(projected);

    expect(serialized).not.toContain("wordpress_life_economy_v1");
    expect(serialized).not.toContain("복잡한 제도 설명이라는 과거 저장값");
    expect(serialized).toContain("WordPress · 밝은재테크");
    expect(serialized).toContain('"siteIdentity":"밝은재테크"');
    expect(serialized).toContain('"contentDomain":"생활경제, 생활금융, 정부지원, 세금, 주거 정보"');
    expect(projected).toMatchObject({
      title: "예금자보호 확인 방법",
      blocks: document.blocks,
      metadata: {
        metaDescription: "예금자보호 대상과 한도를 확인하는 순서를 안내합니다.",
        tags: ["예금자보호"],
      },
    });
  });

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
    expect(instruction).toContain("repeated core advice = 0");
    expect(instruction).toContain("Manuscript diagnostics");
    expect(instruction).toContain("missing, merely mentioned, or sufficiently explained");
    expect(instruction).toContain("Do not broadly rewrite strong sections or expand the manuscript");
    expect(instruction).not.toContain("character safety floor");
    expect(instruction).not.toContain("Current prose length");
    expect(instruction).toContain("Preserve all verified links, tags, related posts");
    expect(instruction).toContain("Reader usefulness is a mandatory final-edit contract");
    expect(instruction).toContain("Do not respond to a low usefulness score by merely adding sentences");
    expect(instruction).toContain("Every H2 must provide distinct new information");
    expect(instruction).toContain("fulfillment of its heading and editorial purpose, the new information, the section-appropriate concrete value");
    expect(instruction).toContain("Evidence integrity is a mandatory final-edit contract");
    expect(instruction).toContain("unsupportedClaimSignal");
    expect(instruction).toContain("fabricatedExperienceRisk");
    expect(instruction).toContain("Never solve this by inventing a citation, source, number, or personal story");
    expect(instruction).toContain("Priority corrections");
    expect(instruction).toContain("Correct blocked and below-threshold dimensions first");
    expect(instruction).toContain("keep the strongest occurrence in its owning H2");
    expect(instruction).toContain("convert existing generic advice into a usable checklist");
    expect(instruction).toContain("Presentation semantics must remain useful and restrained");
    expect(instruction).toContain("a table only for genuine multi-column comparison or lookup");
    expect(instruction).toContain("do not add decorative card-like sections");
  });

  it("preserves current sectionType ownership while using candidate block bindings", async () => {
    const parsed = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const currentStructure = parsed.metadata!.longFormStructure!;
    const initial: ContentDocument = {
      ...parsed,
      metadata: {
        ...parsed.metadata!,
        longFormStructure: {
          ...currentStructure,
          sections: currentStructure.sections.map((section, index) => ({
            ...section,
            sectionType: index === 0 ? "warning" as const : section.sectionType,
          })),
        },
      },
    };
    const reviews = [report(90, false), report(96, true), report(96, true)];
    const qualityEngine = { review: vi.fn(() => reviews.shift() ?? report(96, true)) };
    const result = await new EditorialQualityPipeline({
      generate: async () => ({ content: JSON.stringify(rawDocument("검토 원고")), model: "review" }),
    } as AIProvider, undefined, qualityEngine as never).run({
      document: initial,
      finalReviewInstruction: () => "final",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(result.document.title).toBe("검토 원고");
    expect(result.document.metadata?.longFormStructure?.sections[0]?.sectionType).toBe("warning");
    expect(result.document.metadata?.longFormStructure?.sections[0]?.paragraphBlockIds)
      .toEqual(result.document.blocks.filter((block) => block.id.startsWith("block-")).slice(2, 4).map((block) => block.id));
  });

  it("removes legacy length targets from the final review prompt and priorities", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const legacyDocument = {
      ...initial,
      metadata: {
        ...initial.metadata!,
        qualityTarget: {
          contentDepth: "deep",
          targetLengthRange: { min: 6000, preferred: 7000, max: 8000 },
          targetSectionCount: { min: 5, preferred: 6, max: 7 },
          sectionLengthGuidance: "각 섹션 450자 이상",
          requiredContentElements: ["판단 기준"],
          topicComplexity: "high",
          readerProblem: "검사 결과 해석이 어려움",
        },
      },
    } as unknown as ContentDocument;
    let instruction = "";
    const generate = vi.fn(async (request: AIRequest) => {
      instruction = request.instruction;
      return { content: JSON.stringify(rawDocument("검토 원고")), model: "review" };
    });
    const qualityEngine = { review: vi.fn(() => report(90, false)) };
    await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: legacyDocument,
      finalReviewInstruction: () => "base instruction",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(instruction).not.toContain("targetLengthRange");
    expect(instruction).not.toContain("sectionLengthGuidance");
    expect(instruction).not.toContain("6000");
    expect(instruction).not.toContain("450자");
    expect(instruction).not.toContain("CONTENT_BELOW_PLANNING_TARGET");
  });

  it("preserves the current manuscript when the response is invalid", async () => {
    const initial = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const qualityEngine = { review: vi.fn(() => report(90, false)) };
    const result = await new EditorialQualityPipeline({ generate: async () => ({ content: "not-json", model: "review" }) } as AIProvider, undefined, qualityEngine as never).run({ document: initial, finalReviewInstruction: () => "final", parseInput: parseInput(), qualityContext: {} });
    expect(result.reachedTarget).toBe(false);
    expect(result.document.title).toBe("초기 원고");
    expect(result.attemptHistory[0]?.rejectionReason).toBe("invalid_content_document");
    expect(result.providerDiagnostics).toMatchObject({ stage: "quality_review", completionStatus: "parse_error" });
  });

  it("restores verified editorial links and removes links invented by the Review response", async () => {
    const parsed = new EditorialGenerationStrategy().parse(JSON.stringify(rawDocument()), parseInput());
    const protectedLink = { id: "protected", type: "button" as const, purpose: "internal_link" as const, label: "기존 글", targetUrl: "https://example.com/existing", target: "_blank" as const };
    const initial = { ...parsed, blocks: [...parsed.blocks, protectedLink] };
    const invented = rawDocument("검토 원고");
    invented.blocks.push({ type: "button", purpose: "related_post", label: "만든 링크", targetUrl: "https://example.com/invented", target: "_blank" } as never);
    const reviews = [report(90, false), report(96, true)];
    const qualityEngine = { review: vi.fn(() => reviews.shift() ?? report(96, true)) };
    const result = await new EditorialQualityPipeline({
      generate: async () => ({ content: JSON.stringify(invented), model: "review" }),
    }, undefined, qualityEngine as never).run({
      document: initial,
      finalReviewInstruction: () => "final",
      parseInput: parseInput(),
      qualityContext: {},
    });
    const links = result.document.blocks.filter((block) => block.type === "button" && (block.purpose === "internal_link" || block.purpose === "related_post"));
    expect(links).toEqual([protectedLink]);
    expect(result.attemptHistory[0]?.rejectionReason).toBeUndefined();
  });

  it("rejects a Review that removes a required content element", () => {
    const target = determineContentPlanQualityTarget({ contentType: "standard article", readerProblem: "판단 기준 부족" });
    const before = targetedDocument(target, 900, true);
    const after = targetedDocument(target, 900, false);
    expect(detectEditorialReviewRegression(before, after)).toBe("required_content_element_removed");
  });

  it("allows a quick Review to remove padding while preserving complete information", () => {
    const target = determineContentPlanQualityTarget({ contentType: "quick checklist", readerProblem: "간단한 사용 순서" });
    const before = targetedDocument(target, 720, true);
    const after = targetedDocument(target, 580, true);
    expect(detectEditorialReviewRegression(before, after)).toBeUndefined();
  });
});

function targetedDocument(target: ContentPlanQualityTarget, sectionLength: number, includeApplication: boolean): ContentDocument {
  const types = target.contentDepth === "quick" ? ["checklist", "steps", "warning"] as const : ["explanation", "case_example", "warning", "summary"] as const;
  const blocks: ContentDocument["blocks"][number][] = [{ id: "intro", type: "paragraph", text: "독자의 질문에 직접 답변하고 핵심 의미를 먼저 설명합니다. ".repeat(8) }];
  const sections = types.map((sectionType, index) => {
    const headingBlockId = `h-${index}`, paragraphBlockIds = [`p-${index}`];
    const list = sectionType === "checklist" ? "\n- 준비\n- 확인\n- 실행\n- 정리\n" : sectionType === "steps" ? "\n1. 준비\n2. 확인\n3. 행동\n" : "";
    const semantic = `핵심 개념과 원리를 설명합니다. 판단 기준과 주의사항, 예외 조건을 확인합니다. ${includeApplication ? "실제 적용 방법과 예시를 제공합니다." : ""} 다음 행동을 정합니다.`;
    blocks.push({ id: headingBlockId, type: "heading", level: 2, text: `섹션 ${index + 1}` });
    blocks.push({ id: paragraphBlockIds[0], type: "paragraph", text: `${semantic}${list}${String.fromCharCode(0xac00 + index * 40).repeat(sectionLength)}` });
    return { headingBlockId, paragraphBlockIds, sectionType };
  });
  blocks.push({ id: "conclusion", type: "paragraph", text: "다음 행동을 정리하고 판단 기준을 다시 확인합니다. ".repeat(8) });
  return {
    id: "targeted", title: "동적 Review 문서", blocks,
    metadata: {
      buttonCount: 0, createdAt: "now", generator: "test", imageCount: 0, language: "ko", readingTime: 1,
      source: "test", updatedAt: "now", version: 1, videoCount: 0, wordCount: 1, qualityTarget: target,
      longFormStructure: { introductionBlockIds: ["intro"], sections, conclusionBlockIds: ["conclusion"] },
    },
  };
}
