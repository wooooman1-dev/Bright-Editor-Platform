import { describe, expect, it } from "vitest";

import {
  draftOutcomePresentation,
  projectOutcomeDestination,
  readDraftRequestContext,
  reverifyRequestBody,
} from "../../../../app/user-flow/tistory-draft-outcome-ui";

const context = {
  workspaceId: "workspace-1",
  projectId: "project-1",
  contentId: "content-1",
  connectionId: "connection-1",
  finalConfirmation: true as const,
};

describe("Tistory draft outcome UI", () => {
  it("describes the verified pre-save checks without claiming an unavailable draft thumbnail response", () => {
    const presentation = draftOutcomePresentation("verified");
    expect(presentation.tone).toBe("success");
    expect(presentation.title).toBe("Tistory 임시저장이 완료되었습니다.");
    expect(presentation.message).toBe("임시저장 완료 신호와 저장 전 제목, 본문, 이미지, 카테고리, 태그, 대표이미지 설정을 확인했습니다.");
    expect(presentation.primaryLabel).toBe("완료");
  });

  it("returns to the owning project after a verified draft is completed", () => {
    expect(projectOutcomeDestination(
      context,
      "https://bright-studio.local/?view=editor&projectId=old-project&contentId=content-1&source=test",
    )).toBe("/?view=project&projectId=project-1&source=test");
  });

  it("warns against a duplicate save when the Draft was saved but not reopened", () => {
    const presentation = draftOutcomePresentation("saved_unverified");
    expect(presentation.primaryAction).toBe("reverify");
    expect(presentation.message).toContain("같은 글을 다시 저장하지 말고");
  });

  it("routes an existing duplicate to re-verification rather than retry", () => {
    const presentation = draftOutcomePresentation("duplicate_existing");
    expect(presentation.primaryAction).toBe("reverify");
    expect(presentation.title).toContain("기존 임시글");
  });

  it("allows retry only for an actual failed save", () => {
    expect(draftOutcomePresentation("failed").primaryAction).toBe("retry");
    expect(draftOutcomePresentation("verified").primaryAction).toBe("continue");
  });

  it("captures only the final external Draft save request", () => {
    const request = readDraftRequestContext("/api/tistory", {
      method: "POST",
      body: JSON.stringify(context),
    });
    expect(request).toEqual(context);

    expect(readDraftRequestContext("/api/tistory", {
      method: "POST",
      body: JSON.stringify({ ...context, action: "draft_reopen_verify" }),
    })).toBeUndefined();
  });

  it("builds a diagnostic re-verification request without another save action", () => {
    expect(reverifyRequestBody(context)).toEqual({
      ...context,
      action: "draft_reopen_verify",
    });
  });
});
