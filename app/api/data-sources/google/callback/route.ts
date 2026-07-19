import { NextResponse } from "next/server";
import { googleOAuthStateStore, googleSearchConsoleOAuthFlow } from "../../../../application/data-sources/data-source-runtime";
import { DataSourceError, publicDataSourceError } from "../../../../application/data-sources/DataSourceErrors";
import type { GoogleOAuthState } from "../../../../application/data-sources/google/GoogleOAuthStateStore";
import { studioStore } from "../../../../application/studio-store";
import type { UserData } from "../../../../user-flow/user-data";

export async function GET(request: Request) {
  let context: GoogleOAuthState | undefined;
  try {
    const url = new URL(request.url), state = url.searchParams.get("state")?.trim();
    if (!state) throw new DataSourceError("Google 연결 state가 없습니다. 다시 시작해 주세요.", "GOOGLE_OAUTH_STATE_INVALID", 400, "state");
    context = await googleOAuthStateStore.consume(state);
    if (context.provider !== "googleSearchConsole") throw new DataSourceError("Google OAuth Provider context가 일치하지 않습니다.", "GOOGLE_OAUTH_STATE_INVALID", 400);
    await ownedWorkspace(context.workspaceId);
    if (url.searchParams.has("error")) throw new DataSourceError("Google 계정 연결이 취소되었거나 승인되지 않았습니다.", "GOOGLE_OAUTH_ACCESS_DENIED", 401);
    const code = url.searchParams.get("code")?.trim();
    if (!code) throw new DataSourceError("Google 인증 코드가 없습니다. 연결을 다시 시작해 주세요.", "GOOGLE_OAUTH_TOKEN_EXCHANGE_FAILED", 400);
    const result = await googleSearchConsoleOAuthFlow.complete({ workspaceId: context.workspaceId, ...(context.connectionId ? { connectionId: context.connectionId } : {}), code });
    const outcome = result.connection.availableResources?.length ? (result.resourceRequired ? "resourceRequired" : "success") : "noProperties";
    return NextResponse.redirect(returnUrl(request.url, context.returnTo, outcome, result.connection.id));
  } catch (error) {
    if (context) { const value = publicDataSourceError(error); return NextResponse.redirect(returnUrl(request.url, context.returnTo, "error", context.connectionId, value.code)); }
    return failure(error);
  }
}

async function ownedWorkspace(workspaceId: string) { const data = await studioStore.get<UserData>("application", "user-data"); if (!data?.workspace || data.workspace.id !== workspaceId) throw new DataSourceError("이 Workspace에서 Google 연결을 완료할 수 없습니다.", "DATA_SOURCE_WORKSPACE_FORBIDDEN", 403); }
function returnUrl(requestUrl: string, returnTo: string, outcome: string, connectionId?: string, code?: string) { const target = new URL(returnTo, requestUrl); target.searchParams.set("dataSourceOAuth", outcome); if (connectionId) target.searchParams.set("connectionId", connectionId); if (code) target.searchParams.set("oauthCode", code); return target; }
function failure(error: unknown) { const value = publicDataSourceError(error); return NextResponse.json({ error: value.error, code: value.code }, { status: value.status }); }
