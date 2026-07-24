const htmlPattern = /<\/?[a-z][^>]*>/i;
const entityPattern = /&(?:nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i;

export function normalizeStructuredText(value: string): string {
  const normalized = value.normalize("NFKC");
  if (!htmlPattern.test(normalized) && !entityPattern.test(normalized)) return normalized.trim();

  let text = normalized
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, body: string) => listBody(body, true))
    .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, body: string) => listBody(body, false))
    .replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, body: string) => tableBody(body))
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, body: string) => `${inlineText(body)}\n`)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|section|article|blockquote|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<(?:div|section|article|blockquote|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, " | ")
    .replace(/<t[dh]\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "");

  text = decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

export function structuredListItems(value: string): readonly string[] {
  const text = normalizeStructuredText(value);
  return Object.freeze([...text.matchAll(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+([^\n]+)/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean));
}

export function structuredTableCount(value: string): number {
  const htmlTables = [...value.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].length;
  if (htmlTables) return htmlTables;
  const lines = normalizeStructuredText(value).split("\n").filter((line) => /^\s*\|.+\|\s*$/.test(line));
  return lines.length >= 2 ? 1 : 0;
}

export function structuredProseText(value: string): string {
  return normalizeStructuredText(value)
    .split("\n")
    .filter((line) => !/^\s*(?:[-*•]|\d+[.)])\s+\S/.test(line) && !/^\s*\|.+\|\s*$/.test(line))
    .join("\n")
    .trim();
}

function listBody(body: string, ordered: boolean): string {
  const items = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => inlineText(match[1]))
    .filter(Boolean);
  if (!items.length) return `${inlineText(body)}\n`;
  return `${items.map((item, index) => ordered ? `${index + 1}. ${item}` : `- ${item}`).join("\n")}\n`;
}

function tableBody(body: string): string {
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => {
    const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => inlineText(cell[1]))
      .filter(Boolean);
    return cells.length ? `| ${cells.join(" | ")} |` : "";
  }).filter(Boolean);
  return rows.length ? `${rows.join("\n")}\n` : `${inlineText(body)}\n`;
}

function inlineText(value: string): string {
  return decodeEntities(value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => safeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => safeCodePoint(Number.parseInt(code, 16)));
}

function safeCodePoint(value: number): string {
  try { return Number.isFinite(value) ? String.fromCodePoint(value) : ""; } catch { return ""; }
}
