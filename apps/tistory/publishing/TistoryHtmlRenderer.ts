import { ContentNormalizer, createContentOutline, type ContentDocument, type ContentOutlineEntry, type ListBlock, type TableBlock } from "../../../core/content";
import { isFreeBodyVisualBlock, renderBrightBodyVisualHtml } from "../../../core/media";

export class TistoryHtmlRenderer {
  render(input: ContentDocument): string {
    const document = new ContentNormalizer().normalize(input);
    const anchors = headingAnchors(createContentOutline(document));
    const toc = anchors.length ? `<nav class="bright-toc" aria-label="목차"><strong>목차</strong><ul>${anchors.map((item) => `<li class="bright-toc-level-${item.level}"><a href="#${item.anchor}">${escape(item.text)}</a></li>`).join("")}</ul></nav>` : "";
    const firstHeading = document.blocks.findIndex((block) => block.type === "heading" && block.level >= 2);
    const related = document.blocks.filter((block) => block.type === "button" && block.purpose === "related_post" && validRelatedPost(block.label, block.targetUrl));
    const body = document.blocks.filter((block) => !(block.type === "button" && block.purpose === "related_post")).flatMap((block, index) => {
      const before = index === firstHeading ? [toc] : [];
      if (block.type === "heading") { const anchor = anchors.find((item) => item.id === block.id)?.anchor; return [...before, `<h${block.level}${anchor ? ` id="${anchor}"` : ""}>${escape(block.text)}</h${block.level}>`]; }
      if (block.type === "paragraph") return [...before, `<p>${escape(block.text).replace(/\n/g, "<br>")}</p>`];
      if (block.type === "list") return [...before, renderList(block)];
      if (block.type === "table") return [...before, renderTable(block)];
      if (block.type === "image") {
        if (block.source) return [...before, `<figure><img src="${attribute(block.source)}" alt="${attribute(block.alt)}">${block.caption ? `<figcaption>${escape(block.caption)}</figcaption>` : ""}</figure>`];
        if (isFreeBodyVisualBlock(block)) return [...before, renderBrightBodyVisualHtml(block)];
        return before;
      }
      if (block.type === "video") return [...before, `<div class="bright-embed"><a href="${attribute(block.source)}">${escape(block.source)}</a></div>`];
      const className = `bright-${block.purpose ?? "cta"}`;
      const target = block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : "";
      if (block.purpose === "internal_link" && block.targetUrl) {
        return [...before, `<aside class="${className}" style="margin:28px 0;padding:18px 20px;border:1px solid #cfe0ff;border-radius:14px;background:#f3f7ff;"><strong style="display:block;margin-bottom:8px;color:#234b8f;font-size:15px;">함께 읽으면 좋은 글</strong><a href="${attribute(block.targetUrl)}"${target} style="color:#1456c0;font-weight:700;text-decoration:underline;text-underline-offset:3px;line-height:1.65;">${escape(block.label)} →</a></aside>`];
      }
      return [...before, block.targetUrl ? `<p class="${className}"><a href="${attribute(block.targetUrl)}"${target}>${escape(block.label)}</a></p>` : `<div class="${className} bright-link-required"><strong>${escape(block.label)}</strong><span>URL 입력 필요</span></div>`];
    }).filter(Boolean).join("\n");
    const relatedHtml = related.length ? `<section class="bright-related-posts"><h2>함께 보면 좋은 글</h2><ul>${related.slice(0, 3).map((block) => block.type === "button" ? `<li><a href="${attribute(block.targetUrl)}"${block.target === "_blank" ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escape(block.label)}</a></li>` : "").join("")}</ul></section>` : "";
    return [body, relatedHtml].filter(Boolean).join("\n");
  }
}

function renderList(block: ListBlock): string {
  const tag = block.style === "ordered" ? "ol" : "ul";
  return `<${tag}>${block.items.map((item) => `<li>${escape(item)}</li>`).join("")}</${tag}>`;
}

function renderTable(block: TableBlock): string {
  const caption = block.caption ? `<caption style="caption-side:top;padding:0 0 12px;text-align:left;font-weight:700;color:#333;">${escape(block.caption)}</caption>` : "";
  const headers = block.headers.map((cell) => `<th scope="col" style="border:1px solid #d9d9de;background:#f6f6f8;padding:12px 14px;text-align:left;vertical-align:top;font-weight:700;white-space:nowrap;">${escape(cell)}</th>`).join("");
  const rows = block.rows.map((row) => `<tr>${row.map((cell) => `<td style="border:1px solid #d9d9de;padding:12px 14px;text-align:left;vertical-align:top;">${escape(cell)}</td>`).join("")}</tr>`).join("");
  return `<div class="bright-table-scroll" style="margin:28px 0;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;"><table style="width:100%;min-width:640px;border-collapse:collapse;border-spacing:0;line-height:1.65;">${caption}<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function headingAnchors(outline: readonly ContentOutlineEntry[]) { const used = new Map<string, number>(); return outline.map((entry) => { const base = slug(entry.text), count = used.get(base) ?? 0; used.set(base, count + 1); return { ...entry, anchor: count ? `${base}-${count + 1}` : base }; }); }
function slug(value: string) { return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section"; }
function validRelatedPost(label: string, targetUrl: string) { try { const url = new URL(targetUrl); return Boolean(label.trim()) && url.protocol === "https:" && /\.tistory\.com$/i.test(url.hostname) && url.pathname.startsWith("/entry/") && !url.pathname.includes("/manage"); } catch { return false; } }

function escape(value: string): string { return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!); }
function attribute(value: string): string { return escape(value).replace(/"/g, "&quot;"); }
