import type { ContentDocument } from "../../core/content";

export class WordPressHtmlRenderer {
  render(document: ContentDocument): string {
    const related = document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post" && Boolean(block.targetUrl));
    const body = document.blocks.filter((block) => !(block.type === "button" && block.purpose === "related_post")).map((block) => {
      if (block.type === "heading") return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      if (block.type === "paragraph") return `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
      if (block.type === "image") return block.source ? `<figure class="wp-block-image"><img src="${attribute(block.source)}" alt="${attribute(block.alt)}"></figure>` : `<!-- image: ${escapeHtml(block.alt)} -->`;
      if (block.type === "video") return `<p><a href="${attribute(block.source)}">${escapeHtml(block.source)}</a></p>`;
      const target = block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
      return `<div class="wp-block-button"><a class="wp-block-button__link" href="${attribute(block.targetUrl)}"${target}>${escapeHtml(block.label)}</a></div>`;
    }).join("\n");
    const relatedHtml = related.length ? `<section class="bright-related-posts"><h2>관련 글 보기</h2><ul>${related.slice(0, 3).map((block) => block.type === "button" ? `<li><a href="${attribute(block.targetUrl)}"${block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(block.label)}</a></li>` : "").join("")}</ul></section>` : "";
    return [body, relatedHtml].filter(Boolean).join("\n");
  }
}
function escapeHtml(value: string) { return value.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!); }
function attribute(value: string) { return escapeHtml(value).replace(/"/g, "&quot;"); }
