import type { PublishingExecutionRecord } from "../../core/publishing";
import type { WordPressDraftReadiness } from "../application/publishing/WordPressDraftReadiness";
import {
  canSubmitWordPressDraft,
  type WordPressDraftSubmissionGuard,
} from "./wordpress-draft-overlay-state";

export type WordPressDraftRequestResult = Readonly<{
  record?: PublishingExecutionRecord;
  readiness?: WordPressDraftReadiness;
  reused?: boolean;
  duplicateBlocked?: boolean;
  error?: string;
}>;

export type WordPressDraftRequest = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function requestWordPressDraftCreation(
  guard: WordPressDraftSubmissionGuard,
  request: WordPressDraftRequest = fetch,
  options: Readonly<{ explicitNewAttempt?: boolean }> = {},
): Promise<WordPressDraftRequestResult | undefined> {
  if (!guard.identity) return undefined;
  if (!options.explicitNewAttempt && !canSubmitWordPressDraft(guard)) return undefined;

  const response = await request("/api/publishing/wordpress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "create_draft",
      workspaceId: guard.identity.workspaceId,
      projectId: guard.identity.projectId,
      contentId: guard.identity.contentId,
      connectionId: guard.identity.connectionId,
      finalConfirmation: true,
      ...(options.explicitNewAttempt ? { explicitNewAttempt: true } : {}),
    }),
  });
  const payload = await response.json() as {
    result?: WordPressDraftRequestResult;
    error?: string;
  };
  if (!response.ok && !payload.result?.record) {
    throw new Error(payload.error ?? payload.result?.error ?? "워드프레스 임시글 저장에 실패했습니다.");
  }
  return payload.result;
}
