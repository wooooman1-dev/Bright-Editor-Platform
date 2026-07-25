import { describe, expect, it } from "vitest";

import { classifyTistoryDraftOutcome } from "../../../../apps/tistory/workflows/TistoryDraftOutcome";
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
  steps: [],
};

describe("Tistory Draft outcome classification", () => {
  it("classifies a fully reopened Draft as verified", () => {
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      status: "saved",
      saveClicked: true,
      saveNotificationDetected: true,
      draftListVerified: true,
      reopenedDraftVerified: true,
      titleMatched: true,
      bodyMatched: true,
      editorUrl: "https://bright-healthy.tistory.com/manage/post/123",
    });

    expect(outcome).toEqual({
      status: "verified",
      editorUrl: "https://bright-healthy.tistory.com/manage/post/123",
      canReverify: false,
      canRetrySave: false,
    });
  });

  it("separates a confirmed save from a later reopen failure", () => {
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      status: "partial_failure",
      saveClicked: true,
      draftCountBefore: 0,
      draftCountAfter: 1,
      failedStep: "draft_reopened",
      diagnostic: { currentUrl: "https://bright-healthy.tistory.com/manage/newpost" },
      steps: [
        { key: "draft_save_clicked", passed: true, message: "clicked" },
        { key: "draft_save_confirmed", passed: true, message: "confirmed" },
        { key: "draft_reopened", passed: false, diagnosticCode: "draft_item_not_found", message: "not reopened" },
      ],
    });

    expect(outcome).toEqual({
      status: "saved_unverified",
      diagnosticCode: "draft_item_not_found",
      editorUrl: "https://bright-healthy.tistory.com/manage/newpost",
      canReverify: true,
      canRetrySave: false,
    });
  });

  it("does not treat a click without confirmed count growth as a saved Draft", () => {
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      status: "partial_failure",
      saveClicked: true,
      draftSaveClickCount: 1,
      failedStep: "draft_save_confirmed",
      steps: [
        { key: "draft_save_clicked", passed: true, message: "clicked" },
        { key: "draft_save_confirmed", passed: false, diagnosticCode: "draft_count_not_increased", message: "not confirmed" },
      ],
    });

    expect(outcome.status).toBe("failed");
    expect(outcome.canRetrySave).toBe(true);
  });

  it("classifies a detected same-title Draft without allowing another save", () => {
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      failedStep: "draft_reopened",
      diagnostic: { currentUrl: "https://bright-healthy.tistory.com/manage/post/123" },
      steps: [
        { key: "draft_reopened", passed: false, diagnosticCode: "duplicate_draft_exists", message: "duplicate" },
      ],
    });

    expect(outcome).toEqual({
      status: "duplicate_existing",
      diagnosticCode: "duplicate_draft_exists",
      editorUrl: "https://bright-healthy.tistory.com/manage/post/123",
      canReverify: true,
      canRetrySave: false,
    });
  });

  it("does not expose a non-Tistory diagnostic URL", () => {
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      diagnostic: { currentUrl: "https://example.com/manage/post/123" },
    });

    expect(outcome.editorUrl).toBeUndefined();
  });
});
