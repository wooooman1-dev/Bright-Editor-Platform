import { describe, expect, it } from "vitest";

import {
  draftOutcomePresentation,
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
