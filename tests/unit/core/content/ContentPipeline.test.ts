import { describe, expect, it, vi } from "vitest";

import {
  ContentPipeline,
  type ContentDocument,
  type ContentValidationResult,
} from "../../../../core/content";

describe("ContentPipeline", () => {
  it("orchestrates normalize, validate, and optimize in order", () => {
    const calls: string[] = [];
    const input: ContentDocument = { blocks: [], id: "input", title: "Input" };
    const normalized: ContentDocument = { ...input, id: "normalized" };
    const optimized: ContentDocument = { ...input, id: "optimized" };
    const validation: ContentValidationResult = {
      issues: [],
      valid: true,
    };
    const normalizer = {
      normalize: vi.fn(() => {
        calls.push("normalize");
        return normalized;
      }),
    };
    const validator = {
      validate: vi.fn(() => {
        calls.push("validate");
        return validation;
      }),
    };
    const optimizer = {
      optimize: vi.fn(() => {
        calls.push("optimize");
        return optimized;
      }),
    };

    const result = new ContentPipeline({ normalizer, optimizer, validator }).process(input);

    expect(calls).toEqual(["normalize", "validate", "optimize"]);
    expect(validator.validate).toHaveBeenCalledWith(normalized);
    expect(optimizer.optimize).toHaveBeenCalledWith(normalized);
    expect(result).toEqual({ document: optimized, validation });
  });

  it("returns normalized content without optimizing when validation fails", () => {
    const calls: string[] = [];
    const input: ContentDocument = { blocks: [], id: "input", title: "Input" };
    const normalized: ContentDocument = { ...input, id: "normalized" };
    const validation: ContentValidationResult = {
      issues: [{ code: "INVALID", message: "Invalid" }],
      valid: false,
    };
    const normalizer = {
      normalize: vi.fn(() => {
        calls.push("normalize");
        return normalized;
      }),
    };
    const validator = {
      validate: vi.fn(() => {
        calls.push("validate");
        return validation;
      }),
    };
    const optimizer = {
      optimize: vi.fn(() => {
        calls.push("optimize");
        return input;
      }),
    };

    const result = new ContentPipeline({ normalizer, optimizer, validator }).process(input);

    expect(calls).toEqual(["normalize", "validate"]);
    expect(optimizer.optimize).not.toHaveBeenCalled();
    expect(result).toEqual({ document: normalized, validation });
  });

  it("returns unsupported runtime blocks as validation errors without throwing", () => {
    const document = {
      blocks: [{ id: "unsupported", type: "unknown-widget" }],
      id: "document",
      title: "Title",
    } as unknown as ContentDocument;

    const process = () => new ContentPipeline().process(document);

    expect(process).not.toThrow();
    expect(process()).toMatchObject({
      document,
      validation: { valid: false },
    });
  });

  it("processes canonical tables through the default processors", () => {
    const result = new ContentPipeline().process({
      id: "table-document",
      title: " Table ",
      blocks: [{
        id: "table",
        type: "table",
        headers: [" Criterion ", " Value "],
        rows: [[" Platform ", " Independent "]],
      }],
    });

    expect(result.validation.valid).toBe(true);
    expect(result.document.blocks).toEqual([{
      id: "table",
      type: "table",
      headers: ["Criterion", "Value"],
      rows: [["Platform", "Independent"]],
    }]);
  });

  it("optimizes when validation contains non-blocking issues", () => {
    const document: ContentDocument = { blocks: [], id: "document", title: "Title" };
    const validation: ContentValidationResult = {
      issues: [{ code: "WARNING", message: "Non-blocking warning" }],
      valid: true,
    };
    const optimizer = { optimize: vi.fn(() => document) };

    const result = new ContentPipeline({
      optimizer,
      validator: { validate: vi.fn(() => validation) },
    }).process(document);

    expect(optimizer.optimize).toHaveBeenCalledOnce();
    expect(result.validation).toBe(validation);
  });

  it("processes documents with the default processors", () => {
    const result = new ContentPipeline().process({
      blocks: [{ id: "", text: " Content ", type: "paragraph" }],
      id: "document",
      title: " Title ",
    });

    expect(result.validation.valid).toBe(true);
    expect(result.document).toMatchObject({
      id: "document",
      title: "Title",
    });
    expect(result.document.blocks[0]).toMatchObject({ id: "paragraph-1" });
    expect(result.document.metadata).toBeDefined();
  });
});
