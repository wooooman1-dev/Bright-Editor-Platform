import { NextResponse } from "next/server";
import { dataSourceConnectionRepository, googleOAuthClientFactory, googleOAuthCredentialService, googleOAuthStateStore } from "../../../../application/data-sources/data-source-runtime";
import { DataSourceError, publicDataSourceError } from "../../../../application/data-sources/DataSourceErrors";
import { studioStore } from "../../../../application/studio-store";
import type { UserData } from "../../../../user-flow/user-data";

const googleProviders = new Set(["googleSearchConsole", "youtubeAnalytics"]);

export async function GET(request: Request) {
  try {
    const url = new URL(request.url), workspaceId = required(url.searchParams.get("workspaceId"), "Workspace를 선택해 주세요.", "workspaceId");
    const provider = required(url.searchParams.get("provider"), "Google Provider를 선택해 주세요.", "provider");
    if (!googleProviders.has(provider)) throw new DataSourceError("이번 OAuth 연결이 지원하지 않는 Google Provider입니다.", "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, "provider");
    await ownedWorkspace(workspaceId);
    const connectionId = optional(url.searchParams.get("connectionId")), connection = connectionId ? await dataSourceConnectionRepository.findById(connectionId) : undefined;
    if (connectionId && (!connection || connection.workspaceId !== workspaceId)) throw new DataSourceError("이 Workspace에서 Data Source 연결에 접근할 수 없습니다.", "DATA_SOURCE_WORKSPACE_FORBIDDEN", 403);
    if (connection && connection.provider !== provider) throw new DataSourceError("Google OAuth 연결 대상 Provider가 일치하지 않습니다.", "GOOGLE_OAUTH_STATE_INVALID", 400);
    if (!googleOAuthClientFactory.configured()) throw new DataSourceError("Google OAuth 설정이 필요합니다.", "GOOGLE_OAUTH_NOT_CONFIGURED", 503);
    const returnTo = url.searchParams.get("returnTo") ?? `/workspaces/${encodeURIComponent(workspaceId)}/settings`;
    const promptForConsent = !(await googleOAuthCredentialService.hasRefreshToken(connection?.secretReference));
    const state = await googleOAuthStateStore.create({ workspaceId, provider, ...(connectionId ? { connectionId } : {}), returnTo });
    return NextResponse.redirect(googleOAuthClientFactory.authorizationUrl(provider, state.state, promptForConsent));
  } catch (error) { return failure(error); }
}

async function ownedWorkspace(workspaceId: string) { const data = await studioStore.get<UserData>("application", "user-data"); if (!data?.workspace || data.workspace.id !== workspaceId) throw new DataSourceError("이 Workspace에서 Google 연결을 시작할 수 없습니다.", "DATA_SOURCE_WORKSPACE_FORBIDDEN", 403); }
function required(value: string | null, message: string, field: string) { if (!value?.trim()) throw new DataSourceError(message, "DATA_SOURCE_REQUEST_VALIDATION_ERROR", 400, field); return value.trim(); }
function optional(value: string | null) { return value?.trim() || undefined; }
function failure(error: unknown) { const value = publicDataSourceError(error); return NextResponse.json({ error: value.error, code: value.code, ...(value.field ? { field: value.field } : {}) }, { status: value.status }); }
