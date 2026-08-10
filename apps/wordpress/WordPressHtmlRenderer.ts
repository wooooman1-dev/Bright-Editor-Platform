import { ContentNormalizer, type ContentDocument, type ListBlock, type TableBlock } from "../../core/content";
import { canonicalizeApprovalEvidenceUrl, readerVisibleApprovalSourceText, type ApprovalEvidenceSource } from "../../core/approval";
import { isFreeBodyVisualBlock, renderBrightBodyVisualHtml } from "../../core/media";
import { resolveContentSectionPresentations, resolveTablePresentation, type ContentSectionPresentation } from "../../core/presentation";

export class WordPressHtmlRenderer {
  render(input: ContentDocument): string {
    const document = new ContentNormalizer().normalize(input);
    const related = document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post" && Boolean(block.targetUrl));
    const bodyBlocks = document.blocks.filter((block) => !(block.type === "button" && block.purpose === "related_post"));
    const blockById = new Map(bodyBlocks.map((block) => [block.id, block] as const));
    const cards = new Map(resolveContentSectionPresentations(document)
      .filter((section) => section.treatment === "card")
      .map((section) => [section.headingBlockId, section] as const));
    const consumed = new Set<string>();
    const body = bodyBlocks.flatMap((block) => {
      if (consumed.has(block.id)) return [];
      const card = cards.get(block.id);
      if (card) {
        const sourceBlocks = card.sourceBlockIds.flatMap((id) => blockById.get(id) ?? []);
        sourceBlocks.forEach((source) => consumed.add(source.id));
        return [renderCard(card, sourceBlocks, document)];
      }
      return [renderBlock(block, document)];
    }).filter(Boolean).join("\n");
    const relatedHtml = related.length ? `<section class="bright-related-posts"><h2>관련 글 보기</h2><ul>${related.slice(0, 3).map((block) => block.type === "button" ? `<li><a href="${attribute(block.targetUrl)}"${block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(block.label)}</a></li>` : "").join("")}</ul></section>` : "";
    return [body, relatedHtml].filter(Boolean).join("\n");
  }
}

function renderCard(
  presentation: ContentSectionPresentation,
  blocks: readonly ContentDocument["blocks"][number][],
  document: ContentDocument,
): string {
  const palette = presentation.semanticRole === "warning"
    ? { border: "#e3a008", background: "#fffbeb", badge: "#92400e", badgeBackground: "#fef3c7" }
    : presentation.semanticRole === "checklist"
      ? { border: "#32936f", background: "#f3faf7", badge: "#176044", badgeBackground: "#dff4e9" }
      : { border: "#4776c5", background: "#f5f8ff", badge: "#294f91", badgeBackground: "#e4edff" };
  const content = blocks.map((block) => block.type === "heading"
    ? `<h${block.level} class="bright-content-card__title" style="margin:10px 0 14px;font-size:1.35em;line-height:1.4;word-break:keep-all">${escapeHtml(block.text)}</h${block.level}>`
    : renderBlock(block, document)).filter(Boolean).join("\n");
  return `<section class="bright-content-card bright-content-card--${presentation.semanticRole}" data-bright-component="${presentation.componentId}" style="box-sizing:border-box;max-width:100%;margin:28px 0;padding:20px 22px;border:1px solid ${palette.border};border-left-width:4px;border-radius:14px;background:${palette.background}"><span class="bright-content-card__badge" style="display:inline-block;padding:4px 9px;border-radius:999px;background:${palette.badgeBackground};color:${palette.badge};font-size:12px;font-weight:700;line-height:1.4;letter-spacing:.02em">${presentation.badgeLabel}</span>${content}</section>`;
}

function renderBlock(block: ContentDocument["blocks"][number], document: ContentDocument): string {
  if (block.type === "heading") return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
  if (block.type === "paragraph") {
    const readerText = readerVisibleApprovalSourceText(block);
    const text = projectVerifiedSourceReferences(block.id, readerText, document.metadata?.approvalEvidence?.sources ?? []);
    return text ? `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` : "";
  }
  if (block.type === "list") return renderList(block);
  if (block.type === "table") return renderTable(block);
  if (block.type === "image") {
    if (block.source) return `<figure class="wp-block-image"><img src="${attribute(block.source)}" alt="${attribute(block.alt)}"></figure>`;
    if (isFreeBodyVisualBlock(block)) return renderBrightBodyVisualHtml(block);
    return "";
  }
  if (block.type === "video") return `<p><a href="${attribute(block.source)}">${escapeHtml(block.source)}</a></p>`;
  const target = block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
  if (block.purpose === "internal_link" && block.targetUrl) {
    return `<aside class="bright-internal-link" style="box-sizing:border-box;max-width:100%;margin:28px 0;padding:18px 20px;border:1px solid #cfe0ff;border-radius:14px;background:#f3f7ff"><strong style="display:block;margin-bottom:8px;color:#234b8f;font-size:15px">함께 읽으면 좋은 글</strong><a href="${attribute(block.targetUrl)}"${target} style="color:#1456c0;font-weight:700;text-decoration:underline;text-underline-offset:3px;line-height:1.65">${escapeHtml(block.label)} →</a></aside>`;
  }
  return `<div class="wp-block-button"><a class="wp-block-button__link" href="${attribute(block.targetUrl)}"${target}>${escapeHtml(block.label)}</a></div>`;
}

function projectVerifiedSourceReferences(
  blockId: string,
  value: string,
  sources: readonly ApprovalEvidenceSource[],
): string {
  let text = value;
  const linked = sources.filter((source) =>
    source.verified
    && source.claimVerificationStatus === "verified"
    && source.provenance !== "search_candidate"
    && source.linkedBlockIds?.includes(blockId));
  for (const source of linked) {
    const canonicalUrl = canonicalizeApprovalEvidenceUrl(source.canonicalUrl ?? source.url);
    let host: string;
    try {
      host = new URL(canonicalUrl).hostname.replace(/^www\./iu, "");
    } catch {
      continue;
    }
    text = text.replace(new RegExp(`\\s*\\((?:www\\.)?${escapeRegExp(host)}\\)`, "giu"), "");
    text = text.split(/\r?\n/gu).filter((line) => {
      const match = /^\s*출처\s*:\s*(https:\/\/\S+)\s*$/iu.exec(line);
      return !match || canonicalizeApprovalEvidenceUrl(trimSourceUrl(match[1] ?? "")) !== canonicalUrl;
    }).join("\n");
  }
  return text.replace(/\n{3,}/gu, "\n\n").trim();
}

function trimSourceUrl(value: string): string {
  return value.replace(/[.,;:!?]+$/gu, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderTable(block: TableBlock): string {
  const caption = block.caption
    ? `<figcaption style="margin:0 0 10px;color:#646970;font-size:14px;text-align:left">${escapeHtml(block.caption)}</figcaption>`
    : "";
  const headerStyle = "border:1px solid #dcdcde;padding:12px 14px;text-align:left;vertical-align:top;background:#f6f7f7;font-weight:700";
  const cellStyle = "border:1px solid #dcdcde;padding:12px 14px;text-align:left;vertical-align:top";
  const presentation = resolveTablePresentation(block);
  const labelStyle = presentation.firstColumnRole === "label" ? `;width:1%;min-width:${presentation.firstColumnMinimumWidth}px;white-space:nowrap;word-break:keep-all;overflow-wrap:normal` : "";
  const headers = block.headers.map((cell, index) => `<th scope="col" style="${headerStyle}${index === 0 ? labelStyle : ""}">${escapeHtml(cell)}</th>`).join("");
  const rows = block.rows.map((row) => `<tr>${row.map((cell, index) => `<td style="${cellStyle}${index === 0 ? labelStyle : ""}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<figure class="wp-block-table" style="max-width:100%;margin:28px 0;overflow-x:auto;-webkit-overflow-scrolling:touch">${caption}<table style="width:100%;border-collapse:collapse;border-spacing:0;min-width:${tableMinimumWidth(block)}px;font-size:16px;line-height:1.6"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></figure>`;
}

function renderList(block: ListBlock): string {
  const tag = block.style === "ordered" ? "ol" : "ul";
  return `<${tag}>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
}

function tableMinimumWidth(block: TableBlock): number {
  const longestCell = Math.max(0, ...block.headers.map((cell) => cell.length), ...block.rows.flat().map((cell) => cell.length));
  return Math.min(960, Math.max(480, block.headers.length * 180, longestCell > 40 ? 720 : 0));
}

function escapeHtml(value: string) { return value.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!); }
function attribute(value: string) { return escapeHtml(value).replace(/"/g, "&quot;"); }
