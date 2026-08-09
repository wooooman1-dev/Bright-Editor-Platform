import type { TableBlock } from "../content/blocks/TableBlock";

export type TablePresentation = Readonly<{
  firstColumnRole: "label" | "content";
  firstColumnMinimumWidth?: number;
}>;

/** Identifies compact label columns without imposing platform CSS. */
export function resolveTablePresentation(block: TableBlock): TablePresentation {
  if (block.headers.length < 2) return Object.freeze({ firstColumnRole: "content" });
  const firstColumn = [block.headers[0] ?? "", ...block.rows.map((row) => row[0] ?? "")];
  const lengths = firstColumn.map((cell) => Array.from(cell.trim()).length);
  if (!lengths.every((length) => length > 0 && length <= 18)) {
    return Object.freeze({ firstColumnRole: "content" });
  }
  return Object.freeze({
    firstColumnRole: "label",
    firstColumnMinimumWidth: Math.min(220, Math.max(112, 16 + Math.max(...lengths) * 14)),
  });
}
