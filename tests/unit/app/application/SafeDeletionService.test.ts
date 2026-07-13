import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

import { LocalSafeBackupWriter, calculateProjectImpact, calculateWorkspaceImpact, deleteProjectData, executeProjectDeletion } from "../../../../app/application/SafeDeletionService";
import type { UserData } from "../../../../app/user-flow/user-data";

const data: UserData = { workspace: { id: "w", name: "Workspace" }, brands: [{ id: "brand", workspaceId: "w", name: "Shared" }], projects: [{ id: "p1", workspaceId: "w", brandId: "brand", name: "Delete Me", description: "", createdAt: "now", updatedAt: "now" }, { id: "p2", workspaceId: "w", brandId: "brand", name: "Keep Me", description: "", createdAt: "now", updatedAt: "now" }], contents: [{ id: "c1", workspaceId: "w", projectId: "p1", title: "Draft", body: "", status: "draft", updatedAt: "now" }], history: [], qualityReports: [], publishingRecords: [], scheduledPublishing: [] };

describe("safe deletion", () => {
  it("calculates server-side impacts and preserves shared Brand and other Projects", () => {
    expect(calculateProjectImpact(data, "p1").contentCount).toBe(1);
    expect(calculateWorkspaceImpact(data, 2).publishingAccountCount).toBe(2);
    const next = deleteProjectData(data, "p1");
    expect(next.projects.map((project) => project.id)).toEqual(["p2"]);
    expect(next.brands).toEqual(data.brands);
  });
  it("creates a versioned secret-free backup before deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "bright-backup-"));
    const writer = new LocalSafeBackupWriter(root, () => new Date("2026-07-13T00:00:00.000Z"));
    const file = await writer.write("project", "p1", data);
    const backup = await readFile(file, "utf8");
    expect(file).toContain("v1-project-p1"); expect(backup).not.toContain("secretReference");
  });
  it("rolls application data back when reference cleanup fails", async () => {
    const persisted: UserData[] = [];
    await expect(executeProjectDeletion(data, "p1", { write: vi.fn().mockResolvedValue("backup.json") }, async (value) => { persisted.push(value); }, vi.fn().mockRejectedValue(new Error("cleanup failed")))).rejects.toThrow("rolled back");
    expect(persisted.at(-1)).toEqual(data);
  });
});
