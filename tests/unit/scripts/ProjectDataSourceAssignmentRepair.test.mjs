import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  repairProjectDataSourceAssignments,
  runProjectDataSourceAssignmentRepair,
  verifyPersistedProjectDataSourceAssignments,
} from "../../../scripts/repair-project-data-source-assignments.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

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
              id: "art",
              name: "비바레인 미술 감상 가이드",
              description: "서양미술과 작품 감상을 설명합니다.",
              strategy: { primaryTopic: "서양미술 감상", subtopics: ["화가", "명화", "미술사"] },
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
    schemaVersion: 1,
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
        "art:health-gsc": { projectId: "art", connectionId: "health-gsc", enabled: true },
        "finance:health-gsc": { projectId: "finance", connectionId: "health-gsc", enabled: true },
        "health:health-naver": { projectId: "health", connectionId: "health-naver", enabled: true },
        "art:health-naver": { projectId: "art", connectionId: "health-naver", enabled: true },
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
  it("removes health-only references from every unrelated Project", () => {
    const original = metadataSnapshot();
    const result = repairProjectDataSourceAssignments(studioSnapshot(), original);
    const references = result.metadata.data["project-data-source-references"];

    expect(result.removedReferences.map((value) => `${value.projectId}:${value.connectionId}`).sort()).toEqual([
      "art:health-gsc",
      "art:health-naver",
      "finance:health-gsc",
      "finance:health-naver",
    ]);
    expect(references["art:health-gsc"]).toBeUndefined();
    expect(references["art:health-naver"]).toBeUndefined();
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

  it("writes the repaired metadata and verifies the persisted file", async () => {
    const directory = await temporaryDirectory();
    const studioPath = path.join(directory, "studio-data.json");
    const metadataPath = path.join(directory, "metadata.json");
    await writeFile(studioPath, JSON.stringify(studioSnapshot(), null, 2), "utf8");
    await writeFile(metadataPath, JSON.stringify(metadataSnapshot(), null, 2), "utf8");

    const result = await runProjectDataSourceAssignmentRepair({ studioPath, metadataPath, nextDevLockPath: null });
    const persisted = JSON.parse(await readFile(metadataPath, "utf8"));

    expect(result.verified).toBe(true);
    expect(result.activeReferenceCount).toBe(3);
    expect(Object.keys(persisted.data["project-data-source-references"]).sort()).toEqual([
      "finance:finance-naver",
      "health:health-gsc",
      "health:health-naver",
    ]);
    expect(result.backupPath).toBeTruthy();
    expect(JSON.parse(await readFile(result.backupPath, "utf8"))).toEqual(metadataSnapshot());
  });

  it("rejects repair while the Next.js development server lock exists", async () => {
    const directory = await temporaryDirectory();
    const studioPath = path.join(directory, "studio-data.json");
    const metadataPath = path.join(directory, "metadata.json");
    const nextDevLockPath = path.join(directory, ".next", "dev", "lock");
    await mkdir(path.dirname(nextDevLockPath), { recursive: true });
    await writeFile(nextDevLockPath, "", "utf8");
    await writeFile(studioPath, JSON.stringify(studioSnapshot(), null, 2), "utf8");
    await writeFile(metadataPath, JSON.stringify(metadataSnapshot(), null, 2), "utf8");

    await expect(runProjectDataSourceAssignmentRepair({ studioPath, metadataPath, nextDevLockPath }))
      .rejects.toThrow("Next.js 개발 서버가 실행 중입니다");
    expect(JSON.parse(await readFile(metadataPath, "utf8"))).toEqual(metadataSnapshot());
  });

  it("rejects a success result when the persisted metadata is not the repaired snapshot", () => {
    const result = repairProjectDataSourceAssignments(studioSnapshot(), metadataSnapshot());

    expect(() => verifyPersistedProjectDataSourceAssignments(studioSnapshot(), result, metadataSnapshot()))
      .toThrow("metadata.json 재읽기 결과가 기록하려던 정리 결과와 일치하지 않습니다");
  });
});

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), "bright-project-assignment-repair-"));
  temporaryDirectories.push(directory);
  return directory;
}
