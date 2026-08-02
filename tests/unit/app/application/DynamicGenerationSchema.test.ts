import { describe, expect, it } from "vitest";

import { structuredGenerationFormat } from "../../../../app/application/OpenAIProvider";
import { determineContentPlanQualityTarget } from "../../../../core/content";

describe("structured generation schema", () => {
  it.each(["standard", "deep health guide", "product comparison"])("keeps strict structure without character-length constraints for %s", (contentType) => {
    const format = structuredGenerationFormat(determineContentPlanQualityTarget({ contentType }));
    const paragraphItem = format.schema.properties.sections.items.properties.paragraphs.items;

    expect(format.strict).toBe(true);
    expect(format.schema.properties.sections).toMatchObject({ minItems: 1, maxItems: 12 });
    expect(format.schema.properties.sections.items.required).toEqual(["heading", "sectionType", "paragraphs"]);
    expect(format.schema.required).toEqual(expect.arrayContaining(["seoTitle", "tags", "images", "cta"]));
    expect(format.schema.properties.seoTitle).toEqual({ type: "string" });
    expect(paragraphItem).toEqual({ type: "string" });
    expect(JSON.stringify(format.schema)).not.toContain("minLength");
  });
});
