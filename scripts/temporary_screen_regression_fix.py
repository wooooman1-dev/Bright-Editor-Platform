from pathlib import Path


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    text = path.read_text(encoding="utf-8-sig")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected target missing in {path_value}: {old[:180]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Every zero-cost Bright card, including infographic, can be explicitly replaced by paid AI.
replace_once(
    "core/media/ImageCostPolicy.ts",
    '''const componentPurposes = new Set<ImageBlockPurpose>([
  "comparison",
  "checklist",
  "summary",
  "warning",
]);''',
    '''const componentPurposes = new Set<ImageBlockPurpose>([
  "comparison",
  "checklist",
  "infographic",
  "summary",
  "warning",
]);''',
)

# Re-apply related-post ordering after missing cards are inserted.
replace_once(
    "core/media/BrightBodyVisuals.ts",
    '''  const blocks = orderedDocument.blocks.flatMap((block, index) => [block, ...(insertions.get(index) ?? [])]);
  return Object.freeze({
    ...orderedDocument,
    blocks: Object.freeze(blocks),
    ...(document.metadata
      ? {
        metadata: Object.freeze({
          ...document.metadata,
          imageCount: blocks.filter((block) => block.type === "image").length,
        }),
      }
      : {}),
  });''',
    '''  const blocks = orderedDocument.blocks.flatMap((block, index) => [block, ...(insertions.get(index) ?? [])]);
  return relatedPostsLast(Object.freeze({
    ...orderedDocument,
    blocks: Object.freeze(blocks),
    ...(document.metadata
      ? {
        metadata: Object.freeze({
          ...document.metadata,
          imageCount: blocks.filter((block) => block.type === "image").length,
        }),
      }
      : {}),
  }));''',
)

replace_once(
    "app/user-flow/ContentDocumentEditor.tsx",
    '<summary className="cursor-pointer text-sm font-semibold">Project 이미지 또는 파일로 교체</summary>',
    '<summary className="cursor-pointer text-sm font-semibold">Project 이미지·파일·AI로 교체</summary>',
)

# Do not score generic fallback planning prose as separate search-intent requirements.
replace_once(
    "core/content/ContentOpportunityAlignment.ts",
    '''function intentRequirements(opportunity: ConfirmedContentOpportunity): readonly string[] {
  const planned = [
    opportunity.readerProblem,
    ...opportunity.qualityTarget.coreQuestions,
    ...opportunity.qualityTarget.actionableNextSteps,
  ].map((item) => item.trim()).filter(Boolean);
  return Object.freeze([...new Set(planned.length ? planned : [opportunity.searchIntent.trim()].filter(Boolean))]);
}''',
    '''function intentRequirements(opportunity: ConfirmedContentOpportunity): readonly string[] {
  const readerProblem = opportunity.readerProblem.trim();
  const planned = [
    readerProblem,
    ...opportunity.qualityTarget.coreQuestions.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
    ...opportunity.qualityTarget.actionableNextSteps.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
  ].map((item) => item.trim()).filter(Boolean);
  return Object.freeze([...new Set(planned.length ? planned : [opportunity.searchIntent.trim()].filter(Boolean))]);
}

function isGenericIntentRequirement(value: string, readerProblem: string): boolean {
  const normalized = normalize(value);
  const normalizedProblem = normalize(readerProblem);
  if (normalizedProblem && normalized.startsWith(normalizedProblem) && /직접 답은 무엇인가$/.test(normalized)) return true;
  return normalized === "독자가 이해하거나 실행하기 위해 반드시 알아야 할 것은 무엇인가"
    || normalized === "독자가 콘텐츠를 읽은 뒤 실행할 다음 행동";
}''',
)

# Image policy regression: infographic must be part of the same Bright component set.
replace_once(
    "tests/unit/core/media/ImageCostPolicy.test.ts",
    '''  generatedImageCountForContent,
  isProjectImageReusableForBlock,''',
    '''  generatedImageCountForContent,
  isBrightComponentPurpose,
  isProjectImageReusableForBlock,''',
)
replace_once(
    "tests/unit/core/media/ImageCostPolicy.test.ts",
    '''describe("ImageCostPolicy", () => {
  it("selects only one source-empty hero block for automatic paid generation", () => {''',
    '''describe("ImageCostPolicy", () => {
  it("treats every zero-cost Bright card purpose, including infographic, as an explicit replacement target", () => {
    expect(["comparison", "checklist", "infographic", "summary", "warning"].every((purpose) => isBrightComponentPurpose(purpose as ImageBlockPurpose))).toBe(true);
    expect(isBrightComponentPurpose("inline")).toBe(false);
    expect(isBrightComponentPurpose("hero")).toBe(false);
  });

  it("selects only one source-empty hero block for automatic paid generation", () => {''',
)

# Server test must use the purpose that actually failed on screen.
replace_once(
    "tests/unit/app/api/MediaRoute.test.ts",
    '''  it("allows an explicit paid AI replacement for a free Bright card", async () => {
    current = userData([planned("comparison", "comparison", "운동 비교 카드")]);

    const response = await POST(postRequest({ action: "generate", mode: "manual", contentId: "content-1", blockId: "comparison", prompt: "운동 비교 카드", alt: "운동 비교 카드" }));''',
    '''  it("allows an explicit paid AI replacement for an infographic Bright card", async () => {
    current = userData([planned("infographic", "infographic", "대화 테스트 운동 인포그래픽")]);

    const response = await POST(postRequest({ action: "generate", mode: "manual", contentId: "content-1", blockId: "infographic", prompt: "대화 테스트 운동 인포그래픽", alt: "대화 테스트 운동 인포그래픽" }));''',
)

# Reproduce the exact order shown by the user: one earlier card, three related posts, then a derived warning card.
replace_once(
    "tests/unit/core/media/BrightBodyVisuals.test.ts",
    '''  it("keeps all related posts after every body visual", () => {
    const base = article();
    const withRelated: ContentDocument = {
      ...base,
      blocks: [
        ...base.blocks,
        ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}` })),
        { id: "existing-warning", type: "image", source: "", sourceType: "planned", purpose: "warning", alt: "운동 중단 신호", caption: "통증이 생기면 중단합니다." },
      ],
    };
    const blocks = ensureFreeBodyVisuals(withRelated).blocks;
    expect(blocks.slice(-3).every((block) => block.type === "button" && block.purpose === "related_post")).toBe(true);
  });''',
    '''  it("keeps all related posts after a missing final warning card is derived", () => {
    const base = article();
    const firstHeadingIndex = base.blocks.findIndex((block) => block.type === "heading");
    const firstParagraphIndex = base.blocks.findIndex((block, index) => index > firstHeadingIndex && block.type === "paragraph");
    const existingInfographic = { id: "existing-infographic", type: "image" as const, source: "", sourceType: "planned" as const, purpose: "infographic" as const, alt: "운동 목표 핵심 안내", caption: "체력과 목표를 먼저 확인합니다." };
    const blocksWithEarlierCard = [...base.blocks];
    blocksWithEarlierCard.splice(firstParagraphIndex + 1, 0, existingInfographic);
    const withRelated: ContentDocument = {
      ...base,
      blocks: [
        ...blocksWithEarlierCard,
        ...Array.from({ length: 3 }, (_, index) => ({ id: `related-${index}`, type: "button" as const, purpose: "related_post" as const, label: `관련 글 ${index + 1}`, targetUrl: `https://bright-health.tistory.com/entry/related-${index + 1}` })),
      ],
    };
    const result = ensureFreeBodyVisuals(withRelated).blocks;
    expect(result.filter((block) => block.type === "image" && block.purpose !== "hero")).toHaveLength(2);
    expect(result.at(-4)).toMatchObject({ type: "image", purpose: "warning" });
    expect(result.slice(-3).map((block) => block.type === "button" ? block.purpose : block.type)).toEqual(["related_post", "related_post", "related_post"]);
  });''',
)

# Reproduce the exact confirmed search intent and verify generic default planning text is not scored separately.
replace_once(
    "tests/unit/core/content/ContentOpportunityAlignment.test.ts",
    '''  it("corrects a semantically aligned title that only omitted the exact keyword", () => {''',
    '''  it("scores the confirmed exercise-intensity intent from the actual reader problem rather than generic fallback planning prose", () => {
    const confirmedSearchIntent = "독자가 자신의 체력과 운동 목표에 맞춰 운동을 어느 정도 힘들게 해야 하는지, 심박수 기기 없이도 안전하게 강도를 조절하는 방법을 알고 싶어 한다.";
    const exerciseOpportunity = confirmContentOpportunity(createContentOpportunityCandidate({
      sourceRequest: "유산소운동 강도 조절 방법",
      selectionMode: "automatic",
      selectedTopic: "심박수 기기 없이 유산소운동 강도 조절하기",
      primaryKeyword: "유산소운동 강도",
      secondaryKeywords: ["RPE", "대화 테스트", "운동 강도 조절"],
      searchIntent: confirmedSearchIntent,
      audience: "유산소운동 강도를 정하기 어려운 성인",
      contentType: "guide",
      contentAngle: "RPE와 대화 테스트 중심의 실행 가이드",
      readerProblem: confirmedSearchIntent,
      expectedCoverage: ["체력", "운동 목표", "RPE", "대화 테스트", "안전한 강도 조절"],
      selectionRationale: "운동 강도 판단 기준 제공",
      opportunityEvidence: [{ source: "unknown", summary: "내부 기획" }],
      confidence: 0.8,
      cautions: [],
      projectId: "project-1",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "exercise", confirmedAt: "now" });
    const article: ContentDocument = {
      id: "exercise",
      title: "유산소운동 강도: 심박수 기기 없이 RPE와 대화 테스트로 조절하는 방법",
      blocks: [
        { id: "intro", type: "paragraph", text: "자신의 체력과 운동 목표에 맞는 유산소운동 강도는 숨찬 정도와 동작 상태를 함께 보며 정해야 합니다. 심박수 기기가 없어도 RPE와 대화 테스트를 사용하면 안전하게 조절할 수 있습니다." },
        { id: "h-rpe", type: "heading", level: 2, text: "RPE로 체력과 운동 목표에 맞는 강도 정하기" },
        { id: "p-rpe", type: "paragraph", text: "RPE 1은 매우 편안하고 10은 더 이어가기 어려운 수준입니다. 초보자는 RPE 4에서 6 사이로 시작하고 운동 목표와 당일 체력에 따라 한 단계씩 조절합니다. 숨이 지나치게 차거나 자세가 무너지면 즉시 강도를 낮춥니다." },
        { id: "h-talk", type: "heading", level: 2, text: "대화 테스트로 기기 없이 강도 확인하기" },
        { id: "p-talk", type: "paragraph", text: "편안하게 노래할 수 있으면 강도가 낮고 짧은 문장을 말할 수 있으면 중간 강도입니다. 단어 몇 개만 겨우 말할 수 있으면 강도가 높은 상태이므로 속도나 저항을 낮춥니다. RPE와 대화 상태를 함께 기록하면 다음 운동의 기준을 정할 수 있습니다." },
        { id: "h-warning", type: "heading", level: 2, text: "강도를 낮추거나 운동을 중단해야 하는 신호" },
        { id: "p-warning", type: "paragraph", text: "가슴 통증과 심한 호흡 곤란, 실신할 것 같은 어지러움이 생기면 운동을 중단해야 합니다. 증상이 지속되면 의료기관의 평가를 받아야 합니다." },
        { id: "conclusion", type: "paragraph", text: "오늘 운동에서는 시작 5분에서 10분 뒤 RPE를 기록하고 한 문장을 말해 보세요. 결과에 따라 속도나 저항을 한 단계 조절하면 심박수 기기 없이도 안전한 강도를 선택할 수 있습니다." },
      ],
    };
    const alignment = analyzeContentOpportunityAlignment(article, exerciseOpportunity);
    expect(alignment.review.searchIntentFulfillment.pass).toBe(true);
    expect(alignment.review.searchIntentFulfillment.score).toBe(100);
    expect(alignment.review.searchIntentFulfillment.evidence).toContain("의도 요구사항 충분: 1/1");
  });

  it("corrects a semantically aligned title that only omitted the exact keyword", () => {''',
)

# UI source test checks the exact visible summary and button policy.
replace_once(
    "tests/unit/app/user-flow/ImageWorkspace.test.ts",
    '''    expect(imageEditorSource).toContain("AI 이미지로 교체 · 유료");''',
    '''    expect(imageEditorSource).toContain("AI 이미지로 교체 · 유료");
    expect(editorSource).toContain("Project 이미지·파일·AI로 교체");''',
)

print("screen regression fixes applied")
