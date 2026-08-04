import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  mergeDuplicateProjectSnapshots,
  runDuplicateProjectMerge,
  verifyMergedProjectSnapshots,
} from "../../../scripts/merge-duplicate-project.mjs";

const targetProjectId = "project-health-canonical";
const sourceProjectId = "project-health-duplicate";

function snapshots() {
  return {
    studio: {
      data: {
        application: {
          "user-data": {
            projects: [
              { id: targetProjectId, workspaceId: "workspace", name: "건강정보" },
              { id: sourceProjectId, workspaceId: "workspace", name: " 건강정보 " },
            ],
            contents: [{
              id: "content-1",
              projectId: sourceProjectId,
              planning: { opportunityCandidates: [{ projectId: sourceProjectId }] },
              opportunity: { projectId: sourceProjectId },
            }],
            mediaMetadata: [{ id: "asset-1", metadata: { projectId: sourceProjectId } }],
          },
        },
      },
    },
    metadata: {
      data: {
        "opportunity-evidence": {
          evidence1: { id: "evidence1", projectId: sourceProjectId },
        },
        "project-data-source-references": {},
      },
    },
  };
}

describe("duplicate Project merge", () => {
  it("moves nested Content, Opportunity, Media and Evidence references while preserving one target Project", () => {
    const input = snapshots();
    const result = mergeDuplicateProjectSnapshots(input.studio, input.metadata, sourceProjectId, targetProjectId);

    expect(result.changed).toBe(true);
    expect(result.movedContentCount).toBe(1);
    expect(result.movedMediaCount).toBe(1);
    expect(result.movedEvidenceCount).toBe(1);
    expect(result.studio.data.application["user-data"].projects).toEqual([
      { id: targetProjectId, workspaceId: "workspace", name: "건강정보" },
    ]);
    expect(result.studio.data.application["user-data"].contents[0]).toMatchObject({
      projectId: targetProjectId,
      planning: { opportunityCandidates: [{ projectId: targetProjectId }] },
      opportunity: { projectId: targetProjectId },
    });
    expect(result.studio.data.application["user-data"].mediaMetadata[0].metadata.projectId).toBe(targetProjectId);
    expect(result.metadata.data["opportunity-evidence"].evidence1.projectId).toBe(targetProjectId);
    expect(JSON.stringify(result)).not.toContain(sourceProjectId);
    expect(verifyMergedProjectSnapshots(result, result.studio, result.metadata)).toEqual({ targetContentCount: 1, targetProjectCount: 1 });
  });

  it("refuses to merge Projects from different Workspaces or with different normalized names", () => {
    const input = snapshots();
    input.studio.data.application["user-data"].projects[1].workspaceId = "other";
    expect(() => mergeDuplicateProjectSnapshots(input.studio, input.metadata, sourceProjectId, targetProjectId)).toThrow("서로 다른 Workspace");

    const second = snapshots();
    second.studio.data.application["user-data"].projects[1].name = "밝은재테크";
    expect(() => mergeDuplicateProjectSnapshots(second.studio, second.metadata, sourceProjectId, targetProjectId)).toThrow("Project 이름이 일치하지 않아");
  });

  it("writes both files with backups and verifies the persisted result", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bright-duplicate-project-"));
    const studioPath = path.join(root, ".bright-studio", "studio-data.json");
    const metadataPath = path.join(root, ".bright-studio", "intelligence", "metadata.json");
    await mkdir(path.dirname(metadataPath), { recursive: true });
    const input = snapshots();
    await writeFile(studioPath, JSON.stringify(input.studio, null, 2), "utf8");
    await writeFile(metadataPath, JSON.stringify(input.metadata, null, 2), "utf8");

    const result = await runDuplicateProjectMerge({
      sourceProjectId,
      targetProjectId,
      studioPath,
      metadataPath,
      nextDevLockPath: path.join(root, "missing-next-lock"),
    });

    expect(result.verified).toBe(true);
    expect(result.backupPaths).toHaveLength(2);
    const persistedStudio = JSON.parse(await readFile(studioPath, "utf8"));
    const persistedMetadata = JSON.parse(await readFile(metadataPath, "utf8"));
    expect(JSON.stringify(persistedStudio)).not.toContain(sourceProjectId);
    expect(JSON.stringify(persistedMetadata)).not.toContain(sourceProjectId);
    expect(persistedStudio.data.application["user-data"].contents[0].projectId).toBe(targetProjectId);
  });

  it("refuses to write while the Next.js development lock exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "bright-duplicate-project-lock-"));
    const studioPath = path.join(root, ".bright-studio", "studio-data.json");
    const metadataPath = path.join(root, ".bright-studio", "intelligence", "metadata.json");
    const nextDevLockPath = path.join(root, ".next", "dev", "lock");
    await mkdir(path.dirname(metadataPath), { recursive: true });
    await mkdir(path.dirname(nextDevLockPath), { recursive: true });
    const input = snapshots();
    await writeFile(studioPath, JSON.stringify(input.studio), "utf8");
    await writeFile(metadataPath, JSON.stringify(input.metadata), "utf8");
    await writeFile(nextDevLockPath, "locked", "utf8");

    await expect(runDuplicateProjectMerge({ sourceProjectId, targetProjectId, studioPath, metadataPath, nextDevLockPath })).rejects.toThrow("Next.js 개발 서버가 실행 중");
  });
});
