import { describe, expect, it } from "vitest";

import {
  connectionReferenceCounts,
  publicConnectionRuntimeState,
} from "../../../../app/application/connections/ConnectionPublicState";
import type { PlatformConnection } from "../../../../core/connections";
import type { UserData } from "../../../../app/user-flow/user-data";

const connection: PlatformConnection = {
  id: "connection-1",
  workspaceId: "workspace-1",
  platform: "tistory",
  displayName: "bright-healthy",
  status: "connected",
  publicMetadata: {
    blogId: "bright-healthy",
    blogUrl: "https://bright-healthy.tistory.com",
    sessionStateAvailable: true,
  },
  createdAt: "before",
  updatedAt: "before",
  selectedAsDefault: false,
  version: 1,
};

const data: UserData = {
  workspace: { id: "workspace-1", name: "Workspace" },
  brands: [],
  projects: [{
    id: "project-1",
    workspaceId: "workspace-1",
    name: "Health",
    description: "",
    selectedPublishingAccountIds: [connection.id],
    createdAt: "before",
    updatedAt: "before",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "원고",
    body: "본문",
    status: "ready",
    updatedAt: "before",
    publishingAccountId: connection.id,
  }],
};

describe("ConnectionPublicState", () => {
  it("counts all Project and Content references", () => {
    expect(connectionReferenceCounts(data, connection.id)).toEqual({
      projectCount: 1,
      contentCount: 1,
    });
  });

  it("does not expose a connected Tistory account when its stored session is missing", () => {
    expect(publicConnectionRuntimeState(connection, data, false)).toEqual({
      status: "disconnected",
      sessionStateAvailable: false,
      projectReferenceCount: 1,
      contentReferenceCount: 1,
    });
  });

  it("keeps the same connection ID connected when its stored session exists", () => {
    expect(publicConnectionRuntimeState(connection, data, true)).toEqual({
      status: "connected",
      sessionStateAvailable: true,
      projectReferenceCount: 1,
      contentReferenceCount: 1,
    });
  });
});
