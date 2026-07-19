import type { ContentDocument, ImageBlockPurpose } from "../content";
import { collectImagePromptContexts, excerpt, type ImagePromptContext } from "./ImagePromptContext";

export const IMAGE_PROMPT_SIMILARITY_THRESHOLD = 0.72;

export type ImagePromptIssueCode =
  | "duplicate_prompt"
  | "high_similarity"
  | "missing_prompt"
  | "purpose_mismatch"
  | "section_context_missing"
  | "uniform_purpose";

export type ImagePromptIssue = Readonly<{
  blockIds: readonly string[];
  code: ImagePromptIssueCode;
  message: string;
  similarity?: number;
}>;

export type ImagePromptAnalysis = Readonly<{
  contexts: readonly ImagePromptContext[];
  issues: readonly ImagePromptIssue[];
}>;

type PurposePolicy = Readonly<{
  action: string;
  background: string;
  composition: string;
  expression: string;
  role: string;
  terms: readonly string[];
}>;

const PURPOSE_POLICIES: Readonly<Record<ImageBlockPurpose, PurposePolicy>> = Object.freeze({
  hero: policy("글 전체의 핵심 주제와 대표 상황을 한눈에 전달", "핵심 인물이나 대상을 대표 행동의 시작 순간에 배치", "주제가 실제로 드러나는 넓은 생활 또는 작업 환경", "여백이 있는 넓은 가로 프레임과 명확한 중심 대상", "대표 상황을 직관적으로 보여주는 editorial scene", ["대표", "전체", "넓은", "가로", "핵심 주제", "hero", "wide"]),
  inline: policy("현재 섹션의 방법이나 원리를 구체적으로 설명", "섹션에서 설명하는 실제 행동과 도구의 위치 관계를 보여줌", "해당 행동이 자연스럽게 일어나는 구체적인 현장", "교육적인 중간 거리 또는 세부 프레임", "행동과 확인 지점을 읽을 수 있는 설명형 장면", ["행동", "세부", "설명", "과정", "위치", "inline", "detail"]),
  comparison: policy("두 선택지나 전후 상태의 차이를 명확히 비교", "같은 대상을 두 조건에서 나란히 보여주고 차이를 강조", "비교 조건이 혼동되지 않는 통제된 동일 배경", "좌우 분할 또는 전후 대비가 분명한 대칭 구도", "차이점이 즉시 읽히는 비교형 구성", ["비교", "좌우", "전후", "차이", "대비", "comparison", "versus"]),
  checklist: policy("실행 단계와 확인 항목을 빠짐없이 점검", "준비물과 행동 단계를 서로 구분된 순서로 제시", "정돈된 작업대나 점검 현장", "단계별 영역과 확인 포인트가 분리된 구성", "항목과 순서를 시각적으로 추적하는 체크리스트", ["체크", "점검", "단계", "항목", "확인", "checklist"]),
  infographic: policy("핵심 정보 사이의 구조와 관계를 설명", "원인·과정·결과 또는 요소 간 연결을 시각화", "불필요한 장식이 없는 정보 중심 배경", "계층과 흐름이 분명한 도식형 레이아웃", "관계와 흐름을 구조적으로 읽는 인포그래픽", ["정보", "관계", "구조", "흐름", "도식", "인포그래픽", "infographic"]),
  summary: policy("글의 핵심 요점을 한 화면에서 정리", "가장 중요한 행동과 판단 기준을 간결하게 묶어 제시", "집중을 방해하지 않는 단정한 카드 배경", "핵심 요소가 균형 있게 묶인 요약 카드 구도", "핵심 요점을 빠르게 복습하는 요약형 구성", ["요약", "핵심", "정리", "카드", "summary"]),
  warning: policy("주의사항과 잘못된 행동 또는 위험 신호를 경고", "피해야 할 행동과 즉시 확인할 위험 요소를 명확히 보여줌", "위험 요소가 분명히 드러나는 실제 상황", "주의 대상에 시선이 집중되는 대비 구도", "안전한 선택을 돕는 경고형 장면", ["주의", "위험", "잘못", "경고", "피해야", "warning", "danger"]),
});

const COMMON_STYLE_TOKENS = new Set([
  "고품질", "구성", "그림", "로고", "블로그", "스타일", "이미지", "일관된", "자연스러운", "전문적인", "텍스트", "한국", "화면", "editorial", "high", "image", "logo", "quality", "style", "text",
]);

const FOCUS_VARIANTS = Object.freeze([
  "동작을 시작하는 결정적 순간과 준비 상태를 함께 보여줌",
  "핵심 도구와 대상의 위치 관계를 가까이에서 설명",
  "흔히 놓치는 확인 지점과 올바른 상태를 대비해 강조",
  "행동의 결과를 확인하는 순간과 판단 기준을 시각화",
  "초보자가 따라 할 수 있도록 손과 대상의 상호작용을 강조",
]);
const BACKGROUND_VARIANTS = Object.freeze([
  "밝은 자연광과 정돈된 실제 환경",
  "핵심 대상 외 요소를 절제한 차분한 현장",
  "사용 맥락이 드러나는 생활 공간과 관련 도구",
  "안전 요소와 이동 동선이 보이는 현실적인 공간",
]);
const COMPOSITION_VARIANTS = Object.freeze([
  "대상과 주변 맥락을 함께 담는 3분할 구도",
  "핵심 부위와 도구가 겹치지 않는 대각선 구도",
  "행동 순서를 왼쪽에서 오른쪽으로 읽는 흐름 구도",
  "전경의 확인 요소와 배경의 전체 상황을 나누는 깊이 구도",
  "중앙 대상과 보조 요소의 크기 차이가 분명한 계층 구도",
]);
const VIEWPOINT_VARIANTS = Object.freeze([
  "눈높이의 넓은 시점",
  "동작 위치를 정확히 보여주는 측면 시점",
  "배치 관계를 이해하기 쉬운 사선 상단 시점",
  "세부 확인 지점을 강조하는 가까운 시점",
  "전체 과정과 결과를 함께 보는 중간 거리 시점",
  "사용자의 손과 대상이 함께 보이는 관찰자 시점",
]);

export function normalizeImagePrompt(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
}

export function imagePromptSimilarity(left: string, right: string): number {
  if (!left.trim() || !right.trim()) return 0;
  if (normalizeImagePrompt(left) === normalizeImagePrompt(right)) return 1;
  const leftTokens = semanticTokens(left), rightTokens = semanticTokens(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = intersection / union;
  const containment = intersection / Math.min(leftTokens.size, rightTokens.size);
  return Number(Math.max(jaccard, intersection >= 6 ? containment * 0.92 : 0).toFixed(3));
}

export function analyzeImagePrompts(document: ContentDocument, primaryKeyword?: string): ImagePromptAnalysis {
  const contexts = collectImagePromptContexts(document, primaryKeyword);
  const issues: ImagePromptIssue[] = [];

  for (const context of contexts) {
    const prompt = context.block.prompt?.trim() ?? "";
    if (!prompt) {
      issues.push(issue("missing_prompt", [context.block.id], `${imageLabel(context)}에 독립 제작용 이미지 프롬프트가 없습니다.`));
      continue;
    }
    if (!purposeMatches(context.purpose, prompt)) {
      issues.push(issue("purpose_mismatch", [context.block.id], `${imageLabel(context)}의 프롬프트가 ${purposeLabel(context.purpose)} 목적에 필요한 구도와 표현 방식을 반영하지 못합니다.`));
    }
    if (!reflectsSectionContext(context, prompt)) {
      issues.push(issue("section_context_missing", [context.block.id], `${imageLabel(context)}의 프롬프트가 배치된 섹션 '${context.sectionHeading || context.title}'의 실제 내용을 반영하지 못합니다.`));
    }
  }

  for (let leftIndex = 0; leftIndex < contexts.length; leftIndex += 1) {
    const left = contexts[leftIndex];
    const leftPrompt = left.block.prompt?.trim() ?? "";
    if (!leftPrompt) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < contexts.length; rightIndex += 1) {
      const right = contexts[rightIndex];
      const rightPrompt = right.block.prompt?.trim() ?? "";
      if (!rightPrompt) continue;
      if (normalizeImagePrompt(leftPrompt) === normalizeImagePrompt(rightPrompt)) {
        issues.push(issue("duplicate_prompt", [left.block.id, right.block.id], `${imageLabel(left)}와 ${imageLabel(right)}의 프롬프트가 동일합니다. 각 섹션의 대상·행동·배경·구도를 다르게 설계하세요.`, 1));
        continue;
      }
      const similarity = imagePromptSimilarity(leftPrompt, rightPrompt);
      if (similarity >= IMAGE_PROMPT_SIMILARITY_THRESHOLD) {
        issues.push(issue("high_similarity", [left.block.id, right.block.id], `${imageLabel(left)}와 ${imageLabel(right)}의 장면 지시가 지나치게 유사합니다. 공통 스타일은 유지하되 대상·행동·구도 중 두 가지 이상을 구분하세요.`, similarity));
      }
    }
  }

  if (contexts.length >= 2 && new Set(contexts.map((context) => context.purpose)).size === 1) {
    issues.push(issue("uniform_purpose", contexts.map((context) => context.block.id), `모든 이미지가 '${purposeLabel(contexts[0].purpose)}' 역할로만 구성되어 있습니다. 글의 구조에 맞춰 대표·설명·비교·요약 등 서로 다른 편집 역할을 검토하세요.`));
  }

  return Object.freeze({ contexts, issues: Object.freeze(issues) });
}

export function ensureDistinctImagePrompts(document: ContentDocument, primaryKeyword?: string): ContentDocument {
  const analysis = analyzeImagePrompts(document, primaryKeyword);
  const rewriteIds = new Set(analysis.issues.flatMap((item) => item.blockIds));
  if (!rewriteIds.size) return document;
  const contextById = new Map(analysis.contexts.map((context) => [context.block.id, context] as const));
  let changed = false;
  const blocks = document.blocks.map((block) => {
    if (block.type !== "image" || block.source.trim() || !rewriteIds.has(block.id)) return block;
    const context = contextById.get(block.id);
    if (!context) return block;
    changed = true;
    return Object.freeze({
      ...block,
      prompt: buildContextualImagePrompt(context),
      purpose: context.purpose,
      sourceType: block.sourceType ?? "planned",
    });
  });
  return changed ? Object.freeze({ ...document, blocks: Object.freeze(blocks) }) : document;
}

function buildContextualImagePrompt(context: ImagePromptContext): string {
  const policy = PURPOSE_POLICIES[context.purpose];
  const subject = excerpt(context.block.alt.trim() || context.sectionHeading || context.primaryKeyword || context.title || "콘텐츠 핵심 장면", 120);
  const section = context.sectionHeading || context.title || context.primaryKeyword || "글 전체 주제";
  const detail = context.primaryParagraph || context.sectionText || `${section}의 핵심 내용을 구체적인 실제 상황으로 표현`;
  const focus = FOCUS_VARIANTS[context.imageIndex % FOCUS_VARIANTS.length];
  const background = BACKGROUND_VARIANTS[(context.imageIndex * 3 + 1) % BACKGROUND_VARIANTS.length];
  const composition = COMPOSITION_VARIANTS[(context.imageIndex * 2 + 1) % COMPOSITION_VARIANTS.length];
  const viewpoint = VIEWPOINT_VARIANTS[(context.imageIndex * 3 + 2) % VIEWPOINT_VARIANTS.length];
  const previous = context.previousImages.at(-1);
  const distinction = previous
    ? `이전 ${purposeLabel(previous.purpose)} 장면 '${previous.scene}'과 같은 행동·배경·구도를 반복하지 말고 이번 섹션의 확인 지점을 중심으로 차별화.`
    : "글의 첫 이미지로서 이후 세부 이미지와 구분되는 고유한 장면을 사용.";
  return `핵심 대상: ${subject}. 전달 목적: ${policy.role}. 섹션 문맥: ${section} — ${excerpt(detail, 180)}. 행동과 장면: ${policy.action}; ${focus}. 배경: ${policy.background}; ${background}. 구도: ${policy.composition}; ${composition}. 시점: ${viewpoint}. 정보 표현: ${policy.expression}. 차별화 기준: ${distinction} 공통 스타일: 한국 독자에게 자연스럽고 신뢰감 있는 고품질 editorial visual, 일관된 따뜻한 중성 색감, 과장된 연출 없음, 긴 텍스트·워터마크·브랜드 로고 없음.`;
}

function reflectsSectionContext(context: ImagePromptContext, prompt: string): boolean {
  const sectionSource = `${context.sectionHeading} ${context.primaryParagraph || context.sectionText}`.trim();
  const source = sectionSource || `${context.title} ${context.primaryKeyword ?? ""}`;
  const contextTokens = [...semanticTokens(source)].slice(0, 16);
  if (!contextTokens.length) return true;
  const promptTokens = semanticTokens(prompt);
  return contextTokens.some((token) => promptTokens.has(token));
}

function purposeMatches(purpose: ImageBlockPurpose, prompt: string): boolean {
  if (purpose === "inline") return true;
  const normalized = prompt.normalize("NFKC").toLowerCase();
  return PURPOSE_POLICIES[purpose].terms.some((term) => normalized.includes(term));
}

function semanticTokens(value: string): Set<string> {
  const tokens = value.normalize("NFKC").toLowerCase().match(/[0-9a-z가-힣]+/g) ?? [];
  return new Set(tokens.filter((token) => token.length >= 2 && !COMMON_STYLE_TOKENS.has(token) && !/^(위한|있는|없는|하는|한다|그리고|또는|통해|대한|해당|핵심|내용|장면|목적|배경|구도|시점|표현)$/.test(token)));
}

function imageLabel(context: ImagePromptContext): string {
  return `${context.imageIndex + 1}번째 이미지${context.sectionHeading ? `(${context.sectionHeading})` : ""}`;
}

function purposeLabel(purpose: ImageBlockPurpose): string {
  return ({ hero: "대표", inline: "본문 설명", comparison: "비교", checklist: "체크리스트", infographic: "인포그래픽", summary: "요약", warning: "주의" })[purpose];
}

function issue(code: ImagePromptIssueCode, blockIds: readonly string[], message: string, similarity?: number): ImagePromptIssue {
  return Object.freeze({ blockIds: Object.freeze([...blockIds]), code, message, ...(similarity === undefined ? {} : { similarity }) });
}

function policy(role: string, action: string, background: string, composition: string, expression: string, terms: readonly string[]): PurposePolicy {
  return Object.freeze({ action, background, composition, expression, role, terms: Object.freeze([...terms]) });
}
