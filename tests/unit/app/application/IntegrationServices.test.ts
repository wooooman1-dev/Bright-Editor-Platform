import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

import { AIConfigurationError, OpenAIProvider } from "../../../../app/application/OpenAIProvider";
import { EditorialGenerationStrategy } from "../../../../app/application/EditorialGenerationStrategy";
import { JsonFileSnapshotDriver } from "../../../../app/application/JsonFileSnapshotDriver";
import { SnapshotPersistenceStore } from "../../../../core/data";

describe("integration infrastructure", () => {
  it("persists versioned state across store restarts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-studio-"));
    const file = join(directory, "state.json");
    const first = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(file));
    await first.set("workspaces", "workspace-1", { id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory", "wordpress"] } });
    const second = new SnapshotPersistenceStore(new JsonFileSnapshotDriver(file));
    expect(await second.get("workspaces", "workspace-1")).toEqual({ id: "workspace-1", name: "Studio", settings: { enabledPlatforms: ["tistory", "wordpress"] } });
    expect(JSON.parse(await readFile(file, "utf8")).schemaVersion).toBe(1);
  });

  it("does not silently replace corrupt persisted data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "bright-studio-corrupt-"));
    const file = join(directory, "state.json");
    await writeFile(file, "{corrupt", "utf8");
    const driver = new JsonFileSnapshotDriver(file);
    await expect(driver.read()).rejects.toThrow("could not be read safely");
    expect(await readFile(file, "utf8")).toBe("{corrupt");
  });

  it("reports missing AI configuration without making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(new OpenAIProvider(undefined).generate({ instruction: "test" })).rejects.toBeInstanceOf(AIConfigurationError);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("reports a non-ASCII API key before constructing an HTTP header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(new OpenAIProvider("잘못된-api-key").generate({ instruction: "test" })).rejects.toThrow(
      "OPENAI_API_KEY must contain only printable ASCII characters",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("requests sufficient output capacity only for long-form editorial calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ output_text: "{}" }), { status: 200 }));
    await new OpenAIProvider("sk-test", "gpt-5-mini").generate({ instruction: "write", metadata: { contentType: "long-form blog article", platform: "tistory" } });
    const body = JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[0]?.[1]?.body as Uint8Array));
    expect(body).toMatchObject({ max_output_tokens: 12_000, text: { format: { type: "json_schema", name: "canonical_content_document", schema: { required: ["title", "blocks"] } }, verbosity: "medium" } });
    await new OpenAIProvider("sk-test", "gpt-5-mini").generate({ instruction: "generate", metadata: { task: "content-generation", contentType: "long-form blog article", platform: "tistory" } });
    const generationBody = JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[1]?.[1]?.body as Uint8Array));
    expect(generationBody).toMatchObject({
      max_output_tokens: 11_000,
      text: {
        format: {
          name: "structured_standard_generation",
          strict: true,
          schema: {
            required: expect.arrayContaining(["tags", "introduction", "sections", "conclusion"]),
            properties: {
              introduction: {
                minItems: 1,
                maxItems: 8,
                items: { type: "string" },
              },
              sections: {
                minItems: 1,
                maxItems: 12,
                items: {
                  required: expect.arrayContaining(["sectionType"]),
                  properties: {
                    paragraphs: {
                      minItems: 1,
                      maxItems: 12,
                      items: { type: "string" },
                    },
                  },
                },
              },
              conclusion: {
                minItems: 1,
                maxItems: 8,
                items: { type: "string" },
              },
              images: {
                maxItems: 4,
                items: {
                  properties: {
                    afterSection: { type: "integer", minimum: 0 },
                    purpose: { type: "string", enum: ["hero", "comparison", "checklist", "infographic", "summary", "warning"] },
                    visual: { type: "string", enum: ["", "bar", "ratio", "steps", "timeline", "compare", "stat", "list"] },
                  },
                },
              },
            },
          },
        },
      },
    });
    await new OpenAIProvider("sk-test", "gpt-5-mini").generate({ instruction: "edit", metadata: { task: "quality-final-edit" } });
    const finalBody = JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[2]?.[1]?.body as Uint8Array));
    expect(finalBody).toMatchObject({ max_output_tokens: 12_000, text: { format: { type: "json_schema", name: "canonical_content_document", schema: { required: ["title", "blocks"] } }, verbosity: "high" } });
    await new OpenAIProvider("sk-test", "gpt-5-mini").generate({ instruction: "improve", metadata: { task: "quality-auto-improvement" } });
    const improvementBody = JSON.parse(new TextDecoder().decode(fetchSpy.mock.calls[3]?.[1]?.body as Uint8Array));
    expect(improvementBody).toMatchObject({ max_output_tokens: 12_000, text: { verbosity: "high" } });
    fetchSpy.mockRestore();
  });

  it("reports an incomplete Responses API result before parsing partial output", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "resp-test",
      model: "gpt-5.6-terra",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      usage: { output_tokens: 12_000 },
      output_text: "{}",
    }), { status: 200 }));
    const result = new OpenAIProvider("sk-test", "gpt-5.6-terra").generate({
      instruction: "generate",
      metadata: { task: "content-generation" },
    });
    await expect(result).rejects.toMatchObject({
      name: "AIProviderError",
      diagnostic: expect.objectContaining({
        stage: "generation",
        completionStatus: "incomplete_max_output_tokens",
        configuredMaxOutputTokens: 11_000,
        responseId: "resp-test",
        outputTokens: 12_000,
        structuredOutputPresent: true,
      }),
    });
    fetchSpy.mockRestore();
  });

  it.each([
    ["content-planning", "planning"],
    ["approval-source-preflight", "source_preflight"],
    ["content-generation", "generation"],
    ["quality-final-edit", "quality_review"],
  ] as const)("preserves the incomplete boundary for %s", async (task, stage) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: `resp-${stage}`,
      model: "gpt-test",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    }), { status: 200 }));
    await expect(new OpenAIProvider("sk-test", "gpt-test").generate({ instruction: "x", metadata: { task } }))
      .rejects.toMatchObject({ diagnostic: expect.objectContaining({ stage, completionStatus: "incomplete_max_output_tokens" }) });
    fetchSpy.mockRestore();
  });

  it("keeps content-filter incomplete distinct from token exhaustion", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      id: "resp-filter",
      model: "gpt-test",
      status: "incomplete",
      incomplete_details: { reason: "content_filter" },
    }), { status: 200 }));
    await expect(new OpenAIProvider("sk-test", "gpt-test").generate({ instruction: "x", metadata: { task: "approval-source-preflight" } }))
      .rejects.toMatchObject({ diagnostic: expect.objectContaining({ completionStatus: "incomplete_content_filter", stage: "source_preflight" }) });
    fetchSpy.mockRestore();
  });

  it("aborts the underlying Responses API request at the configured timeout without retrying", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    await expect(new OpenAIProvider("sk-test", "gpt-5.6-terra", 5).generate({
      instruction: "generate once",
      metadata: { task: "content-generation" },
    })).rejects.toThrow("timed out after 5ms");
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    fetchSpy.mockRestore();
  });

  it("converts one AI JSON response into canonical blocks and guarantees the hero image", () => {
    const strategy = new EditorialGenerationStrategy();
    const prose = "A complete and useful explanation for the reader with concrete context, actions, examples, and outcomes. ".repeat(20);
    const document = strategy.parse(JSON.stringify({ title: "Guide", blocks: [{ type: "paragraph", text: prose }, ...Array.from({ length: 5 }, (_, index) => [{ type: "heading", level: 2, text: `Step ${index + 1}` }, { type: "paragraph", text: prose }]).flat(), { type: "button", purpose: "cta", label: "Start", targetUrl: "https://example.com", target: "_blank" }] }), {
      contentType: "article" as never, keywords: ["guide"], platform: "tistory" as never, projectId: "project-1",
    });
    expect(document.blocks.map((block) => block.type)).toContain("button");
    expect(document.blocks.filter((block) => block.type === "image")).toHaveLength(1);
    expect(document.blocks.find((block) => block.type === "image")).toMatchObject({ type: "image", purpose: "hero", source: "" });
    expect(document.blocks).toHaveLength(13);
    expect(document.blocks.at(-1)).toMatchObject({ type: "button", purpose: "cta", target: "_blank" });
  });

  it("accepts a named canonical document wrapper from JSON-mode editorial output", () => {
    const strategy = new EditorialGenerationStrategy();
    const prose = "Complete connected explanation with concrete criteria, examples, cautions, and actions for the reader. ".repeat(20);
    const wrapped = { finalDocument: { title: "Wrapped guide", blocks: [{ type: "paragraph", text: prose }, ...Array.from({ length: 5 }, (_, index) => [{ type: "heading", level: 2, text: `Section ${index + 1}` }, { type: "paragraph", text: prose }]).flat()] } };
    expect(strategy.parse(JSON.stringify(wrapped), { contentType: "article" as never, keywords: ["guide"], platform: "tistory" as never, projectId: "project-1" }).title).toBe("Wrapped guide");
  });

  it("removes source-empty body image recommendations during canonical parsing", () => {
    const strategy = new EditorialGenerationStrategy();
    const prose = "독자가 실제로 따라 할 수 있도록 준비 기준과 동작, 확인 지점, 주의사항을 구체적으로 설명합니다. ".repeat(18);
    const response = { title: "중년 아침 운동 가이드", blocks: [
      { type: "paragraph", text: prose },
      { type: "heading", level: 2, text: "호흡과 어깨 준비" }, { type: "paragraph", text: prose }, { type: "image", source: "", purpose: "inline", alt: "호흡과 어깨 준비 자세", prompt: "중년 여성이 거실에서 스트레칭하는 모습" },
      { type: "heading", level: 2, text: "허리와 골반 위치" }, { type: "paragraph", text: prose }, { type: "image", source: "", purpose: "infographic", alt: "허리와 골반의 올바른 위치", prompt: "중년 여성이 거실에서 스트레칭하는 모습" },
      ...Array.from({ length: 3 }, (_, index) => [{ type: "heading", level: 2, text: `추가 실천 기준 ${index + 1}` }, { type: "paragraph", text: prose }]).flat(),
      { type: "paragraph", text: prose },
    ] };

    const document = strategy.parse(JSON.stringify(response), { contentId: "image-context", contentType: "article" as never, keywords: ["중년 아침 운동"], platform: "tistory" as never, projectId: "project-1" });
    // 본문 이미지 추천은 사라지고, 대표 이미지 한 장만 남는다.
    expect(document.blocks.filter((block) => block.type === "image")).toHaveLength(1);
    expect(document.blocks.find((block) => block.type === "image")).toMatchObject({ type: "image", purpose: "hero" });
  });

  it("lets a complete but shallow first pass reach the bounded final editorial review", () => {
    const strategy = new EditorialGenerationStrategy();
    const prose = "This is connected article prose with a concrete criterion, an example, a caution, and an action for the reader. ".repeat(10);
    const response = { title: "First pass", blocks: [{ type: "paragraph", text: prose }, ...Array.from({ length: 5 }, (_, index) => [{ type: "heading", level: 2, text: `Section ${index + 1}` }, { type: "paragraph", text: prose }]).flat()] };
    expect(strategy.parse(JSON.stringify(response), { contentType: "long-form blog article" as never, keywords: ["guide"], platform: "tistory" as never, projectId: "project-1" }).title).toBe("First pass");
  });

  it("rejects a planning outline instead of persisting it as an article", () => {
    const strategy = new EditorialGenerationStrategy();
    expect(() => strategy.parse('{"title":"기획안","blocks":[{"type":"paragraph","text":"1) 인트로\\n2) 준비물\\n3) 단계별 루틴\\n4) 결론"}]}', {
      contentType: "long-form blog" as never, keywords: ["루틴"], platform: "tistory" as never, projectId: "project-1",
    })).toThrow("planning outline");
  });
});
