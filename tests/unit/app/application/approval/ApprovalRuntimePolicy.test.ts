import { describe, expect, it } from "vitest";

import {
  approvalAwareInstruction,
  contentEditorialContext,
  preserveContentApprovalPolicy,
} from "../../../../../app/application/approval/ApprovalRuntimePolicy";
import {
  snapshotApprovalPolicyForPlanning,
  updateProjectApprovalSettings,
} from "../../../../../app/application/approval/ApprovalContentPolicy";
import {
  createProject,
  createWorkspace,
  emptyUserData,
  startContentPlanning,
} from "../../../../../app/user-flow/user-data";
import type { ContentDocument } from "../../../../../core/content";

function projectData() {
  const workspace = createWorkspace(emptyUserData, "Studio", "workspace-1");
  return createProject(workspace, {
    id: "project-1",
    name: "비바레인 미술 감상 가이드",
    brandName: "비바레인",
    description: "서양미술 화가와 작품 감상",
    brandIdFactory: () => "brand-1",
    now: "2026-07-27T00:00:00.000Z",
  });
}

function planningContent(data: ReturnType<typeof projectData>) {
  return startContentPlanning(data, {
    id: "content-1",
    projectId: "project-1",
    request: "오늘의 미술 감상 글을 작성해줘",
    selectionMode: "automatic",
    operationId: "operation-1",
    now: "2026-07-27T01:00:00.000Z",
  });
}

function document(approvalPolicy?: NonNullable<ContentDocument["metadata"]>["approvalPolicy"]): ContentDocument {
  return {
    id: "content-1",
    title: "미술 감상 가이드",
    metadata: {
      buttonCount: 0,
      createdAt: "2026-07-27T01:00:00.000Z",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "2026-07-27T01:00:00.000Z",
      version: 1,
      videoCount: 0,
      wordCount: 20,
      ...(approvalPolicy ? { approvalPolicy } : {}),
    },
    blocks: [{ id: "p-1", type: "paragraph", text: "공식 소장처와 최종 검토일을 확인합니다." }],
  };
}

describe("ApprovalRuntimePolicy", () => {
  it("uses the Content snapshot after the Project approval default changes", () => {
    const configured = updateProjectApprovalSettings(projectData(), "project-1", {
      contentPurpose: "adsense_approval",
      approvalProfileId: "tistory_vivarain_art_v1",
    }, "2026-07-27T01:00:00.000Z");
    const snapshotted = snapshotApprovalPolicyForPlanning(
      planningContent(configured),
      "project-1",
      "content-1",
    );
    const projectChanged = updateProjectApprovalSettings(snapshotted, "project-1", {
      contentPurpose: "standard",
    }, "2026-07-27T02:00:00.000Z");

    const context = contentEditorialContext(projectChanged, projectChanged.contents[0]!);

    expect(context).toContain("Approval profile: tistory_vivarain_art_v1@1.0");
    expect(approvalAwareInstruction("Write.", projectChanged, projectChanged.contents[0]!))
      .toContain("Canonical server editorial context");
  });

  it("does not apply a later Project approval default to an existing standard Content", () => {
    const snapshotted = snapshotApprovalPolicyForPlanning(
      planningContent(projectData()),
      "project-1",
      "content-1",
    );
    const projectChanged = updateProjectApprovalSettings(snapshotted, "project-1", {
      contentPurpose: "adsense_approval",
      approvalProfileId: "tistory_vivarain_art_v1",
    }, "2026-07-27T02:00:00.000Z");

    expect(contentEditorialContext(projectChanged, projectChanged.contents[0]!))
      .not.toContain("Approval profile:");
  });

  it("restores the exact Content approval snapshot into canonical metadata", () => {
    const configured = updateProjectApprovalSettings(projectData(), "project-1", {
      contentPurpose: "adsense_approval",
      approvalProfileId: "tistory_vivarain_art_v1",
    }, "2026-07-27T01:00:00.000Z");
    const data = snapshotApprovalPolicyForPlanning(
      planningContent(configured),
      "project-1",
      "content-1",
    );

    const restored = preserveContentApprovalPolicy(document(), data.contents[0]!);

    expect(restored.metadata?.approvalPolicy).toMatchObject({
      policyId: "adsense_approval_mode",
      profileId: "tistory_vivarain_art_v1",
    });
  });

  it("removes approval metadata from standard Content", () => {
    const data = snapshotApprovalPolicyForPlanning(
      planningContent(projectData()),
      "project-1",
      "content-1",
    );
    const approvalData = snapshotApprovalPolicyForPlanning(
      planningContent(updateProjectApprovalSettings(projectData(), "project-1", {
        contentPurpose: "adsense_approval",
        approvalProfileId: "tistory_vivarain_art_v1",
      }, "2026-07-27T01:00:00.000Z")),
      "project-1",
      "content-1",
    );
    const injected = document(preserveContentApprovalPolicy(document(), approvalData.contents[0]!).metadata?.approvalPolicy);

    expect(preserveContentApprovalPolicy(injected, data.contents[0]!).metadata)
      .not.toHaveProperty("approvalPolicy");
  });
});
