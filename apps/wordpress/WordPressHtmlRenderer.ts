import { ContentNormalizer, type ContentDocument, type TableBlock } from "../../core/content";
import { ensureFreeBodyVisuals, isFreeBodyVisualBlock, renderBrightBodyVisualHtml } from "../../core/media";

export class WordPressHtmlRenderer {
  render(input: ContentDocument): string {
    const document = ensureFreeBodyVisuals(new ContentNormalizer().normalize(input));
    const related = document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post" && Boolean(block.targetUrl));
    const body = document.blocks.filter((block) => !(block.type === "button" && block.purpose === "related_post")).map((block) => {
      if (block.type === "heading") return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      if (block.type === "paragraph") return `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
      if (block.type === "table") return renderTable(block);
      if (block.type === "image") {
        if (block.source) return `<figure class="wp-block-image"><img src="${attribute(block.source)}" alt="${attribute(block.alt)}"></figure>`;
        if (isFreeBodyVisualBlock(block)) return renderBrightBodyVisualHtml(block);
        return `<!-- image: ${escapeHtml(block.alt)} -->`;
      }
      if (block.type === "video") return `<p><a href="${attribute(block.source)}">${escapeHtml(block.source)}</a></p>`;
      const target = block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<div class="wp-block-button"><a class="wp-block-button__link" href="${attribute(block.targetUrl)}"${target}>${escapeHtml(block.label)}</a></div>`;
    }).join("\n");
    const relatedHtml = related.length ? `<section class="bright-related-posts"><h2>관련 글 보기</h2><ul>${related.slice(0, 3).map((block) => block.type === "button" ? `<li><a href="${attribute(block.targetUrl)}"${block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(block.label)}</a></li>` : "").join("")}</ul></section>` : "";
    return [body, relatedHtml].filter(Boolean).join("\n");
  }
}

function renderTable(block: TableBlock): string {
  const caption = block.caption
    ? `<figcaption style="margin:0 0 10px;color:#646970;font-size:14px;text-align:left">${escapeHtml(block.caption)}</figcaption>`
    : "";
  const headerStyle = "border:1px solid #dcdcde;padding:12px 14px;text-align:left;vertical-align:top;background:#f6f7f7;font-weight:700";
  const cellStyle = "border:1px solid #dcdcde;padding:12px 14px;text-align:left;vertical-align:top";
  const headers = block.headers.map((cell) => `<th scope="col" style="${headerStyle}">${escapeHtml(cell)}</th>`).join("");
  const rows = block.rows.map((row) => `<tr>${row.map((cell) => `<td style="${cellStyle}">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  return `<figure class="wp-block-table" style="margin:28px 0;overflow-x:auto">${caption}<table style="width:100%;border-collapse:collapse;border-spacing:0;font-size:16px;line-height:1.6"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></figure>`;
}

function escapeHtml(value: string) { return value.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!); }
function attribute(value: string) { return escapeHtml(value).replace(/"/g, "&quot;"); }
