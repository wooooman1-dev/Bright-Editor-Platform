export const defaultOpenAIGenerationModel = "gpt-5.6-terra";
// 2026-09-03: gpt-5.6-sol(입력 $5/M·출력 $30/M) 대신 생성과 같은 등급을 쓴다.
// 검토 단계가 전체 AI 비용의 64%를 차지했는데(근로장려금·이후 실측 공통),
// 이 등급 차이 하나가 원인이었고 문서화된 근거는 없었다. 새 사실 추가를 막는
// QualityReviewFactualGuard 는 모델과 무관하게 그대로 작동한다.
export const defaultOpenAIReviewModel = "gpt-5.6-terra";
export const defaultOpenAISourcePreflightModel = "gpt-5.6-luna";

export type OpenAIModelPolicy = Readonly<{
  generationModel: string;
  reviewModel: string;
  sourcePreflightModel: string;
}>;

export function resolveOpenAIModelPolicy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): OpenAIModelPolicy {
  return Object.freeze({
    generationModel: configuredModel(environment.OPENAI_GENERATION_MODEL, defaultOpenAIGenerationModel),
    reviewModel: configuredModel(environment.OPENAI_REVIEW_MODEL, defaultOpenAIReviewModel),
    sourcePreflightModel: configuredModel(environment.OPENAI_SOURCE_PREFLIGHT_MODEL, defaultOpenAISourcePreflightModel),
  });
}

export function openAIGenerationModel(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return resolveOpenAIModelPolicy(environment).generationModel;
}

export function openAIReviewModel(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return resolveOpenAIModelPolicy(environment).reviewModel;
}

export function openAISourcePreflightModel(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return resolveOpenAIModelPolicy(environment).sourcePreflightModel;
}

function configuredModel(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}
