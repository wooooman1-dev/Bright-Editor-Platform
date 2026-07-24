import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("app/api/studio/route.ts", "utf8");
const pipelineSource = readFileSync("app/application/EditorialQualityPipeline.ts", "utf8");
const generationSource = readFileSync("app/application/EditorialGenerationStrategy.ts", "utf8");
const providerSource = readFileSync("app/application/OpenAIProvider.ts", "utf8");

describe("editorial prompt policy", () => {
  it("keeps one non-conflicting long-form contract", () => {
    expect(routeSource).not.toContain("4,800–5,200");
    expect(routeSource).not.toContain("five to eight developed H2 sections");
    expect(routeSource).not.toContain("12–18 paragraph blocks");
    expect(routeSource).not.toContain("total paragraph text at or below 6,000");
    expect(generationSource).toContain("Planning information contract");
    expect(generationSource).toContain("missing, merely mentioned, or sufficiently explained");
    expect(generationSource).toContain("Prefer the shorter result when quality is equal");
    expect(generationSource).not.toContain("target.targetLengthRange");
    expect(generationSource).not.toContain("target.targetSectionCount");
    expect(generationSource).not.toContain("safety floor");
    expect(generationSource).toContain("declared sectionType");
    expect(generationSource).toContain("Do not return blocks from the generation call");
    expect(providerSource).toContain("strict: true");
    expect(providerSource).not.toContain("minLength");
    expect(pipelineSource).toContain("standard approval only");
    expect(pipelineSource).toContain("Do not broadly rewrite strong sections or expand the manuscript");
    expect(pipelineSource).not.toContain("Current prose length");
  });
});
