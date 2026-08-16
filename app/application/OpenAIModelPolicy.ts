export const defaultOpenAIGenerationModel = "gpt-5.6-terra";
export const defaultOpenAIReviewModel = "gpt-5.6-sol";
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
