import type {
  TistoryDraftRuntimeFailure,
  TistoryDraftSaveResult,
  TistoryDraftWorkflowStep,
} from "../../../apps/tistory/workflows/TistoryDraftSaveWorkflow";

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
  const runtimeFailure = result.diagnostic?.runtimeFailure;
  const failedStep: TistoryDraftWorkflowStep["key"] = completedSteps.includes("editor_ready")
    ? "draft_preflight"
    : "editor_opened";
  const diagnosticCode = runtimeFailureCode(runtimeFailure, failedStep);
  const error = runtimeFailureMessage(runtimeFailure, failedStep);

  return {
    ...result,
    status: "failed",
    failedStep,
    error,
    steps: [
      ...(result.steps ?? []),
      {
        key: failedStep,
        passed: false,
        diagnosticCode,
        message: error,
        evidence: {
          attempts,
          completedSteps,
          ...(runtimeFailure?.name ? { runtimeName: runtimeFailure.name } : {}),
        },
      },
    ],
    verification: {
      ...(result.verification ?? {}),
      startupAttempts: attempts,
      completedSteps,
    },
  };
}

export function runtimeFailureCode(
  runtimeFailure: TistoryDraftRuntimeFailure | undefined,
  failedStep: TistoryDraftWorkflowStep["key"] = "draft_preflight",
): string {
  const runtimeName = safeToken(runtimeFailure?.name);
  if (runtimeName) return `${failedStep}_${runtimeName}`.slice(0, 100);
  return failedStep === "draft_preflight" ? "draft_preflight_unknown_error" : "editor_startup_failed";
}

export function runtimeFailureMessage(
  runtimeFailure: TistoryDraftRuntimeFailure | undefined,
  failedStep: TistoryDraftWorkflowStep["key"] = "draft_preflight",
): string {
  const detail = safeRuntimeMessage(runtimeFailure?.message);
  const prefix = failedStep === "draft_preflight"
    ? "Tistory 에디터 준비 후 임시저장 사전 확인 단계에서 오류가 발생했습니다."
    : "Tistory 글쓰기 화면 초기화에 실패했습니다.";
  return detail ? `${prefix} ${detail}` : `${prefix} 다시 시도해 주세요.`;
}

function safeToken(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function safeRuntimeMessage(value: string | undefined): string {
  return String(value ?? "")
    .replace(/[A-Z]:\\[^\s]+/gi, "[local path]")
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}
