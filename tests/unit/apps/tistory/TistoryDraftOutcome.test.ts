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

  it("shows success when only the reopened Tistory representative UI was not rehydrated", () => {
    const passed = (key: NonNullable<TistoryDraftSaveResult["steps"]>[number]["key"]) => ({ key, passed: true, message: key });
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      status: "partial_failure",
      saveClicked: true,
      draftCountBefore: 3,
      draftCountAfter: 4,
      steps: [
        passed("draft_save_confirmed"),
        passed("title_reverified"),
        passed("body_reverified"),
        passed("media_reverified"),
        passed("representative_image_verified"),
        passed("representative_persisted_verified"),
        { key: "representative_reverified", passed: false, warning: true, diagnosticCode: "tistory_representative_ui_not_rehydrated", message: "not rehydrated" },
        passed("category_reverified"),
        passed("tags_reverified"),
        passed("structure_verified"),
        passed("publication_state_verified"),
        passed("draft_verified"),
      ],
    });

    expect(outcome).toMatchObject({
      status: "verified",
      diagnosticCode: "tistory_representative_ui_not_rehydrated",
      canReverify: false,
      canRetrySave: false,
    });
  });

  it("shows success when Tistory omits the draft thumbnail after every pre-save check passed", () => {
    const passed = (key: NonNullable<TistoryDraftSaveResult["steps"]>[number]["key"]) => ({ key, passed: true, message: key });
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      status: "partial_failure",
      saveClicked: true,
      draftCountBefore: 4,
      draftCountAfter: 5,
      steps: [
        passed("category_verified"),
        passed("title_verified"),
        passed("body_verified"),
        passed("tags_verified"),
        passed("representative_image_verified"),
        passed("draft_save_confirmed"),
        { key: "representative_persisted_verified", passed: false, diagnosticCode: "representative_persisted_thumbnail_missing", message: "missing" },
      ],
    });

    expect(outcome).toEqual({
      status: "verified",
      diagnosticCode: "representative_persisted_thumbnail_missing",
      canReverify: false,
      canRetrySave: false,
    });
  });

  it("does not show success when representative persistence or another required verification failed", () => {
    const persistedMissing = classifyTistoryDraftOutcome({
      ...base,
      status: "partial_failure",
      saveClicked: true,
      draftCountBefore: 3,
      draftCountAfter: 4,
      steps: [
        { key: "draft_save_confirmed", passed: true, message: "confirmed" },
        { key: "representative_image_verified", passed: true, message: "active" },
        { key: "representative_persisted_verified", passed: false, diagnosticCode: "representative_persisted_thumbnail_missing", message: "missing" },
      ],
    });
    const bodyFailed = classifyTistoryDraftOutcome({
      ...base,
      status: "partial_failure",
      saveClicked: true,
      draftCountBefore: 3,
      draftCountAfter: 4,
      steps: [
        { key: "draft_save_confirmed", passed: true, message: "confirmed" },
        { key: "body_reverified", passed: false, diagnosticCode: "reopened_body_empty", message: "empty" },
      ],
    });

    expect(persistedMissing.status).not.toBe("verified");
    expect(bodyFailed.status).not.toBe("verified");
  });

  it("does not infer representative success from an evidence object without explicit verification steps", () => {
    const outcome = classifyTistoryDraftOutcome({
      ...base,
      status: "saved",
      saveClicked: true,
      saveNotificationDetected: true,
      draftListVerified: true,
      reopenedDraftVerified: true,
      titleMatched: true,
      bodyMatched: true,
      steps: [{
        key: "tags_reverified",
        passed: true,
        message: "tags",
        evidence: { representative: { state: { className: "mce-represent-image-btn active" } } },
      }],
    });

    expect(outcome.status).not.toBe("verified");
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
