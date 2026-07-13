import type { ContentDocument } from "../../core/content";
import type { ContentGenerationStrategy, GenerationInput } from "../../core/ai";

export class EditorialGenerationStrategy implements ContentGenerationStrategy {
  createRequest(input: GenerationInput) {
    return {
      instruction: `Create one complete editorial package for ${input.contentType} on ${input.platform} about: ${input.keywords.join(", ")}.
Confirmed editorial context: ${input.editorialContext ?? "Use the supplied keywords and content type."}
Include search intent, reader analysis, plan, article, SEO, image strategy, CTA strategy, internal-link strategy, and final editing in one call.
Return JSON only: {"title":"...","blocks":[{"type":"heading","level":1,"text":"..."},{"type":"paragraph","text":"..."},{"type":"image","source":"","alt":"..."},{"type":"button","label":"...","targetUrl":"/..."}]}.`,
    };
  }

  parse(response: string, input: GenerationInput): ContentDocument {
    const value = JSON.parse(stripFence(response)) as { title?: unknown; blocks?: unknown[] };
    if (typeof value.title !== "string" || !Array.isArray(value.blocks)) throw new Error("AI response is not a valid Content Model.");
    const blocks = value.blocks.map((block, index) => parseBlock(block, index));
    return Object.freeze({ blocks: Object.freeze(blocks), id: input.contentId ?? `content-${input.projectId}-${Date.now()}`, title: value.title.trim() });
  }
}

function parseBlock(value: unknown, index: number): ContentDocument["blocks"][number] {
  if (!value || typeof value !== "object" || !("type" in value)) throw new Error("AI returned an invalid content block.");
  const block = value as Record<string, unknown>;
  const id = `block-${index + 1}`;
  if (block.type === "heading" && typeof block.text === "string") return { id, level: normalizeLevel(block.level), text: block.text, type: "heading" };
  if (block.type === "paragraph" && typeof block.text === "string") return { id, text: block.text, type: "paragraph" };
  if (block.type === "image" && typeof block.alt === "string") return { alt: block.alt, id, source: typeof block.source === "string" ? block.source : "", type: "image" };
  if (block.type === "button" && typeof block.label === "string" && typeof block.targetUrl === "string") return { id, label: block.label, targetUrl: block.targetUrl, type: "button" };
  throw new Error(`AI returned unsupported block ${index + 1}.`);
}
function normalizeLevel(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 { return typeof value === "number" && value >= 1 && value <= 6 ? value as 1 | 2 | 3 | 4 | 5 | 6 : 2; }
function stripFence(value: string): string { return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); }
