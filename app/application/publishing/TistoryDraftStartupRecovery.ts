import type { TistoryDraftSaveResult } from "../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

export function isRetryableDraftStartupFailure(result: TistoryDraftSaveResult): boolean {
  return result.status === "failed"
    && result.saveClicked === false
    && !result.failedStep
    && (result.steps?.length ?? 0) === 0;
}

export function normalizeDraftStartupFailure(
  result: TistoryDraftSaveResult,
  attempts: number,
): TistoryDraftSaveResult {
  if (!isRetryableDraftStartupFailure(result)) return result;

  const error = "Tistory 글쓰기 화면 초기화에 실패했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
  return {
    ...result,
    status: "failed",
    failedStep: "editor_opened",
    error,
    steps: [
      ...(result.steps ?? []),
      {
        key: "editor_opened",
        passed: false,
        diagnosticCode: "editor_startup_failed",
        message: error,
        evidence: { attempts },
      },
    ],
    verification: {
      ...(result.verification ?? {}),
      startupAttempts: attempts,
    },
  };
}
