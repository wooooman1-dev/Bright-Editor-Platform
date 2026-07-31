import type { ContentDocument } from "../../core/content";
import type { UserContent, UserData } from "../user-flow/user-data";
import { contentOwnedIdentityContamination } from "./publishing/ContentOwnedIdentityPolicy";

export function assertCandidateDocumentOwnedIdentityClean(
  data: UserData,
  content: UserContent,
  document: ContentDocument,
): void {
  const project = data.projects.find((item) =>
    item.id === content.projectId
    && item.workspaceId === content.workspaceId);
  if (!project) throw new Error("프로젝트명·브랜드명 검증을 위한 프로젝트를 찾을 수 없습니다.");

  const contamination = contentOwnedIdentityContamination(
    data,
    project,
    { ...content, title: document.title, document },
  );
  if (!contamination.length) return;
  throw new Error(
    `후보 문서의 제목·본문·메타데이터·이미지 설명 또는 태그에 요청하지 않은 프로젝트명 또는 브랜드명이 포함되어 저장을 차단했습니다: ${contamination.join(", ")}.`,
  );
}
