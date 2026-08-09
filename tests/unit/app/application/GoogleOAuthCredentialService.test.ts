import { describe, expect, it, vi } from "vitest";
import { GoogleOAuthCredentialService } from "../../../../app/application/data-sources/google/GoogleOAuthCredentialService";
import { GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE, GOOGLE_YOUTUBE_ANALYTICS_READONLY_SCOPE, GOOGLE_YOUTUBE_READONLY_SCOPE } from "../../../../app/application/data-sources/google/GoogleOAuthClientFactory";

function secrets(value: string) {
  return { storeSecret: vi.fn(), readSecret: vi.fn().mockResolvedValue(value), replaceSecret: vi.fn().mockResolvedValue(undefined), deleteSecret: vi.fn(), secretExists: vi.fn().mockResolvedValue(true) };
}

describe("Google OAuth credential exchange and refresh", () => {
  it("stores only the required OAuth token fields and verifies granted scope", async () => {
    const client = { getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "access-secret", refresh_token: "refresh-secret", expiry_date: 1234, token_type: "Bearer", scope: GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE } }), setCredentials: vi.fn(), getTokenInfo: vi.fn(), on: vi.fn(), getAccessToken: vi.fn() };
    const service = new GoogleOAuthCredentialService(secrets(""), { create: () => client } as never);
    const result = await service.exchangeCode("authorization-code-secret");
    expect(result.credential).toEqual({ kind: "googleOAuth", accessToken: "access-secret", refreshToken: "refresh-secret", expiryDate: 1234, tokenType: "Bearer", grantedScopes: [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE] });
    expect(JSON.stringify(result.credential)).not.toMatch(/authorization-code|id_token|client-secret/);
  });

  it("accepts only the complete YouTube read-only scope set for YouTube Analytics", async () => {
    const scope = `${GOOGLE_YOUTUBE_READONLY_SCOPE} ${GOOGLE_YOUTUBE_ANALYTICS_READONLY_SCOPE}`;
    const client = { getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "access-secret", refresh_token: "refresh-secret", scope } }), setCredentials: vi.fn(), getTokenInfo: vi.fn(), on: vi.fn(), getAccessToken: vi.fn() };
    const result = await new GoogleOAuthCredentialService(secrets(""), { create: () => client } as never).exchangeCode("code", undefined, "youtubeAnalytics");
    expect(result.credential.grantedScopes).toEqual([GOOGLE_YOUTUBE_ANALYTICS_READONLY_SCOPE, GOOGLE_YOUTUBE_READONLY_SCOPE].sort());
  });

  it("rejects YouTube Analytics OAuth when either required read-only scope is missing", async () => {
    const client = { getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "access-secret", refresh_token: "refresh-secret", scope: GOOGLE_YOUTUBE_READONLY_SCOPE } }), setCredentials: vi.fn(), getTokenInfo: vi.fn(), on: vi.fn(), getAccessToken: vi.fn() };
    await expect(new GoogleOAuthCredentialService(secrets(""), { create: () => client } as never).exchangeCode("code", undefined, "youtubeAnalytics")).rejects.toMatchObject({ code: "GOOGLE_OAUTH_SCOPE_MISSING" });
  });

  it("keeps the existing refresh token when Google omits it during reconnection", async () => {
    const prior = JSON.stringify({ kind: "googleOAuth", accessToken: "old-access", refreshToken: "keep-refresh", grantedScopes: [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE] });
    const store = secrets(prior), client = { getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "new-access", scope: GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE } }), setCredentials: vi.fn(), getTokenInfo: vi.fn(), on: vi.fn(), getAccessToken: vi.fn() };
    const result = await new GoogleOAuthCredentialService(store, { create: () => client } as never).exchangeCode("code", "secret-reference");
    expect(result.credential.refreshToken).toBe("keep-refresh");
  });

  it("rejects a token exchange that does not grant Search Console readonly scope", async () => {
    const client = { getToken: vi.fn().mockResolvedValue({ tokens: { access_token: "access-secret", refresh_token: "refresh-secret", scope: "https://www.googleapis.com/auth/drive.readonly" } }), setCredentials: vi.fn(), getTokenInfo: vi.fn(), on: vi.fn(), getAccessToken: vi.fn() };
    await expect(new GoogleOAuthCredentialService(secrets(""), { create: () => client } as never).exchangeCode("code")).rejects.toMatchObject({ code: "GOOGLE_OAUTH_SCOPE_MISSING" });
  });

  it("refreshes an expired access token and persists it without deleting the refresh token", async () => {
    const stored = JSON.stringify({ kind: "googleOAuth", accessToken: "expired-access", refreshToken: "keep-refresh", expiryDate: 1, grantedScopes: [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE] });
    const store = secrets(stored); let tokenListener: ((tokens: Record<string, unknown>) => void) | undefined;
    const client = { on: vi.fn((_event, listener) => { tokenListener = listener; }), setCredentials: vi.fn(), getAccessToken: vi.fn().mockImplementation(async () => { tokenListener?.({ access_token: "refreshed-access", expiry_date: 9999 }); return { token: "refreshed-access" }; }), getToken: vi.fn(), getTokenInfo: vi.fn() };
    const session = await new GoogleOAuthCredentialService(store, { create: () => client } as never).authorized({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret-reference", credentialMode: "googleOAuth", resourceConfiguration: { siteProperty: "sc-domain:example.com" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    await session.persist();
    const saved = JSON.parse(store.replaceSecret.mock.calls[0][1]);
    expect(saved).toMatchObject({ accessToken: "refreshed-access", refreshToken: "keep-refresh", expiryDate: 9999 });
  });

  it("rejects a stored credential when it lacks the current connection provider scopes", async () => {
    const stored = JSON.stringify({ kind: "googleOAuth", accessToken: "access-secret", refreshToken: "refresh-secret", grantedScopes: [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE] });
    const client = { on: vi.fn(), setCredentials: vi.fn(), getAccessToken: vi.fn(), getToken: vi.fn(), getTokenInfo: vi.fn() };
    const promise = new GoogleOAuthCredentialService(secrets(stored), { create: () => client } as never).authorized({ id: "youtube-1", workspaceId: "workspace-1", provider: "youtubeAnalytics", displayName: "YouTube", status: "connected", secretReference: "secret-reference", credentialMode: "googleOAuth", resourceConfiguration: { channelId: "channel-1" }, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    await expect(promise).rejects.toMatchObject({ code: "GOOGLE_OAUTH_SCOPE_MISSING" });
  });

  it("marks refresh failure for reconnection without exposing token material", async () => {
    const stored = JSON.stringify({ kind: "googleOAuth", accessToken: "access-secret", refreshToken: "refresh-secret", grantedScopes: [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE] });
    const client = { on: vi.fn(), setCredentials: vi.fn(), getAccessToken: vi.fn().mockRejectedValue(new Error("invalid_grant refresh-secret")), getToken: vi.fn(), getTokenInfo: vi.fn() };
    const promise = new GoogleOAuthCredentialService(secrets(stored), { create: () => client } as never).authorized({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret-reference", credentialMode: "googleOAuth", resourceConfiguration: {}, enabled: true, createdAt: "now", updatedAt: "now", version: 1 });
    await expect(promise).rejects.toMatchObject({ code: "GOOGLE_OAUTH_REFRESH_FAILED" });
    await expect(promise).rejects.not.toThrow("refresh-secret");
  });

  it("does not let remote token revocation failure block local disconnect flow", async () => {
    const stored = JSON.stringify({ kind: "googleOAuth", accessToken: "access-secret", refreshToken: "refresh-secret", grantedScopes: [GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE] });
    const client = { revokeToken: vi.fn().mockRejectedValue(new Error("network failed refresh-secret")) };
    const service = new GoogleOAuthCredentialService(secrets(stored), { create: () => client } as never);
    await expect(service.revoke({ id: "connection-1", workspaceId: "workspace-1", provider: "googleSearchConsole", displayName: "GSC", status: "connected", secretReference: "secret-reference", credentialMode: "googleOAuth", resourceConfiguration: {}, enabled: true, createdAt: "now", updatedAt: "now", version: 1 })).resolves.toBeUndefined();
  });
});
