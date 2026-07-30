import { describe, expect, it } from "vitest";

import { InMemoryPersistenceStore } from "../../../../../core/data";
import { ApprovalAwarePersistenceStore } from "../../../../../app/application/approval/ApprovalAwarePersistenceStore";
import { updateProjectApprovalSettings } from "../../../../../app/application/approval/ApprovalContentPolicy";
import {
  createProject,
  createWorkspace,
  emptyUserData,
  startContentPlanning,
  type UserContent,
  type UserData,
} from "../../../../../app/user-flow/user-data";
import { contentRevisionId } from "../../../../../core/quality";

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

function planning(data: UserData, contentId = "content-1", operationId = "operation-1"): UserData {
  return startContentPlanning(data, {
    id: contentId,
    projectId: "project-1",
    request: "오늘의 승인 준비 미술 감상 글을 작성해줘",
    selectionMode: "automatic",
    operationId,
    now: "2026-07-27T02:00:00.000Z",
  });
}

function approvalProject(): UserData {
  return updateProjectApprovalSettings(projectData(), "project-1", {
    contentPurpose: "adsense_approval",
    approvalProfileId: "tistory_vivarain_art_v1",
  }, "2026-07-27T01:00:00.000Z");
}

function withDocument(content: UserContent, title: string, heading: string, paragraph: string): UserContent {
  const now = "2026-07-27T04:00:00.000Z";
  return {
    ...content,
    title,
    updatedAt: now,
    document: {
      id: content.id,
      title,
      metadata: {
        buttonCount: 0,
        createdAt: now,
        generator: "test",
        imageCount: 0,
        language: "ko",
        readingTime: 1,
        source: "test",
        updatedAt: now,
        version: 1,
        videoCount: 0,
        wordCount: 20,
      },
      blocks: [
        { id: `${content.id}-h1`, type: "heading", level: 2, text: heading },
        { id: `${content.id}-p1`, type: "paragraph", text: paragraph },
      ],
    },
  };
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
    const legacyContent = {
      ...(saved.contents[0] as UserData["contents"][number] & Record<string, unknown>),
    };
    for (const key of [
      "contentPurpose",
      "approvalPolicyId",
      "approvalPolicyVersion",
      "approvalProfileId",
      "approvalProfileVersion",
    ]) {
      delete legacyContent[key];
    }

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

  it("persists deterministic duplicate snapshots for approval documents in the same Project", async () => {
    const store = new ApprovalAwarePersistenceStore(new InMemoryPersistenceStore());
    await store.set("application", "user-data", approvalProject());
    await store.update<UserData>("application", "user-data", (current) => planning(current!, "content-1", "operation-1"));
    await store.update<UserData>("application", "user-data", (current) => planning(current!, "content-2", "operation-2"));
    const planned = (await store.get<UserData>("application", "user-data"))!;
    const [first, second] = planned.contents;

    await store.set("application", "user-data", {
      ...planned,
      contents: [
        withDocument(first, "작품 감상 가이드", "색을 보는 순서", "먼저 중심 색과 주변 색을 비교합니다."),
        withDocument(second, "작품 감상 가이드", "색을 보는 순서", "먼저 중심 색과 주변 색을 비교합니다."),
      ],
    });

    const saved = (await store.get<UserData>("application", "user-data"))!;
    expect(saved.contents[0].document?.metadata?.approvalDuplicateCheck).toMatchObject({
      status: "blocked",
      matchedContentId: "content-2",
      highestSimilarity: 1,
    });
    expect(saved.contents[1].document?.metadata?.approvalDuplicateCheck).toMatchObject({
      status: "blocked",
      matchedContentId: "content-1",
      highestSimilarity: 1,
    });
  });

  it.each(["missing", "needs_review"] as const)(
    "preserves a current %s Evidence review and site diagnostics across a stale same-Revision write",
    async (status) => {
      const store = new ApprovalAwarePersistenceStore(new InMemoryPersistenceStore());
      await store.set("application", "user-data", approvalProject());
      await store.update<UserData>("application", "user-data", (current) => planning(current!));
      const planned = (await store.get<UserData>("application", "user-data"))!;
      const paragraph = status === "needs_review"
        ? "공식 자료 후보 https://www.moma.org/collection/works/79802"
        : "공식 자료를 추가로 확인해야 합니다.";
      const documented = {
        ...planned,
        contents: [withDocument(planned.contents[0]!, "작품 감상 가이드", "작품을 보는 순서", paragraph)],
      };
      await store.set("application", "user-data", documented);
      const candidate = (await store.get<UserData>("application", "user-data"))!;
      const content = candidate.contents[0]!;
      const revisionId = contentRevisionId(content.document!);
      const sources = status === "needs_review"
        ? content.document!.metadata!.approvalEvidence!.sources.map((source) => ({
            ...source,
            verificationStatus: "unreachable" as const,
            failureReason: "공식 출처가 일시적으로 응답하지 않았습니다.",
            checkedAt: "2026-07-28T02:00:00.000Z",
          }))
        : [];
      const reviewed: UserData = {
        ...candidate,
        contents: [{
          ...content,
          document: {
            ...content.document!,
            metadata: {
              ...content.document!.metadata!,
              approvalEvidence: {
                version: "1.0",
                status,
                reviewedAt: "2026-07-28T02:00:00.000Z",
                reviewedRevisionId: revisionId,
                sources,
              },
              siteApprovalReadiness: {
                version: "1.0",
                status: "needs_review",
                checkedAt: "2026-07-28T02:00:00.000Z",
                checks: [{ key: "privacy", passed: false, message: "개인정보처리방침을 확인하지 못했습니다." }],
              },
            },
          },
        }],
      };

      await store.set("application", "user-data", reviewed);
      const afterReview = (await store.get<UserData>("application", "user-data"))!;
      expect(afterReview.contents[0]?.document?.metadata?.approvalEvidence).toMatchObject({
        status,
        reviewedRevisionId: revisionId,
      });
      if (status === "needs_review") {
        expect(afterReview.contents[0]?.document?.metadata?.approvalEvidence?.sources[0]).toMatchObject({
          verificationStatus: "unreachable",
          failureReason: "공식 출처가 일시적으로 응답하지 않았습니다.",
        });
      }

      await store.set("application", "user-data", candidate);
      const afterStaleWrite = (await store.get<UserData>("application", "user-data"))!;
      expect(afterStaleWrite.contents[0]?.document?.metadata?.approvalEvidence).toMatchObject({
        status,
        reviewedRevisionId: revisionId,
      });
      expect(afterStaleWrite.contents[0]?.document?.metadata?.siteApprovalReadiness).toMatchObject({
        status: "needs_review",
        checkedAt: "2026-07-28T02:00:00.000Z",
      });
    },
  );
});
