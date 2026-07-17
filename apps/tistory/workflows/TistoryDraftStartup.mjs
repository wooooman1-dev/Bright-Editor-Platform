export async function openTistoryEditor(page, blogId, options = {}) {
  const attempts = Number.isInteger(options.attempts) ? Math.max(1, options.attempts) : 2;
  const timeout = Number.isFinite(options.timeout) ? Math.max(1_000, options.timeout) : 20_000;
  const retryDelay = Number.isFinite(options.retryDelay) ? Math.max(0, options.retryDelay) : 750;
  const editorUrl = `https://${blogId}.tistory.com/manage/newpost`;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(editorUrl, { waitUntil: "commit", timeout });
      await page.waitForLoadState?.("domcontentloaded", { timeout: Math.min(timeout, 10_000) }).catch(() => undefined);
      return { attempt, editorUrl };
    } catch (error) {
      lastError = error;
      const currentUrl = typeof page.url === "function" ? String(page.url()) : "";
      if (currentUrl.startsWith(`https://${blogId}.tistory.com/manage`)) {
        return { attempt, editorUrl: currentUrl };
      }
      if (attempt < attempts && retryDelay > 0) {
        await page.waitForTimeout?.(retryDelay);
      }
    }
  }

  const timedOut = /timeout/i.test(String(lastError?.message ?? lastError ?? ""));
  throw workflowError(
    "editor_opened",
    timedOut ? "editor_navigation_timeout" : "editor_navigation_failed",
    timedOut
      ? "Tistory 글쓰기 화면 응답이 지연되어 열지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
      : "Tistory 글쓰기 화면을 열지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
  );
}

export function normalizeTistoryDraftStartupError(error, phase) {
  if (error && typeof error === "object") {
    const candidate = error;
    if (typeof candidate.failedStep === "string" && typeof candidate.diagnosticCode === "string" && typeof candidate.safeMessage === "string") {
      return { failedStep: candidate.failedStep, diagnosticCode: candidate.diagnosticCode, safeMessage: candidate.safeMessage };
    }
  }

  const rawMessage = String(error?.message ?? error ?? "");
  if (phase === "command_loaded") {
    return { failedStep: "session_loaded", diagnosticCode: "draft_command_invalid", safeMessage: "임시저장 작업 정보를 불러오지 못했습니다." };
  }
  if (phase === "browser_launched") {
    return { failedStep: "session_loaded", diagnosticCode: "browser_launch_failed", safeMessage: "Tistory 임시저장용 브라우저를 시작하지 못했습니다." };
  }
  if (phase === "session_loaded") {
    return { failedStep: "session_loaded", diagnosticCode: "stored_session_load_failed", safeMessage: "저장된 Tistory 세션을 불러오지 못했습니다. 플랫폼 연결을 다시 확인해 주세요." };
  }
  if (phase === "editor_navigation") {
    const timedOut = /timeout/i.test(rawMessage);
    return {
      failedStep: "editor_opened",
      diagnosticCode: timedOut ? "editor_navigation_timeout" : "editor_navigation_failed",
      safeMessage: timedOut
        ? "Tistory 글쓰기 화면 응답이 지연되어 열지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."
        : "Tistory 글쓰기 화면을 열지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
    };
  }
  return { failedStep: "editor_ready", diagnosticCode: "editor_startup_failed", safeMessage: "Tistory 에디터 초기화 중 오류가 발생했습니다. 다시 시도해 주세요." };
}

function workflowError(failedStep, diagnosticCode, safeMessage) {
  const error = new Error(safeMessage);
  error.failedStep = failedStep;
  error.diagnosticCode = diagnosticCode;
  error.safeMessage = safeMessage;
  return error;
}
