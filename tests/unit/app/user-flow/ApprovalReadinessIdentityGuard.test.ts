import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { approvalReadinessIdentityContamination } from "../../../../app/user-flow/ApprovalReadinessActions";
import type { UserData } from "../../../../app/user-flow/user-data";

function data(title: string, primaryKeyword: string): UserData {
  return {
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
      title,
      primaryKeyword,
      relatedKeywords: ["생활비 통장"],
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
    }],
  };
}

describe("approval readiness identity contamination guard", () => {
  it("detects a Project identity inserted into a legacy automatic Planning result", () => {
    expect(approvalReadinessIdentityContamination(
      data("밝은재테크 통장 쪼개기 방법", "밝은재테크 통장 쪼개기"),
      "content-1",
    )).toEqual(["밝은재테크"]);
  });

  it("keeps a clean legacy automatic Planning result eligible for normal checks", () => {
    expect(approvalReadinessIdentityContamination(
      data("통장 쪼개기 방법", "통장 쪼개기 방법"),
      "content-1",
    )).toEqual([]);
  });

  it("does not run or enable approval audits while identity contamination is present", () => {
    const source = readFileSync(
      join(process.cwd(), "app/user-flow/ApprovalReadinessActions.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "if (decision.shouldRun && contamination.length === 0) void execute(\"automatic\");",
    );
    expect(source).toContain(
      "disabled={props.disabled || state === \"running\" || identityBlocked}",
    );
    expect(source).toContain("기존 기획 또는 원고에 검색 주제가 아닌 프로젝트명·브랜드명이 포함되어 있습니다");
  });
});