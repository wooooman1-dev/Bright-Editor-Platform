import { describe, expect, it } from "vitest";

import { InMemoryPersistenceStore } from "../../../../../core/data";
import { ApprovalAwarePersistenceStore } from "../../../../../app/application/approval/ApprovalAwarePersistenceStore";
import { updateProjectApprovalSettings } from "../../../../../app/application/approval/ApprovalContentPolicy";
import {
  createProject,
  createWorkspace,
  emptyUserData,
  startContentPlanning,
  type UserData,
} from "../../../../../app/user-flow/user-data";

function projectData(): UserData {
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

function planning(data: UserData): UserData {
  return startContentPlanning(data, {
    id: "content-1",
    projectId: "project-1",
    request: "오늘의 승인 준비 미술 감상 글을 작성해줘",
    selectionMode: "automatic",
    operationId: "operation-1",
    now: "2026-07-27T02:00:00.000Z",
  });
}

function approvalProject(): UserData {
  return updateProjectApprovalSettings(projectData(), "project-1", {
    contentPurpose: "adsense_approval",
    approvalProfileId: "tistory_vivarain_art_v1",
  }, "2026-07-27T01:00:00.000Z");
}

describe("ApprovalAwarePersistenceStore", () => {
  it("automatically snapshots the Project approval policy for a new Planning Content", async () => {
    const store = new ApprovalAwarePersistenceStore(new InMemoryPersistenceStore());
    await store.set("application", "user-data", approvalProject());

    await store.update<UserData>("application", "user-data", (current) => planning(current!));

    const saved = await store.get<UserData>("application", "user-data");
    expect(saved?.contents[0]).toMatchObject({
      contentPurpose: "adsense_approval",
      approvalPolicyId: "adsense_approval_mode",
      approvalPolicyVersion: "1.0",
      approvalProfileId: "tistory_vivarain_art_v1",
      approvalProfileVersion: "1.0",
    });
  });

  it("restores an immutable snapshot when a stale client omits the new fields", async () => {
    const store = new ApprovalAwarePersistenceStore(new InMemoryPersistenceStore());
    await store.set("application", "user-data", approvalProject());
    await store.update<UserData>("application", "user-data", (current) => planning(current!));
    const saved = (await store.get<UserData>("application", "user-data"))!;
    const content = saved.contents[0] as UserData["contents"][number] & Record<string, unknown>;
    const {
      contentPurpose: _contentPurpose,
      approvalPolicyId: _approvalPolicyId,
      approvalPolicyVersion: _approvalPolicyVersion,
      approvalProfileId: _approvalProfileId,
      approvalProfileVersion: _approvalProfileVersion,
      ...legacyContent
    } = content;

    await store.set("application", "user-data", {
      ...saved,
      contents: [legacyContent as UserData["contents"][number]],
    });

    const restored = await store.get<UserData>("application", "user-data");
    expect(restored?.contents[0]).toMatchObject({
      contentPurpose: "adsense_approval",
      approvalPolicyId: "adsense_approval_mode",
      approvalProfileId: "tistory_vivarain_art_v1",
    });
  });

  it("rejects changing the purpose of an existing Planning Content", async () => {
    const store = new ApprovalAwarePersistenceStore(new InMemoryPersistenceStore());
    await store.set("application", "user-data", approvalProject());
    await store.update<UserData>("application", "user-data", (current) => planning(current!));
    const saved = (await store.get<UserData>("application", "user-data"))!;

    await expect(store.set("application", "user-data", {
      ...saved,
      contents: saved.contents.map((content) => ({
        ...content,
        contentPurpose: "standard",
      } as UserData["contents"][number])),
    })).rejects.toThrow("Planning이 시작된 Content의 콘텐츠 목적은 변경할 수 없습니다.");
  });

  it("keeps an existing standard Content standard after the Project default changes", async () => {
    const store = new ApprovalAwarePersistenceStore(new InMemoryPersistenceStore());
    await store.set("application", "user-data", projectData());
    await store.update<UserData>("application", "user-data", (current) => planning(current!));
    const standard = (await store.get<UserData>("application", "user-data"))!;
    const changedProject = updateProjectApprovalSettings(standard, "project-1", {
      contentPurpose: "adsense_approval",
      approvalProfileId: "tistory_vivarain_art_v1",
    }, "2026-07-27T03:00:00.000Z");

    await store.set("application", "user-data", changedProject);

    const saved = await store.get<UserData>("application", "user-data");
    expect(saved?.contents[0]).toMatchObject({ contentPurpose: "standard" });
    expect(saved?.contents[0]).not.toHaveProperty("approvalProfileId");
  });
});
