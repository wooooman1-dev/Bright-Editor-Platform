import { describe, expect, it } from "vitest";

import { repairProjectDataSourceAssignments } from "../../../scripts/repair-project-data-source-assignments.mjs";

function studioSnapshot() {
  return {
    data: {
      application: {
        "user-data": {
          projects: [
            {
              id: "health",
              name: "건강 정보",
              description: "일상 건강관리와 운동 정보를 설명합니다.",
              strategy: { primaryTopic: "생활건강", subtopics: ["운동", "걷기", "건강보험", "실손보험"] },
            },
            {
              id: "finance",
              name: "밝은재테크",
              description: "예금과 적금, 고정비, 신용관리 정보를 제공합니다.",
              strategy: { primaryTopic: "생활재테크", subtopics: ["예금", "적금", "보험", "신용관리"] },
            },
          ],
        },
      },
    },
  };
}

function metadataSnapshot() {
  return {
    data: {
      "data-source-connections": {
        healthGsc: {
          id: "health-gsc",
          provider: "googleSearchConsole",
          displayName: "건강 GSC",
          resourceConfiguration: { siteProperty: "https://bright-healthy.tistory.com/" },
        },
        healthNaver: {
          id: "health-naver",
          provider: "naverSearchTrend",
          displayName: "건강 NAVER",
          resourceConfiguration: { keywords: ["건강", "정보", "운동"] },
        },
        financeNaver: {
          id: "finance-naver",
          provider: "naverSearchTrend",
          displayName: "재테크 NAVER",
          resourceConfiguration: { keywords: ["예금", "적금", "고정비"] },
        },
      },
      "project-data-source-references": {
        "health:health-gsc": { projectId: "health", connectionId: "health-gsc", enabled: true },
        "finance:health-gsc": { projectId: "finance", connectionId: "health-gsc", enabled: true },
        "health:health-naver": { projectId: "health", connectionId: "health-naver", enabled: true },
        "finance:health-naver": { projectId: "finance", connectionId: "health-naver", enabled: true },
        "finance:finance-naver": { projectId: "finance", connectionId: "finance-naver", enabled: true },
      },
      "opportunity-evidence": {
        evidence1: { id: "evidence1", connectionId: "health-gsc", keyword: "운동" },
      },
      "data-source-snapshots": {
        snapshot1: { id: "snapshot1", connectionId: "health-gsc" },
      },
    },
  };
}

describe("Project Data Source assignment repair", () => {
  it("removes only health-only references from 밝은재테크", () => {
    const original = metadataSnapshot();
    const result = repairProjectDataSourceAssignments(studioSnapshot(), original);
    const references = result.metadata.data["project-data-source-references"];

    expect(result.removedReferences.map((value) => value.connectionId).sort()).toEqual(["health-gsc", "health-naver"]);
    expect(references["finance:health-gsc"]).toBeUndefined();
    expect(references["finance:health-naver"]).toBeUndefined();
    expect(references["health:health-gsc"]).toEqual({ projectId: "health", connectionId: "health-gsc", enabled: true });
    expect(references["health:health-naver"]).toEqual({ projectId: "health", connectionId: "health-naver", enabled: true });
    expect(references["finance:finance-naver"]).toEqual({ projectId: "finance", connectionId: "finance-naver", enabled: true });
    expect(result.preservedHealthReferenceCount).toBe(2);
  });

  it("preserves Connections, Snapshots and Evidence", () => {
    const original = metadataSnapshot();
    const result = repairProjectDataSourceAssignments(studioSnapshot(), original);

    expect(result.metadata.data["data-source-connections"]).toEqual(original.data["data-source-connections"]);
    expect(result.metadata.data["data-source-snapshots"]).toEqual(original.data["data-source-snapshots"]);
    expect(result.metadata.data["opportunity-evidence"]).toEqual(original.data["opportunity-evidence"]);
  });

  it("is idempotent after incorrect references are removed", () => {
    const first = repairProjectDataSourceAssignments(studioSnapshot(), metadataSnapshot());
    const second = repairProjectDataSourceAssignments(studioSnapshot(), first.metadata);

    expect(second.removedReferences).toEqual([]);
    expect(second.metadata).toEqual(first.metadata);
  });
});
