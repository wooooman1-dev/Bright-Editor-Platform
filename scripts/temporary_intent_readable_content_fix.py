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
    'import type { ContentDocument } from "./ContentDocument";',
    'import type { ContentBlock } from "./ContentBlock";\nimport type { ContentDocument } from "./ContentDocument";',
)
replace_once(
    path,
    '  const body = document.blocks.flatMap((block) => block.type === "paragraph" ? [normalizeStructuredText(block.text)] : block.type === "table" ? [normalizeStructuredText(serializeStructuredTable(block))] : []).join(" ");',
    '''  const body = document.blocks.flatMap((block) => {
    const text = readableIntentBlockText(block);
    return block.type === "heading" || !text ? [] : [normalizeStructuredText(text)];
  }).join(" ");''',
)
replace_once(
    path,
    '''  const planned = [
    readerProblem,
    ...opportunity.qualityTarget.coreQuestions.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
    ...opportunity.qualityTarget.actionableNextSteps.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
  ].map((item) => item.trim()).filter(Boolean);
  return Object.freeze([...new Set(planned.length ? planned : [opportunity.searchIntent.trim()].filter(Boolean))]);''',
    '''  const planned = [
    readerProblem,
    ...opportunity.qualityTarget.coreQuestions.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
    ...opportunity.qualityTarget.actionableNextSteps.filter((item) => !isGenericIntentRequirement(item, readerProblem)),
  ].map((item) => item.trim()).filter(Boolean);
  const unique: string[] = [];
  for (const requirement of (planned.length ? planned : [opportunity.searchIntent.trim()].filter(Boolean))) {
    if (unique.some((existing) => sameIntentRequirement(existing, requirement))) continue;
    unique.push(requirement);
  }
  return Object.freeze(unique);''',
)
replace_once(
    path,
    '''function intentRequirementStatus(requirement: string, document: ContentDocument): InformationSufficiencyStatus {
  const normalizedRequirement = normalize(requirement);''',
    '''function sameIntentRequirement(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return normalizedLeft === normalizedRight;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true;
  const leftTerms = intentConceptTerms(left);
  const rightTerms = intentConceptTerms(right);
  const denominator = Math.min(leftTerms.length, rightTerms.length);
  if (!denominator) return false;
  const overlap = leftTerms.filter((term) => rightTerms.some((candidate) => candidate.includes(term) || term.includes(candidate))).length;
  return overlap / denominator >= 0.8;
}

function intentRequirementStatus(requirement: string, document: ContentDocument): InformationSufficiencyStatus {
  const normalizedRequirement = normalize(requirement);''',
)
replace_once(
    path,
    '  const fullText = normalizeStructuredText(document.blocks.flatMap((block) => block.type === "heading" || block.type === "paragraph" ? [block.text] : block.type === "table" ? [serializeStructuredTable(block)] : []).join("\\n"));',
    '  const fullText = normalizeStructuredText(document.blocks.flatMap((block) => { const text = readableIntentBlockText(block); return text ? [text] : []; }).join("\\n"));',
)
replace_once(
    path,
    '''    } else if (block.type === "table") {
      texts.push(serializeStructuredTable(block));
    }
  }''',
    '''    } else {
      const text = readableIntentBlockText(block);
      if (text) texts.push(text);
    }
  }''',
)
replace_once(
    path,
    '''function informationElements(text: string): number {
  const prose = normalizeStructuredText(text)''',
    '''const freeVisualPurposes = new Set(["comparison", "checklist", "infographic", "summary", "warning"]);

function readableIntentBlockText(block: ContentBlock): string {
  if (block.type === "heading" || block.type === "paragraph") return block.text;
  if (block.type === "table") return serializeStructuredTable(block);
  if (block.type === "image" && !block.source.trim() && block.purpose && freeVisualPurposes.has(block.purpose)) {
    return [block.alt, block.caption ?? ""].filter(Boolean).join("\\n");
  }
  return "";
}

function informationElements(text: string): number {
  const prose = normalizeStructuredText(text)''',
)

path = "tests/unit/core/content/ContentOpportunityAlignment.test.ts"
replace_once(
    path,
    '''    const exerciseOpportunity = confirmContentOpportunity(createContentOpportunityCandidate({
      sourceRequest: "유산소운동 강도 조절 방법",''',
    '''    const exerciseBase = createContentOpportunityCandidate({
      sourceRequest: "유산소운동 강도 조절 방법",''',
)
replace_once(
    path,
    '''      cautions: [],
      projectId: "project-1",
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "exercise", confirmedAt: "now" });''',
    '''      cautions: [],
      projectId: "project-1",
    });
    const exerciseOpportunity = confirmContentOpportunity(createContentOpportunityCandidate({
      ...exerciseBase,
      qualityTarget: {
        ...exerciseBase.qualityTarget,
        coreQuestions: [
          ...exerciseBase.qualityTarget.coreQuestions,
          "노래 가능, 짧은 문장 가능, 단어 몇 개만 가능한 상태를 대화 테스트 강도 기준으로 어떻게 구분하는가",
        ],
      },
    }), { workspaceId: "workspace-1", projectId: "project-1", contentId: "exercise", confirmedAt: "now" });''',
)
replace_once(
    path,
    '''        { id: "h-talk", type: "heading", level: 2, text: "대화 테스트로 기기 없이 강도 확인하기" },
        { id: "p-talk", type: "paragraph", text: "편안하게 노래할 수 있으면 강도가 낮고 짧은 문장을 말할 수 있으면 중간 강도입니다. 단어 몇 개만 겨우 말할 수 있으면 강도가 높은 상태이므로 속도나 저항을 낮춥니다. RPE와 대화 상태를 함께 기록하면 다음 운동의 기준을 정할 수 있습니다." },''',
    '''        { id: "h-talk", type: "heading", level: 2, text: "대화 테스트로 기기 없이 강도 확인하기" },
        { id: "p-talk", type: "paragraph", text: "대화 테스트를 RPE와 함께 사용하면 장비 없이도 호흡 부담을 확인할 수 있습니다." },
        { id: "talk-card", type: "image", source: "", sourceType: "planned", purpose: "infographic", alt: "대화 테스트 운동으로 유산소운동 강도 확인하기", caption: "노래를 부를 수 있을 만큼 편안하면 낮은 강도입니다. 짧은 문장을 말할 수 있으면 중간 강도입니다. 단어 몇 개만 겨우 말할 수 있으면 높은 강도이므로 속도나 저항을 낮춥니다." },''',
)
replace_once(
    path,
    '    expect(alignment.review.searchIntentFulfillment.evidence).toContain("의도 요구사항 충분: 1/1");',
    '    expect(alignment.review.searchIntentFulfillment.evidence).toContain("의도 요구사항 충분: 2/2");',
)

print("intent readable-content fix applied")
