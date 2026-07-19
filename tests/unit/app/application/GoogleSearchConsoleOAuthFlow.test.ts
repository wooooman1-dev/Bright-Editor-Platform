import { describe, expect, it, vi } from "vitest";
import { InMemoryPersistenceStore } from "../../../../core/data";
import { DurableDataSourceConnectionRepository } from "../../../../app/application/data-sources/DataSourceRepositories";
import { GoogleSearchConsoleOAuthFlow } from "../../../../app/application/data-sources/google/GoogleSearchConsoleOAuthFlow";
import { GoogleSearchConsoleService } from "../../../../app/application/data-sources/google/GoogleSearchConsoleService";

function secretStore() { return { storeSecret: vi.fn().mockResolvedValue("new-secret-reference"), readSecret: vi.fn(), replaceSecret: vi.fn(), deleteSecret: vi.fn().mockResolvedValue(undefined), secretExists: vi.fn() }; }
const credential = { kind: "googleOAuth" as const, accessToken: "access-secret", refreshToken: "refresh-secret", grantedScopes: ["https://www.googleapis.com/auth/webmasters.readonly"] };

describe("Google Search Console OAuth completion", () => {
  it("creates a configuration-required connection with projected sites and no public token fields", async () => {
    const connections = new DurableDataSourceConnectionRepository(new InMemoryPersistenceStore()), secrets = secretStore();
    const flow = new GoogleSearchConsoleOAuthFlow(connections, secrets, { exchangeCode: vi.fn().mockResolvedValue({ client: {}, credential }) } as never, { listSites: vi.fn().mockResolvedValue([{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }]) } as never);
    const result = await flow.complete({ workspaceId: "workspace-1", code: "authorization-code" });
    expect(result.connection).toMatchObject({ workspaceId: "workspace-1", provider: "googleSearchConsole", status: "configurationRequired", credentialMode: "googleOAuth", secretReference: "new-secret-reference", availableResources: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] });
    expect(result.resourceRequired).toBe(true);
    expect(JSON.stringify(result.connection)).not.toContain("access-secret");
  });

  it("keeps Connection identity, snapshots metadata, and a still-accessible selected site during reconnection", async () => {
    const connections = new DurableDataSourceConnectionRepository(new InMemoryPersistenceStore()), secrets = secretStore();
    await connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "Existing", status: "error", secretReference: "old-secret", credentialMode: "googleOAuth", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, availableResources: [{ siteUrl: "sc-domain:example.com" }], enabled: true, lastSuccessfulSyncAt: "2026-07-18T00:00:00.000Z", createdAt: "created", updatedAt: "old", version: 4 });
    const flow = new GoogleSearchConsoleOAuthFlow(connections, secrets, { exchangeCode: vi.fn().mockResolvedValue({ client: {}, credential }) } as never, { listSites: vi.fn().mockResolvedValue([{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }]) } as never);
    const result = await flow.complete({ workspaceId: "workspace-1", connectionId: "connection-1", code: "code" });
    expect(result.connection).toMatchObject({ id: "connection-1", displayName: "Existing", status: "connected", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, lastSuccessfulSyncAt: "2026-07-18T00:00:00.000Z", version: 5 });
    expect(secrets.deleteSecret).toHaveBeenCalledWith("old-secret");
  });

  it("requires a new selection when the prior site is unavailable and handles an empty site list without 500", async () => {
    const connections = new DurableDataSourceConnectionRepository(new InMemoryPersistenceStore()), secrets = secretStore();
    await connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "Existing", status: "ready", secretReference: "old-secret", credentialMode: "googleOAuth", resourceConfiguration: { siteProperty: "sc-domain:old.example" }, enabled: true, createdAt: "created", updatedAt: "old", version: 1 });
    const flow = new GoogleSearchConsoleOAuthFlow(connections, secrets, { exchangeCode: vi.fn().mockResolvedValue({ client: {}, credential }) } as never, { listSites: vi.fn().mockResolvedValue([]) } as never);
    const result = await flow.complete({ workspaceId: "workspace-1", connectionId: "connection-1", code: "code" });
    expect(result.connection.status).toBe("configurationRequired");
    expect(result.connection.resourceConfiguration.siteProperty).toBeUndefined();
    expect(result.connection.availableResources).toEqual([]);
  });

  it("rejects cross-Workspace reconnection before token exchange", async () => {
    const connections = new DurableDataSourceConnectionRepository(new InMemoryPersistenceStore()), secrets = secretStore(), exchangeCode = vi.fn();
    await connections.save({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "Existing", status: "connected", secretReference: "old", resourceConfiguration: {}, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    const flow = new GoogleSearchConsoleOAuthFlow(connections, secrets, { exchangeCode } as never, { listSites: vi.fn() } as never);
    await expect(flow.complete({ workspaceId: "workspace-2", connectionId: "connection-1", code: "code" })).rejects.toMatchObject({ code: "DATA_SOURCE_WORKSPACE_FORBIDDEN" });
    expect(exchangeCode).not.toHaveBeenCalled();
  });
});

describe("Google Search Console resource service", () => {
  it("projects sites.list resources and permission levels", async () => {
    const api = { sites: { list: vi.fn().mockResolvedValue({ data: { siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteFullUser" }, { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] } }) }, searchanalytics: { query: vi.fn() } };
    const service = new GoogleSearchConsoleService({ authorized: vi.fn() } as never, (() => api) as never);
    await expect(service.listSites({} as never)).resolves.toEqual([{ siteUrl: "https://example.com/", permissionLevel: "siteFullUser" }, { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }]);
  });

  it("rejects a client-invented site property before any Provider call", async () => {
    const authorized = vi.fn(), query = vi.fn(), service = new GoogleSearchConsoleService({ authorized } as never, (() => ({ sites: { list: vi.fn() }, searchanalytics: { query } })) as never);
    await expect(service.sync({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", resourceConfiguration: { siteProperty: "sc-domain:invented.example" }, availableResources: [{ siteUrl: "sc-domain:allowed.example" }], enabled: true, createdAt: "now", updatedAt: "now", version: 1 }, { periodStart: "2026-07-01", periodEnd: "2026-07-18", operationId: "operation-1" })).rejects.toMatchObject({ code: "GOOGLE_SEARCH_CONSOLE_RESOURCE_NOT_FOUND", field: "siteProperty" });
    expect(authorized).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
  });

  it("keeps existing Search Analytics sync semantics for an accessible site", async () => {
    const persist = vi.fn(), query = vi.fn().mockResolvedValue({ data: { rows: [{ keys: ["검색어", "https://example.com/page"], clicks: 2, impressions: 10, ctr: 0.2, position: 3 }] } });
    const service = new GoogleSearchConsoleService({ authorized: vi.fn().mockResolvedValue({ client: {}, persist }) } as never, (() => ({ sites: { list: vi.fn() }, searchanalytics: { query } })) as never);
    const result = await service.sync({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret", credentialMode: "googleOAuth", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, availableResources: [{ siteUrl: "sc-domain:example.com" }], enabled: true, createdAt: "now", updatedAt: "now", version: 1 }, { periodStart: "2026-07-01", periodEnd: "2026-07-18", operationId: "operation-1" });
    expect(result.resourceReference).toBe("sc-domain:example.com");
    expect(result.limitations.join(" ")).toContain("not total monthly search volume");
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ siteUrl: "sc-domain:example.com" }));
    expect(persist).toHaveBeenCalled();
  });
});
