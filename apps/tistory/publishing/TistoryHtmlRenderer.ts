import type { ContentDocument } from "../../../core/content";

export class TistoryHtmlRenderer {
  render(document: ContentDocument): string {
    const anchors = headingAnchors(document);
    const toc = anchors.length ? `<nav class="bright-toc" aria-label="목차"><strong>목차</strong><ul>${anchors.map((item) => `<li class="bright-toc-level-${item.level}"><a href="#${item.anchor}">${escape(item.text)}</a></li>`).join("")}</ul></nav>` : "";
    const firstHeading = document.blocks.findIndex((block) => block.type === "heading" && block.level >= 2);
    const related = document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post" && validRelatedPost(block.label, block.targetUrl));
    const body = document.blocks.filter((block) => !(block.type === "button" && block.purpose === "related_post")).flatMap((block, index) => {
      const before = index === firstHeading ? [toc] : [];
      if (block.type === "heading") { const anchor = anchors.find((item) => item.id === block.id)?.anchor; return [...before, `<h${block.level}${anchor ? ` id="${anchor}"` : ""}>${escape(block.text)}</h${block.level}>`]; }
      if (block.type === "paragraph") return [...before, `<p>${escape(block.text).replace(/\n/g, "<br>")}</p>`];
      if (block.type === "image") return [...before, block.source ? `<figure><img src="${attribute(block.source)}" alt="${attribute(block.alt)}">${block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ""}</figure>` : `<figure class="bright-image-placeholder" data-image-required="true"><strong>추천 이미지</strong><p>${escape(block.alt)}</p></figure>`];
      if (block.type === "video") return [...before, `<div class="bright-embed"><a href="${attribute(block.source)}">${escape(block.source)}</a></div>`];
      const className = `bright-${block.purpose ?? "cta"}`;
      const target = block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
      return [...before, block.targetUrl ? `<p class="${className}"><a href="${attribute(block.targetUrl)}"${target}>${escape(block.label)}</a></p>` : `<div class="${className} bright-link-required"><strong>${escape(block.label)}</strong><span>URL 입력 필요</span></div>`];
    }).filter(Boolean).join("\n");
    const relatedHtml = related.length ? `<section class="bright-related-posts"><h2>관련 글 보기</h2><ul>${related.slice(0, 3).map((block) => block.type === "button" ? `<li><a href="${attribute(block.targetUrl)}"${block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escape(block.label)}</a></li>` : "").join("")}</ul></section>` : "";
    return [body, relatedHtml].filter(Boolean).join("\n");
  }
}

function headingAnchors(document: ContentDocument) { const used = new Map<string, number>(); return document.blocks.filter((block): block is Extract<ContentDocument["blocks"][number], { type: "heading" }> => block.type === "heading" && (block.level === 2 || block.level === 3) && Boolean(block.text.trim())).map((block) => { const base = slug(block.text), count = used.get(base) ?? 0; used.set(base, count + 1); return { id: block.id, level: block.level, text: block.text.trim(), anchor: count ? `${base}-${count + 1}` : base }; }); }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section"; }
function validRelatedPost(label: string, targetUrl: string) { try { const url = new URL(targetUrl); return Boolean(label.trim()) && url.protocol === "https:" && /\.tistory\.com$/i.test(url.hostname) && url.pathname.startsWith("/entry/") && !url.pathname.includes("/manage"); } catch { return false; } }

function escape(value: string): string { return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!); }
function attribute(value: string): string { return escape(value).replace(/"/g, "&quot;"); }
