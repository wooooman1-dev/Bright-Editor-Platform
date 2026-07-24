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
    expect(generationSource).toContain("server hard floor is 4,800");
    expect(generationSource).toContain("at least 5,500");
    expect(generationSource).toContain("target 6,000–6,500");
    expect(generationSource).toContain("Write six developed H2 sections by default");
    expect(generationSource).toContain("Every section must contain exactly eight developed paragraphs");
    expect(generationSource).toContain("exactly five substantive introduction paragraphs");
    expect(generationSource).toContain("Do not return blocks from the generation call");
    expect(providerSource).toContain('name: "structured_long_form_generation"');
    expect(providerSource).toContain("strict: true");
    expect(providerSource).toContain("minItems: 5, maxItems: 6");
    expect(pipelineSource).toContain("standard approval only");
  });
});
