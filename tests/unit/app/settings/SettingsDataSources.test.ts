import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dataSourceDeletionConfirmation, parseOAuthReturn, selectPreferredDataSourceConnection, validateDataSourceFields, type PublicDataSourceConnection } from "../../../../app/settings/SettingsDataSources";

const base = { displayName: "Connection", resource: {}, accessToken: "token", clientId: "", clientSecret: "", hasCredentials: false } as const;
const connection = (value: Partial<PublicDataSourceConnection> & Pick<PublicDataSourceConnection, "id" | "status">): PublicDataSourceConnection => ({
  provider: "googleSearchConsole", displayName: value.id, enabled: true, version: 1, resourceConfiguration: {}, hasCredentials: false, freshness: "unavailable", ...value,
});

describe("Settings Data Sources validation and error presentation", () => {
  it.each([
    ["googleSearchConsole", "siteProperty", "Search Console 사이트 속성을 입력해 주세요."],
    ["googleAnalytics4", "propertyId", "GA4 property ID를 입력해 주세요."],
    ["googleAdSense", "accountReference", "AdSense 계정 리소스를 입력해 주세요."],
  ] as const)("shows a field error before saving %s without its required resource", (provider, field, message) => {
    expect(validateDataSourceFields({ ...base, provider })[field]).toBe(message);
  });

  it("requires both NAVER credentials but permits blank credential fields when editing a stored connection", () => {
    expect(validateDataSourceFields({ ...base, provider: "naverSearchTrend", resource: { keywords: "콘텐츠" }, accessToken: "", clientId: "client-id", clientSecret: "" })).toMatchObject({ clientSecret: "NAVER Client Secret을 입력해 주세요." });
    expect(validateDataSourceFields({ ...base, provider: "naverSearchTrend", resource: { keywords: "콘텐츠" }, accessToken: "", clientId: "", clientSecret: "", hasCredentials: true })).toEqual({});
  });

  it("does not require or render a manual access token for Search Console OAuth", () => {
    expect(validateDataSourceFields({ ...base, provider: "googleSearchConsole", resource: { siteProperty: "sc-domain:example.com" }, accessToken: "", hasCredentials: false })).toEqual({});
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
    expect(source).toContain("Google 계정으로 연결");
    expect(source).toContain("/api/data-sources/google/start");
    expect(source).toContain('provider === "googleSearchConsole" ? null : <SecretField');
    expect(source).toContain("Search Console 사이트 속성 (필수)");
    expect(source).toContain("Google OAuth 설정이 필요합니다.");
    expect(source).toContain('startGoogleOAuth(connection.id)');
  });

  it("keeps authentication failure on the card as reconnect-required without a duplicate bottom error", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
    expect(source).toContain('return "재연결 필요"');
    expect(source).toContain('connection.lastErrorCode === "DATA_SOURCE_AUTHENTICATION_ERROR"');
    expect(source).toContain('connection.lastErrorCode === "GOOGLE_OAUTH_REFRESH_FAILED"');
    expect(source).toContain('result.job.state === "failed" ? "" : result.job.message');
    expect(source.match(/인증에 실패했습니다\. 연결 정보를 다시 설정해 주세요\./g)).toHaveLength(1);
  });

  it("retains snapshot, Project reference, and password-field rendering", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
    expect(source).toContain("connection.latestSnapshot");
    expect(source).toContain("checked={referenced}");
    expect(source).toContain('type="password"');
    expect(source).toContain('setAccessToken(""); setClientId(""); setClientSecret("")');
  });

  it("selects the callback-created connection before an older disconnected connection", () => {
    const disconnected = connection({ id: "old-disconnected", status: "disconnected", updatedAt: "2026-07-18T00:00:00.000Z" });
    const callback = connection({ id: "callback-oauth", status: "configurationRequired", credentialMode: "googleOAuth", hasCredentials: true, availableResources: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }], updatedAt: "2026-07-19T00:00:00.000Z" });
    expect(selectPreferredDataSourceConnection([disconnected, callback], "googleSearchConsole", callback.id)?.id).toBe(callback.id);
    expect(selectPreferredDataSourceConnection([disconnected, callback], "googleSearchConsole")?.id).toBe(callback.id);
  });

  it("uses the documented fallback priority for multiple same-provider connections", () => {
    const values = [
      connection({ id: "disconnected", status: "disconnected" }),
      connection({ id: "reconnect", status: "error", hasCredentials: true }),
      connection({ id: "resource-required", status: "configurationRequired", hasCredentials: true }),
      connection({ id: "ready", status: "ready", hasCredentials: true }),
    ];
    expect(selectPreferredDataSourceConnection(values, "googleSearchConsole")?.id).toBe("ready");
    expect(selectPreferredDataSourceConnection(values.slice(0, 3), "googleSearchConsole")?.id).toBe("resource-required");
    expect(selectPreferredDataSourceConnection(values, "googleSearchConsole", "missing")).toBeUndefined();
  });

  it("parses callback state client-side and removes OAuth query only after hydration", () => {
    expect(parseOAuthReturn("?dataSourceOAuth=resourceRequired&connectionId=callback-oauth")).toMatchObject({ outcome: "resourceRequired", connectionId: "callback-oauth" });
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
    expect(source.indexOf("refresh(oauthReturn.connectionId || undefined).then")).toBeLessThan(source.indexOf("removeOAuthReturnQuery();"));
    expect(source).toContain("OAuth로 생성된 Google Search Console 연결을 찾을 수 없습니다.");
  });

  it("hydrates OAuth resources and binds edit and disconnect actions to each rendered card", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
    expect(source).toContain("options={editingConnection.availableResources ?? []}");
    expect(source).toContain("editConnection(connection)");
    expect(source).toContain('connectionId: connection.id, connectionVersion: connection.version');
    expect(source).toContain('connection.status === "disconnected" ? <span');
    expect(source).toContain("이미 연결 해제됨");
    expect(source).toContain('type="button">연결 해제</button>');
  });

  it("shows safe deletion impact details for a disconnected card", () => {
    const message = dataSourceDeletionConfirmation(connection({ id: "old-gsc", status: "disconnected", displayName: "Search Console", resourceConfiguration: { siteProperty: "sc-domain:old.example" }, projectReferenceCount: 2 }));
    expect(message).toContain("이 데이터 소스 연결을 삭제하시겠습니까?");
    expect(message).toContain("Search Console");
    expect(message).toContain("sc-domain:old.example");
    expect(message).toContain("Project 참조: 2개");
    expect(message).toContain("기존 Snapshot과 이미 콘텐츠에 사용된 Evidence는 보존됩니다.");
  });

  it("cancels deletion before any request and sends the rendered card ID only after confirmation", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
    expect(source).toContain("if (!window.confirm(dataSourceDeletionConfirmation(connection))) return;");
    expect(source).toContain('method: "DELETE"');
    expect(source).toContain("connectionId: connection.id, connectionVersion: connection.version");
    expect(source).toContain('confirmationMode: active ? "disconnectAndDelete" : "deleteDisconnected"');
    expect(source).toContain('connection.status === "disconnected" ? <span');
    expect(source).toContain("이미 연결 해제됨");
    expect(source).toContain("데이터 소스 삭제</button>");
  });

  it("removes a deleted card and safely reselects another same-provider connection", () => {
    const source = readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
    expect(source).toContain("current.filter((value) => value.id !== connection.id)");
    expect(source).toContain("current.filter((value) => value.connectionId !== connection.id)");
    expect(source).toContain("selectionInitialized.current = false");
    expect(source).toContain("await refresh(undefined, connection.provider)");
  });
});
