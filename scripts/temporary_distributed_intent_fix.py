from pathlib import Path


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    text = path.read_text(encoding="utf-8-sig")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected target missing in {path_value}: {old[:180]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


path = "core/content/ContentOpportunityAlignment.ts"
replace_once(
    path,
    '''function intentRequirementStatus(requirement: string, document: ContentDocument): InformationSufficiencyStatus {
  const normalizedRequirement = normalize(requirement);
  const terms = intentConceptTerms(requirement);
  const sections = contentSections(document);
  const fullText = normalizeStructuredText(document.blocks.flatMap((block) => { const text = readableIntentBlockText(block); return text ? [text] : []; }).join("\\n"));
  const fullCoverage = conceptCoverage(terms, fullText);
  const semanticWhole = semanticIntentSignal(requirement, fullText);
  const matching = sections.filter((section) => {
    const normalizedSection = normalize(section.text);
    return (normalizedRequirement && normalizedSection.includes(normalizedRequirement))
      || conceptCoverage(terms, section.text) >= 0.5
      || semanticIntentSignal(requirement, section.text);
  });
  if (!matching.length) return fullCoverage >= 0.34 || semanticWhole ? "mentioned" : "missing";
  return matching.some((section) => section.informationElements >= 2) ? "sufficient" : "mentioned";
}''',
    '''function intentRequirementStatus(requirement: string, document: ContentDocument): InformationSufficiencyStatus {
  const normalizedRequirement = normalize(requirement);
  const terms = intentConceptTerms(requirement);
  const sections = contentSections(document);
  const fullText = normalizeStructuredText(document.blocks.flatMap((block) => { const text = readableIntentBlockText(block); return text ? [text] : []; }).join("\\n"));
  const fullCoverage = conceptCoverage(terms, fullText);
  const semanticWhole = semanticIntentSignal(requirement, fullText);
  const sectionDiagnostics = sections.map((section) => Object.freeze({
    ...section,
    coverage: conceptCoverage(terms, section.text),
    directMatch: Boolean(normalizedRequirement && normalize(section.text).includes(normalizedRequirement)),
    semanticMatch: semanticIntentSignal(requirement, section.text),
  }));
  const matching = sectionDiagnostics.filter((section) => section.directMatch || section.coverage >= 0.5 || section.semanticMatch);
  const matchingInformationElements = matching.reduce((sum, section) => sum + section.informationElements, 0);
  const documentInformationElements = sectionDiagnostics.reduce((sum, section) => sum + section.informationElements, 0);
  const distributedEvidenceSections = sectionDiagnostics.filter((section) => section.coverage >= 0.2 || section.semanticMatch).length;
  const documentWideSufficient = fullCoverage >= 0.34
    && documentInformationElements >= 3
    && distributedEvidenceSections >= 2;
  if (matchingInformationElements >= 2 || documentWideSufficient) return "sufficient";
  return matching.length || fullCoverage >= 0.34 || semanticWhole ? "mentioned" : "missing";
}''',
)

path = "tests/unit/core/content/ContentOpportunityAlignment.test.ts"
replace_once(
    path,
    '  it("corrects a semantically aligned title that only omitted the exact keyword", () => {',
    '''  it("aggregates one confirmed intent across intro, table, free card, safety section, and conclusion", () => {
    const confirmedSearchIntent = "독자가 자신의 체력과 운동 목표에 맞춰 운동을 어느 정도 힘들게 해야 하는지, 심박수 기기 없이도 안전하게 강도를 조절하는 방법을 알고 싶어 한다.";
    const distributedOpportunity = confirmContentOpportunity(createContentOpportunityCandidate({
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
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "distributed-exercise", confirmedAt: "now" });
    const article: ContentDocument = {
      id: "distributed-exercise",
      title: "유산소운동 강도: RPE와 대화 테스트로 안전하게 조절하기",
      blocks: [
        { id: "intro", type: "paragraph", text: "운동 목표와 현재 체력은 시작 강도를 정하는 출발점입니다." },
        { id: "h-table", type: "heading", level: 2, text: "현재 상태별 시작 기준" },
        { id: "table", type: "table", headers: ["현재 상태", "시작 기준"], rows: [["초보자", "RPE 4에서 5"], ["익숙한 사람", "RPE 5에서 6"], ["피로한 날", "평소보다 한 단계 낮게"]] },
        { id: "h-talk", type: "heading", level: 2, text: "심박수 기기 없는 대화 테스트" },
        { id: "talk-card", type: "image", source: "", sourceType: "planned", purpose: "infographic", alt: "대화 테스트로 유산소운동 강도 확인", caption: "노래가 편하면 낮은 강도입니다. 짧은 문장이 가능하면 중간 강도입니다. 단어 몇 개만 가능하면 속도나 저항을 낮춥니다." },
        { id: "h-safety", type: "heading", level: 2, text: "안전 신호" },
        { id: "p-safety", type: "paragraph", text: "가슴 통증이나 실신할 것 같은 어지러움이 생기면 즉시 중단합니다." },
        { id: "conclusion", type: "paragraph", text: "오늘은 RPE와 말하기 상태를 함께 보고 결과에 따라 강도를 한 단계 조절합니다." },
      ],
    };
    const alignment = analyzeContentOpportunityAlignment(article, distributedOpportunity);
    expect(alignment.review.searchIntentFulfillment.pass).toBe(true);
    expect(alignment.review.searchIntentFulfillment.score).toBe(100);
    expect(alignment.review.searchIntentFulfillment.evidence).toContain("의도 요구사항 충분: 1/1");
  });

  it("corrects a semantically aligned title that only omitted the exact keyword", () => {''',
)

print("distributed intent fix applied")
