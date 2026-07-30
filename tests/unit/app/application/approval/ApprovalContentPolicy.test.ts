import { describe, expect, it } from "vitest";

import {
  contentApprovalPromptContext,
  contentBoundEditorialContext,
  resolveContentApprovalSnapshot,
  resolveProjectApprovalSettings,
  snapshotApprovalPolicyForPlanning,
  updateProjectApprovalSettings,
} from "../../../../../app/application/approval/ApprovalContentPolicy";
import { createProject, createWorkspace, emptyUserData, startContentPlanning } from "../../../../../app/user-flow/user-data";
import { peopleFirstValueAndTrustPrinciple } from "../../../../../core/approval";

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

function approvalPlanningData() {
  const configured = updateProjectApprovalSettings(projectData(), "project-1", {
    contentPurpose: "adsense_approval",
    approvalProfileId: "tistory_vivarain_art_v1",
  }, "2026-07-27T01:00:00.000Z");
  const planning = startContentPlanning(configured, {
    id: "content-1",
    projectId: "project-1",
    request: "오늘의 승인 준비 미술 감상 글을 작성해줘",
    selectionMode: "automatic",
    operationId: "operation-1",
    now: "2026-07-27T02:00:00.000Z",
  });
  return snapshotApprovalPolicyForPlanning(planning, "project-1", "content-1");
}

describe("ApprovalContentPolicy", () => {
  it("reads existing Project data as standard", () => {
    const data = projectData();
    expect(resolveProjectApprovalSettings(data.projects[0]!)).toEqual({ contentPurpose: "standard" });
  });

  it("persists a Project approval purpose and profile", () => {
    const data = updateProjectApprovalSettings(projectData(), "project-1", {
      contentPurpose: "adsense_approval",
      approvalProfileId: "tistory_vivarain_art_v1",
    }, "2026-07-27T01:00:00.000Z");
    expect(resolveProjectApprovalSettings(data.projects[0]!)).toEqual({
      contentPurpose: "adsense_approval",
      approvalProfileId: "tistory_vivarain_art_v1",
    });
  });

  it("requires a profile when approval preparation is selected", () => {
    expect(() => updateProjectApprovalSettings(projectData(), "project-1", {
      contentPurpose: "adsense_approval",
    }, "2026-07-27T01:00:00.000Z")).toThrow("승인 준비 모드에는 승인 정책 프로필을 선택해 주세요.");
  });

  it("snapshots the exact policy contract into the Planning Content", () => {
    const snapshotted = approvalPlanningData();
    const content = snapshotted.contents[0]!;
    expect(content).toMatchObject({
      contentPurpose: "adsense_approval",
      approvalPolicyId: "adsense_approval_mode",
      approvalPolicyVersion: "1.0",
      approvalProfileId: "tistory_vivarain_art_v1",
      approvalProfileVersion: "1.0",
    });
    expect(resolveContentApprovalSnapshot(content)?.profileId).toBe("tistory_vivarain_art_v1");
    expect(contentApprovalPromptContext(content)).toContain("Policy documents reviewed:");
  });

  it("snapshots the WordPress 생활경제 approval profile into the Planning Content", () => {
    const configured = updateProjectApprovalSettings(projectData(), "project-1", {
      contentPurpose: "adsense_approval",
      approvalProfileId: "wordpress_life_economy_v1",
    }, "2026-07-27T01:00:00.000Z");
    const planning = startContentPlanning(configured, {
      id: "content-wordpress",
      projectId: "project-1",
      request: "생활경제 승인 준비 글을 작성해줘",
      selectionMode: "automatic",
      operationId: "operation-wordpress",
      now: "2026-07-27T02:00:00.000Z",
    });
    const snapshotted = snapshotApprovalPolicyForPlanning(planning, "project-1", "content-wordpress");

    expect(snapshotted.contents[0]).toMatchObject({
      contentPurpose: "adsense_approval",
      approvalPolicyId: "adsense_approval_mode",
      approvalPolicyVersion: "1.0",
      approvalProfileId: "wordpress_life_economy_v1",
      approvalProfileVersion: "1.0",
    });
    const promptContext = contentApprovalPromptContext(snapshotted.contents[0]!);
    expect(promptContext).toContain("Approval profile: wordpress_life_economy_v1@1.0");
    expect(promptContext).toContain(peopleFirstValueAndTrustPrinciple);
  });

  it("clears approval metadata for standard Planning", () => {
    const planning = startContentPlanning(projectData(), {
      id: "content-1",
      projectId: "project-1",
      request: "일반 글 작성",
      selectionMode: "userSpecified",
      operationId: "operation-1",
      now: "2026-07-27T02:00:00.000Z",
    });
    const snapshotted = snapshotApprovalPolicyForPlanning(planning, "project-1", "content-1");
    expect(snapshotted.contents[0]).toMatchObject({ contentPurpose: "standard" });
    expect(resolveContentApprovalSnapshot(snapshotted.contents[0]!)).toBeUndefined();
  });

  it("uses the immutable Content snapshot instead of the current Project approval policy", () => {
    const data = approvalPlanningData();
    const context = contentBoundEditorialContext({
      primaryTopic: "미술 감상",
      approvalPolicy: "stale project policy",
    }, data.contents[0]!);

    expect(context).toContain("Approval profile: tistory_vivarain_art_v1@1.0");
    expect(context).not.toContain("stale project policy");
  });

  it("removes a later Project approval default from existing standard Content", () => {
    const planning = startContentPlanning(projectData(), {
      id: "content-1",
      projectId: "project-1",
      request: "일반 글 작성",
      selectionMode: "userSpecified",
      operationId: "operation-1",
      now: "2026-07-27T02:00:00.000Z",
    });
    const standard = snapshotApprovalPolicyForPlanning(planning, "project-1", "content-1");
    const context = contentBoundEditorialContext({
      primaryTopic: "미술 감상",
      approvalPolicy: "later project approval policy",
    }, standard.contents[0]!);

    expect(context).toContain("미술 감상");
    expect(context).not.toContain("approvalPolicy");
    expect(context).not.toContain("later project approval policy");
    expect(context).not.toContain(peopleFirstValueAndTrustPrinciple);
  });
});
