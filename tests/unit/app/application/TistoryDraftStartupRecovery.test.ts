import { describe, expect, it } from "vitest";

import {
  isRetryableDraftStartupFailure,
  normalizeDraftStartupFailure,
  runtimeFailureCode,
  runtimeFailureMessage,
} from "../../../../app/application/publishing/TistoryDraftStartupRecovery";
import type { TistoryDraftSaveResult } from "../../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

const base: TistoryDraftSaveResult = {
  saveClicked: false,
  saveNotificationDetected: false,
  draftIdDetected: false,
  draftListVerified: false,
  reopenedDraftVerified: false,
  titleMatched: false,
  bodyMatched: false,
  publicPostCreated: false,
  status: "failed",
  steps: [
    { key: "session_loaded", passed: true, message: "session loaded" },
    { key: "editor_opened", passed: true, message: "editor opened" },
    { key: "editor_ready", passed: true, message: "editor ready" },
  ],
  error: "Tistory 임시저장 작업을 완료하지 못했습니다.",
  diagnostic: {
    currentUrl: "https://bright-healthy.tistory.com/manage/newpost",
    runtimeFailure: {
      name: "TimeoutError",
      message: "locator.click: Timeout 30000ms exceeded at C:\\private\\worker.mjs",
    },
  },
};

describe("draft startup recovery", () => {
  it("retries an unclassified failure after successful pre-save steps", () => {
    expect(isRetryableDraftStartupFailure(base)).toBe(true);
  });

  it("normalizes repeated editor-ready failure as draft preflight with safe runtime detail", () => {
    const result = normalizeDraftStartupFailure(base, 2);

    expect(result.failedStep).toBe("draft_preflight");
    expect(result.error).toContain("임시저장 사전 확인 단계");
    expect(result.error).toContain("[local path]");
    expect(result.error).not.toContain("C:\\private");
    expect(result.steps?.at(-1)).toEqual(expect.objectContaining({
      key: "draft_preflight",
      diagnosticCode: "draft_preflight_timeouterror",
      evidence: expect.objectContaining({
        attempts: 2,
        completedSteps: ["session_loaded", "editor_opened", "editor_ready"],
        runtimeName: "TimeoutError",
      }),
    }));
  });

  it("does not retry after a workflow failure or external save click evidence", () => {
    expect(isRetryableDraftStartupFailure({
      ...base,
      failedStep: "category_applied",
      steps: [...(base.steps ?? []), { key: "category_applied", passed: false, message: "failed" }],
    })).toBe(false);
    expect(isRetryableDraftStartupFailure({ ...base, saveClicked: true })).toBe(false);
    expect(isRetryableDraftStartupFailure({ ...base, draftSaveClickCount: 1 })).toBe(false);
  });

  it("does not retry an application failure before the worker starts", () => {
    expect(isRetryableDraftStartupFailure({ ...base, steps: [] })).toBe(false);
  });

  it("builds stable runtime codes and user-facing messages", () => {
    expect(runtimeFailureCode({ name: "Target closed" }, "draft_preflight")).toBe("draft_preflight_target_closed");
    expect(runtimeFailureMessage(undefined, "editor_opened")).toBe("Tistory 글쓰기 화면 초기화에 실패했습니다. 다시 시도해 주세요.");
  });
});
