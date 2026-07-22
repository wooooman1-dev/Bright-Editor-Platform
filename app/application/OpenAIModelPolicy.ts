export const defaultOpenAIGenerationModel = "gpt-5.6-terra";
export const defaultOpenAIReviewModel = "gpt-5.6-sol";

export type OpenAIModelPolicy = Readonly<{
  generationModel: string;
  reviewModel: string;
}>;

export function resolveOpenAIModelPolicy(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): OpenAIModelPolicy {
  return Object.freeze({
    generationModel: configuredModel(environment.OPENAI_GENERATION_MODEL, defaultOpenAIGenerationModel),
    reviewModel: configuredModel(environment.OPENAI_REVIEW_MODEL, defaultOpenAIReviewModel),
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

function configuredModel(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}
