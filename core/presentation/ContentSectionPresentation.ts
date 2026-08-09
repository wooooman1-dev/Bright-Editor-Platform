import type { ContentDocument } from "../content/ContentDocument";
import type { ContentSectionType } from "../content/ContentDepthPolicy";
import type { BrightSemanticRole } from "./PresentationModel";

export type ContentSectionTreatment = "standard" | "card";

export type ContentSectionPresentation = Readonly<{
  headingBlockId: string;
  sectionType: ContentSectionType;
  semanticRole: BrightSemanticRole;
  treatment: ContentSectionTreatment;
  sourceBlockIds: readonly string[];
  componentId?: "bright.checklist" | "bright.warning" | "bright.summary-card";
  badgeLabel?: "체크리스트" | "주의·확인" | "핵심 요약";
}>;

/**
 * Projects existing canonical section semantics into presentation intent.
 * It never changes Content blocks or their factual surfaces.
 */
export function resolveContentSectionPresentations(document: ContentDocument): readonly ContentSectionPresentation[] {
  const structure = document.metadata?.longFormStructure;
  if (!structure) return Object.freeze([]);
  const blockIndex = new Map(document.blocks.map((block, index) => [block.id, index] as const));

  return Object.freeze(structure.sections.flatMap((section) => {
    const start = blockIndex.get(section.headingBlockId);
    if (start === undefined || document.blocks[start]?.type !== "heading") return [];
    const contentIndexes = section.paragraphBlockIds
      .flatMap((id) => blockIndex.get(id) ?? [])
      .filter((index) => index > start);
    const end = contentIndexes.length ? Math.max(...contentIndexes) + 1 : start + 1;
    const sourceBlocks = document.blocks.slice(start, end);
    const sectionType = section.sectionType ?? "explanation";
    const card = cardDefinition(sectionType, sourceBlocks);
    return [Object.freeze({
      headingBlockId: section.headingBlockId,
      sectionType,
      semanticRole: semanticRole(sectionType),
      treatment: card ? "card" as const : "standard" as const,
      sourceBlockIds: Object.freeze(sourceBlocks.map((block) => block.id)),
      ...(card ?? {}),
    })];
  }));
}

function cardDefinition(
  sectionType: ContentSectionType,
  blocks: ContentDocument["blocks"],
): Pick<ContentSectionPresentation, "componentId" | "badgeLabel"> | undefined {
  const content = blocks.slice(1);
  if (!content.length || content.some((block) => block.type === "table")) return undefined;
  if (sectionType === "checklist" && content.some((block) => block.type === "list")) {
    return { componentId: "bright.checklist", badgeLabel: "체크리스트" };
  }
  if (sectionType === "warning" && content.some(isReadableContent)) {
    return { componentId: "bright.warning", badgeLabel: "주의·확인" };
  }
  if (sectionType === "summary" && content.some(isReadableContent)) {
    return { componentId: "bright.summary-card", badgeLabel: "핵심 요약" };
  }
  return undefined;
}

function semanticRole(sectionType: ContentSectionType): BrightSemanticRole {
  if (sectionType === "checklist") return "checklist";
  if (sectionType === "warning") return "warning";
  if (sectionType === "summary") return "summary";
  if (sectionType === "comparison") return "comparison";
  if (sectionType === "faq") return "faq";
  return "standard_content";
}

function isReadableContent(block: ContentDocument["blocks"][number]): boolean {
  return block.type === "paragraph" || block.type === "list" || block.type === "image" || block.type === "button";
}
