import { findUnrequestedOwnedIdentityPrefixes } from "../../../core/content";
import type { UserContent, UserData, UserProject } from "../../user-flow/user-data";

export function contentOwnedIdentityContamination(
  data: UserData,
  project: UserProject,
  content: UserContent,
): readonly string[] {
  const brandName = project.brandId
    ? data.brands.find((brand) =>
        brand.id === project.brandId
        && brand.workspaceId === project.workspaceId)?.name
    : undefined;
  const opportunity = content.opportunity;
  const sourceRequest = opportunity?.sourceRequest
    ?? content.planningWorkflow?.request
    ?? content.naturalLanguageRequest
    ?? "";
  const selectionMode = opportunity?.selectionMode
    ?? content.planning?.selectionMode
    ?? "automatic";
  return findUnrequestedOwnedIdentityPrefixes({
    ownedTerms: [project.name, brandName ?? ""],
    sourceRequest,
    selectionMode,
    values: [
      opportunity?.selectedTopic ?? content.title,
      opportunity?.primaryKeyword ?? content.primaryKeyword ?? "",
      ...(opportunity?.secondaryKeywords ?? content.relatedKeywords ?? []),
    ],
  });
}

export function assertContentOwnedIdentityClean(
  data: UserData,
  project: UserProject,
  content: UserContent,
): void {
  const contamination = contentOwnedIdentityContamination(data, project, content);
  if (!contamination.length) return;
  throw new Error(
    `기존 기획에 검색 주제가 아닌 프로젝트명 또는 브랜드명이 포함되어 외부 저장을 차단했습니다: ${contamination.join(", ")}. 새 Content에서 Planning을 다시 실행해 주세요.`,
  );
}
