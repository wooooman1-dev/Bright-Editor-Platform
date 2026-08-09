import { describe, expect, it } from "vitest";

import {
  approvalSourceReviewPresentationText,
  readerVisibleApprovalSourceText,
} from "../../../../core/approval";

describe("Approval source presentation", () => {
  it("builds reader copy without exposing the internal Claim review label", () => {
    const text = approvalSourceReviewPresentationText({
      sourceReviewedAt: "2026-08-01T02:00:00.000Z",
      informationAsOf: "2026-07-31",
    });
    expect(text).toBe("출처 확인일: 2026-08-01 · 정보 기준일: 2026-07-31");
    expect(text).not.toContain("Claim");
  });

  it("sanitizes only system-owned legacy source projections", () => {
    const legacy = "출처 확인일: 2026-08-01 · Claim 최종 검토일: 2026-08-01 · 정보 기준일: 2026-07-31";
    expect(readerVisibleApprovalSourceText({ id: "approval-review-date", ownership: "system_source_projection", text: legacy }))
      .toBe("출처 확인일: 2026-08-01 · 정보 기준일: 2026-07-31");
    expect(readerVisibleApprovalSourceText({ id: "editorial", ownership: "user_manual", text: legacy })).toBe(legacy);
  });
});
