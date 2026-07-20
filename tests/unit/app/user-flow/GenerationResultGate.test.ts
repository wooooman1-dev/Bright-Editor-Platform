import { describe, expect, it } from "vitest";

import { diagnosticDocumentAvailable, generatedDocumentReady } from "../../../../app/user-flow/generation-result";

const document = { id: "content-1", title: "Approved", blocks: [] } as never;
const quality = { approved: true, approvalType: "standard" } as never;

describe("GenerationResultGate", () => {
  it("allows standard and exception approved target-reaching documents", () => {
    expect(generatedDocumentReady({ document, quality, reachedTarget: true })).toBe(true);
    expect(generatedDocumentReady({ document, quality: { approved: true, approvalType: "exception" } as never, reachedTarget: true })).toBe(true);
  });

  it("blocks recovery manuscripts below the target", () => {
    expect(generatedDocumentReady({ document, quality: { approved: false } as never, reachedTarget: false, qualityTargetBlocked: true })).toBe(false);
    expect(generatedDocumentReady({ document, quality, reachedTarget: false, qualityTargetBlocked: true })).toBe(false);
  });

  it("blocks incomplete responses", () => {
    expect(generatedDocumentReady({ quality, reachedTarget: true })).toBe(false);
    expect(generatedDocumentReady({ document, reachedTarget: true })).toBe(false);
  });
});


describe("temporary diagnostic editor access", () => {
  it("allows a persisted quality-blocked manuscript to open for diagnosis", () => {
    const quality = { approved: false } as never;
    expect(diagnosticDocumentAvailable({ data: {} as never, quality, reachedTarget: false, qualityTargetBlocked: true })).toBe(true);
  });

  it("does not open diagnostic access when no persisted manuscript state exists", () => {
    const quality = { approved: false } as never;
    expect(diagnosticDocumentAvailable({ quality, reachedTarget: false, qualityTargetBlocked: true })).toBe(false);
  });
});
