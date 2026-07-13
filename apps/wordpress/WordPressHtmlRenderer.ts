import type { ContentDocument } from "../../core/content";

export class WordPressHtmlRenderer {
  render(document: ContentDocument): string {
    return document.blocks.map((block) => {
      if (block.type === "heading") return `<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`;
      if (block.type === "paragraph") return `<p>${escapeHtml(block.text).replace(/\n/g, "<br>")}</p>`;
      if (block.type === "image") return block.source ? `<figure class="wp-block-image"><img src="${attribute(block.source)}" alt="${attribute(block.alt)}"></figure>` : `<!-- image: ${escapeHtml(block.alt)} -->`;
      if (block.type === "video") return `<p><a href="${attribute(block.source)}">${escapeHtml(block.source)}</a></p>`;
      return `<div class="wp-block-button"><a class="wp-block-button__link" href="${attribute(block.targetUrl)}">${escapeHtml(block.label)}</a></div>`;
    }).join("\n");
  }
}
function escapeHtml(value: string) { return value.replace(/[&<>]/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[value]!); }
function attribute(value: string) { return escapeHtml(value).replace(/"/g, "&quot;"); }
