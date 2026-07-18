import { describe, expect, it } from "vitest";

import { mergeUserDataSnapshot } from "../../../../app/application/persistence/mergeUserDataSnapshot";
import type { MediaAsset } from "../../../../core/media";
import type { UserData } from "../../../../app/user-flow/user-data";

const mediaAsset: MediaAsset = Object.freeze({
  id: "asset-server",
  kind: "image",
  metadata: Object.freeze({
    alt: "서버 이미지",
    contentId: "content-1",
    createdAt: "2026-07-18T01:00:00.000Z",
    projectId: "project-1",
    sourceType: "upload",
    workspaceId: "workspace-1",
  }),
  source: "/api/media/server.png",
});

function snapshot(overrides: Partial<UserData> = {}): UserData {
  return {
    workspace: { id: "workspace-1", name: "Workspace" },
    brands: [],
    projects: [{ id: "project-1", workspaceId: "workspace-1", name: "Project", description: "", createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" }],
    contents: [{ id: "content-1", workspaceId: "workspace-1", projectId: "project-1", title: "Server title", body: "", status: "draft", updatedAt: "2026-07-18T00:00:00.000Z" }],
    history: [],
    mediaMetadata: [],
    publishingRecords: [],
    qualityReports: [],
    scheduledPublishing: [],
    ...overrides,
  };
}

describe("mergeUserDataSnapshot", () => {
  it("preserves the latest server media metadata during a stale full-state save", () => {
    const current = snapshot({ mediaMetadata: [mediaAsset] });
    const incoming = snapshot({
      contents: [{ ...current.contents[0], title: "Client edited title" }],
      mediaMetadata: [],
    });

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.contents[0].title).toBe("Client edited title");
    expect(merged.mediaMetadata).toEqual([mediaAsset]);
  });

  it("keeps server-owned workflow collections and server quality", () => {
    const serverQuality = { overallScore: 99, approved: true } as unknown as NonNullable<UserData["contents"][number]["quality"]>;
    const clientQuality = { overallScore: 1, approved: false } as unknown as NonNullable<UserData["contents"][number]["quality"]>;
    const current = snapshot({
      contents: [{ ...snapshot().contents[0], quality: serverQuality }],
      history: [{ id: "history-server", contentId: "content-1", document: { id: "content-1", title: "Server", blocks: [] }, reason: "autosave", recordedAt: "2026-07-18T01:00:00.000Z", version: 1 }],
      publishingRecords: [{ id: "publish-server", contentId: "content-1", platformConnectionId: "connection-1", status: "saved", createdAt: "2026-07-18T01:00:00.000Z" }],
      qualityReports: [{ contentId: "content-1", report: serverQuality }],
      scheduledPublishing: [{ contentId: "content-1", platform: "tistory", scheduledFor: "2026-07-19T01:00:00.000Z" }],
    });
    const incoming = snapshot({ contents: [{ ...current.contents[0], quality: clientQuality }] });

    const merged = mergeUserDataSnapshot(current, incoming);

    expect(merged.contents[0].quality).toBe(serverQuality);
    expect(merged.history).toEqual(current.history);
    expect(merged.publishingRecords).toEqual(current.publishingRecords);
    expect(merged.qualityReports).toEqual(current.qualityReports);
    expect(merged.scheduledPublishing).toEqual(current.scheduledPublishing);
  });

  it("accepts the first valid snapshot when no server state exists", () => {
    const incoming = snapshot({ mediaMetadata: [mediaAsset] });
    expect(mergeUserDataSnapshot(undefined, incoming)).toBe(incoming);
  });

  it("rejects malformed full-state payloads", () => {
    expect(() => mergeUserDataSnapshot(undefined, { contents: [] })).toThrow("Application state is invalid.");
  });
});
