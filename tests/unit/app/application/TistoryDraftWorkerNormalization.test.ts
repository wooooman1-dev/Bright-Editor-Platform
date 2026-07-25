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

  it("expands successful tag evidence into explicit media and representative steps", () => {
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
            representative: { state: { className: "mce-represent-image-btn active" } },
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
      "representative_image_verified",
      "tags_filled",
      "media_reverified",
      "representative_reverified",
      "tags_reverified",
    ]);
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
});
