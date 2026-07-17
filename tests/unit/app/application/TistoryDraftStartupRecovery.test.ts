import { describe, expect, it } from "vitest";

import { isRetryableDraftStartupFailure, normalizeDraftStartupFailure } from "../../../../app/application/publishing/TistoryDraftStartupRecovery";

const base = {
  saveClicked: false,
  saveNotificationDetected: false,
  draftIdDetected: false,
  draftListVerified: false,
  reopenedDraftVerified: false,
  titleMatched: false,
  bodyMatched: false,
  publicPostCreated: false as const,
  status: "failed" as const,
  steps: [
    { key: "session_loaded" as const, passed: true, message: "session loaded" },
  ],
  error: "Tistory 임시저장 작업을 완료하지 못했습니다.",
};

describe("draft startup recovery", () => {
  it("retries an unclassified startup failure after completed pre-save steps", () => {
    expect(isRetryableDraftStartupFailure(base)).toBe(true);
    const result = normalizeDraftStartupFailure(base, 2);
    expect(result.failedStep).toBe("editor_opened");
    expect(result.steps?.at(-1)).toEqual(expect.objectContaining({
      diagnosticCode: "editor_startup_failed",
      evidence: expect.objectContaining({
        attempts: 2,
        completedSteps: ["session_loaded"],
      }),
    }));
  });

  it("does not retry a recorded workflow failure", () => {
    const known = {
      ...base,
      failedStep: "editor_ready" as const,
      steps: [...base.steps, { key: "editor_ready" as const, passed: false, diagnosticCode: "not_ready", message: "not ready" }],
    };
    expect(isRetryableDraftStartupFailure(known)).toBe(false);
    expect(normalizeDraftStartupFailure(known, 2)).toBe(known);
  });

  it("does not retry after any external draft save click evidence", () => {
    expect(isRetryableDraftStartupFailure({ ...base, saveClicked: true })).toBe(false);
    expect(isRetryableDraftStartupFailure({ ...base, draftSaveClickCount: 1 })).toBe(false);
    expect(isRetryableDraftStartupFailure({
      ...base,
      steps: [...base.steps, { key: "draft_save_clicked" as const, passed: true, message: "clicked" }],
    })).toBe(false);
  });

  it("does not retry an application precondition failure before the worker starts", () => {
    const precondition = { ...base, steps: [], error: "The selected account is not a Project publishing target." };
    expect(isRetryableDraftStartupFailure(precondition)).toBe(false);
  });
});
