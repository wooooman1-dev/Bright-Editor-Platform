import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { publicDataSourceConnection } from "../../../../app/application/data-sources/PublicDataSourceConnection";

const mocks = vi.hoisted(() => ({
  connectionFind: vi.fn(), connectionList: vi.fn(), connectionSave: vi.fn(),
  snapshotList: vi.fn(), referenceList: vi.fn(), referenceListWorkspace: vi.fn(), referenceSave: vi.fn(), referenceDelete: vi.fn(),
  syncStart: vi.fn(), syncStatus: vi.fn(), storeSecret: vi.fn(), deleteSecret: vi.fn(), studioGet: vi.fn(),
  oauthConfigured: vi.fn(), oauthInvalidate: vi.fn(), oauthRevoke: vi.fn(), dataSourceDelete: vi.fn(),
}));

vi.mock("../../../../app/application/data-sources/data-source-runtime", () => ({
  dataSourceConnectionRepository: { findById: mocks.connectionFind, listByWorkspace: mocks.connectionList, save: mocks.connectionSave },
  dataSourceSnapshotRepository: { listByWorkspace: mocks.snapshotList },
  projectDataSourceReferenceRepository: { listByProject: mocks.referenceList, listByWorkspace: mocks.referenceListWorkspace, save: mocks.referenceSave, delete: mocks.referenceDelete },
  dataSourceSyncService: { start: mocks.syncStart, status: mocks.syncStatus },
  googleOAuthClientFactory: { configured: mocks.oauthConfigured },
  googleOAuthCredentialService: { revoke: mocks.oauthRevoke },
  googleOAuthStateStore: { invalidate: mocks.oauthInvalidate },
  dataSourceDeletionService: { delete: mocks.dataSourceDelete },
}));
vi.mock("../../../../app/application/connections/connection-runtime", () => ({ secretStore: { storeSecret: mocks.storeSecret, deleteSecret: mocks.deleteSecret } }));
vi.mock("../../../../app/application/studio-store", () => ({ studioStore: { get: mocks.studioGet } }));

import { DELETE, GET, POST } from "../../../../app/api/data-sources/route";

function request(body: unknown) { return new Request("http://localhost/api/data-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
function saveBody(provider: string, resourceConfiguration: Record<string, unknown>, credentials: Record<string, string> = { accessToken: "secret-token-value" }) { return { action: "save-connection", workspaceId: "workspace-1", provider, displayName: "Connection", resourceConfiguration, credentials }; }

describe("Data Source API safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.studioGet.mockResolvedValue({ workspace: { id: "workspace-1" }, projects: [] });
    mocks.storeSecret.mockResolvedValue("secret-reference");
    mocks.connectionSave.mockResolvedValue(undefined);
    mocks.deleteSecret.mockResolvedValue(undefined);
    mocks.oauthConfigured.mockReturnValue(false);
    mocks.oauthInvalidate.mockResolvedValue(undefined);
    mocks.oauthRevoke.mockResolvedValue(undefined);
    mocks.connectionList.mockResolvedValue([]);
    mocks.snapshotList.mockResolvedValue([]);
    mocks.referenceList.mockResolvedValue([]);
    mocks.referenceListWorkspace.mockResolvedValue([]);
    mocks.dataSourceDelete.mockResolvedValue({ deleted: true, alreadyDeleted: false, connectionId: "connection-1", status: "deleted", removedProjectReferences: 1, retainedSnapshots: 1, retainedEvidence: 2 });
  });

  it.each([
    ["googleSearchConsole", {}, "siteProperty", "Search Console 사이트 속성을 입력해 주세요."],
    ["googleAnalytics4", {}, "propertyId", "GA4 property ID를 입력해 주세요."],
    ["googleAdSense", {}, "accountReference", "AdSense 계정 리소스를 입력해 주세요."],
  ])("returns a structured 400 for missing %s resource", async (provider, resourceConfiguration, field, error) => {
    const response = await POST(request(saveBody(provider, resourceConfiguration)));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error, code: "DATA_SOURCE_RESOURCE_VALIDATION_ERROR", field });
    expect(mocks.storeSecret).not.toHaveBeenCalled();
  });

  it("returns a structured 400 when only one NAVER credential is supplied", async () => {
    const response = await POST(request(saveBody("naverSearchTrend", { keywords: ["콘텐츠"] }, { clientId: "client-id-secret" })));
    expect(response.status).toBe(400);
    const result = await response.json();
    expect(result).toMatchObject({ code: "DATA_SOURCE_CREDENTIAL_VALIDATION_ERROR", field: "clientSecret" });
    expect(JSON.stringify(result)).not.toContain("client-id-secret");
  });

  it("rejects an invented Search Console property and accepts a server-listed property", async () => {
    mocks.connectionFind.mockResolvedValue({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "configurationRequired", secretReference: "secret-reference", credentialMode: "googleOAuth", resourceConfiguration: {}, availableResources: [{ siteUrl: "sc-domain:allowed.example", permissionLevel: "siteOwner" }], enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    const invented = await POST(request({ ...saveBody("googleSearchConsole", { siteProperty: "sc-domain:invented.example" }, {}), connectionId: "connection-1", connectionVersion: 1 }));
    expect(invented.status).toBe(400);
    await expect(invented.json()).resolves.toMatchObject({ code: "GOOGLE_SEARCH_CONSOLE_RESOURCE_NOT_FOUND", field: "siteProperty" });
    const allowed = await POST(request({ ...saveBody("googleSearchConsole", { siteProperty: "sc-domain:allowed.example" }, {}), connectionId: "connection-1", connectionVersion: 1 }));
    expect(allowed.status).toBe(200);
    expect(mocks.connectionSave).toHaveBeenCalledWith(expect.objectContaining({ id: "connection-1", status: "connected", resourceConfiguration: { siteProperty: "sc-domain:allowed.example" }, credentialMode: "googleOAuth" }));
  });

  it("uses 500 only for an unexpected failure without reflecting credentials", async () => {
    mocks.connectionSave.mockRejectedValueOnce(new Error("database failed near secret-token-value"));
    const response = await POST(request(saveBody("googleAnalytics4", { propertyId: "123456" })));
    expect(response.status).toBe(500);
    const result = await response.json();
    expect(result).toMatchObject({ code: "DATA_SOURCE_INTERNAL_ERROR" });
    expect(JSON.stringify(result)).not.toContain("secret-token-value");
  });

  it("returns 400 for malformed JSON payloads", async () => {
    const response = await POST(new Request("http://localhost/api/data-sources", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "DATA_SOURCE_REQUEST_VALIDATION_ERROR" });
  });

  it("never returns secret references or active operation IDs in public connection JSON", () => {
    const value = publicDataSourceConnection({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "syncing", secretReference: "secret-token-file", activeOperationId: "operation-private", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    expect(value.hasCredentials).toBe(true);
    expect(JSON.stringify(value)).not.toContain("secret-token-file");
    expect(JSON.stringify(value)).not.toContain("operation-private");
  });

  it("returns a callback-created resource-required connection and its safe resource candidates from GET", async () => {
    mocks.connectionList.mockResolvedValue([{ id: "callback-oauth", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "Google Search Console", status: "configurationRequired", secretReference: "dpapi-secret-reference", credentialMode: "googleOAuth", resourceConfiguration: {}, availableResources: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }], enabled: true, createdAt: "now", updatedAt: "now", version: 1 }]);
    const response = await GET(new Request("http://localhost/api/data-sources?workspaceId=workspace-1"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.connections).toEqual([expect.objectContaining({ id: "callback-oauth", status: "configurationRequired", credentialMode: "googleOAuth", hasCredentials: true, availableResources: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] })]);
    expect(JSON.stringify(result)).not.toContain("dpapi-secret-reference");
  });

  it("returns Workspace-wide Project reference counts without exposing credentials", async () => {
    mocks.connectionList.mockResolvedValue([{ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "ready", secretReference: "secret-reference", credentialMode: "googleOAuth", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 }]);
    mocks.referenceListWorkspace.mockResolvedValue([{ workspaceId: "workspace-1", projectId: "project-1", connectionId: "connection-1", enabled: true }, { workspaceId: "workspace-1", projectId: "project-2", connectionId: "connection-1", enabled: true }]);
    const response = await GET(new Request("http://localhost/api/data-sources?workspaceId=workspace-1"));
    await expect(response.json()).resolves.toMatchObject({ connections: [{ id: "connection-1", projectReferenceCount: 2, hasCredentials: true }] });
  });

  it("uses the dedicated DELETE contract and returns only safe deletion metadata", async () => {
    const response = await DELETE(new Request("http://localhost/api/data-sources", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 4, confirmationMode: "deleteDisconnected" }) }));
    expect(response.status).toBe(200);
    expect(mocks.dataSourceDelete).toHaveBeenCalledWith({ workspaceId: "workspace-1", connectionId: "connection-1", connectionVersion: 4, confirmationMode: "deleteDisconnected" });
    const result = await response.json();
    expect(result).toMatchObject({ deleted: true, connectionId: "connection-1", status: "deleted" });
    expect(JSON.stringify(result)).not.toMatch(/token|secretReference|oauth/i);
  });

  it("localizes a persisted authentication error and retains the last successful snapshot", () => {
    const value = publicDataSourceConnection(
      { id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "error", secretReference: "secret-token-file", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, lastError: "Provider authentication failed. Reconnect the data source.", lastSuccessfulSyncAt: "2026-07-18T00:00:00.000Z", createdAt: "now", updatedAt: "now", version: 2 },
      { periodStart: "2026-06-01", periodEnd: "2026-06-30", syncedAt: "2026-07-18T00:00:00.000Z", limitations: ["외부 검색 수요 미검증"] },
    );
    expect(value).toMatchObject({ credentialMode: "legacyManualToken", lastErrorCode: "DATA_SOURCE_AUTHENTICATION_ERROR", lastError: "기존 수동 token 연결입니다. Google 계정으로 다시 연결해 주세요.", latestSnapshot: { periodStart: "2026-06-01" } });
    expect(JSON.stringify(value)).not.toContain("Provider authentication failed");
  });

  it("keeps Project and Connection Workspace ownership checks on every reference mutation", () => {
    const source = readFileSync(join(process.cwd(), "app/api/data-sources/route.ts"), "utf8");
    expect(source).toContain("ownedProject(data, projectId)");
    expect(source).toContain("ownedConnection(project.workspaceId, connectionId)");
    expect(source).toContain("DATA_SOURCE_PERMISSION_ERROR");
    expect(source).toContain("connectionVersion");
  });

  it("keeps conditional providers disabled until official access is verified", () => {
    const source = readFileSync(join(process.cwd(), "app/api/data-sources/route.ts"), "utf8");
    expect(source).toContain("공식 API 접근이 확인되기 전에는 이 Provider를 활성화할 수 없습니다");
    expect(source).not.toContain("pytrends");
  });
});
