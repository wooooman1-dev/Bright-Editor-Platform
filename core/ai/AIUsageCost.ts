import type { ContentDocument } from "../content";

export const aiUsageStages = [
  "planning",
  "generation",
  "quality_review",
  "revision",
  "quality_improvement",
  "other",
] as const;

export type AIUsageStage = (typeof aiUsageStages)[number];
export type AIUsagePricingStatus = "estimated_standard" | "unknown_model" | "usage_incomplete";

export type AIUsageRecord = Readonly<{
  version: "1.0";
  stage: AIUsageStage;
  task: string;
  model: string;
  responseId?: string;
  recordedAt: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  webSearchCalls: number;
  estimatedCostUsd?: number;
  pricingStatus: AIUsagePricingStatus;
}>;

export type AIUsageInput = Readonly<{
  stage: AIUsageStage;
  task: string;
  model: string;
  responseId?: string;
  recordedAt: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  webSearchCalls?: number;
}>;

type ModelPrice = Readonly<{
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
}>;

const WEB_SEARCH_CALL_USD = 0.01;
const LONG_CONTEXT_THRESHOLD = 272_000;

export function aiUsageStageForTask(task: string | undefined): AIUsageStage {
  switch (task) {
    case "content-planning": return "planning";
    case "content-generation": return "generation";
    case "quality-final-edit": return "quality_review";
    case "content-revision": return "revision";
    case "quality-improvement":
    case "quality-auto-improvement": return "quality_improvement";
    default: return "other";
  }
}

export function createAIUsageRecord(input: AIUsageInput): AIUsageRecord {
  const inputTokens = nonNegativeInteger(input.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, nonNegativeInteger(input.cachedInputTokens));
  const cacheWriteTokens = Math.min(
    Math.max(0, inputTokens - cachedInputTokens),
    nonNegativeInteger(input.cacheWriteTokens),
  );
  const outputTokens = nonNegativeInteger(input.outputTokens);
  const reasoningTokens = Math.min(outputTokens, nonNegativeInteger(input.reasoningTokens));
  const totalTokens = nonNegativeInteger(input.totalTokens) || inputTokens + outputTokens;
  const webSearchCalls = nonNegativeInteger(input.webSearchCalls);
  const price = modelPrice(input.model);
  const usageComplete = input.inputTokens !== undefined && input.outputTokens !== undefined;
  const pricingStatus: AIUsagePricingStatus = !usageComplete
    ? "usage_incomplete"
    : price
      ? "estimated_standard"
      : "unknown_model";
  const estimatedCostUsd = price && usageComplete
    ? estimateCostUsd({
        inputTokens,
        cachedInputTokens,
        cacheWriteTokens,
        outputTokens,
        webSearchCalls,
        price,
      })
    : undefined;

  return Object.freeze({
    version: "1.0",
    stage: input.stage,
    task: input.task,
    model: input.model,
    ...(input.responseId ? { responseId: input.responseId } : {}),
    recordedAt: input.recordedAt,
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    webSearchCalls,
    ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    pricingStatus,
  });
}

export function appendAIUsageRecord(
  records: readonly AIUsageRecord[] | undefined,
  record: AIUsageRecord | undefined,
): readonly AIUsageRecord[] {
  if (!record) return Object.freeze([...(records ?? [])]);
  const current = records ?? [];
  const key = usageRecordKey(record);
  return Object.freeze([
    ...current.filter((item) => usageRecordKey(item) !== key),
    record,
  ]);
}

export function appendAIUsageToDocument(
  document: ContentDocument,
  record: AIUsageRecord | undefined,
): ContentDocument {
  if (!record || !document.metadata) return document;
  return Object.freeze({
    ...document,
    metadata: Object.freeze({
      ...document.metadata,
      aiUsage: appendAIUsageRecord(document.metadata.aiUsage, record),
    }),
  });
}

export function totalAIUsageCostUsd(records: readonly AIUsageRecord[]): number | undefined {
  if (!records.length || records.some((item) => item.estimatedCostUsd === undefined)) return undefined;
  return roundUsd(records.reduce((sum, item) => sum + (item.estimatedCostUsd ?? 0), 0));
}

export function totalAIUsageTokens(records: readonly AIUsageRecord[]): number {
  return records.reduce((sum, item) => sum + item.totalTokens, 0);
}

function estimateCostUsd(input: Readonly<{
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  price: ModelPrice;
}>): number {
  const regularInputTokens = Math.max(
    0,
    input.inputTokens - input.cachedInputTokens - input.cacheWriteTokens,
  );
  const longContext = input.inputTokens > LONG_CONTEXT_THRESHOLD;
  const inputMultiplier = longContext ? 2 : 1;
  const outputMultiplier = longContext ? 1.5 : 1;
  const tokenCost = (
    regularInputTokens * input.price.inputPerMillionUsd * inputMultiplier
    + input.cachedInputTokens * input.price.cachedInputPerMillionUsd * inputMultiplier
    + input.cacheWriteTokens * input.price.inputPerMillionUsd * 1.25 * inputMultiplier
    + input.outputTokens * input.price.outputPerMillionUsd * outputMultiplier
  ) / 1_000_000;
  return roundUsd(tokenCost + input.webSearchCalls * WEB_SEARCH_CALL_USD);
}

function modelPrice(model: string): ModelPrice | undefined {
  const normalized = model.toLocaleLowerCase("en-US");
  if (normalized.startsWith("gpt-5.6-terra")) {
    return Object.freeze({ inputPerMillionUsd: 2.5, cachedInputPerMillionUsd: 0.25, outputPerMillionUsd: 15 });
  }
  if (normalized.startsWith("gpt-5.6-luna")) {
    return Object.freeze({ inputPerMillionUsd: 1, cachedInputPerMillionUsd: 0.1, outputPerMillionUsd: 6 });
  }
  if (normalized === "gpt-5.6" || normalized.startsWith("gpt-5.6-sol")) {
    return Object.freeze({ inputPerMillionUsd: 5, cachedInputPerMillionUsd: 0.5, outputPerMillionUsd: 30 });
  }
  return undefined;
}

function usageRecordKey(record: AIUsageRecord): string {
  return record.responseId
    ? `response:${record.responseId}`
    : [record.stage, record.task, record.model, record.recordedAt, record.totalTokens].join(":");
}

function nonNegativeInteger(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
