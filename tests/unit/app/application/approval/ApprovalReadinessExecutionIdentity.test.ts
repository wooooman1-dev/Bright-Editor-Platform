import { describe, expect, it } from "vitest";

import {
  approvalReadinessInspectionVersion,
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

  it("uses Claim applicability instead of profile source rules in the reusable key", () => {
    const value = {
      ...content("wordpress_life_economy_v1"),
      opportunity: {
        requiredEvidenceContract: {
          schemaVersion: 1,
          contractId: "contract-not-required",
          policyId: "adsense_approval_mode",
          policyVersion: "1.0",
          profileId: "wordpress_life_economy_v1",
          profileVersion: "1.0",
          profileSourceRequirementApplicable: false,
          explicitVerificationRequired: false,
          sourceRequirements: ["official HTTPS source"],
          requiredClaims: [],
        },
      },
    } as unknown as UserContent;
    const identity = approvalReadinessExecutionIdentity(value);

    // 계약 버전은 감사 규칙이 바뀔 때마다 올라간다. 값을 박아 두면 올릴 때마다
    // 이 테스트가 깨지므로, 신원이 현재 계약 버전을 싣고 있다는 사실만 고정한다.
    expect(identity.version).toBe(approvalReadinessInspectionVersion);
    expect(identity.key).toContain("evidence-not_required@temporal-not_required");
    expect(identity.key).not.toContain("profile-source-required");
  });
});
