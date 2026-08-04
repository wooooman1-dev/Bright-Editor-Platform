import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dataSourceDeletionConfirmation, parseOAuthReturn, selectPreferredDataSourceConnection, validateDataSourceFields, type PublicDataSourceConnection } from "../../../../app/settings/SettingsDataSources";

const base = { displayName: "Connection", resource: {}, accessToken: "token", clientId: "", clientSecret: "", hasCredentials: false } as const;
const connection = (value: Partial<PublicDataSourceConnection> & Pick<PublicDataSourceConnection, "id" | "status">): PublicDataSourceConnection => ({
  provider: "googleSearchConsole", displayName: value.id, enabled: true, version: 1, resourceConfiguration: {}, hasCredentials: false, freshness: "unavailable", ...value,
});
const source = () => readFileSync(join(process.cwd(), "app/settings/SettingsDataSources.tsx"), "utf8");
const routeSource = () => readFileSync(join(process.cwd(), "app/api/data-sources/route.ts"), "utf8");
const projectPageSource = () => readFileSync(join(process.cwd(), "app/projects/new/page.tsx"), "utf8");

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

  it("uses an explicit Project-first provider workflow without auto-selecting the first Project", () => {
    const value = source();
    expect(value).toContain("데이터 소스를 설정할 Project");
    expect(value).toContain("Project를 선택해 주세요.");
    expect(value).toContain("새 Project 만들기");
    expect(value).toContain("Provider 선택해서 새 연결 추가");
    expect(value).toContain("이 Provider 연결 추가");
    expect(value).toContain("기존 연결은 변경되지 않습니다.");
    expect(value).not.toContain('useState(projects[0]?.id ?? "")');
    expect(value).toContain("initialProjectId(projects)");
  });

  it("stores Project assignment explicitly and separates assigned from available connections", () => {
    const value = source();
    expect(value).toContain("workspaceProjectReferences");
    expect(value).toContain("assignmentProjectIds");
    expect(value).toContain("이 연결을 사용할 Project");
    expect(value).toContain("선택하지 않으면 Workspace 연결로만 저장");
    expect(value).toContain("배정된 연결");
    expect(value).toContain("배정 가능한 Workspace 연결");
    expect(value).toContain('action: "set-project-reference"');
    expect(value).toContain("replaceProjectAssignments");
  });

  it("exposes all Workspace references while retaining the selected Project projection", () => {
    const value = routeSource();
    expect(value).toContain("projectReferences: references.filter");
    expect(value).toContain("workspaceProjectReferences: workspaceReferences.filter");
  });

  it("supports multiple named connections and safe Google credential reuse", () => {
    const value = source();
    expect(value).toContain("create-google-resource-connection");
    expect(value).toContain("sourceConnectionId: source.id");
    expect(value).toContain("인증 재사용");
    expect(value).toContain("선택한 리소스마다 별도 연결 카드로 관리됩니다.");
    expect(value).toContain("connections.filter((value) => value.provider === item.provider).length");
  });

  it("renders Search Console, YouTube and NAVER as independently selectable Providers", () => {
    const value = source();
    expect(value).toContain('provider: "googleSearchConsole"');
    expect(value).toContain('provider: "youtubeAnalytics"');
    expect(value).toContain('provider: "naverSearchTrend"');
    expect(value).toContain("Project 검색어 세트 (필수, 쉼표 구분)");
    expect(value).toContain("Search Console 사이트 속성 (필수)");
    expect(value).toContain("YouTube 채널 (필수)");
  });

  it("keeps authentication failure on the card as reconnect-required without a duplicate bottom error", () => {
    const value = source();
    expect(value).toContain('return "재연결 필요"');
    expect(value).toContain('connection.lastErrorCode === "DATA_SOURCE_AUTHENTICATION_ERROR"');
    expect(value).toContain('connection.lastErrorCode === "GOOGLE_OAUTH_REFRESH_FAILED"');
    expect(value).toContain('result.job.state === "failed" ? "" : result.job.message');
    expect(value.match(/인증에 실패했습니다\. 연결 정보를 다시 설정해 주세요\./g)).toHaveLength(1);
  });

  it("retains snapshot, password-field rendering and explicit Project actions", () => {
    const value = source();
    expect(value).toContain("connection.latestSnapshot");
    expect(value).toContain('type="password"');
    expect(value).toContain('setAccessToken(""); setClientId(""); setClientSecret("")');
    expect(value).toContain("이 Project에 배정");
    expect(value).toContain("이 Project에서 제외");
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

  it("preserves explicit Project choices across a new Google OAuth callback", () => {
    expect(parseOAuthReturn("?dataSourceOAuth=resourceRequired&connectionId=callback-oauth&dataSourceProvider=youtubeAnalytics&assignProjectIds=finance,health")).toMatchObject({ outcome: "resourceRequired", connectionId: "callback-oauth", provider: "youtubeAnalytics", assignProjectIds: ["finance", "health"] });
    const value = source();
    const hydrateIndex = value.indexOf("refresh(oauthReturn.connectionId || undefined).then");
    const cleanupIndex = value.lastIndexOf("removeOAuthReturnQuery();");
    expect(hydrateIndex).toBeGreaterThanOrEqual(0);
    expect(cleanupIndex).toBeGreaterThan(hydrateIndex);
    expect(value).toContain('returnQuery.set("assignProjectIds"');
    expect(value).toContain('query.delete("assignProjectIds")');
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
    const value = dataSourceDeletionConfirmation(connection({ id: "old-gsc", status: "disconnected", displayName: "Search Console", resourceConfiguration: { siteProperty: "sc-domain:old.example" }, projectReferenceCount: 2 }));
    expect(value).toContain("이 데이터 소스 연결을 삭제하시겠습니까?");
    expect(value).toContain("Search Console");
    expect(value).toContain("sc-domain:old.example");
    expect(value).toContain("Project 참조: 2개");
    expect(value).toContain("기존 Snapshot과 이미 콘텐츠에 사용된 Evidence는 보존됩니다.");
  });

  it("cancels deletion before any request and sends the rendered card ID only after confirmation", () => {
    const value = source();
    expect(value).toContain("if (!window.confirm(dataSourceDeletionConfirmation(connection))) return;");
    expect(value).toContain('method: "DELETE"');
    expect(value).toContain("connectionId: connection.id, connectionVersion: connection.version");
    expect(value).toContain('confirmationMode: active ? "disconnectAndDelete" : "deleteDisconnected"');
    expect(value).toContain("데이터 소스 삭제</button>");
  });

  it("creates a Project and returns to Data Sources with the new Project selected", () => {
    const value = projectPageSource();
    expect(value).toContain("createProject(data");
    expect(value).toContain("Project 만들고 데이터 소스 설정으로 돌아가기");
    expect(value).toContain("section=data-sources");
    expect(value).toContain("projectId=${encodeURIComponent(projectId)}");
  });
});
