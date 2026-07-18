import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ContentDeletionService } from "../../../../app/application/content/ContentDeletionService";
import type { UserData } from "../../../../app/user-flow/user-data";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function data(): UserData {
  const document = {
    id: "content-a",
    title: "삭제할 콘텐츠",
    blocks: [{ id: "p1", type: "paragraph" as const, text: "본문" }],
  };
  return {
    workspace: { id: "workspace-1", name: "테스트" },
    brands: [],
    projects: [{ id: "project-1", workspaceId: "workspace-1", name: "프로젝트", description: "", createdAt: "now", updatedAt: "now" }],
    contents: [
      { id: "content-a", projectId: "project-1", title: "삭제할 콘텐츠", body: "본문", status: "draft", updatedAt: "now", document },
      { id: "content-b", projectId: "project-1", title: "유지할 콘텐츠", body: "유지", status: "draft", updatedAt: "now" },
    ],
    history: [
      { id: "h1", contentId: "content-a", document, reason: "manual", recordedAt: "now", version: 1 },
      { id: "h2", contentId: "content-b", document: { ...document, id: "content-b", title: "유지할 콘텐츠" }, reason: "manual", recordedAt: "now", version: 1 },
    ],
    qualityReports: [
      { contentId: "content-a", report: {} as never },
      { contentId: "content-b", report: {} as never },
    ],
    publishingRecords: [
      { id: "pub-a", contentId: "content-a", platformConnectionId: "connection-1", status: "saved", createdAt: "now" },
      { id: "pub-b", contentId: "content-b", platformConnectionId: "connection-1", status: "saved", createdAt: "now" },
    ],
    scheduledPublishing: [
      { contentId: "content-a", platform: "tistory", scheduledFor: "later" },
      { contentId: "content-b", platform: "tistory", scheduledFor: "later" },
    ],
    mediaMetadata: [
      { id: "media-a", contentId: "content-a" },
      { id: "media-b", contentId: "content-b" },
    ] as never,
  };
}

describe("ContentDeletionService", () => {
  it("calculates impact through Project ownership for legacy content without workspaceId", () => {
    const impact = new ContentDeletionService().impact(data(), "workspace-1", "content-a");

    expect(impact).toEqual(expect.objectContaining({
      contentId: "content-a",
      projectId: "project-1",
      title: "삭제할 콘텐츠",
      historyCount: 1,
      qualityReportCount: 1,
      publishingRecordCount: 1,
      scheduledPublishingCount: 1,
      mediaMetadataCount: 1,
      externalPostsDeleted: false,
    }));
  });

  it("requires the exact current title before writing a backup or deleting data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bright-content-delete-"));
    roots.push(root);
    const service = new ContentDeletionService(root);

    await expect(service.delete(data(), {
      workspaceId: "workspace-1",
      contentId: "content-a",
      confirmationTitle: "다른 제목",
    })).rejects.toThrow("현재 콘텐츠 제목을 정확히 입력");
    expect(await readdir(root)).toEqual([]);
  });

  it("writes a backup first and removes only records owned by the selected content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bright-content-delete-"));
    roots.push(root);
    const service = new ContentDeletionService(root, () => new Date("2026-07-18T01:02:03.000Z"));

    const result = await service.delete(data(), {
      workspaceId: "workspace-1",
      contentId: "content-a",
      confirmationTitle: "삭제할 콘텐츠",
    });

    expect(result.data.projects).toHaveLength(1);
    expect(result.data.contents.map((item) => item.id)).toEqual(["content-b"]);
    expect(result.data.history?.map((item) => item.contentId)).toEqual(["content-b"]);
    expect(result.data.qualityReports?.map((item) => item.contentId)).toEqual(["content-b"]);
    expect(result.data.publishingRecords?.map((item) => item.contentId)).toEqual(["content-b"]);
    expect(result.data.scheduledPublishing?.map((item) => item.contentId)).toEqual(["content-b"]);
    expect((result.data.mediaMetadata as readonly { contentId?: string }[])?.map((item) => item.contentId)).toEqual(["content-b"]);

    const backupFiles = await readdir(root);
    expect(backupFiles).toEqual([result.backupFileName]);
    const backup = JSON.parse(await readFile(path.join(root, result.backupFileName), "utf8")) as { content: { id: string }; impact: { externalPostsDeleted: boolean } };
    expect(backup.content.id).toBe("content-a");
    expect(backup.impact.externalPostsDeleted).toBe(false);
  });
});
