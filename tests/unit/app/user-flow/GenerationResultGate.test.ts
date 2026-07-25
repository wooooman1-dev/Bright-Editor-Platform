import { describe, expect, it } from "vitest";

import { generatedDocumentEditable, generatedDocumentReady } from "../../../../app/user-flow/generation-result";

const document = { id: "content-1", title: "Approved", blocks: [] } as never;
const quality = { approved: true, approvalType: "standard" } as never;

describe("GenerationResultGate", () => {
  it("allows only standard approved target-reaching documents", () => {
    expect(generatedDocumentReady({ document, quality, reachedTarget: true })).toBe(true);
    expect(generatedDocumentReady({ document, quality: { approved: true, approvalType: "exception" } as never, reachedTarget: true })).toBe(false);
  });

  it("blocks recovery manuscripts below the target", () => {
    expect(generatedDocumentReady({ document, quality: { approved: false } as never, reachedTarget: false, qualityTargetBlocked: true })).toBe(false);
    expect(generatedDocumentReady({ document, quality, reachedTarget: false, qualityTargetBlocked: true })).toBe(false);
  });

  it("blocks incomplete responses", () => {
    expect(generatedDocumentReady({ quality, reachedTarget: true })).toBe(false);
    expect(generatedDocumentReady({ document, reachedTarget: true })).toBe(false);
  });

  it("keeps an unapproved generated document editable without marking it ready", () => {
    const result = {
      document,
      quality: { approved: false } as never,
      reachedTarget: false,
      qualityTargetBlocked: true,
    };
    expect(generatedDocumentEditable(result)).toBe(true);
    expect(generatedDocumentReady(result)).toBe(false);
    expect(generatedDocumentEditable({ quality, reachedTarget: false })).toBe(false);
  });
});
