import { describe, expect, it, vi } from "vitest";

import { ApprovalReadinessApplicationService } from "../../../../../app/application/approval/ApprovalReadinessApplicationService";
import type { ContentDocument } from "../../../../../core/content";
import type { UserData } from "../../../../../app/user-flow/user-data";

const document: ContentDocument = {
  id: "content-1",
  title: "밝은재테크 통장 쪼개기 방법",
  metadata: {
    buttonCount: 0,
    createdAt: "2026-07-31T00:00:00.000Z",
    generator: "test",
    imageCount: 0,
    language: "ko",
    readingTime: 1,
    source: "test",
    updatedAt: "2026-07-31T00:00:00.000Z",
    version: 1,
    videoCount: 0,
    wordCount: 10,
  },
  blocks: [{
    id: "p1",
    type: "paragraph",
    text: "목적별 계좌 역할을 설명합니다.",
  }],
};

const data: UserData = {
  workspace: { id: "workspace-1", name: "Studio" },
  brands: [],
  projects: [{
    id: "project-1",
    workspaceId: "workspace-1",
    name: "밝은재테크",
    description: "생활경제 정보",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
  }],
  contents: [{
    id: "content-1",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: document.title,
    primaryKeyword: "밝은재테크 통장 쪼개기",
    naturalLanguageRequest: "밝은재테크 프로젝트에서 아직 다루지 않은 생활경제 주제를 골라줘",
    planningWorkflow: {
      status: "generated",
      request: "밝은재테크 프로젝트에서 아직 다루지 않은 생활경제 주제를 골라줘",
      selectionMode: "automatic",
      operationId: "operation-1",
      revision: 1,
      createdAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:00.000Z",
    },
    body: "",
    status: "ready",
    updatedAt: "2026-07-31T00:00:00.000Z",
    document,
    contentPurpose: "adsense_approval",
    approvalPolicyId: "adsense_approval_mode",
    approvalPolicyVersion: "1.0",
    approvalProfileId: "wordpress_life_economy_v1",
    approvalProfileVersion: "1.0",
  }],
};

describe("ApprovalReadinessApplicationService identity guard", () => {
  it("rejects contaminated legacy Planning before any external fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const service = new ApprovalReadinessApplicationService(fetcher);

    await expect(service.execute({
      data,
      contentId: "content-1",
    })).rejects.toThrow(
      "프로젝트명·브랜드명이 포함되어 승인 준비 검사를 차단했습니다: 밝은재테크",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});