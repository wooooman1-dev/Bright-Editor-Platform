import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PlatformConnection } from "../../../../core/connections";
import type { UserData } from "../../../../app/user-flow/user-data";

const mocks = vi.hoisted(() => ({
  data: undefined as UserData | undefined,
  execute: vi.fn(),
  set: vi.fn(),
  connections: [] as PlatformConnection[],
  targets: [] as ReadonlyArray<Readonly<{
    projectId: string;
    platform: "tistory" | "wordpress";
    platformConnectionId: string;
  }>>,
}));

vi.mock("../../../../app/application/studio-store", () => ({
  studioStore: {
    get: vi.fn(async () => mocks.data),
    set: mocks.set,
  },
}));

vi.mock("../../../../app/application/connections/connection-runtime", () => ({
  connectionRepository: {
    listByWorkspace: vi.fn(async () => mocks.connections),
  },
  targetRepository: {
    listByProject: vi.fn(async () => mocks.targets),
  },
}));

vi.mock("../../../../app/application/approval/ApprovalReadinessApplicationService", () => ({
  approvalReadinessExecutionIdentity: () => ({ key: "execution-key" }),
  executeApprovalReadinessOnce: (_key: string, task: () => Promise<unknown>) => task(),
  ApprovalReadinessApplicationService: class {
    execute = mocks.execute;
  },
}));

import { POST } from "../../../../app/api/approval/readiness/route";

describe("approval readiness route canonical connection selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connections = [connection("tistory"), connection("wordpress")];
    mocks.targets = [
      { projectId: "project-1", platform: "tistory", platformConnectionId: "tistory-1" },
      { projectId: "project-1", platform: "wordpress", platformConnectionId: "wordpress-1" },
    ];
    mocks.execute.mockImplementation(async (input: { data: UserData; contentId: string }) => result(input.data));
  });

  it.each([
    ["wordpress", "wordpress-1"],
    ["tistory", "tistory-1"],
  ] as const)("passes only the canonical %s connection when both platforms are active", async (platform, expectedConnectionId) => {
    mocks.data = userData(platform);

    const response = await POST(new Request("http://localhost/api/approval/readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "workspace-1", contentId: "content-1" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      contentId: "content-1",
      connection: expect.objectContaining({ id: expectedConnectionId, platform }),
      selectedTarget: true,
    }));
    expect(mocks.set).toHaveBeenCalledTimes(1);
  });

  it("does not add AI, WordPress Draft, scheduling, or public publishing execution to readiness", () => {
    const serviceSource = readFileSync(join(process.cwd(), "app/application/approval/ApprovalReadinessApplicationService.ts"), "utf8");
    const adapterSource = readFileSync(join(process.cwd(), "apps/wordpress/approval/WordPressSiteReadinessAudit.ts"), "utf8");

    expect(serviceSource).not.toContain("OpenAIProvider");
    expect(serviceSource).not.toContain("provider.generate");
    expect(adapterSource).not.toContain('method: "POST"');
    expect(adapterSource).not.toContain("create_draft");
    expect(adapterSource).not.toContain("public.publish");
    expect(adapterSource).not.toContain("schedule.create");
  });
});

function userData(platform: "tistory" | "wordpress"): UserData {
  const accountId = `${platform}-1`;
  const document = {
    id: "content-1",
    title: "승인 준비 원고",
    metadata: {
      buttonCount: 0,
      createdAt: "now",
      generator: "test",
      imageCount: 0,
      language: "ko",
      readingTime: 1,
      source: "test",
      updatedAt: "now",
      version: 1,
      videoCount: 0,
      wordCount: 10,
    },
    blocks: [{ id: "p", type: "paragraph" as const, text: "공식 출처를 확인하는 승인 준비 원고입니다." }],
  };
  return {
    workspace: { id: "workspace-1", name: "Studio" },
    brands: [],
    projects: [{
      id: "project-1",
      workspaceId: "workspace-1",
      name: "Project",
      description: "",
      selectedPublishingAccountIds: ["tistory-1", "wordpress-1"],
      strategy: {
        primaryTopic: "생활경제",
        subtopics: [],
        excludedTopics: [],
        defaultContentType: "article",
        defaultPlatform: platform,
        targetAudience: "일반 독자",
        tone: "clear",
        internalLinkPolicy: "real",
        relatedPostPolicy: "real",
        ctaPolicy: "optional",
        imageStrategy: "purposeful",
        seoPolicy: "people-first",
        defaultPublishingAccountId: accountId,
      },
      createdAt: "now",
      updatedAt: "now",
    }],
    contents: [{
      id: "content-1",
      workspaceId: "workspace-1",
      projectId: "project-1",
      title: document.title,
      body: "",
      status: "ready",
      platform,
      publishingAccountId: accountId,
      selectedPublishingAccountIds: ["tistory-1", "wordpress-1"],
      contentPurpose: "adsense_approval",
      updatedAt: "now",
      document,
    } as UserData["contents"][number]],
  };
}

function connection(platform: "tistory" | "wordpress"): PlatformConnection {
  return {
    id: `${platform}-1`,
    workspaceId: "workspace-1",
    platform,
    displayName: platform,
    status: "connected",
    publicMetadata: platform === "wordpress"
      ? { siteUrl: "https://example.com" }
      : { blogUrl: "https://example.tistory.com" },
    createdAt: "now",
    updatedAt: "now",
    selectedAsDefault: false,
    version: 1,
  };
}

function result(data: UserData) {
  const document = data.contents[0]!.document!;
  const quality = {
    approved: false,
    approvalType: "none" as const,
    overallScore: 0,
    reviewedAt: "now",
    revisionId: "revision",
    reviewedRevisionId: "revision",
    dimensions: [],
    weights: {},
    findings: [],
    tasks: [],
  };
  return {
    data,
    document,
    quality,
    evidence: {
      pack: { version: "1.0" as const, status: "missing" as const, sources: [] },
      verifiedSourceCount: 0,
      rejectedSourceCount: 0,
      reasons: [],
    },
    siteReadiness: {
      version: "1.0" as const,
      status: "needs_review" as const,
      checkedAt: "now",
      checks: [],
    },
  };
}
