import { describe, expect, it } from "vitest";
import { InMemoryPersistenceStore } from "../../../../core/data";
import { GoogleOAuthClientFactory, GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE } from "../../../../app/application/data-sources/google/GoogleOAuthClientFactory";
import { GoogleOAuthStateStore, safeInternalReturnTo } from "../../../../app/application/data-sources/google/GoogleOAuthStateStore";

describe("Google OAuth configuration and one-time state", () => {
  it("fails safely when server OAuth environment variables are incomplete", () => {
    const factory = new GoogleOAuthClientFactory({});
    expect(factory.configured()).toBe(false);
    expect(() => factory.create()).toThrow(expect.objectContaining({ code: "GOOGLE_OAUTH_NOT_CONFIGURED", status: 503 }));
  });

  it("generates the exact configured redirect URI and minimum readonly scope", () => {
    const factory = new GoogleOAuthClientFactory({ GOOGLE_OAUTH_CLIENT_ID: "client-id", GOOGLE_OAUTH_CLIENT_SECRET: "client-secret", GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/data-sources/google/callback" });
    const url = new URL(factory.authorizationUrl("googleSearchConsole", "secure-state", true));
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/data-sources/google/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("scope")).toBe(GOOGLE_SEARCH_CONSOLE_READONLY_SCOPE);
  });

  it("stores only hashed state context and consumes it once", async () => {
    const persistence = new InMemoryPersistenceStore(), states = new GoogleOAuthStateStore(persistence);
    const created = await states.create({ workspaceId: "workspace-1", provider: "googleSearchConsole", connectionId: "connection-1", returnTo: "/workspaces/workspace-1/settings" });
    const stored = await persistence.list<Record<string, unknown>>("google-oauth-states");
    expect(created.state).toHaveLength(43);
    expect(JSON.stringify(stored)).not.toContain(created.state);
    expect(JSON.stringify(stored)).not.toMatch(/accessToken|refreshToken|clientSecret|authorizationCode/);
    await expect(states.consume(created.state)).resolves.toMatchObject({ workspaceId: "workspace-1", connectionId: "connection-1", provider: "googleSearchConsole" });
    await expect(states.consume(created.state)).rejects.toMatchObject({ code: "GOOGLE_OAUTH_STATE_INVALID" });
  });

  it("rejects expired state and unsafe external return paths", async () => {
    const states = new GoogleOAuthStateStore(new InMemoryPersistenceStore(), () => new Date("2026-07-19T00:00:00.000Z"));
    const expired = await states.create({ workspaceId: "workspace-1", provider: "googleSearchConsole", returnTo: "/workspaces/workspace-1/settings", lifetimeMs: -1 });
    await expect(states.consume(expired.state)).rejects.toMatchObject({ code: "GOOGLE_OAUTH_STATE_EXPIRED" });
    expect(() => safeInternalReturnTo("https://evil.example/steal")).toThrow(expect.objectContaining({ field: "returnTo" }));
    expect(() => safeInternalReturnTo("//evil.example/steal")).toThrow(expect.objectContaining({ field: "returnTo" }));
    expect(safeInternalReturnTo("/workspaces/workspace-1/settings?tab=data-sources")).toBe("/workspaces/workspace-1/settings?tab=data-sources");
    await expect(states.create({ workspaceId: "workspace-1", provider: "googleSearchConsole", returnTo: "/workspaces/workspace-2/settings" })).rejects.toMatchObject({ code: "DATA_SOURCE_WORKSPACE_FORBIDDEN" });
  });
});
