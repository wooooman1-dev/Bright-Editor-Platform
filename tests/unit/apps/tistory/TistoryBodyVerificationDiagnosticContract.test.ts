import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeTistoryDraftWorkerResult } from "../../../../app/application/publishing/TistoryDraftApplicationService";
import { semanticHtmlDiagnosticCode, semanticHtmlVerified } from "../../../../apps/tistory/workflows/tistory-body-editor.mjs";
import type { TistoryDraftSaveResult } from "../../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

const draftWorkerSource = readFileSync(
  join(process.cwd(), "apps/tistory/workflows/tistory-draft-worker.mjs"),
  "utf8",
);

const completeEvidence = Object.freeze({
  textLengthWithinTolerance: true,
  firstParagraphMatched: true,
  paragraphCount: 4,
  h2Matched: true,
  tocMatched: true,
  internalLinksMatched: true,
  relatedLinksMatched: true,
  ctaLinksMatched: true,
  invalidPlaceholderLinks: 0,
  imagesMatched: true,
});

function failedResult(): TistoryDraftSaveResult {
  return {
    saveClicked: false,
    saveNotificationDetected: false,
    draftIdDetected: false,
    draftListVerified: false,
    reopenedDraftVerified: false,
    titleMatched: false,
    bodyMatched: false,
    publicPostCreated: false,
    status: "failed",
    failedStep: "body_verified",
    error: "Tistory 기본모드에서 Renderer HTML 본문을 확인하지 못했습니다.",
    steps: [
      { key: "body_filled", passed: true, message: "본문 입력 완료" },
      { key: "body_verified", passed: false, diagnosticCode: "body_verification_failed", message: "본문 확인 실패" },
    ],
  };
}

describe("Tistory body verification diagnostics", () => {
  it("returns a specific semantic mismatch code", () => {
    expect(semanticHtmlDiagnosticCode({ ...completeEvidence, imagesMatched: false })).toBe("rendered_image_mismatch");
    expect(semanticHtmlDiagnosticCode({ ...completeEvidence, internalLinksMatched: false })).toBe("rendered_internal_link_missing");
    expect(semanticHtmlDiagnosticCode(completeEvidence)).toBeUndefined();
  });

  it("accepts native images added after marker-only HTML verification", () => {
    expect(semanticHtmlDiagnosticCode({
      ...completeEvidence,
      imagesMatched: false,
      expectedImageCount: 0,
      imageCount: 3,
    })).toBeUndefined();
  });

  it("still rejects a missing expected image", () => {
    expect(semanticHtmlDiagnosticCode({
      ...completeEvidence,
      imagesMatched: false,
      expectedImageCount: 3,
      imageCount: 0,
    })).toBe("rendered_image_mismatch");
  });

  it("counts reopened native images from the TinyMCE body DOM", () => {
    expect(draftWorkerSource).toContain('window.tinymce?.activeEditor?.getBody?.()');
    expect(draftWorkerSource).toContain('imageEvidenceSource: actualImageEvidence.editorAvailable ? "tinymce_body_dom" : "serialized_html"');
    expect(draftWorkerSource).toContain("const observedImages = actualImageEvidence.editorAvailable ? actualImageEvidence.images : found.images");
  });

  it("keeps the semantic verifier boolean contract", () => {
    expect(semanticHtmlVerified(completeEvidence)).toBe(true);
    expect(semanticHtmlVerified({ ...completeEvidence, tocMatched: false })).toBe(false);
  });

  it("replaces the generic worker failure with stderr semantic evidence", () => {
    const evidence = { ...completeEvidence, imagesMatched: false, expectedImageCount: 3, imageCount: 2 };
    const stderr = `[tistory-semantic-html] ${JSON.stringify({ code: "rendered_image_mismatch", evidence })}\n[tistory-draft-worker] body_verified:body_verification_failed\n`;

    const normalized = normalizeTistoryDraftWorkerResult(failedResult(), stderr);

    expect(normalized.failedStep).toBe("body_verified");
    expect(normalized.steps?.find((step) => !step.passed)).toMatchObject({
      key: "body_verified",
      diagnosticCode: "rendered_image_mismatch",
      evidence,
    });
    expect(normalized.verification).toEqual(evidence);
    expect(normalized.diagnostic?.semanticHtml).toEqual({ code: "rendered_image_mismatch", evidence });
  });

  it("leaves unrelated worker failures unchanged", () => {
    const result = failedResult();
    expect(normalizeTistoryDraftWorkerResult(result, "[tistory-draft-worker] body_verified:body_verification_failed\n")).toBe(result);
  });
});
