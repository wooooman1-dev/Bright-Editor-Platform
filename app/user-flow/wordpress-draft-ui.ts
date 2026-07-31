import type { PublishingExecutionRecord } from "../../core/publishing";

export type WordPressDraftOutcomePresentation = Readonly<{
  title: string;
  description: string;
  tone: "success" | "warning" | "error" | "info";
  retryBlocked: boolean;
}>;

export function wordpressDraftOutcomePresentation(
  record: PublishingExecutionRecord,
): WordPressDraftOutcomePresentation {
  if (record.status === "verified") {
    return Object.freeze({
      title: "워드프레스 임시글 저장 완료",
      description: "워드프레스에서 임시글을 다시 읽어 제목, 본문, 카테고리와 필요한 이미지를 검증했습니다.",
      tone: "success",
      retryBlocked: false,
    });
  }
  if (record.status === "cleanup_required") {
    return Object.freeze({
      title: "워드프레스 이미지 확인 필요",
      description: "임시글 저장이 끝나기 전에 이미지가 생성되었습니다. 자동 삭제하지 않았으므로 워드프레스 미디어 보관함에서 아래 이미지 ID를 확인하세요.",
      tone: "warning",
      retryBlocked: true,
    });
  }
  if (record.status === "unknown_result") {
    return Object.freeze({
      title: "워드프레스 결과를 확인할 수 없습니다",
      description: "새 임시글을 만들지 마세요. 먼저 워드프레스 관리자에서 기존 임시글과 이미지 존재 여부를 확인하세요.",
      tone: "warning",
      retryBlocked: true,
    });
  }
  if (record.status === "verification_failed") {
    return Object.freeze({
      title: "워드프레스 외부 검증 실패",
      description: "외부 글 ID는 보존했습니다. 새 임시글을 만들지 않고 워드프레스 관리자에서 불일치 항목을 확인해야 합니다.",
      tone: "error",
      retryBlocked: true,
    });
  }
  if (["preparing", "media_uploaded", "draft_created"].includes(record.status)) {
    return Object.freeze({
      title: "워드프레스 임시글 저장 진행 중",
      description: "동일한 문서 버전의 중복 실행을 차단하고 있습니다.",
      tone: "info",
      retryBlocked: true,
    });
  }
  return Object.freeze({
    title: "워드프레스 임시글 저장 실패",
    description: record.stage === "media"
      ? "이미지 처리 단계에서 실패했습니다. 외부 생성물이 없으므로 저장된 오류 상태를 확인하세요."
      : record.stage === "draft_create"
        ? "임시글 생성 단계에서 실패했습니다. 자동으로 다시 실행하지 않습니다."
        : "저장된 단계와 안전 오류 안내를 확인하세요.",
    tone: "error",
    retryBlocked: true,
  });
}

export function blocksWordPressDraftExecution(record: PublishingExecutionRecord | undefined): boolean {
  return Boolean(record && record.status !== "verified");
}
