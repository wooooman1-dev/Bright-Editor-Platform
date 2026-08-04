import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dataSourceDeletionConfirmation, parseOAuthReturn, selectPreferredDataSourceConnection, validateDataSourceFields, type PublicDataSourceConnection } from "../../../../app/settings/SettingsDataSources";

const base = { displayName: "Connection", resource: {}, accessToken: "token", clientId: "", clientSecret: "", hasCredentials: false } as const;
const connection = (value: Partial<PublicDataSourceConnection> & Pick<PublicDataSourceConnection, "id" | "status">): PublicDataSourceConnection => ({
  provider: "googleSearchConsole", displayName: value.id, enabled: true, version: 1, resourceConfiguration: {}, hasCredentials: false, freshness: "unavailable", ...value,
});
const source = () => readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");

describe("Settings Data Sources multi-connection workflow", () => {
  it("requires resources after OAuth and for non-Google providers", () => {
    expect(validateDataSourceFields({ ...base, provider: "googleSearchConsole", hasCredentials: true }).siteProperty).toBe("Search Console 사이트 속성을 입력해 주세요.");
    expect(validateDataSourceFields({ ...base, provider: "youtubeAnalytics", hasCredentials: true }).channelId).toBe("YouTube 채널을 선택해 주세요.");
    expect(validateDataSourceFields({ ...base, provider: "googleAnalytics4" }).propertyId).toBe("GA4 property ID를 입력해 주세요.");
    expect(validateDataSourceFields({ ...base, provider: "googleAdSense" }).accountReference).toBe("AdSense 계정 리소스를 입력해 주세요.");
  });

  it("allows a new Google connection to begin before a resource is available", () => {
    expect(validateDataSourceFields({ ...base, provider: "googleSearchConsole", resource: {}, accessToken: "", hasCredentials: false })).toEqual({});
    expect(validateDataSourceFields({ ...base, provider: "youtubeAnalytics", resource: {}, accessToken: "", hasCredentials: false })).toEqual({});
  });

  it("requires both NAVER credentials but permits blank credential fields when editing a stored connection", () => {
    expect(validateDataSourceFields({ ...base, provider: "naverSearchTrend", resource: { keywords: "콘텐츠" }, accessToken: "", clientId: "client-id", clientSecret: "" })).toMatchObject({ clientSecret: "NAVER Client Secret을 입력해 주세요." });
    expect(validateDataSourceFields({ ...base, provider: "naverSearchTrend", resource: { keywords: "콘텐츠" }, accessToken: "", clientId: "", clientSecret: "", hasCredentials: true })).toEqual({});
  });

  it("renders an explicit add workflow instead of silently editing the preferred connection", () => {
    const value = source();
    expect(value).toContain("새 연결 추가");
    expect(value).toContain("beginNewConnection(item.provider)");
    expect(value).toContain("기존 연결은 변경되지 않습니다.");
    expect(value).toContain("새 연결로 전환");
    expect(value).toContain("Project별 데이터 소스 배정");
    expect(value).not.toContain("const preferred = selectPreferredDataSourceConnection");
  });

  it("supports multiple named connections and safe Google credential reuse", () => {
    const value = source();
    expect(value).toContain("create-google-resource-connection");
    expect(value).toContain("sourceConnectionId: source.id");
    expect(value).toContain("인증 재사용");
    expect(value).toContain("선택한 리소스마다 별도 연결 카드로 관리됩니다.");
    expect(value).toContain("connections.filter((value) => value.provider === item.provider).length");
  });

  it("renders Search Console and YouTube OAuth resources without manual access-token fields", () => {
    const value = source();
    expect(value).toContain("Google 계정 인증");
    expect(value).toContain("/api/data-sources/google/start");
    expect(value).toContain("Search Console 사이트 속성 (필수)");
    expect(value).toContain("YouTube 채널 (필수)");
    expect(value).toContain('provider === "youtubeAnalytics"');
    expect(value).toContain("읽기 전용 채널 성과만 사용하며 수익 지표는 요청하지 않습니다.");
    expect(value).toContain("!isGoogleOAuthProvider(provider) && provider !== \"naverSearchTrend\"");
  });

  it("keeps authentication failure on the card as reconnect-required without a duplicate bottom error", () => {
    const value = source();
    expect(value).toContain('return "재연결 필요"');
    expect(value).toContain('connection.lastErrorCode === "DATA_SOURCE_AUTHENTICATION_ERROR"');
    expect(value).toContain('connection.lastErrorCode === "GOOGLE_OAUTH_REFRESH_FAILED"');
    expect(value).toContain('result.job.state === "failed" ? "" : result.job.message');
    expect(value.match(/인증에 실패했습니다\. 연결 정보를 다시 설정해 주세요\./g)).toHaveLength(1);
  });

  it("retains snapshot, Project reference, and password-field rendering", () => {
    const value = source();
    expect(value).toContain("connection.latestSnapshot");
    expect(value).toContain("checked={referenced}");
    expect(value).toContain('type="password"');
    expect(value).toContain('setAccessToken(""); setClientId(""); setClientSecret("")');
    expect(value).toContain("이 Project의 Opportunity Planning에서 사용");
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

  it("parses provider-aware OAuth callback state and removes it only after hydration", () => {
    expect(parseOAuthReturn("?dataSourceOAuth=resourceRequired&connectionId=callback-oauth&dataSourceProvider=youtubeAnalytics")).toMatchObject({ outcome: "resourceRequired", connectionId: "callback-oauth", provider: "youtubeAnalytics" });
    const value = source();
    expect(value.indexOf("refresh(oauthReturn.connectionId || undefined).then")).toBeLessThan(value.indexOf("removeOAuthReturnQuery();"));
    expect(value).toContain('query.delete("dataSourceProvider")');
    expect(value).toContain("OAuth로 생성된 Google 연결을 찾을 수 없습니다.");
  });

  it("hydrates provider resources and binds edit and disconnect actions to each rendered card", () => {
    const value = source();
    expect(value).toContain("editingConnection?.availableResources ?? []");
    expect(value).toContain("editConnection(connection)");
    expect(value).toContain('connectionId: connection.id, connectionVersion: connection.version');
    expect(value).toContain('connection.status === "disconnected" ? <span');
    expect(value).toContain("이미 연결 해제됨");
    expect(value).toContain('type="button">연결 해제</button>');
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
    const value = source();
    expect(value).toContain("if (!window.confirm(dataSourceDeletionConfirmation(connection))) return;");
    expect(value).toContain('method: "DELETE"');
    expect(value).toContain("connectionId: connection.id, connectionVersion: connection.version");
    expect(value).toContain('confirmationMode: active ? "disconnectAndDelete" : "deleteDisconnected"');
    expect(value).toContain('connection.status === "disconnected" ? <span');
    expect(value).toContain("이미 연결 해제됨");
    expect(value).toContain("데이터 소스 삭제</button>");
  });

  it("removes a deleted card and returns the editor to a clean add state", () => {
    const value = source();
    expect(value).toContain("current.filter((value) => value.id !== connection.id)");
    expect(value).toContain("current.filter((value) => value.connectionId !== connection.id)");
    expect(value).toContain("beginNewConnection(connection.provider)");
    expect(value).toContain("await refresh();");
  });
});
