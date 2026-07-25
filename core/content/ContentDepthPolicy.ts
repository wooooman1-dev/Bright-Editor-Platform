export const contentDepths = ["quick", "standard", "deep", "comparison"] as const;
export type ContentDepth = (typeof contentDepths)[number];
export type PlannedContentDepth = Exclude<ContentDepth, "quick">;

export const contentSectionTypes = [
  "explanation", "checklist", "comparison", "steps", "warning", "faq", "summary", "case_example",
] as const;
export type ContentSectionType = (typeof contentSectionTypes)[number];

export type ContentTargetRange = Readonly<{ min: number; preferred: number; max: number }>;
export type LegacySectionLengthGuidance = Readonly<Record<ContentSectionType, Readonly<{
  expectedRole?: string;
  minimumInformationElements?: number;
  minimumListItems?: number;
  minimumProseCharacters?: number;
}>>>;
/** @deprecated Legacy persisted-data compatibility only. */
export type SectionLengthGuidance = LegacySectionLengthGuidance;
export type SectionCompletenessGuidance = Readonly<Record<ContentSectionType, Readonly<{
  expectedRole: string;
  minimumInformationElements: number;
  minimumListItems: number;
  preferredStructures: readonly ("prose" | "list" | "table" | "steps" | "qa")[];
}>>>;

export type ContentPlanQualityTarget = Readonly<{
  /** `quick` is accepted only when reading legacy state. New Planning never creates it. */
  contentDepth: ContentDepth;
  coreQuestions: readonly string[];
  requiredContentElements: readonly string[];
  decisionCriteria: readonly string[];
  examplesNeeded: readonly string[];
  warningsOrExceptions: readonly string[];
  actionableNextSteps: readonly string[];
  comparisonNeeds: readonly string[];
  tableNeeds: boolean;
  checklistNeeds: boolean;
  scopeBoundaries: readonly string[];
  sectionGuidance: SectionCompletenessGuidance;
  topicComplexity: "low" | "moderate" | "high";
  readerProblem: string;
  /** Read compatibility only. Canonical targets returned by policy functions omit these fields. */
  targetLengthRange?: ContentTargetRange;
  targetSectionCount?: ContentTargetRange;
  safetyFloor?: number;
  sectionLengthGuidance?: LegacySectionLengthGuidance;
}>;

export type ContentDepthPolicyInput = Readonly<{
  searchIntent?: string;
  contentType?: string;
  topicComplexity?: string;
  readerProblem?: string;
  projectStrategy?: string;
  domain?: string;
  audience?: string;
  selectedTopic?: string;
  expectedCoverage?: readonly string[];
  coreQuestions?: readonly string[];
  requiredContentElements?: readonly string[];
  decisionCriteria?: readonly string[];
  examplesNeeded?: readonly string[];
  warningsOrExceptions?: readonly string[];
  actionableNextSteps?: readonly string[];
  comparisonNeeds?: readonly string[];
  tableNeeds?: boolean;
  checklistNeeds?: boolean;
  scopeBoundaries?: readonly string[];
}>;

const sectionGuidance: SectionCompletenessGuidance = Object.freeze({
  explanation: guidance("핵심 개념·관계·이유를 독자가 이해할 수 있게 설명", 3, 0, ["prose"]),
  checklist: guidance("서로 다른 점검 항목과 각 항목의 이유 또는 행동을 제시", 4, 3, ["list"]),
  comparison: guidance("비교 기준·차이·장단점·선택 조건을 함께 제시", 4, 0, ["table", "list", "prose"]),
  steps: guidance("순서가 있는 행동과 각 단계의 조건 또는 결과를 제시", 4, 3, ["steps", "list"]),
  warning: guidance("위험 신호·예외·피해야 할 행동·다음 행동을 제시", 3, 0, ["prose", "list"]),
  faq: guidance("서로 다른 질문에 각각 완결된 답변을 제시", 4, 0, ["qa"]),
  summary: guidance("핵심 판단과 다음 행동을 간결하게 닫음", 2, 0, ["prose", "list"]),
  case_example: guidance("구체적 상황·판단 과정·적용 결과를 연결", 3, 0, ["prose"]),
});

export function determineContentPlanQualityTarget(input: ContentDepthPolicyInput): ContentPlanQualityTarget {
  const normalized = searchable(input);
  const contentDepth = classifyDepth(normalized);
  return buildTarget(contentDepth, input);
}

export function normalizeContentPlanQualityTarget(
  value: ContentPlanQualityTarget | undefined,
  fallback: ContentDepthPolicyInput,
): ContentPlanQualityTarget {
  if (!value || !contentDepths.includes(value.contentDepth)) return determineContentPlanQualityTarget(fallback);
  const legacyDepth = value.contentDepth === "quick";
  return buildTarget(legacyDepth ? "quick" : value.contentDepth, {
    ...fallback,
    coreQuestions: cleanList(value.coreQuestions).length ? value.coreQuestions : fallback.coreQuestions,
    requiredContentElements: cleanList(value.requiredContentElements).length ? value.requiredContentElements : fallback.requiredContentElements,
    decisionCriteria: cleanList(value.decisionCriteria).length ? value.decisionCriteria : fallback.decisionCriteria,
    examplesNeeded: cleanList(value.examplesNeeded).length ? value.examplesNeeded : fallback.examplesNeeded,
    warningsOrExceptions: cleanList(value.warningsOrExceptions).length ? value.warningsOrExceptions : fallback.warningsOrExceptions,
    actionableNextSteps: cleanList(value.actionableNextSteps).length ? value.actionableNextSteps : fallback.actionableNextSteps,
    comparisonNeeds: cleanList(value.comparisonNeeds).length ? value.comparisonNeeds : fallback.comparisonNeeds,
    tableNeeds: value.tableNeeds,
    checklistNeeds: value.checklistNeeds,
    scopeBoundaries: cleanList(value.scopeBoundaries).length ? value.scopeBoundaries : fallback.scopeBoundaries,
    topicComplexity: value.topicComplexity,
    readerProblem: value.readerProblem,
  });
}

export function effectiveContentDepth(value: ContentDepth): PlannedContentDepth {
  return value === "quick" ? "standard" : value;
}

function buildTarget(contentDepth: ContentDepth, input: ContentDepthPolicyInput): ContentPlanQualityTarget {
  const effectiveDepth = effectiveContentDepth(contentDepth);
  const readerProblem = input.readerProblem?.trim() || input.searchIntent?.trim() || input.selectedTopic?.trim() || "독자가 해결하려는 문제";
  const expectedCoverage = cleanList(input.expectedCoverage);
  const comparison = effectiveDepth === "comparison";
  const deep = effectiveDepth === "deep";
  const requiredDefaults = comparison
    ? ["독자의 질문에 대한 직접 답변", "명확한 비교 기준", "차이와 장단점", "상황별 선택 조건", "최종 판단과 추천 기준"]
    : deep
      ? ["독자의 질문에 대한 직접 답변", "복잡한 원인과 관계", "여러 판단 기준", "구체적인 사례와 예외", "오해하기 쉬운 부분", "위험과 주의사항", "실행 가능한 다음 행동"]
      : ["독자의 질문에 대한 직접 답변", "필요한 배경 설명", "실행 또는 적용 방법", "주의사항과 다음 행동"];
  return Object.freeze({
    contentDepth,
    coreQuestions: freezeList(input.coreQuestions, [
      `${readerProblem}에 대한 직접 답은 무엇인가`,
      "독자가 이해하거나 실행하기 위해 반드시 알아야 할 것은 무엇인가",
    ]),
    requiredContentElements: freezeList(input.requiredContentElements, [...requiredDefaults, ...expectedCoverage]),
    decisionCriteria: freezeList(input.decisionCriteria, comparison || deep ? ["독자가 상황을 구분하고 다음 행동을 선택할 판단 기준"] : ["독자가 적용 여부를 결정할 핵심 기준"]),
    examplesNeeded: freezeList(input.examplesNeeded, deep ? ["판단 기준을 실제 상황에 적용하는 사례"] : ["독자가 바로 적용할 수 있는 짧은 예시"]),
    warningsOrExceptions: freezeList(input.warningsOrExceptions, ["일반화하면 안 되는 예외와 주의사항"]),
    actionableNextSteps: freezeList(input.actionableNextSteps, ["독자가 콘텐츠를 읽은 뒤 실행할 다음 행동"]),
    comparisonNeeds: comparison ? freezeList(input.comparisonNeeds, ["동일한 기준으로 비교한 차이", "상황별 선택 조건"]) : Object.freeze(cleanList(input.comparisonNeeds)),
    tableNeeds: comparison ? input.tableNeeds !== false : Boolean(input.tableNeeds),
    checklistNeeds: Boolean(input.checklistNeeds) || /checklist|체크리스트|준비물|점검/i.test(searchable(input)),
    scopeBoundaries: freezeList(input.scopeBoundaries, ["확인되지 않은 수치·사실·URL을 만들지 않음", "주제 밖의 일반론으로 범위를 확장하지 않음"]),
    sectionGuidance,
    topicComplexity: input.topicComplexity === "low" || input.topicComplexity === "high"
      ? input.topicComplexity
      : deep ? "high" : "moderate",
    readerProblem,
  });
}

function classifyDepth(value: string): PlannedContentDepth {
  if (/(?:비교|차이|vs\b|장단점|선택지|어떤 .* 좋|comparison)/i.test(value)) return "comparison";
  if (/(?:건강|의학|질환|증상|검진|혈압|혈당|약물|치료|진단|응급|전문|심층|복잡|승인용|deep)/i.test(value)) return "deep";
  return "standard";
}

function searchable(input: ContentDepthPolicyInput): string {
  return [
    input.searchIntent, input.contentType, input.topicComplexity, input.readerProblem, input.projectStrategy,
    input.domain, input.audience, input.selectedTopic, ...(input.expectedCoverage ?? []),
  ].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ko-KR");
}

function guidance(
  expectedRole: string,
  minimumInformationElements: number,
  minimumListItems: number,
  preferredStructures: SectionCompletenessGuidance[ContentSectionType]["preferredStructures"],
) {
  return Object.freeze({ expectedRole, minimumInformationElements, minimumListItems, preferredStructures: Object.freeze([...preferredStructures]) });
}

function freezeList(values: readonly string[] | undefined, fallback: readonly string[]): readonly string[] {
  const cleaned = cleanList(values);
  return Object.freeze(cleaned.length ? cleaned : [...fallback]);
}
function cleanList(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((item) => item?.trim()).filter((item): item is string => Boolean(item)))];
}
