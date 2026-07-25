export type TistoryDraftOutcomeStatus =
  | "verified"
  | "saved_unverified"
  | "duplicate_existing"
  | "diagnosed"
  | "failed";

export type TistoryDraftOutcomePresentation = Readonly<{
  title: string;
  message: string;
  tone: "success" | "warning" | "error" | "info";
  primaryAction: "continue" | "reverify" | "retry";
  primaryLabel: string;
}>;

export type TistoryDraftRequestContext = Readonly<{
  workspaceId: string;
  projectId: string;
  contentId: string;
  connectionId: string;
  finalConfirmation: true;
}>;

export function draftOutcomePresentation(status: TistoryDraftOutcomeStatus): TistoryDraftOutcomePresentation {
  switch (status) {
    case "verified":
      return Object.freeze({
        title: "Tistory 임시저장 완료",
        message: "새 임시글을 저장하고 다시 열어 제목, 본문, 카테고리와 비공개 상태를 확인했습니다.",
        tone: "success",
        primaryAction: "continue",
        primaryLabel: "계속 편집",
      });
    case "saved_unverified":
      return Object.freeze({
        title: "임시저장은 완료됐지만 재확인이 필요합니다",
        message: "임시저장 완료 신호와 Draft 수 증가를 확인했습니다. 같은 글을 다시 저장하지 말고 기존 임시글을 먼저 확인하세요.",
        tone: "warning",
        primaryAction: "reverify",
        primaryLabel: "기존 임시글 다시 확인",
      });
    case "duplicate_existing":
      return Object.freeze({
        title: "같은 제목의 기존 임시글이 있습니다",
        message: "새 임시글을 만들지 않았습니다. 기존 임시글을 다시 열어 현재 원고와 일치하는지 확인하세요.",
        tone: "warning",
        primaryAction: "reverify",
        primaryLabel: "기존 임시글 다시 확인",
      });
    case "diagnosed":
      return Object.freeze({
        title: "기존 임시글 확인 결과",
        message: "재저장 없이 기존 임시글 확인 작업을 완료했습니다. 진단 정보와 Tistory 화면을 확인하세요.",
        tone: "info",
        primaryAction: "continue",
        primaryLabel: "계속 편집",
      });
    default:
      return Object.freeze({
        title: "Tistory 임시저장에 실패했습니다",
        message: "새 임시글 저장이 확인되지 않았습니다. 오류 내용을 확인한 뒤에만 다시 시도하세요.",
        tone: "error",
        primaryAction: "retry",
        primaryLabel: "임시저장 다시 시도",
      });
  }
}

export function readDraftRequestContext(input: RequestInfo | URL, init?: RequestInit): TistoryDraftRequestContext | undefined {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST" || !isTistoryApiUrl(url) || typeof init?.body !== "string") return undefined;

  try {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    if (body.action !== undefined || body.finalConfirmation !== true) return undefined;
    const workspaceId = requiredString(body.workspaceId);
    const projectId = requiredString(body.projectId);
    const contentId = requiredString(body.contentId);
    const connectionId = requiredString(body.connectionId);
    if (!workspaceId || !projectId || !contentId || !connectionId) return undefined;
    return Object.freeze({ workspaceId, projectId, contentId, connectionId, finalConfirmation: true });
  } catch {
    return undefined;
  }
}

export function reverifyRequestBody(context: TistoryDraftRequestContext): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...context, action: "draft_reopen_verify" });
}

function isTistoryApiUrl(value: string): boolean {
  try {
    const url = new URL(value, "http://bright-studio.local");
    return url.pathname === "/api/tistory";
  } catch {
    return false;
  }
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
