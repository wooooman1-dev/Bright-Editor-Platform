import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ studioGet: vi.fn(), connectionFind: vi.fn(), hasRefreshToken: vi.fn(), stateCreate: vi.fn(), stateConsume: vi.fn(), authorizationUrl: vi.fn(), oauthConfigured: vi.fn(), complete: vi.fn() }));

vi.mock("../../../../app/application/studio-store", () => ({ studioStore: { get: mocks.studioGet } }));
vi.mock("../../../../app/application/data-sources/data-source-runtime", () => ({
  dataSourceConnectionRepository: { findById: mocks.connectionFind },
  googleOAuthCredentialService: { hasRefreshToken: mocks.hasRefreshToken },
  googleOAuthStateStore: { create: mocks.stateCreate, consume: mocks.stateConsume },
  googleOAuthClientFactory: { authorizationUrl: mocks.authorizationUrl, configured: mocks.oauthConfigured },
  googleSearchConsoleOAuthFlow: { complete: mocks.complete },
}));

import { GET as start } from "../../../../app/api/data-sources/google/start/route";
import { GET as callback } from "../../../../app/api/data-sources/google/callback/route";

describe("Google OAuth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.studioGet.mockResolvedValue({ workspace: { id: "workspace-1" }, projects: [] });
    mocks.hasRefreshToken.mockResolvedValue(false);
    mocks.oauthConfigured.mockReturnValue(true);
    mocks.stateCreate.mockResolvedValue({ state: "secure-random-state", context: {} });
    mocks.authorizationUrl.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?state=secure-random-state");
  });

  it("returns a safe configuration-required response before creating state when OAuth env is missing", async () => {
    mocks.oauthConfigured.mockReturnValue(false);
    const response = await start(new Request("http://localhost:3000/api/data-sources/google/start?workspaceId=workspace-1&provider=googleSearchConsole"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Google OAuth 설정이 필요합니다.", code: "GOOGLE_OAUTH_NOT_CONFIGURED" });
    expect(mocks.stateCreate).not.toHaveBeenCalled();
  });

  it("validates ownership, stores state context, and redirects with consent for a first connection", async () => {
    const response = await start(new Request("http://localhost:3000/api/data-sources/google/start?workspaceId=workspace-1&provider=googleSearchConsole&returnTo=%2Fworkspaces%2Fworkspace-1%2Fsettings"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("accounts.google.com");
    expect(mocks.stateCreate).toHaveBeenCalledWith({ workspaceId: "workspace-1", provider: "googleSearchConsole", returnTo: "/workspaces/workspace-1/settings" });
    expect(mocks.authorizationUrl).toHaveBeenCalledWith("googleSearchConsole", "secure-random-state", true);
  });

  it("passes an existing Connection ID and avoids repeated consent when a refresh token exists", async () => {
    mocks.connectionFind.mockResolvedValue({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", secretReference: "secret" });
    mocks.hasRefreshToken.mockResolvedValue(true);
    await start(new Request("http://localhost:3000/api/data-sources/google/start?workspaceId=workspace-1&provider=googleSearchConsole&connectionId=connection-1&returnTo=%2Fworkspaces%2Fworkspace-1%2Fsettings"));
    expect(mocks.stateCreate).toHaveBeenCalledWith(expect.objectContaining({ connectionId: "connection-1" }));
    expect(mocks.authorizationUrl).toHaveBeenCalledWith("googleSearchConsole", "secure-random-state", false);
  });

  it("rejects unsupported Providers and foreign Workspaces before creating state", async () => {
    const unsupported = await start(new Request("http://localhost:3000/api/data-sources/google/start?workspaceId=workspace-1&provider=googleAnalytics4"));
    expect(unsupported.status).toBe(400);
    mocks.studioGet.mockResolvedValue({ workspace: { id: "workspace-2" }, projects: [] });
    const forbidden = await start(new Request("http://localhost:3000/api/data-sources/google/start?workspaceId=workspace-1&provider=googleSearchConsole"));
    expect(forbidden.status).toBe(403);
    expect(mocks.stateCreate).not.toHaveBeenCalled();
  });
});

describe("Google OAuth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.studioGet.mockResolvedValue({ workspace: { id: "workspace-1" }, projects: [] });
    mocks.stateConsume.mockResolvedValue({ stateId: "state-id", workspaceId: "workspace-1", provider: "googleSearchConsole", returnTo: "/workspaces/workspace-1/settings", createdAt: "now", expiresAt: "later" });
    mocks.complete.mockResolvedValue({ connection: { id: "connection-1", availableResources: [{ siteUrl: "sc-domain:example.com" }] }, resourceRequired: true });
  });

  it("rejects a missing state before exchanging a code", async () => {
    const response = await callback(new Request("http://localhost:3000/api/data-sources/google/callback?code=authorization-code"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "GOOGLE_OAUTH_STATE_INVALID" });
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("consumes state, completes code exchange, and returns without code or token in the URL", async () => {
    const response = await callback(new Request("http://localhost:3000/api/data-sources/google/callback?state=secure-state&code=authorization-code-secret"));
    expect(mocks.stateConsume).toHaveBeenCalledWith("secure-state");
    expect(mocks.complete).toHaveBeenCalledWith({ workspaceId: "workspace-1", code: "authorization-code-secret" });
    const location = response.headers.get("location")!;
    expect(location).toContain("dataSourceOAuth=resourceRequired");
    expect(location).toContain("connectionId=connection-1");
    expect(location).not.toMatch(/authorization-code-secret|accessToken|refreshToken/);
  });

  it("handles access_denied safely after consuming state", async () => {
    const response = await callback(new Request("http://localhost:3000/api/data-sources/google/callback?state=secure-state&error=access_denied&error_description=access-token-secret"));
    const location = response.headers.get("location")!;
    expect(location).toContain("oauthCode=GOOGLE_OAUTH_ACCESS_DENIED");
    expect(location).not.toContain("access-token-secret");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects a different Provider state and revalidates the Workspace", async () => {
    mocks.stateConsume.mockResolvedValueOnce({ workspaceId: "workspace-1", provider: "googleAnalytics4", returnTo: "/settings" });
    const provider = await callback(new Request("http://localhost:3000/api/data-sources/google/callback?state=secure-state&code=code"));
    expect(provider.headers.get("location")).toContain("GOOGLE_OAUTH_STATE_INVALID");
    mocks.stateConsume.mockResolvedValueOnce({ workspaceId: "workspace-1", provider: "googleSearchConsole", returnTo: "/settings" });
    mocks.studioGet.mockResolvedValueOnce({ workspace: { id: "workspace-2" }, projects: [] });
    const workspace = await callback(new Request("http://localhost:3000/api/data-sources/google/callback?state=secure-state-2&code=code"));
    expect(workspace.headers.get("location")).toContain("DATA_SOURCE_WORKSPACE_FORBIDDEN");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
