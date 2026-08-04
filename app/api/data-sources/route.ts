import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  isDataSourceProvider,
  type DataSourceConnection,
  type DataSourceResourceConfiguration,
  type ProjectDataSourceReference,
} from "../../../core/intelligence";
import { secretStore } from "../../application/connections/connection-runtime";
import {
  dataSourceConnectionRepository,
  dataSourceDeletionService,
  dataSourceSnapshotRepository,
  dataSourceSyncService,
  googleOAuthClientFactory,
  googleOAuthCredentialService,
  googleOAuthStateStore,
  projectDataSourceReferenceRepository,
} from "../../application/data-sources/data-source-runtime";
import { DataSourceError, publicDataSourceError } from "../../application/data-sources/DataSourceErrors";
import { publicDataSourceConnection } from "../../application/data-sources/PublicDataSourceConnection";
import { studioStore } from "../../application/studio-store";
import type { UserData } from "../../user-flow/user-data";

const googleOAuthProviders = new Set<DataSourceConnection["provider"]>(["googleSearchConsole", "youtubeAnalytics"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url), workspaceId = required(url.searchParams.get("workspaceId"), "Workspace is required."), data = await ownedWorkspace(workspaceId);
    const jobId = url.searchParams.get("jobId");
    if (jobId) return NextResponse.json({ job: dataSourceSyncService.status(workspaceId, jobId) ?? null });
    const projectId = url.searchParams.get("projectId");
    if (projectId) ownedProject(data, projectId);
    const connections = await dataSourceConnectionRepository.listByWorkspace(workspaceId);
    const snapshots = await dataSourceSnapshotRepository.listByWorkspace(workspaceId);
    const workspaceReferences = await visibleWorkspaceReferences(data);
    const references = projectId ? workspaceReferences.filter((value) => value.projectId === projectId) : [];
    return NextResponse.json({
      connections: connections.map((connection) => ({
        ...publicDataSourceConnection(connection, snapshots.filter((value) => value.connectionId === connection.id).sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))[0]),
        projectReferenceCount: workspaceReferences.filter((value) => value.connectionId === connection.id).length,
      })),
      projectReferences: references,
      workspaceProjectReferences: workspaceReferences,
      googleOAuth: { configured: googleOAuthClientFactory.configured() },
      conditionalProviders: [
        { provider: "googleAdsKeywordPlanning", status: "configurationRequired", reason: "Google Ads API access and an authorized customer account must be verified before activation." },
        { provider: "googleTrendsOfficial", status: "configurationRequired", reason: "Official Google Trends API access and a resource reference must be verified before activation. Scraping is not used." },
      ],
    });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const body = await requestBody(request), workspaceId = required(body.workspaceId, "Workspace를 선택해 주세요.", "workspaceId");
    await ownedWorkspace(workspaceId);
    const confirmationMode = deletionMode(body.confirmationMode);
    const result = await dataSourceDeletionService.delete({ workspaceId, connectionId: required(body.connectionId, "Data Source 연결을 선택해 주세요.", "connectionId"), connectionVersion: number(body.connectionVersion), confirmationMode });
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await requestBody(request), workspaceId = required(body.workspaceId, "Workspace를 선택해 주세요.", "workspaceId"), data = await ownedWorkspace(workspaceId);
    if (body.action === "save-connection") return await saveConnection(workspaceId, body);
    if (body.action === "create-google-resource-connection") return await createGoogleResourceConnection(workspaceId, body);
    if (body.action === "disconnect") return await disconnect(workspaceId, required(body.connectionId, "Data Source 연결을 선택해 주세요.", "connectionId"), number(body.connectionVersion));
    if (body.action === "set-enabled") return await setEnabled(workspaceId, required(body.connectionId, "Data Source 연결을 선택해 주세요.", "connectionId"), number(body.connectionVersion), body.enabled === true);
    if (body.action === "set-project-reference") return await setProjectReference(data, required(body.projectId, "Project를 선택해 주세요.", "projectId"), required(body.connectionId, "Data Source 연결을 선택해 주세요.", "connectionId"), body.enabled === true);
    if (body.action === "sync") return await startSync(workspaceId, body);
    throw new DataSourceError("지원하지 않는 Data Source 요청입니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "action");
  } catch (error) { return failure(error); }
}

async function saveConnection(workspaceId: string, body: Record<string, unknown>) {
  if (!isDataSourceProvider(body.provider)) throw new DataSourceError("지원하지 않는 Data Source Provider입니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "provider");
  const provider = body.provider;
  if (provider === "googleAdsKeywordPlanning" || provider === "googleTrendsOfficial") throw new DataSourceError("공식 API 접근이 확인되기 전에는 이 Provider를 활성화할 수 없습니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "provider");
  const existing = typeof body.connectionId === "string" ? await ownedConnection(workspaceId, body.connectionId) : undefined;
  if (existing && existing.provider !== provider) throw new DataSourceError("연결 Provider가 일치하지 않습니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "provider");
  if (existing && existing.version !== number(body.connectionVersion)) throw new DataSourceError("연결 정보가 변경되었습니다. 새로고침 후 다시 저장해 주세요.", "DATA_SOURCE_CONFLICT", 409, "connectionVersion");
  let resourceConfiguration = sanitizeResourceConfiguration(body.resourceConfiguration);
  const displayName = required(body.displayName, "표시 이름을 입력해 주세요.", "displayName"), credentials = sanitizeCredentials(body.credentials);
  validateResource(provider, resourceConfiguration);
  if (googleOAuthProviders.has(provider)) {
    if (Object.keys(credentials).length) throw new DataSourceError("Google OAuth credential은 callback 또는 기존 Google 연결 재사용 경로에서만 저장할 수 있습니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "credentials");
    if (!existing || existing.credentialMode !== "googleOAuth" || !existing.secretReference) throw new DataSourceError("먼저 Google 계정을 연결하거나 기존 Google 연결을 재사용해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 400);
    const selectedId = provider === "googleSearchConsole" ? resourceConfiguration.siteProperty : resourceConfiguration.channelId;
    const selected = existing.availableResources?.find((value) => (value.resourceId ?? value.siteUrl) === selectedId);
    if (!selected) throw new DataSourceError(provider === "googleSearchConsole" ? "선택한 Search Console 속성에 접근할 수 없습니다. 속성을 다시 선택해 주세요." : "선택한 YouTube 채널에 접근할 수 없습니다. 채널을 다시 선택해 주세요.", provider === "googleSearchConsole" ? "GOOGLE_SEARCH_CONSOLE_RESOURCE_NOT_FOUND" : "DATA_SOURCE_RESOURCE_NOT_FOUND", 400, provider === "googleSearchConsole" ? "siteProperty" : "channelId");
    if (provider === "youtubeAnalytics") resourceConfiguration = Object.freeze({ ...resourceConfiguration, channelTitle: selected.displayName ?? selected.siteUrl });
  } else if (Object.keys(credentials).length) validateCredentials(provider, credentials);
  if (existing) assertResourceIdentityUnchanged(existing, resourceConfiguration);
  let secretReference = existing?.secretReference, createdSecret: string | undefined;
  if (!googleOAuthProviders.has(provider) && Object.keys(credentials).length) { createdSecret = await secretStore.storeSecret(`data-source-${workspaceId}-${provider}`, JSON.stringify(credentials)); secretReference = createdSecret; }
  if (!secretReference) throw new DataSourceError(provider === "naverSearchTrend" ? "NAVER Client ID와 Client Secret을 입력해 주세요." : "OAuth access token을 입력해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 400, provider === "naverSearchTrend" ? "clientId" : "accessToken");
  const now = new Date().toISOString(), connection: DataSourceConnection = Object.freeze({ id: existing?.id ?? randomUUID(), workspaceId, provider, displayName, status: "connected", secretReference, credentialMode: googleOAuthProviders.has(provider) ? "googleOAuth" : "providerCredential", resourceConfiguration, availableResources: existing?.availableResources, enabled: body.enabled !== false, lastSuccessfulSyncAt: existing?.lastSuccessfulSyncAt, lastSyncAttemptAt: existing?.lastSyncAttemptAt, createdAt: existing?.createdAt ?? now, updatedAt: now, version: (existing?.version ?? 0) + 1 });
  try {
    await dataSourceConnectionRepository.save(connection);
  } catch (error) { if (createdSecret) await secretStore.deleteSecret(createdSecret); throw error; }
  if (createdSecret && existing?.secretReference) await secretStore.deleteSecret(existing.secretReference).catch(() => undefined);
  return NextResponse.json({ connection: publicDataSourceConnection(connection) });
}

async function createGoogleResourceConnection(workspaceId: string, body: Record<string, unknown>) {
  const source = await ownedConnection(workspaceId, required(body.sourceConnectionId, "재사용할 Google 연결을 선택해 주세요.", "sourceConnectionId"));
  if (!googleOAuthProviders.has(source.provider) || source.credentialMode !== "googleOAuth" || !source.secretReference || source.status === "disconnected") {
    throw new DataSourceError("재사용 가능한 Google OAuth 연결이 아닙니다.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 400, "sourceConnectionId");
  }
  const now = new Date().toISOString();
  const connection: DataSourceConnection = Object.freeze({
    id: randomUUID(), workspaceId, provider: source.provider,
    displayName: required(body.displayName, "새 연결의 표시 이름을 입력해 주세요.", "displayName"),
    status: "configurationRequired", secretReference: source.secretReference, credentialMode: "googleOAuth",
    resourceConfiguration: Object.freeze({}), availableResources: source.availableResources,
    enabled: true, createdAt: now, updatedAt: now, version: 1,
  });
  await dataSourceConnectionRepository.save(connection);
  return NextResponse.json({ connection: publicDataSourceConnection(connection), reusedGoogleCredential: true });
}

async function disconnect(workspaceId: string, connectionId: string, version: number) {
  const connection = await ownedConnection(workspaceId, connectionId);
  if (connection.version !== version) throw new DataSourceError("연결 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", "DATA_SOURCE_CONFLICT", 409, "connectionVersion");
  await googleOAuthStateStore.invalidate({ workspaceId, connectionId }).catch(() => undefined);
  const sharedCredential = await credentialIsShared(connection);
  if (!sharedCredential) {
    await googleOAuthCredentialService.revoke(connection);
    if (connection.secretReference) await secretStore.deleteSecret(connection.secretReference);
  }
  const now = new Date().toISOString();
  await dataSourceConnectionRepository.save(Object.freeze({ ...connection, status: "disconnected", enabled: false, secretReference: undefined, activeOperationId: undefined, lastError: undefined, lastErrorCode: undefined, updatedAt: now, version: connection.version + 1 }));
  return NextResponse.json({ disconnected: true, retainedSnapshots: true, sharedCredentialRetained: sharedCredential, message: "연결과 비밀정보 참조를 해제했습니다. 마지막 성공 snapshot과 Evidence는 안전하게 유지됩니다." });
}

async function setEnabled(workspaceId: string, connectionId: string, version: number, enabled: boolean) {
  const connection = await ownedConnection(workspaceId, connectionId);
  if (connection.version !== version) throw new DataSourceError("연결 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.", "DATA_SOURCE_CONFLICT", 409, "connectionVersion");
  if (enabled && (connection.status === "disconnected" || !connection.secretReference)) throw new DataSourceError("연결 정보를 다시 설정한 후 활성화해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 400);
  await dataSourceConnectionRepository.save(Object.freeze({ ...connection, enabled, updatedAt: new Date().toISOString(), version: connection.version + 1 }));
  return NextResponse.json({ enabled });
}

async function setProjectReference(data: UserData, projectId: string, connectionId: string, enabled: boolean) {
  const project = ownedProject(data, projectId), connection = await ownedConnection(project.workspaceId, connectionId);
  if (connection.workspaceId !== project.workspaceId) throw new DataSourceError("다른 Workspace의 Data Source를 이 Project에서 사용할 수 없습니다.", "DATA_SOURCE_PERMISSION_ERROR", 403);
  if (enabled) {
    const ownerReference = (await visibleWorkspaceReferences(data)).find((reference) => reference.connectionId === connectionId);
    if (ownerReference && ownerReference.projectId !== projectId) {
      const ownerName = data.projects.find((value) => value.id === ownerReference.projectId)?.name ?? ownerReference.projectId;
      throw new DataSourceError(`이 연결은 이미 ${ownerName} Project에서 사용 중입니다. ${project.name}에는 전용 연결을 새로 추가해 주세요.`, "DATA_SOURCE_PROJECT_SCOPE_CONFLICT", 409, "connectionId");
    }
    await projectDataSourceReferenceRepository.save(Object.freeze({ workspaceId: project.workspaceId, projectId, connectionId, enabled: true, updatedAt: new Date().toISOString() }));
  } else {
    await projectDataSourceReferenceRepository.delete(projectId, connectionId);
  }
  return NextResponse.json({ referenced: enabled });
}

async function startSync(workspaceId: string, body: Record<string, unknown>) {
  const connectionId = required(body.connectionId, "Data Source 연결을 선택해 주세요.", "connectionId"), connection = await ownedConnection(workspaceId, connectionId);
  const periodEnd = date(body.periodEnd, new Date()), periodStart = date(body.periodStart, new Date(Date.parse(periodEnd) - 27 * 86400000));
  const job = await dataSourceSyncService.start({ workspaceId, connectionId, connectionVersion: number(body.connectionVersion), periodStart, periodEnd, operationId: typeof body.operationId === "string" ? body.operationId : undefined });
  return NextResponse.json({ job, connectionVersion: connection.version + 1 });
}

async function visibleWorkspaceReferences(data: UserData): Promise<readonly ProjectDataSourceReference[]> {
  const references = (await Promise.all(data.projects.map((project) => projectDataSourceReferenceRepository.listByProject(project.id)))).flat();
  const byConnection = new Map<string, ProjectDataSourceReference>();
  for (const reference of references) {
    if (reference.enabled && reference.workspaceId === data.workspace?.id && !byConnection.has(reference.connectionId)) {
      byConnection.set(reference.connectionId, reference);
    }
  }
  return Object.freeze([...byConnection.values()]);
}

function assertResourceIdentityUnchanged(existing: DataSourceConnection, next: DataSourceResourceConfiguration): void {
  const currentIdentity = resourceIdentity(existing.provider, existing.resourceConfiguration);
  if (!currentIdentity.value) return;
  const nextIdentity = resourceIdentity(existing.provider, next);
  if (currentIdentity.value === nextIdentity.value) return;
  throw new DataSourceError(
    "기존 Data Source 연결의 사이트·채널·계정·키워드 resource는 변경할 수 없습니다. 다른 resource는 새 연결을 추가해 주세요.",
    "DATA_SOURCE_CONFLICT",
    409,
    currentIdentity.field,
  );
}

function resourceIdentity(provider: DataSourceConnection["provider"], value: DataSourceResourceConfiguration): Readonly<{ field: string; value: string }> {
  if (provider === "googleSearchConsole") return Object.freeze({ field: "siteProperty", value: value.siteProperty?.trim() ?? "" });
  if (provider === "googleAnalytics4") return Object.freeze({ field: "propertyId", value: value.propertyId?.trim() ?? "" });
  if (provider === "googleAdSense") return Object.freeze({ field: "accountReference", value: `${value.accountReference?.trim() ?? ""}\u0000${value.siteReference?.trim() ?? ""}`.replace(/^\u0000$/, "") });
  if (provider === "youtubeAnalytics") return Object.freeze({ field: "channelId", value: value.channelId?.trim() ?? "" });
  if (provider === "naverSearchTrend") return Object.freeze({ field: "keywords", value: [...new Set((value.keywords ?? []).map((item) => item.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")).filter(Boolean))].sort().join("\u0000") });
  return Object.freeze({ field: "resourceConfiguration", value: value.officialResourceReference?.trim() ?? value.customerReference?.trim() ?? "" });
}

async function credentialIsShared(connection: DataSourceConnection): Promise<boolean> {
  if (!connection.secretReference) return false;
  return (await dataSourceConnectionRepository.listByWorkspace(connection.workspaceId)).some((value) => value.id !== connection.id && value.secretReference === connection.secretReference && value.status !== "disconnected");
}
async function ownedWorkspace(workspaceId: string) { const data = await studioStore.get<UserData>("application", "user-data"); if (!data?.workspace || data.workspace.id !== workspaceId) throw new DataSourceError("Workspace를 찾을 수 없습니다.", "DATA_SOURCE_NOT_FOUND", 404); return data; }
function ownedProject(data: UserData, projectId: string) { const project = data.projects.find((value) => value.id === projectId && value.workspaceId === data.workspace?.id); if (!project) throw new DataSourceError("이 Workspace에서 Project에 접근할 수 없습니다.", "DATA_SOURCE_PERMISSION_ERROR", 403); return project; }
async function ownedConnection(workspaceId: string, id: string) { const value = await dataSourceConnectionRepository.findById(id); if (!value) throw new DataSourceError("Data Source 연결을 찾을 수 없습니다.", "DATA_SOURCE_NOT_FOUND", 404); if (value.workspaceId !== workspaceId) throw new DataSourceError("이 Workspace에서 Data Source 연결에 접근할 수 없습니다.", "DATA_SOURCE_PERMISSION_ERROR", 403); return value; }
function sanitizeResourceConfiguration(value: unknown): DataSourceResourceConfiguration {
  if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
  const input = value as Record<string, unknown>, allowed = ["siteProperty", "country", "device", "searchType", "propertyId", "streamReference", "accountReference", "siteReference", "channelId", "channelTitle", "region", "gender", "customerReference", "officialResourceReference"];
  const result: Record<string, string | readonly string[]> = {};
  for (const key of allowed) if (typeof input[key] === "string" && input[key].trim()) result[key] = input[key].trim().slice(0, 500);
  for (const key of ["ages", "keywords"]) if (Array.isArray(input[key])) result[key] = Object.freeze((input[key] as unknown[]).filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 20));
  return Object.freeze(result);
}
function sanitizeCredentials(value: unknown): Record<string, string> { if (!value || typeof value !== "object" || Array.isArray(value)) return {}; const input = value as Record<string, unknown>; return Object.fromEntries(["accessToken", "refreshToken", "clientId", "clientSecret"].flatMap((key) => typeof input[key] === "string" && input[key].trim() ? [[key, input[key].trim()]] : [])); }
function validateResource(provider: DataSourceConnection["provider"], value: DataSourceResourceConfiguration) { if (provider === "googleSearchConsole" && !value.siteProperty) throw new DataSourceError("Search Console 사이트 속성을 입력해 주세요.", "DATA_SOURCE_RESOURCE_VALIDATION_ERROR", 400, "siteProperty"); if (provider === "googleAnalytics4" && !value.propertyId) throw new DataSourceError("GA4 property ID를 입력해 주세요.", "DATA_SOURCE_RESOURCE_VALIDATION_ERROR", 400, "propertyId"); if (provider === "googleAdSense" && !value.accountReference) throw new DataSourceError("AdSense 계정 리소스를 입력해 주세요.", "DATA_SOURCE_RESOURCE_VALIDATION_ERROR", 400, "accountReference"); if (provider === "youtubeAnalytics" && !value.channelId) throw new DataSourceError("YouTube 채널을 선택해 주세요.", "DATA_SOURCE_RESOURCE_VALIDATION_ERROR", 400, "channelId"); if (provider === "naverSearchTrend" && !value.keywords?.length) throw new DataSourceError("NAVER 검색어를 하나 이상 입력해 주세요.", "DATA_SOURCE_RESOURCE_VALIDATION_ERROR", 400, "keywords"); }
function validateCredentials(provider: DataSourceConnection["provider"], value: Record<string, string>) { if (provider === "naverSearchTrend" && (!value.clientId || !value.clientSecret)) throw new DataSourceError("NAVER Client ID와 Client Secret을 모두 입력해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 400, !value.clientId ? "clientId" : "clientSecret"); if (provider !== "naverSearchTrend" && !value.accessToken) throw new DataSourceError("OAuth access token을 입력해 주세요.", "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", 400, "accessToken"); }
function required(value: unknown, error: string, field?: string): string { if (typeof value !== "string" || !value.trim()) throw new DataSourceError(error, "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, field); return value.trim(); }
function number(value: unknown): number { const result = Number(value); if (!Number.isInteger(result) || result < 0) throw new DataSourceError("올바른 connection version이 필요합니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "connectionVersion"); return result; }
function deletionMode(value: unknown): "deleteDisconnected" | "disconnectAndDelete" { if (value === "deleteDisconnected" || value === "disconnectAndDelete") return value; throw new DataSourceError("삭제 확인 방식이 필요합니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "confirmationMode"); }
function date(value: unknown, fallback: Date): string { if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value; return fallback.toISOString().slice(0, 10); }
async function requestBody(request: Request): Promise<Record<string, unknown>> { try { const value = await request.json(); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; } catch { throw new DataSourceError("올바른 요청 payload가 필요합니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400); } }
function failure(error: unknown) { const value = publicDataSourceError(error); return NextResponse.json({ error: value.error, code: value.code, ...(value.field ? { field: value.field } : {}) }, { status: value.status }); }
