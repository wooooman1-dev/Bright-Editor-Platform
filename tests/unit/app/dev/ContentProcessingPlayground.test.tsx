import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ContentProcessingPlayground,
  ContentProcessingResults,
} from "../../../../app/dev/content-processing/ContentProcessingPlayground";
import ContentProcessingPlaygroundPage from "../../../../app/dev/content-processing/page";
import {
  contentProcessingSamples,
  createPlaygroundState,
  playgroundReducer,
  runContentProcessing,
  summarizeValidation,
} from "../../../../app/dev/content-processing/playground";

describe("Content Processing Playground", () => {
  it("renders the development route successfully", () => {
    const html = renderToStaticMarkup(<ContentProcessingPlaygroundPage />);

    expect(html).toContain("Content Processing Playground");
  });

  it("renders the page controls and default valid sample", () => {
    const html = renderToStaticMarkup(<ContentProcessingPlayground />);

    expect(html).toContain("Content Processing Playground");
    expect(html).toContain("Run Pipeline");
    expect(html).toContain("Reset");
    expect(html).toContain("Valid Document");
    expect(html).toContain("valid-document");
  });

  it("runs the valid sample and renders metadata and optimized outcome", () => {
    const state = createPlaygroundState("valid");
    const result = runContentProcessing(state.input);

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    const html = renderToStaticMarkup(
      <ContentProcessingResults result={result} />,
    );

    expect(result.pipeline.validation.valid).toBe(true);
    expect(html).toContain("Processed Document");
    expect(html).toContain("Metadata");
    expect(html).toContain("wordCount");
    expect(html).toContain("Optimized successfully");
  });

  it("renders validation issues and skipped outcome for an invalid sample", () => {
    const state = createPlaygroundState("duplicateBlockId");
    const result = runContentProcessing(state.input);

    expect(result.status).toBe("success");
    if (result.status !== "success") return;

    const html = renderToStaticMarkup(
      <ContentProcessingResults result={result} />,
    );

    expect(html).toContain("DUPLICATE_BLOCK_ID");
    expect(html).toContain("Validation failed — optimizer skipped");
    expect(html).toContain("Metadata is unavailable");
  });

  it("reports invalid JSON without executing the Pipeline", () => {
    const pipeline = { process: vi.fn() };

    const result = runContentProcessing("{ invalid", pipeline);

    expect(result).toMatchObject({ status: "parse-error" });
    expect(pipeline.process).not.toHaveBeenCalled();
    expect(
      renderToStaticMarkup(<ContentProcessingResults result={result} />),
    ).toContain("Invalid JSON");
  });

  it("changes samples and resets edits to the selected sample", () => {
    const initial = createPlaygroundState();
    const selected = playgroundReducer(initial, {
      sample: "invalidVideoUrl",
      type: "select",
    });
    const edited = playgroundReducer(selected, {
      input: "custom input",
      type: "edit",
    });
    const reset = playgroundReducer(edited, { type: "reset" });

    expect(selected.input).toContain("invalid-video-url");
    expect(edited.input).toBe("custom input");
    expect(reset.input).toBe(selected.input);
  });

  it("includes every approved verification sample", () => {
    expect(Object.values(contentProcessingSamples).map((sample) => sample.label)).toEqual([
      "Valid Document",
      "Missing Image Alt",
      "Duplicate Block ID",
      "Invalid Video URL",
      "Invalid Heading Hierarchy",
      "Empty Paragraph",
      "Missing Block IDs",
      "Mixed Valid Blocks",
    ]);
  });

  it("summarizes Sprint 1-compatible validation results", () => {
    expect(
      summarizeValidation({
        issues: [{ code: "CUSTOM", message: "Custom issue" }],
        valid: false,
      }),
    ).toEqual({
      errorCount: undefined,
      infoCount: undefined,
      issueCount: 1,
      valid: false,
      warningCount: undefined,
    });
  });
});
