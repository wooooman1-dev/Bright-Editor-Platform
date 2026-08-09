import { describe, expect, it } from "vitest";

import { invalidatePublishingContextDependentState } from "../../../../../app/application/publishing/PublishingContextInvalidation";
import type { UserData } from "../../../../../app/user-flow/user-data";

describe("publishing context invalidation", () => {
  it("removes only system catalog projections and preserves editorial and independent approval state", () => {
    const quality = {
      approved: true,
      approvalType: "standard" as const,
      approvalState: "approved" as const,
      findings: [], overallScore: 100, reviews: [], dimensions: [], tasks: [], reviewedAt: "now", reviewedRevisionId: "rev-editorial", weights: {} as never,
      approvalReadiness: { status: "ready", applicationReady: true, checks: [] },
    };
    const data: UserData = {
      workspace: { id: "workspace-1", name: "Studio" }, brands: [], projects: [],
      contents: [{
        id: "content-1", projectId: "project-1", title: "원고", body: "", status: "ready", updatedAt: "before", quality,
        document: {
          id: "document-1", title: "원고",
          metadata: {
            buttonCount: 3, createdAt: "before", generator: "test", imageCount: 0, language: "ko", readingTime: 1, source: "test", updatedAt: "before", version: 1, videoCount: 0, wordCount: 10,
            internalLinkCatalogStatus: "evaluated", internalLinkCatalogContextKey: "old", availableRelatedContentCandidates: 2,
            approvalEvidence: { version: "1.0", status: "needs_review", sources: [] },
            approvalDuplicateCheck: { version: "1.0", status: "passed", checkedAt: "before", comparedContentIds: [], reasons: [] },
            siteApprovalReadiness: { version: "1.0", status: "passed", checkedAt: "before", checks: [] },
          },
          blocks: [
            { id: "p", type: "paragraph", text: "사용자 본문" },
            { id: "auto-internal-link", type: "button", ownership: "system_catalog", purpose: "internal_link", label: "자동", targetUrl: "https://example.com/auto" },
            { id: "manual", type: "button", ownership: "user_manual", purpose: "internal_link", label: "수동", targetUrl: "https://example.com/manual", sourceExternalPostId: "manual-post" },
            { id: "approval-source-link-1", type: "button", ownership: "system_source_projection", purpose: "source", label: "출처", targetUrl: "https://example.com/source" },
          ],
        },
      }],
      qualityReports: [{ contentId: "content-1", report: quality }],
    };

    const result = invalidatePublishingContextDependentState(data, "content-1", "after");
    const content = result.contents[0]!;
    expect(content.status).toBe("ready");
    expect(content.quality).toMatchObject({ approved: true, reviewedRevisionId: "rev-editorial" });
    expect(content.quality).not.toHaveProperty("approvalReadiness");
    expect(result.qualityReports?.[0]?.report).toMatchObject({ approved: true, reviewedRevisionId: "rev-editorial" });
    expect(content.document?.blocks.map((block) => block.id)).toEqual(["p", "manual", "approval-source-link-1"]);
    expect(content.document?.metadata?.approvalEvidence).toBe(data.contents[0]?.document?.metadata?.approvalEvidence);
    expect(content.document?.metadata?.approvalDuplicateCheck).toBe(data.contents[0]?.document?.metadata?.approvalDuplicateCheck);
    expect(content.document?.metadata?.siteApprovalReadiness).toBeUndefined();
    expect(content.document?.metadata?.internalLinkCatalogStatus).toBeUndefined();
  });
});
