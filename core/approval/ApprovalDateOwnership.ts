import {
  isSystemProjectionBlock,
  type ContentBlock,
  type ContentDocument,
} from "../content";

const combinedInformationDatePattern = /정보\s*기준일\s*(?:과|와|및|·|\/|,)\s*(?:(?:Claim\s*)?최종\s*검토일|출처\s*확인일)\s*(?:은|는|이|가)?\s*[:：]?\s*((?:20\d{2})\s*(?:[-./년])\s*\d{1,2}\s*(?:(?:[-./월])\s*\d{1,2}\s*(?:일)?)?)/giu;
const reversedInformationDatePattern = /(?:(?:Claim\s*)?최종\s*검토일|출처\s*확인일)\s*(?:과|와|및|·|\/|,)\s*정보\s*기준일\s*(?:은|는|이|가)?\s*[:：]?\s*((?:20\d{2})\s*(?:[-./년])\s*\d{1,2}\s*(?:(?:[-./월])\s*\d{1,2}\s*(?:일)?)?)/giu;

/**
 * Deterministically separates the manuscript-owned information date from
 * Bright Studio's system-owned source/Claim review dates.
 */
export function normalizeApprovalDateOwnership(document: ContentDocument): ContentDocument {
  if (document.metadata?.approvalPolicy?.profileId !== "wordpress_life_economy_v1") return document;
  let changed = false;
  const blocks = document.blocks.map((block) => {
    if (isSystemProjectionBlock(block)) return block;
    const normalized = normalizeBlock(block);
    if (normalized !== block) changed = true;
    return normalized;
  });
  if (!changed) return document;
  return Object.freeze({
    ...document,
    blocks: Object.freeze(blocks),
  });
}

export function normalizeApprovalInformationDateText(value: string): string {
  return value
    .replace(combinedInformationDatePattern, "정보 기준일은 $1")
    .replace(reversedInformationDatePattern, "정보 기준일은 $1");
}

function normalizeBlock(block: ContentBlock): ContentBlock {
  if (block.type === "paragraph" || block.type === "heading") {
    const text = normalizeApprovalInformationDateText(block.text);
    return text === block.text ? block : Object.freeze({ ...block, text });
  }
  if (block.type === "list") {
    const items = block.items.map(normalizeApprovalInformationDateText);
    return items.every((item, index) => item === block.items[index])
      ? block
      : Object.freeze({ ...block, items: Object.freeze(items) });
  }
  if (block.type === "table") {
    const caption = block.caption ? normalizeApprovalInformationDateText(block.caption) : block.caption;
    const headers = block.headers.map(normalizeApprovalInformationDateText);
    const rows = block.rows.map((row) => row.map(normalizeApprovalInformationDateText));
    const unchanged = caption === block.caption
      && headers.every((item, index) => item === block.headers[index])
      && rows.every((row, rowIndex) => row.every((item, columnIndex) => item === block.rows[rowIndex]?.[columnIndex]));
    return unchanged
      ? block
      : Object.freeze({
          ...block,
          ...(caption !== undefined ? { caption } : {}),
          headers: Object.freeze(headers),
          rows: Object.freeze(rows.map((row) => Object.freeze(row))),
        });
  }
  return block;
}
