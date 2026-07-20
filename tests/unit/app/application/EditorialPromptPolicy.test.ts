import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync("app/api/studio/route.ts", "utf8");
const pipelineSource = readFileSync("app/application/EditorialQualityPipeline.ts", "utf8");

describe("editorial prompt policy", () => {
  it("keeps one non-conflicting long-form contract", () => {
    expect(routeSource).not.toContain("4,800–5,200");
    expect(routeSource).not.toContain("five to eight developed H2 sections");
    expect(routeSource).not.toContain("12–18 paragraph blocks");
    expect(routeSource).not.toContain("total paragraph text at or below 6,000");
    expect(pipelineSource).toContain("at least 4,800 non-whitespace prose characters, with no maximum character limit");
    expect(pipelineSource).toContain("not a fixed count");
  });
});
