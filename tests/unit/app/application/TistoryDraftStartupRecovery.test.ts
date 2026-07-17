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
  error: "failed",
};

describe("draft startup recovery", () => {
  it("classifies an unstructured startup failure", () => {
    expect(isRetryableDraftStartupFailure(base)).toBe(true);
    const result = normalizeDraftStartupFailure(base, 2);
    expect(result.failedStep).toBe("editor_opened");
    expect(result.steps?.at(-1)?.diagnosticCode).toBe("editor_startup_failed");
  });

  it("keeps a structured failure unchanged", () => {
    const structured = { ...base, failedStep: "editor_ready" as const };
    expect(isRetryableDraftStartupFailure(structured)).toBe(false);
    expect(normalizeDraftStartupFailure(structured, 2)).toBe(structured);
  });
});
