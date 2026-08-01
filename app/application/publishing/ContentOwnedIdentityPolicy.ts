import {
  findUnrequestedOwnedIdentityOccurrences,
  findUnrequestedOwnedIdentityPrefixes,
  serializeStructuredList,
  type ContentDocument,
} from "../../../core/content";
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
  const explicitPrimaryTopic = project.strategy?.primaryTopic?.trim() ?? "";
  const projectIdentity = explicitPrimaryTopic
    && normalizedIdentity(project.name) === normalizedIdentity(explicitPrimaryTopic)
    ? ""
    : project.name;
  const ownedTerms = [projectIdentity, brandName ?? ""];
  const planningMatches = findUnrequestedOwnedIdentityPrefixes({
    ownedTerms,
    sourceRequest,
    selectionMode,
    values: [
      opportunity?.selectedTopic ?? content.title,
      opportunity?.primaryKeyword ?? content.primaryKeyword ?? "",
      ...(opportunity?.secondaryKeywords ?? content.relatedKeywords ?? []),
    ],
  });
  const documentMatches = findUnrequestedOwnedIdentityOccurrences({
    ownedTerms,
    sourceRequest,
    selectionMode,
    values: content.document ? documentEditorialValues(content.document) : [content.title],
  });
  return Object.freeze([...new Set([...planningMatches, ...documentMatches])]);
}

export function assertContentOwnedIdentityClean(
  data: UserData,
  project: UserProject,
  content: UserContent,
): void {
  const contamination = contentOwnedIdentityContamination(data, project, content);
  if (!contamination.length) return;
  throw new Error(
    `기존 기획 또는 원고에 검색 주제가 아닌 프로젝트명 또는 브랜드명이 포함되어 외부 저장을 차단했습니다: ${contamination.join(", ")}. 새 Content에서 Planning을 다시 실행해 주세요.`,
  );
}

function documentEditorialValues(document: ContentDocument): readonly string[] {
  const metadata = document.metadata;
  return Object.freeze([
    document.title,
    metadata?.metaDescription ?? "",
    metadata?.primarySearchIntent ?? "",
    metadata?.secondaryIntent ?? "",
    ...(metadata?.secondaryKeywords ?? []),
    ...(metadata?.relatedTerms ?? []),
    ...(metadata?.tags ?? []),
    ...document.blocks.flatMap((block) => {
      if (block.type === "heading" || block.type === "paragraph") return [block.text];
      if (block.type === "list") return [serializeStructuredList(block)];
      if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
      if (block.type === "image") return [block.alt, block.prompt ?? "", block.caption ?? ""];
      if (block.type === "button") return [block.label];
      return [];
    }),
  ].filter(Boolean));
}

function normalizedIdentity(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
