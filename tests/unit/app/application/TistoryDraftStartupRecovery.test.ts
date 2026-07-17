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
  steps: [],
  error: "Tistory 임시저장 작업을 완료하지 못했습니다.",
};

describe("draft startup recovery", () => {
  it("classifies the generic startup result", () => {
    expect(isRetryableDraftStartupFailure(base)).toBe(true);
    const result = normalizeDraftStartupFailure(base, 2);
    expect(result.failedStep).toBe("editor_opened");
    expect(result.steps?.at(-1)?.diagnosticCode).toBe("editor_startup_failed");
  });

  it("keeps a known failure unchanged", () => {
    const known = { ...base, failedStep: "editor_ready" as const };
    expect(isRetryableDraftStartupFailure(known)).toBe(false);
    expect(normalizeDraftStartupFailure(known, 2)).toBe(known);
  });
});
