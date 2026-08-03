import { describe, expect, it } from "vitest";

import {
  aiUsageStageForTask,
  appendAIUsageRecord,
  createAIUsageRecord,
  totalAIUsageCostUsd,
  totalAIUsageTokens,
} from "../../../../core/ai";

describe("AI usage cost ledger", () => {
  it("classifies approval source discovery as source preflight", () => {
    expect(aiUsageStageForTask("approval-source-preflight")).toBe("source_preflight");
  });

  it("calculates GPT-5.6 Terra standard token cost", () => {
    const record = createAIUsageRecord({
      stage: "generation",
      task: "content-generation",
      model: "gpt-5.6-terra",
      responseId: "resp-terra",
      recordedAt: "2026-08-02T00:00:00.000Z",
      inputTokens: 100_000,
      outputTokens: 100_000,
      totalTokens: 200_000,
    });
    expect(record.estimatedCostUsd).toBe(1.75);
    expect(record.pricingStatus).toBe("estimated_standard");
  });

  it("separates cached input and cache-write tokens", () => {
    const record = createAIUsageRecord({
      stage: "quality_review",
      task: "quality-final-edit",
      model: "gpt-5.6-sol",
      responseId: "resp-sol",
      recordedAt: "2026-08-02T00:00:00.000Z",
      inputTokens: 100_000,
      cachedInputTokens: 40_000,
      cacheWriteTokens: 10_000,
      outputTokens: 10_000,
      totalTokens: 110_000,
    });
    expect(record.estimatedCostUsd).toBe(0.6325);
  });

  it("applies long-context pricing above 272K input tokens", () => {
    const record = createAIUsageRecord({
      stage: "generation",
      task: "content-generation",
      model: "gpt-5.6-luna",
      responseId: "resp-long",
      recordedAt: "2026-08-02T00:00:00.000Z",
      inputTokens: 300_000,
      outputTokens: 100_000,
      totalTokens: 400_000,
    });
    expect(record.estimatedCostUsd).toBe(1.5);
  });

  it("adds web-search request cost and de-duplicates the same response", () => {
    const record = createAIUsageRecord({
      stage: "source_preflight",
      task: "approval-source-preflight",
      model: "gpt-5.6-terra",
      responseId: "resp-web",
      recordedAt: "2026-08-02T00:00:00.000Z",
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
      webSearchCalls: 2,
    });
    const records = appendAIUsageRecord(appendAIUsageRecord([], record), record);
    expect(records).toHaveLength(1);
    expect(totalAIUsageTokens(records)).toBe(1_500);
    expect(totalAIUsageCostUsd(records)).toBe(record.estimatedCostUsd);
  });

  it("does not invent a price for an unknown model or incomplete usage", () => {
    const unknown = createAIUsageRecord({
      stage: "other",
      task: "unknown",
      model: "future-model",
      recordedAt: "2026-08-02T00:00:00.000Z",
      inputTokens: 100,
      outputTokens: 100,
    });
    const incomplete = createAIUsageRecord({
      stage: "other",
      task: "unknown",
      model: "gpt-5.6-terra",
      recordedAt: "2026-08-02T00:00:00.000Z",
      outputTokens: 100,
    });
    expect(unknown.pricingStatus).toBe("unknown_model");
    expect(incomplete.pricingStatus).toBe("usage_incomplete");
    expect(totalAIUsageCostUsd([unknown])).toBeUndefined();
  });
});
