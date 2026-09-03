import { describe, expect, it, vi } from "vitest";

import { contentDocumentAIContext, detectEditorialReviewRegression, EditorialQualityPipeline } from "../../../../app/application/EditorialQualityPipeline";
import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";
import type { AIProvider, AIRequest } from "../../../../core/ai";
import { applyGeneratedFactualClaimInventory, resolveApprovalPolicySnapshot, type GeneratedFactualClaimInventoryDraft } from "../../../../core/approval";
import { analyzeLongFormDocument, determineContentPlanQualityTarget, type ContentDocument, type ContentPlanQualityTarget } from "../../../../core/content";

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
    const qualityEngine = { review: vi.fn(() => report(92, false)) };
    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: initial, finalReviewInstruction: () => "final", parseInput: parseInput(), qualityContext: {},
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[0].metadata).toMatchObject({ factualInventoryMode: "structured_claims_v2" });
    expect(result.attemptHistory[0]?.rejectionReason).toBe("quality_new_factual_claim_added");
    expect(result.document.title).toBe("초기 원고");
    expect(JSON.stringify(result.document.blocks)).not.toContain("7%");
  });

  it("sends the canonical factual claim inventory the model is told to reproduce exactly", async () => {
    // 2026-09-03 실측: 검토 프롬프트는 verificationClaimsUsed를 원본과 똑같이
    // 돌려달라고 요구하면서도, contentDocumentAIContext가 generatedFactualClaimInventory를
    // 제외해 모델이 원본 값을 한 번도 보지 못했다. 이 테스트는 그 원본 데이터가
    // 실제로 지시문에 실려 가는지 잠근다.
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
    const generate = vi.fn(async (request: AIRequest) => {
      void request;
      return { content: JSON.stringify({ ...rawDocument("검토 후보"), verificationClaimsUsed: [verifyDraft] }), model: "review" };
    });
    const qualityEngine = { review: vi.fn(() => report(92, false)) };
    await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: initial, finalReviewInstruction: (document, quality) => `base ${document.title} ${quality.overallScore}`, parseInput: parseInput(), qualityContext: {},
    });
    const instruction = generate.mock.calls[0]?.[0].instruction as string;
    expect(instruction).toContain("claim-verify");
    expect(instruction).toContain("https://www.fss.or.kr/card");
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
    const qualityEngine = { review: vi.fn(() => report(92, false)) };
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

  /**
   * content-msrfq4gt-fc8ub1 was blocked on two CONTENT_SECTION_PROSE_INSUFFICIENT
   * sections after the factual inventory deleted the paragraphs that explained
   * them. The final call is the pipeline's only repair opportunity, and the
   * diagnostics it received forwarded CONTENT_INCOMPLETE_SECTION only, so the
   * one thing blocking the article never reached the editor.
   */
  it("tells the final call which sections fall below the prose floor and by how much", async () => {
    const target = determineContentPlanQualityTarget({
      contentType: "article",
      readerProblem: "조회 금액이 확정인지 판단하기 어렵다",
      requiredContentElements: ["판단 기준"],
    });
    const heading = "국민연금 예상연금액과 실제 지급 판단은 같은 질문이 아닙니다";
    const initial: ContentDocument = {
      id: "content-prose-shortfall",
      title: "국민연금 예상수령액 조회 방법",
      blocks: [
        { id: "intro", type: "paragraph", text: "조회 화면의 금액과 실제 지급 판단은 서로 다른 질문에 답합니다. 두 질문을 나누어 확인해야 합니다." },
        { id: "h-1", type: "heading", level: 2, text: heading },
        { id: "p-1", type: "paragraph", text: "예상연금액은 조회 시점의 기록과 산정 전제를 바탕으로 계획을 가늠하게 하는 값입니다. 아래 표는 그 차이를 정리한 것입니다." },
        {
          id: "p-2",
          type: "table",
          headers: ["구분", "조회 화면", "지급 판단"],
          rows: [
            ["주된 목적", "노후 계획 점검", "개별 수급 확인"],
            ["기준 자료", "조회 시점 기록", "수급 시점 기록"],
            ["독자가 할 일", "금액과 가정을 기록", "공식 상담으로 확인"],
            ["해석 원칙", "변화 가능성 전제", "현행 기준과 함께 판단"],
          ],
        },
        { id: "conclusion", type: "paragraph", text: "조회 결과는 계획을 점검하는 기준으로 쓰고 최종 판단은 공식 기록으로 확인합니다." },
      ],
      metadata: {
        buttonCount: 0, createdAt: "2026-08-13T00:00:00.000Z", generator: "test", imageCount: 0, language: "ko",
        readingTime: 1, source: "test", updatedAt: "2026-08-13T00:00:00.000Z", version: 1, videoCount: 0, wordCount: 20,
        metaDescription: "국민연금 예상수령액 조회 결과를 해석하는 기준을 안내합니다.",
        qualityTarget: target,
        longFormStructure: {
          introductionBlockIds: ["intro"],
          sections: [{ headingBlockId: "h-1", paragraphBlockIds: ["p-1", "p-2"], sectionType: "comparison" }],
          conclusionBlockIds: ["conclusion"],
        },
      },
    };
    let instruction = "";
    const generate = vi.fn(async (request: AIRequest) => { instruction = request.instruction; return { content: JSON.stringify(rawDocument("검토 원고")), model: "review" }; });
    const qualityEngine = { review: vi.fn(() => report(92, false)) };

    await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: initial,
      finalReviewInstruction: () => "final",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(instruction).toContain("sectionProseShortfalls");
    expect(instruction).toContain(`"heading":"${heading}"`);
    expect(instruction).toContain('"minimumNarrativeCharacters":400');
    expect(instruction).toContain("Structural repair is a mandatory final-edit contract");
    expect(instruction).toContain("CONTENT_SECTION_PROSE_INSUFFICIENT");
    expect(instruction).toContain("Do not close the gap with a new number, date, amount, rate, statute, or eligibility rule");
    expect(instruction).toContain("do not add list items or table rows, which are not counted");
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

  /**
   * content-mssph0q6-ftn4h7 was planned with two comparisonNeeds, generated six
   * sections without one comparison among them, and stayed blocked on
   * CONTENT_DECLARED_COMPARISON_MISSING through the final call that is
   * explicitly told to repair it. Every scored dimension read 100, so the score
   * vector was identical either way and the acceptance rule fell through to
   * preferring the shorter manuscript — which is always the one that never
   * wrote the comparison.
   */
  it("accepts a final candidate that clears a blocking structural violation even though it is longer", async () => {
    const target = comparisonTarget();
    const current = comparisonDocument("초기 원고", false, target);
    expect(analyzeLongFormDocument(current, target).violations.map((item) => item.code))
      .toEqual(["CONTENT_DECLARED_COMPARISON_MISSING"]);
    const generate = vi.fn(async () => ({
      content: JSON.stringify(structuredComparisonArticle("검토 원고", true)),
      model: "review",
    }));
    const qualityEngine = { review: vi.fn(() => report(100, false)) };

    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: current,
      finalReviewInstruction: () => "final",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(result.attemptHistory[0]?.rejectionReason).toBeUndefined();
    expect(result.document.title).toBe("검토 원고");
    expect(result.document.metadata?.longFormStructure?.sections.map((section) => section.sectionType))
      .toContain("comparison");
    expect(analyzeLongFormDocument(result.document, target).violations).toEqual([]);
  });

  it("still refuses a longer candidate that clears nothing", async () => {
    const target = comparisonTarget();
    const current = comparisonDocument("초기 원고", true, target);
    expect(analyzeLongFormDocument(current, target).violations).toEqual([]);
    const padded = structuredComparisonArticle("검토 원고", true);
    padded.sections[0]!.paragraphs.push("같은 내용을 다른 문장으로 한 번 더 늘려 적은 문단입니다.");
    const generate = vi.fn(async () => ({ content: JSON.stringify(padded), model: "review" }));
    const qualityEngine = { review: vi.fn(() => report(100, false)) };

    const result = await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: current,
      finalReviewInstruction: () => "final",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(result.document.title).toBe("초기 원고");
  });

  /**
   * D-043: 원고는 자기 글의 기준일을 쓰지 않는다. 최종 편집 호출도 그 줄을 넣으라고
   * 요구하지 않는다. 시스템이 출처 영역에 직접 표시한다.
   */
  it("never asks the final call to add an information date", async () => {
    const target = comparisonTarget();
    const approvalPolicy = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
    const base = comparisonDocument("초기 원고", true, target);
    const withoutDate: ContentDocument = { ...base, metadata: { ...base.metadata!, approvalPolicy } };
    let instruction = "";
    const generate = vi.fn(async (request: AIRequest) => {
      instruction = request.instruction;
      return { content: JSON.stringify(structuredComparisonArticle("검토 원고", true)), model: "review" };
    });
    const qualityEngine = { review: vi.fn(() => report(100, false)) };
    await new EditorialQualityPipeline({ generate } as AIProvider, undefined, qualityEngine as never).run({
      document: withoutDate,
      finalReviewInstruction: () => "final",
      parseInput: parseInput(),
      qualityContext: {},
    });

    expect(instruction).not.toContain("Information-date contract");
    expect(instruction).not.toContain("정보 기준과 다시 확인할 곳");
    expect(instruction).not.toContain("does not carry this line");
    expect(instruction).not.toMatch(/정보\s*기준일\s*[:：]/u);
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

function comparisonTarget(): ContentPlanQualityTarget {
  return determineContentPlanQualityTarget({
    contentType: "article",
    readerProblem: "국세환급금 조회 결과를 어떻게 읽어야 하는지 판단하기 어렵다",
    requiredContentElements: ["판단 기준"],
    comparisonNeeds: ["국세환급금 조회와 지방세 환급 조회의 범위 비교"],
  });
}

function structuredComparisonArticle(title: string, withComparison: boolean) {
  const sections = [
    {
      heading: "국세환급금 조회 대상을 먼저 구분합니다",
      sectionType: "explanation" as const,
      paragraphs: [
        "국세환급금은 이미 납부한 세금 가운데 돌려받을 몫이 확정된 금액을 가리킵니다. 어떤 세목에서 발생했는지에 따라 확인해야 할 화면이 달라집니다. 그래서 조회를 시작하기 전에 대상 세목을 먼저 정리해 두는 편이 빠릅니다. 정리한 내용을 메모해 두면 이후 확인 과정에서 근거로 쓸 수 있습니다.",
      ],
    },
    {
      heading: "공식 경로에서 조회하는 순서를 정리합니다",
      sectionType: "explanation" as const,
      paragraphs: [
        "조회는 공식 서비스에 접속해 본인 인증을 마친 뒤 환급금 항목을 여는 흐름으로 이어집니다. 인증 수단은 상황에 맞게 고르되 이름과 등록번호가 일치해야 결과가 나옵니다. 결과 화면이 비어 있다면 대상이 아니거나 처리 단계가 남아 있다는 뜻입니다. 이때는 화면을 닫지 말고 표시된 안내 문구를 함께 읽어야 합니다.",
      ],
    },
    {
      heading: "결과 화면을 읽는 판단 기준을 세웁니다",
      sectionType: "explanation" as const,
      paragraphs: [
        "화면에 표시되는 상태 값은 지급이 확정된 경우와 확인이 더 필요한 경우로 나뉩니다. 상태 값이 무엇을 뜻하는지 알아야 다음에 할 행동이 정해집니다. 확정 상태라면 지급 계좌와 예정일을 확인하는 것으로 충분합니다. 확인이 남은 상태라면 요청된 서류나 절차를 먼저 마쳐야 합니다.",
      ],
    },
  ];
  const comparison = {
    heading: "국세 환급 조회와 지방세 환급 조회는 무엇이 다른가",
    sectionType: "comparison" as const,
    paragraphs: [
      "두 조회의 가장 큰 차이는 다루는 세목과 담당 기관이 다르다는 점입니다. 국세 쪽은 소득세와 부가가치세처럼 국가가 걷는 세금을 비교 대상으로 삼습니다. 반면 지방세 쪽은 지방자치단체가 걷는 세금을 대상으로 하므로 조회 화면 자체가 따로 있습니다. 비교해 보면 한쪽에서 결과가 없다고 해서 다른 쪽에도 없는 것은 아니라는 결론이 나옵니다. 그래서 돌려받을 돈이 있는지 확인할 때는 두 경로를 모두 열어 두는 선택이 안전합니다.",
    ],
  };
  return {
    title,
    metaDescription: "국세환급금 조회 결과를 읽는 기준과 확인 순서를 정리해 다음 행동을 정할 수 있게 안내합니다.",
    introduction: [
      "돌려받을 세금이 있는지 확인하려면 조회 결과가 무엇을 말하는지부터 읽어야 합니다. 화면에 뜬 금액과 실제 수령 여부는 같은 질문이 아니기 때문입니다.",
    ],
    sections: withComparison ? [...sections, comparison] : sections,
    conclusion: [
      "조회 결과는 상태 값과 함께 읽고 남은 절차가 있는지 확인한 뒤 다음 행동을 정하면 됩니다. 확인이 끝나지 않은 항목은 공식 안내에 따라 마무리하는 것이 마지막 판단 기준입니다.",
    ],
  };
}

function comparisonDocument(title: string, withComparison: boolean, target: ContentPlanQualityTarget): ContentDocument {
  const parsed = new EditorialGenerationStrategy().parse(
    JSON.stringify(structuredComparisonArticle(title, withComparison)),
    parseInput(),
  );
  return { ...parsed, metadata: { ...parsed.metadata!, qualityTarget: target } };
}

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
