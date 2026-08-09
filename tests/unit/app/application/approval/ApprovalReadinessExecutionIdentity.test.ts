import { describe, expect, it } from "vitest";

import {
  resolveApprovalPolicySnapshot,
} from "../../../../../core/approval";
import type { ContentDocument } from "../../../../../core/content";
import type { UserContent } from "../../../../../app/user-flow/user-data";
import { approvalReadinessExecutionIdentity } from "../../../../../app/application/approval/ApprovalReadinessExecutionIdentity";

function content(policyProfile: "wordpress_life_economy_v1" | "tistory_vivarain_art_v1"): UserContent {
  const document = {
    id: "content-1",
    title: "Synthetic approval article",
    metadata: {
      approvalPolicy: resolveApprovalPolicySnapshot("adsense_approval", policyProfile),
    },
    blocks: [],
  } as unknown as ContentDocument;
  return {
    id: "content-1",
    projectId: "project-1",
    title: document.title,
    body: "",
    status: "in_review",
    updatedAt: "2026-08-08T00:00:00.000Z",
    document,
  };
}

describe("ApprovalReadinessExecutionIdentity", () => {
  it("includes policy and profile identity in the reusable execution key", () => {
    const wordpress = approvalReadinessExecutionIdentity(content("wordpress_life_economy_v1"));
    const tistory = approvalReadinessExecutionIdentity(content("tistory_vivarain_art_v1"));

    expect(wordpress.key).not.toBe(tistory.key);
    expect(approvalReadinessExecutionIdentity(content("wordpress_life_economy_v1")).key)
      .toBe(wordpress.key);
  });
});
