import { ContentNormalizer, type ContentDocument, type ListBlock, type TableBlock } from "../../core/content";
import { canonicalizeApprovalEvidenceUrl, type ApprovalEvidenceSource } from "../../core/approval";
import { isFreeBodyVisualBlock, renderBrightBodyVisualHtml } from "../../core/media";

export class WordPressHtmlRenderer {
  render(input: ContentDocument): string {
    const document = new ContentNormalizer().normalize(input);
    const related = document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post" && Boolean(block.targetUrl));
    const body = document.blocks.filter((block) => !(block.type === "button" && block.purpose === "related_post")).map((block) => {
      if (block.type === "heading") return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      if (block.type === "paragraph") {
        const text = projectVerifiedSourceReferences(block.id, block.text, document.metadata?.approvalEvidence?.sources ?? []);
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
      return `<div class="wp-block-button"><a class="wp-block-button__link" href="${attribute(block.targetUrl)}"${target}>${escapeHtml(block.label)}</a></div>`;
    }).join("\n");
    const relatedHtml = related.length ? `<section class="bright-related-posts"><h2>관련 글 보기</h2><ul>${related.slice(0, 3).map((block) => block.type === "button" ? `<li><a href="${attribute(block.targetUrl)}"${block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(block.label)}</a></li>` : "").join("")}</ul></section>` : "";
    return [body, relatedHtml].filter(Boolean).join("\n");
  }
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
  const headers = block.headers.map((cell) => `<th scope="col" style="${headerStyle}">${escapeHtml(cell)}</th>`).join("");
  const rows = block.rows.map((row) => `<tr>${row.map((cell) => `<td style="${cellStyle}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
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
