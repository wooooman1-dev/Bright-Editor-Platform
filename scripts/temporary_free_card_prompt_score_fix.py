from pathlib import Path


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    text = path.read_text(encoding="utf-8-sig")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected target missing in {path_value}: {old[:180]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


path = "core/quality/QualityEngine.ts"
replace_once(
    path,
    '''  const images = document.blocks.filter((block) => block.type === "image");
  const imagePromptAnalysis = analyzeImagePrompts(document, context.primaryKeyword);''',
    '''  const images = document.blocks.filter((block) => block.type === "image");
  const imagePromptAnalysis = analyzeImagePrompts(document, context.primaryKeyword);
  const promptScoredImageIds = new Set(images
    .filter((item) => !isBrightComponentPurpose(item.purpose) || Boolean(item.source.trim()))
    .map((item) => item.id));''',
)
replace_once(
    path,
    '''  return { document, context, text, metrics, paragraphs, headings, buttons, images, imagePromptAnalysis, opportunityAlignment,''',
    '''  return { document, context, text, metrics, paragraphs, headings, buttons, images, imagePromptAnalysis, promptScoredImageIds, opportunityAlignment,''',
)
replace_once(
    path,
    '''  const actionableImageIssues = s.imagePromptAnalysis.issues.filter((item) => item.code !== "missing_prompt");''',
    '''  const actionableImageIssues = s.imagePromptAnalysis.issues.filter((item) => item.code !== "missing_prompt"
    && item.blockIds.every((blockId) => s.promptScoredImageIds.has(blockId)));''',
)
replace_once(
    path,
    '''        { signal: "uploadedImageBlocks", value: s.images.filter((item) => Boolean(item.source.trim())).length },''',
    '''        { signal: "uploadedImageBlocks", value: s.images.filter((item) => Boolean(item.source.trim())).length },
        { signal: "promptScoredImageBlocks", value: s.promptScoredImageIds.size },''',
)

path = "tests/unit/core/quality/QualityEngine.test.ts"
replace_once(
    path,
    '''  it("reports duplicated image prompts as a concrete image-strategy task", () => {''',
    '''  it("does not score source-empty Bright cards as paid image prompts after a hero is attached", () => {
    const base = structured();
    const document: ContentDocument = {
      ...base,
      blocks: [
        ...base.blocks.map((block) => block.type === "image" ? {
          ...block,
          purpose: "hero" as const,
          source: "/api/media/hero.png",
          sourceType: "ai_generated" as const,
        } : block),
        {
          id: "talk-test-card",
          type: "image",
          source: "",
          sourceType: "planned",
          purpose: "infographic",
          alt: "대화 테스트 운동으로 유산소운동 강도 확인하기",
          prompt: "대화 테스트 운동으로 유산소운동 강도 확인하기",
          caption: "노래와 짧은 문장 가능 여부로 강도를 확인합니다.",
        },
        {
          id: "warning-card",
          type: "image",
          source: "",
          sourceType: "planned",
          purpose: "warning",
          alt: "강도를 낮추거나 운동을 중단해야 하는 신호",
          prompt: "Bright 무료 주의사항 컴포넌트",
          caption: "가슴 통증이나 심한 어지러움이 있으면 운동을 중단합니다.",
        },
      ],
    };
    const dimension = new QualityEngine().review(document, { primaryKeyword: "유산소운동 강도", searchIntent: "운동 강도 조절 방법" }).dimensions.find((item) => item.category === "imageStrategy");
    expect(dimension?.score).toBe(100);
    expect(dimension?.evidence).toContainEqual({ signal: "recommendedImageBlocks", value: 3 });
    expect(dimension?.evidence).toContainEqual({ signal: "uploadedImageBlocks", value: 1 });
    expect(dimension?.evidence).toContainEqual({ signal: "promptScoredImageBlocks", value: 1 });
    expect(dimension?.evidence).toContainEqual({ signal: "purposeMismatchedImagePrompts", value: 0 });
    expect(dimension?.evidence).toContainEqual({ signal: "sectionContextMissingImagePrompts", value: 0 });
    expect(dimension?.evidence).toContainEqual({ signal: "zeroCostVisualSignals", value: 2 });
  });

  it("reports duplicated image prompts as a concrete image-strategy task", () => {''',
)

print("free-card prompt score fix applied")
