import type { TistoryDraftSaveResult } from "../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

export function isRetryableDraftStartupFailure(result: TistoryDraftSaveResult): boolean {
  const steps = result.steps ?? [];
  const hasRecordedFailure = steps.some((step) => !step.passed);
  const hasExternalSaveClick = result.saveClicked === true
    || (result.draftSaveClickCount ?? 0) > 0
    || steps.some((step) => step.key === "draft_save_clicked" && step.passed);
  const workerStarted = steps.some((step) => step.key === "session_loaded" && step.passed);

  return result.status === "failed"
    && !result.failedStep
    && workerStarted
    && !hasRecordedFailure
    && !hasExternalSaveClick;
}

export function normalizeDraftStartupFailure(
  result: TistoryDraftSaveResult,
  attempts: number,
): TistoryDraftSaveResult {
  if (!isRetryableDraftStartupFailure(result)) return result;

  const completedSteps = (result.steps ?? [])
    .filter((step) => step.passed)
    .map((step) => step.key);
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
        evidence: { attempts, completedSteps },
      },
    ],
    verification: {
      ...(result.verification ?? {}),
      startupAttempts: attempts,
      completedSteps,
    },
  };
}
