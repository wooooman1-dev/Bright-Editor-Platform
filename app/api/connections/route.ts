import { rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { PlatformConnection } from "../../../core/connections";
import { PlatformConnectionService, safeDraftPermissions } from "../../../core/connections";
import type { Project } from "../../../core/data";
import { parseTistoryBlogAddress } from "../../../apps/tistory/config/TistoryBlogAddress";
import { TistoryLoginJob } from "../../../apps/tistory/connections/TistoryLoginJob";
import { WordPressConnectionAdapter } from "../../../apps/wordpress";
import { connectionJobRunner, connectionRepository, connectionRoot, secretStore, targetRepository } from "../../application/connections/connection-runtime";
import {
  assertCompatibleConnectionReplacement,
  contentReferencesConnection,
  migrateConnectionReferences,
  projectReferencesConnection,
  replacementPublishingTarget,
} from "../../application/connections/ConnectionReferenceMigration";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { studioStore } from "../../application/studio-store";
import type { UserData, WorkspacePlatform } from "../../user-flow/user-data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url), jobId = url.searchParams.get("jobId");
    const workspaceId = required(url.searchParams.get("workspaceId"), "Workspace is required."); await assertWorkspace(workspaceId);
    if (jobId) {
      const job = connectionJobRunner.status(jobId);
      if (job) { await ownedConnection(workspaceId, job.connectionId); if (job.state === "failed" || job.state === "timed_out") await recordConnectionFailure(workspaceId, job.connectionId, job); }
      return NextResponse.json({ job: job ?? null });
    }
    const data = await workspaceData(workspaceId), enabledPlatforms = resolveWorkspaceSettings(data).enabledPlatforms;
    return NextResponse.json({ enabledPlatforms, connections: (await connectionRepository.listByWorkspace(workspaceId)).filter((connection) => enabledPlatforms.includes(connection.platform)).map(safe) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; workspaceId?: string; connectionId?: string; replacementConnectionId?: string; projectId?: string; blogAddress?: string; siteUrl?: string; username?: string; applicationPassword?: string; confirmation?: string; displayName?: string };
    const workspaceId = required(body.workspaceId, "Workspace is required."); const data = await workspaceData(workspaceId);
    if (body.action === "cancel") {
      const jobId = required(body.connectionId, "Connection job is required."), job = connectionJobRunner.status(jobId);
      if (!job) throw new Error("Connection job was not found.");
      await ownedConnection(workspaceId, job.connectionId);
      return NextResponse.json({ job: await connectionJobRunner.cancel(jobId) });
    }
    if (body.action === "tistory-connect") { assertPlatformEnabled(data, "tistory"); return await connectTistory(workspaceId, required(body.blogAddress, "Enter your Tistory blog address."), body.connectionId); }
    if (body.action === "verify") { const connection = await ownedConnection(workspaceId, required(body.connectionId, "Connection is required.")); assertPlatformEnabled(data, connection.platform); return await verifyConnection(workspaceId, connection.id); }
    if (body.action === "wordpress-test") { assertPlatformEnabled(data, "wordpress"); return NextResponse.json({ verification: await new WordPressConnectionAdapter().verify(wordpressInput(body)) }); }
    if (body.action === "wordpress-save") { assertPlatformEnabled(data, "wordpress"); return await saveWordPress(workspaceId, body); }
    if (body.action === "disconnect") return await disconnect(workspaceId, required(body.connectionId, "Connection is required."));
    if (body.action === "rename") return await renameConnection(workspaceId, required(body.connectionId, "Connection is required."), required(body.displayName, "Account name is required."));
    if (body.action === "connection-impact") return await connectionImpact(workspaceId, required(body.connectionId, "Connection is required."));
    if (body.action === "delete-connection") return await deleteConnection(workspaceId, required(body.connectionId, "Connection is required."), body.confirmation);
    if (body.action === "migrate-delete-connection") return await migrateAndDeleteConnection(
      workspaceId,
      required(body.connectionId, "Connection is required."),
      required(body.replacementConnectionId, "Replacement account is required."),
      body.confirmation,
    );
    if (body.action === "select-target") { const connection = await ownedConnection(workspaceId, required(body.connectionId, "Connection is required.")); assertPlatformEnabled(data, connection.platform); return await selectTarget(workspaceId, required(body.projectId, "Project is required."), connection.id); }
    throw new Error("Unsupported connection action.");
  } catch (error) { return failure(error); }
}

async function connectTistory(workspaceId: string, address: string, requestedId?: string) {
  const parsed = parseTistoryBlogAddress(address), existing = requestedId ? await connectionRepository.findById(requestedId) : undefined;
  if (existing && existing.workspaceId !== workspaceId) throw new Error("Connection was not found.");
  const id = existing?.id ?? randomUUID(), now = new Date().toISOString();
  const sessionPath = path.join(connectionRoot, "tistory", id, "storage-state.json");
  const connection: PlatformConnection = Object.freeze({ id, workspaceId, platform: "tistory", displayName: parsed.blogId, status: "connecting", publicMetadata: { ...parsed, displayName: parsed.blogId, sessionStateAvailable: Boolean(existing?.publicMetadata.sessionStateAvailable) }, createdAt: existing?.createdAt ?? now, updatedAt: now, selectedAsDefault: existing?.selectedAsDefault ?? false, version: (existing?.version ?? 0) + 1, automationPermissions: existing?.automationPermissions ?? safeDraftPermissions, publishingPolicy: "review_first" });
  await connectionRepository.save(connection);
  const job = new TistoryLoginJob(id, parsed.blogId, sessionPath, async () => { const current = await connectionRepository.findById(id); if (!current) return; const verifiedAt = new Date().toISOString(); await connectionRepository.save(Object.freeze({ ...current, status: "connected", secretReference: `tistory-session-${id}`, lastVerifiedAt: verifiedAt, updatedAt: verifiedAt, publicMetadata: { ...current.publicMetadata, sessionStateAvailable: true, lastAuthenticatedAt: verifiedAt } })); });
  const status = await connectionJobRunner.start(job); return NextResponse.json({ connection: safe(connection), job: status });
}

async function saveWordPress(workspaceId: string, body: Record<string, unknown>) {
  const input = wordpressInput(body), metadata = await new WordPressConnectionAdapter().verify(input), now = new Date().toISOString();
  const existingById = typeof body.connectionId === "string" ? await connectionRepository.findById(body.connectionId) : undefined;
  const existing = existingById ?? (await connectionRepository.listByWorkspace(workspaceId)).find((value) => value.platform === "wordpress" && value.publicMetadata.siteUrl === metadata.siteUrl && value.publicMetadata.username === metadata.username);
  if (existing && existing.workspaceId !== workspaceId) throw new Error("Connection was not found.");
  const reference = await secretStore.storeSecret(`wordpress-${workspaceId}`, input.applicationPassword), id = existing?.id ?? randomUUID();
  const connection: PlatformConnection = Object.freeze({ id, workspaceId, platform: "wordpress", displayName: metadata.siteTitle, status: "connected", publicMetadata: metadata, secretReference: reference, createdAt: existing?.createdAt ?? now, updatedAt: now, lastVerifiedAt: now, selectedAsDefault: existing?.selectedAsDefault ?? false, version: (existing?.version ?? 0) + 1, automationPermissions: existing?.automationPermissions ?? safeDraftPermissions, publishingPolicy: "review_first" });
  try { await connectionRepository.save(connection); if (existing?.secretReference) await secretStore.deleteSecret(existing.secretReference); } catch (error) { await secretStore.deleteSecret(reference); throw error; }
  return NextResponse.json({ connection: safe(connection) });
}

async function verifyConnection(workspaceId: string, id: string) {
  const connection = await connectionRepository.findById(id); if (!connection || connection.workspaceId !== workspaceId) throw new Error("Connection was not found.");
  if (connection.platform === "wordpress") {
    if (!connection.secretReference) throw new Error("WordPress reconnect is required.");
    const applicationPassword = await secretStore.readSecret(connection.secretReference), metadata = connection.publicMetadata as { siteUrl: string; username: string };
    const verified = await new WordPressConnectionAdapter().verify({ siteUrl: metadata.siteUrl, username: metadata.username, applicationPassword });
    const now = new Date().toISOString(); await connectionRepository.save(Object.freeze({ ...connection, status: "connected", publicMetadata: verified, lastVerifiedAt: now, updatedAt: now })); return NextResponse.json({ connected: true, verifiedAt: now });
  }
  const blogUrl = required(connection.publicMetadata.blogUrl, "Tistory reconnect is required."); return connectTistory(workspaceId, blogUrl, connection.id);
}

async function disconnect(workspaceId: string, id: string) {
  const connection = await connectionRepository.findById(id); if (!connection || connection.workspaceId !== workspaceId) throw new Error("Connection was not found.");
  try {
    if (connection.platform === "wordpress" && connection.secretReference) await secretStore.deleteSecret(connection.secretReference);
    if (connection.platform === "tistory") await rm(path.join(connectionRoot, "tistory", id), { recursive: true, force: true });
  } catch {
    await connectionRepository.save(Object.freeze({ ...connection, status: "failed", updatedAt: new Date().toISOString(), publicMetadata: { ...connection.publicMetadata, cleanupRequired: true, safeError: "로컬 연결 정보를 정리하지 못했습니다. 다시 시도해 주세요." } }));
    throw new Error("Connection cleanup is required before disconnect can complete.");
  }
  await connectionRepository.save(Object.freeze({ ...connection, status: "disconnected", secretReference: undefined, updatedAt: new Date().toISOString(), publicMetadata: { ...connection.publicMetadata, sessionStateAvailable: false } }));
  return NextResponse.json({ disconnected: true });
}

async function renameConnection(workspaceId: string, id: string, displayName: string) {
  const connection = await ownedConnection(workspaceId, id), normalized = displayName.replace(/\s+/g, " ").trim();
  if (normalized.length > 80) throw new Error("Account name must be 80 characters or fewer.");
  await connectionRepository.save(Object.freeze({ ...connection, displayName: normalized, updatedAt: new Date().toISOString(), version: connection.version + 1 }));
  return NextResponse.json({ renamed: true });
}

async function connectionImpact(workspaceId: string, id: string) {
  const connection = await ownedConnection(workspaceId, id);
  const state = await studioStore.get<UserData>("application", "user-data");
  const projectCount = (state?.projects ?? []).filter((project) => projectReferencesConnection(project, id)).length;
  const contentCount = (state?.contents ?? []).filter((content) => contentReferencesConnection(content, id)).length;
  return NextResponse.json({ impact: { name: connection.displayName, projectCount, contentCount, canDelete: connection.status === "disconnected" && projectCount === 0 && contentCount === 0 } });
}

async function deleteConnection(workspaceId: string, id: string, confirmation?: string) {
  const connection = await ownedConnection(workspaceId, id);
  if (confirmation !== connection.displayName) throw new Error("Account name confirmation does not match exactly.");
  if (connection.status !== "disconnected") throw new Error("Disconnect the account before deleting its metadata.");
  const impactResponse = await connectionImpact(workspaceId, id), impact = (await impactResponse.json()).impact as { projectCount: number; contentCount: number };
  if (impact.projectCount || impact.contentCount) throw new Error("Remove this account from Projects and Contents before deleting its metadata.");
  await targetRepository.deleteByConnection(id);
  await connectionRepository.delete(id);
  return NextResponse.json({ deleted: true });
}

async function migrateAndDeleteConnection(
  workspaceId: string,
  sourceId: string,
  replacementId: string,
  confirmation?: string,
) {
  const source = await ownedConnection(workspaceId, sourceId);
  const replacement = await ownedConnection(workspaceId, replacementId);
  if (confirmation !== source.displayName) throw new Error("Account name confirmation does not match exactly.");
  assertCompatibleConnectionReplacement(source, replacement);

  const data = await workspaceData(workspaceId);
  const updatedAt = new Date().toISOString();
  const migration = migrateConnectionReferences(data, source.id, replacement.id, updatedAt);
  const affectedContentProjectIds = migration.data.contents
    .filter((content) => migration.affectedContentIds.includes(content.id))
    .map((content) => content.projectId);
  const targetProjectIds = [...new Set([...migration.affectedProjectIds, ...affectedContentProjectIds])];

  for (const projectId of targetProjectIds) {
    const existingTargets = targetRepository.listByProject ? await targetRepository.listByProject(projectId) : [];
    if (!existingTargets.some((target) => target.platformConnectionId === replacement.id)) {
      await targetRepository.save(replacementPublishingTarget(projectId, replacement, updatedAt));
    }
  }

  const remainingProjectReferences = migration.data.projects.filter((project) => projectReferencesConnection(project, source.id));
  const remainingContentReferences = migration.data.contents.filter((content) => contentReferencesConnection(content, source.id));
  if (remainingProjectReferences.length || remainingContentReferences.length) {
    throw new Error("Connection references could not be migrated completely. Nothing was deleted.");
  }

  await studioStore.set("application", "user-data", migration.data);
  await targetRepository.deleteByConnection(source.id);
  await connectionRepository.delete(source.id);

  return NextResponse.json({
    deleted: true,
    migrated: true,
    projectCount: migration.affectedProjectIds.length,
    contentCount: migration.affectedContentIds.length,
    replacementConnectionId: replacement.id,
  });
}

async function ownedConnection(workspaceId: string, id: string) {
  const connection = await connectionRepository.findById(id);
  if (!connection || connection.workspaceId !== workspaceId) throw new Error("Connection was not found.");
  return connection;
}

async function recordConnectionFailure(workspaceId: string, id: string, job: { failureCode?: string; safeMessage?: string; remediation?: string }) {
  const connection = await ownedConnection(workspaceId, id);
  if (connection.status === "failed" && connection.publicMetadata.failureCode === job.failureCode) return;
  await connectionRepository.save(Object.freeze({ ...connection, status: "failed", updatedAt: new Date().toISOString(), publicMetadata: { ...connection.publicMetadata, failureCode: job.failureCode ?? "unknown_error", safeError: job.safeMessage ?? "The connection attempt failed.", remediation: job.remediation ?? "Try connecting again." } }));
}

async function selectTarget(workspaceId: string, projectId: string, connectionId: string) {
  const state = await studioStore.get<{ projects?: Project[] }>("application", "user-data"); const project = state?.projects?.find((value) => value.id === projectId);
  if (!project || project.workspaceId !== workspaceId) throw new Error("Project was not found.");
  const target = await new PlatformConnectionService(connectionRepository, targetRepository).selectTarget(project, connectionId); return NextResponse.json({ target });
}
async function assertWorkspace(workspaceId: string) { await workspaceData(workspaceId); }
async function workspaceData(workspaceId: string) { const state = await studioStore.get<UserData>("application", "user-data"); if (state?.workspace?.id !== workspaceId) throw new Error("Workspace was not found."); return state; }
function assertPlatformEnabled(data: UserData, platform: WorkspacePlatform) { if (!isPlatformEnabled(data, platform)) throw new Error("This platform is disabled in Workspace Settings."); }
function safe(value: PlatformConnection) {
  const metadata = value.platform === "tistory"
    ? { blogId: value.publicMetadata.blogId, blogUrl: value.publicMetadata.blogUrl, sessionStateAvailable: value.publicMetadata.sessionStateAvailable === true, cleanupRequired: value.publicMetadata.cleanupRequired === true, safeError: value.publicMetadata.safeError }
    : { siteUrl: value.publicMetadata.siteUrl, siteTitle: value.publicMetadata.siteTitle, username: value.publicMetadata.username, cleanupRequired: value.publicMetadata.cleanupRequired === true, safeError: value.publicMetadata.safeError };
  const { secretReference: _secret, ...safeValue } = value; void _secret; return { ...safeValue, publicMetadata: metadata };
}
function wordpressInput(body: Record<string, unknown>) { return { siteUrl: required(body.siteUrl, "Enter a WordPress site address."), username: required(body.username, "Enter a WordPress username."), applicationPassword: required(body.applicationPassword, "Enter a WordPress Application Password."), }; }
function required(value: unknown, message: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(message); return value.trim(); }
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Connection request failed.";
  if (message === "Enter a valid Tistory blog address.") return NextResponse.json({ error: message, failureCode: "invalid_blog_url", safeMessage: "Enter a valid Tistory blog address.", remediation: "Use your blog name or a URL such as https://example.tistory.com." }, { status: 400 });
  return NextResponse.json({ error: message }, { status: 400 });
}
