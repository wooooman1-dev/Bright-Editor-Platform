import type { ContentDocument } from "../../../core/content";

export class TistoryHtmlRenderer {
  render(document: ContentDocument): string {
    return document.blocks.map((block) => {
      if (block.type === "heading") return `<h${block.level}>${escape(block.text)}</h${block.level}>`;
      if (block.type === "paragraph") return `<p>${escape(block.text).replace(/\n/g, "<br>")}</p>`;
      if (block.type === "image") return block.source ? `<figure><img src="${attribute(block.source)}" alt="${attribute(block.alt)}">${block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ""}</figure>` : `<!-- image: ${escape(block.alt)} -->`;
      if (block.type === "video") return `<div class="bright-embed"><a href="${attribute(block.source)}">${escape(block.source)}</a></div>`;
      return `<p class="bright-cta"><a href="${attribute(block.targetUrl)}">${escape(block.label)}</a></p>`;
    }).join("\n");
  }
}

function escape(value: string): string { return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!); }
function attribute(value: string): string { return escape(value).replace(/"/g, "&quot;"); }
