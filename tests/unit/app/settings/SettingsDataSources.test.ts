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

  it("uses existing Projects to create independent lower management areas", () => {
    const value = source();
    expect(value).toContain("하단에 표시할 Project 영역");
    expect(value).toContain("선택한 Project 영역 만들기");
    expect(value).toContain("이 버튼은 Project 데이터를 새로 만들지 않습니다.");
    expect(value).toContain("projectSectionIds");
    expect(value).toContain("projectSectionIds.map");
    expect(value).toContain("data-project-id={project.id}");
    expect(value).toContain("영역 닫기");
    expect(value).not.toContain("/projects/new");
    expect(value).not.toContain("createProject(");
  });

  it("renders every current Project as an independent area by default", () => {
    const value = source();
    expect(value).toContain("projects.map((project) => project.id)");
    expect(value).toContain("const assignedIdSet = new Set(workspaceReferences.filter((value) => value.projectId === project.id && value.enabled)");
    expect(value).toContain("connectionCard(connection, project, true)");
    expect(value).toContain("connectionCard(connection, project, false)");
    expect(value).toContain("각 영역은 고유한 Project ID를 유지합니다.");
  });

  it("binds assignment actions to the Project area being rendered", () => {
    const value = source();
    expect(value).toContain('projectId: contextProject.id');
    expect(value).toContain("실제 배정 Project:");
    expect(value).toContain("projectNamesForConnection");
    expect(value).toContain("이 Project에서 제외");
    expect(value).toContain("이 Project에 배정");
  });

  it("starts GSC or NAVER creation with the area Project preselected", () => {
    const value = source();
    expect(value).toContain('beginNewConnection("googleSearchConsole", project.id)');
    expect(value).toContain('beginNewConnection("naverSearchTrend", project.id)');
    expect(value).toContain("setAssignmentProjectIds(defaultProjectId ? [defaultProjectId] : [])");
  });

  it("loads Workspace references once instead of changing them with the Project picker", () => {
    const value = source();
    expect(value).toContain('fetch(`/api/data-sources?workspaceId=${encodeURIComponent(workspaceId)}`');
    expect(value).not.toContain('...(projectId ? { projectId } : {})');
    expect(value).toContain("workspaceProjectReferences");
    expect(value).toContain("setProjectPickerId(event.target.value)");
  });

  it("exposes all Workspace references from the API", () => {
    const value = routeSource();
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
    expect(value).toContain('returnQuery.set("assignProjectIds"');
    expect(value).toContain('query.delete("assignProjectIds")');
  });

  it("shows safe deletion impact details for a disconnected card", () => {
    const value = dataSourceDeletionConfirmation(connection({ id: "old-gsc", status: "disconnected", displayName: "Search Console", resourceConfiguration: { siteProperty: "sc-domain:old.example" }, projectReferenceCount: 2 }));
    expect(value).toContain("이 데이터 소스 연결을 삭제하시겠습니까?");
    expect(value).toContain("Search Console");
    expect(value).toContain("sc-domain:old.example");
    expect(value).toContain("Project 참조: 2개");
    expect(value).toContain("기존 Snapshot과 이미 콘텐츠에 사용된 Evidence는 보존됩니다.");
  });
});
