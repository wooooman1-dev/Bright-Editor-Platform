import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { UserContent, UserData } from "../user-flow/user-data";

export type DeletionImpact = Readonly<{
  name: string;
  brandCount: number;
  projectCount: number;
  contentCount: number;
  draftCount: number;
  historyCount: number;
  autosaveCount: number;
  mediaCount: number;
  qualityReportCount: number;
  publishingRecordCount: number;
  scheduleRecordCount: number;
  publishingAccountCount: number;
  publishingPreparationCount: number;
}>;

export class ProjectDeletionError extends Error {
  readonly status = "cleanup_required";
  constructor(readonly backupPath: string, readonly projectRestored: boolean) { super("Project deletion requires cleanup after rollback."); this.name = "ProjectDeletionError"; }
}

export interface SafeBackupWriter { write(scope: "project" | "workspace", id: string, snapshot: unknown): Promise<string>; }

export class LocalSafeBackupWriter implements SafeBackupWriter {
  constructor(private readonly root = path.join(process.cwd(), ".bright-studio", "backups"), private readonly now = () => new Date()) {}
  async write(scope: "project" | "workspace", id: string, snapshot: unknown): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const timestamp = this.now().toISOString().replace(/[:.]/g, "-");
    const file = path.join(this.root, `v1-${scope}-${safe(id)}-${timestamp}.json`);
    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify({ schemaVersion: 1, scope, createdAt: this.now().toISOString(), data: snapshot }, null, 2), "utf8");
    await rename(temporary, file);
    return file;
  }
}

export function calculateProjectImpact(data: UserData, projectId: string): DeletionImpact {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project was not found.");
  return impact(project.name, data, data.contents.filter((content) => content.projectId === projectId), 0, 1);
}

export function calculateWorkspaceImpact(data: UserData, publishingAccountCount = 0): DeletionImpact {
  if (!data.workspace) throw new Error("Workspace was not found.");
  return { ...impact(data.workspace.name, data, data.contents, data.brands.length, data.projects.length), publishingAccountCount };
}

export function deleteProjectData(data: UserData, projectId: string): UserData {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project was not found.");
  const contentIds = new Set(data.contents.filter((content) => content.projectId === projectId).map((content) => content.id));
  return {
    ...data,
    projects: data.projects.filter((item) => item.id !== projectId), contents: data.contents.filter((item) => item.projectId !== projectId),
    history: (data.history ?? []).filter((item) => !contentIds.has(item.contentId)),
    qualityReports: (data.qualityReports ?? []).filter((item) => !contentIds.has(item.contentId)),
    publishingRecords: (data.publishingRecords ?? []).filter((item) => !contentIds.has(item.contentId)),
    scheduledPublishing: (data.scheduledPublishing ?? []).filter((item) => !contentIds.has(item.contentId)),
  };
}

export function deleteWorkspaceData(): UserData {
  return { brands: [], projects: [], contents: [], history: [], mediaMetadata: [], qualityReports: [], publishingRecords: [], scheduledPublishing: [] };
}

export async function executeProjectDeletion(
  data: UserData,
  projectId: string,
  backupWriter: SafeBackupWriter,
  persist: (data: UserData) => Promise<void>,
  cleanupProjectReferences: (projectId: string) => Promise<void>,
): Promise<{ backupPath: string; data: UserData }> {
  const backupPath = await backupWriter.write("project", projectId, projectSnapshot(data, projectId));
  const next = deleteProjectData(data, projectId);
  try { await persist(next); await cleanupProjectReferences(projectId); }
  catch {
    let projectRestored = false;
    try { await persist(data); projectRestored = true; } catch { /* the backup remains the recovery source */ }
    throw new ProjectDeletionError(backupPath, projectRestored);
  }
  return { backupPath, data: next };
}

function impact(name: string, data: UserData, contents: readonly UserContent[], brandCount: number, projectCount: number): DeletionImpact {
  const contentIds = new Set(contents.map((content) => content.id));
  const mediaCount = contents.reduce((count, content) => count + (content.document?.blocks.filter((block) => block.type === "image" || block.type === "video").length ?? 0), 0);
  return {
    name, brandCount, projectCount, contentCount: contents.length,
    draftCount: contents.filter((content) => content.status !== "draft_saved").length,
    historyCount: (data.history ?? []).filter((entry) => contentIds.has(entry.contentId)).length, mediaCount,
    autosaveCount: (data.history ?? []).filter((entry) => contentIds.has(entry.contentId) && entry.reason === "autosave").length,
    qualityReportCount: (data.qualityReports ?? []).filter((entry) => contentIds.has(entry.contentId)).length,
    publishingRecordCount: (data.publishingRecords ?? []).filter((entry) => contentIds.has(entry.contentId)).length,
    scheduleRecordCount: (data.scheduledPublishing ?? []).filter((entry) => contentIds.has(entry.contentId)).length,
    publishingAccountCount: 0,
    publishingPreparationCount: contents.filter((content) => Boolean(content.publishingPreparation)).length,
  };
}
function safe(value: string): string { return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60); }
function projectSnapshot(data: UserData, projectId: string) {
  const ids = new Set(data.contents.filter((item) => item.projectId === projectId).map((item) => item.id));
  return { project: data.projects.find((item) => item.id === projectId), contents: data.contents.filter((item) => ids.has(item.id)), history: (data.history ?? []).filter((item) => ids.has(item.contentId)), qualityReports: (data.qualityReports ?? []).filter((item) => ids.has(item.contentId)), publishingRecords: (data.publishingRecords ?? []).filter((item) => ids.has(item.contentId)), schedules: (data.scheduledPublishing ?? []).filter((item) => ids.has(item.contentId)) };
}
