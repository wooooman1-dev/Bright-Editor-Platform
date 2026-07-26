import { describe, expect, it } from "vitest";

import { normalizeTistoryDraftWorkerResult } from "../../../../app/application/publishing/TistoryDraftApplicationService";
import type { TistoryDraftSaveResult } from "../../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

const empty = {
  saveClicked: false,
  saveNotificationDetected: false,
  draftIdDetected: false,
  draftListVerified: false,
  reopenedDraftVerified: false,
  titleMatched: false,
  bodyMatched: false,
  publicPostCreated: false as const,
};

describe("Tistory draft worker normalization", () => {
  it("reports reopened representative failure as representative_reverified instead of tags_reverified", () => {
    const result: TistoryDraftSaveResult = {
      ...empty,
      status: "failed",
      failedStep: "tags_reverified",
      error: "대표이미지 상태가 유지되지 않았습니다.",
      steps: [
        {
          key: "tags_reverified",
          passed: false,
          diagnosticCode: "representative_persistence_not_selected",
          message: "대표이미지 상태가 유지되지 않았습니다.",
        },
      ],
    };

    const normalized = normalizeTistoryDraftWorkerResult(result, "");
    expect(normalized.failedStep).toBe("representative_reverified");
    expect(normalized.steps?.find((step) => !step.passed)?.key).toBe("representative_reverified");
  });

  it("does not synthesize representative success from generic tag evidence", () => {
    const result: TistoryDraftSaveResult = {
      ...empty,
      status: "verified",
      steps: [
        {
          key: "tags_filled",
          passed: true,
          message: "태그 입력 완료",
          evidence: {
            upload: { count: 3 },
            representative: { verified: false, state: { className: "mce-represent-image-btn active" } },
          },
        },
        {
          key: "tags_reverified",
          passed: true,
          message: "태그 재확인 완료",
          evidence: {
            media: { expectedCount: 3, nativeImageCount: 3 },
            representative: { state: { className: "mce-represent-image-btn active" } },
          },
        },
      ],
    };

    const normalized = normalizeTistoryDraftWorkerResult(result, "");
    expect(normalized.steps?.map((step) => step.key)).toEqual([
      "media_prepared",
      "tags_filled",
      "media_reverified",
      "tags_reverified",
    ]);
  });

  it("normalizes a reopened representative UI-only failure to a non-blocking warning after explicit persistence verification", () => {
    const passed = (key: NonNullable<TistoryDraftSaveResult["steps"]>[number]["key"]) => ({ key, passed: true, message: key });
    const result: TistoryDraftSaveResult = {
      ...empty,
      status: "partial_failure",
      saveClicked: true,
      draftCountBefore: 3,
      draftCountAfter: 4,
      failedStep: "representative_reverified",
      error: "representative control not found",
      steps: [
        passed("draft_save_confirmed"),
        passed("title_reverified"),
        passed("body_reverified"),
        passed("media_reverified"),
        passed("representative_image_verified"),
        passed("representative_persisted_verified"),
        { key: "representative_reverified", passed: false, diagnosticCode: "representative_persistence_control_not_found", message: "not rehydrated" },
        passed("category_reverified"),
        passed("tags_reverified"),
        passed("structure_verified"),
        passed("publication_state_verified"),
        passed("draft_verified"),
      ],
    };

    const normalized = normalizeTistoryDraftWorkerResult(result, "");
    expect(normalized.status).toBe("saved");
    expect(normalized.failedStep).toBeUndefined();
    expect(normalized.error).toBeUndefined();
    expect(normalized.steps?.find((step) => step.key === "representative_reverified")).toMatchObject({
      passed: false,
      warning: true,
      diagnosticCode: "tistory_representative_ui_not_rehydrated",
    });
  });

  it("reports category evidence failure as category_reverified", () => {
    const result: TistoryDraftSaveResult = {
      ...empty,
      status: "failed",
      failedStep: "tags_reverified",
      steps: [
        {
          key: "tags_reverified",
          passed: false,
          diagnosticCode: "category_selected_value_missing",
          message: "카테고리 증거 없음",
        },
      ],
    };

    const normalized = normalizeTistoryDraftWorkerResult(result, "");
    expect(normalized.failedStep).toBe("category_reverified");
  });

  it("keeps a missing persisted thumbnail as a blocking representative persistence failure", () => {
    const result: TistoryDraftSaveResult = {
      ...empty,
      status: "partial_failure",
      failedStep: "tags_reverified",
      steps: [{
        key: "tags_reverified",
        passed: false,
        diagnosticCode: "representative_persisted_thumbnail_missing",
        message: "missing",
      }],
    };

    const normalized = normalizeTistoryDraftWorkerResult(result, "");
    expect(normalized.status).toBe("partial_failure");
    expect(normalized.failedStep).toBe("representative_persisted_verified");
    expect(normalized.steps?.find((step) => !step.passed)?.warning).not.toBe(true);
  });
});
