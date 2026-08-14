const htmlPattern = /<\/?[a-z][^>]*>/i;
const entityPattern = /&(?:nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i;
const htmlTablePattern = /<table\b[^>]*>[\s\S]*?<\/table>/gi;

export type StructuredTableData = Readonly<{
  caption?: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}>;

export type StructuredTextSegment =
  | Readonly<{ text: string; type: "text" }>
  | Readonly<{ table: StructuredTableData; type: "table" }>;

export type StructuredListData = Readonly<{
  prefix?: string;
  style: "ordered" | "unordered";
  items: readonly string[];
}>;

/**
 * Recognizes only an explicit, line-delimited list. A single plain-text prefix
 * may precede the list and is returned separately; prose with embedded list
 * markers is never guessed into a list.
 */
export function parseStructuredList(value: string): StructuredListData | undefined {
  const lines = normalizePlainText(value).split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return undefined;
  const firstListIndex = lines.findIndex((line) => listLine(line) !== undefined);
  if (firstListIndex < 0 || firstListIndex > 1) return undefined;
  const prefix = firstListIndex === 1 ? lines[0] : undefined;
  const parsed = lines.slice(firstListIndex).map(listLine);
  if (parsed.some((item) => item === undefined) || parsed.length < 2) return undefined;
  const items = parsed as Array<Readonly<{ marker: string; text: string }>>;
  const ordered = /^\d+[.)]$/u.test(items[0]!.marker);
  if (items.some((item) => /^\d+[.)]$/u.test(item.marker) !== ordered)) return undefined;
  if (ordered && items.some((item, index) => Number.parseInt(item.marker, 10) !== index + 1)) return undefined;
  return Object.freeze({
    ...(prefix ? { prefix } : {}),
    style: ordered ? "ordered" as const : "unordered" as const,
    items: Object.freeze(items.map((item) => item.text)),
  });
}

export function serializeStructuredList(input: Readonly<{
  style: "ordered" | "unordered";
  items: readonly string[];
}>): string {
  return input.items.map((item, index) => input.style === "ordered"
    ? `${index + 1}. ${item}`
    : `- ${item}`).join("\n");
}

export function parseStructuredText(value: string): readonly StructuredTextSegment[] {
  const source = value.normalize("NFKC");
  const segments: StructuredTextSegment[] = [];
  let cursor = 0;

  for (const match of source.matchAll(htmlTablePattern)) {
    const index = match.index ?? 0;
    appendMarkdownSegments(source.slice(cursor, index), segments);
    const table = parseHtmlTable(match[0]);
    if (table) segments.push(Object.freeze({ table, type: "table" }));
    else appendText(normalizePlainText(match[0]), segments);
    cursor = index + match[0].length;
  }
  appendMarkdownSegments(source.slice(cursor), segments);
  return Object.freeze(segments);
}

export function normalizeStructuredTable(input: Readonly<{
  caption?: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}>): StructuredTableData | undefined {
  const headers = input.headers.map(normalizeCell);
  const sourceRows = input.rows
    .map((row) => row.map(normalizeCell))
    .filter((row) => row.some(Boolean));
  const columnCount = Math.max(headers.length, ...sourceRows.map((row) => row.length), 0);
  if (!columnCount || !headers.some(Boolean) || !sourceRows.length) return undefined;
  const normalizedHeaders = normalizeColumns(headers, columnCount);
  const rows = sourceRows.map((row) => Object.freeze(normalizeColumns(row, columnCount)));
  /**
   * 표에는 언제나 설명이 붙는다.
   *
   * 생성은 표를 문단 안의 마크다운으로 돌려주고, 마크다운 표에는 캡션을 실을
   * 자리가 없다 — 파서가 헤더와 구분선만 읽는다. 그래서 캡션을 모델에게 요구할
   * 방법이 없고, 없으면 없는 채로 발행된다.
   *
   * 그러면 표가 무엇을 비교하는지를 스크린 리더는 표 안에 들어가서야 알게 되고,
   * 검색엔진은 주변 문단으로 추측해야 한다. 열 이름은 이미 그 답을 담고 있으므로,
   * 캡션이 없을 때는 열에서 만들어 붙인다. 지어내는 것이 아니라 표가 이미 말하고
   * 있는 것을 앞으로 옮기는 것이다.
   */
  const caption = normalizeCell(input.caption ?? "") || describeTableColumns(normalizedHeaders);
  return Object.freeze({
    ...(caption ? { caption } : {}),
    headers: Object.freeze(normalizedHeaders),
    rows: Object.freeze(rows),
  });
}

export function serializeStructuredTable(table: StructuredTableData): string {
  const header = `| ${table.headers.map(escapeMarkdownCell).join(" | ")} |`;
  const separator = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`);
  return [table.caption ?? "", header, separator, ...rows].filter(Boolean).join("\n");
}

export function normalizeStructuredText(value: string): string {
  return parseStructuredText(value).map((segment) => segment.type === "table"
    ? serializeStructuredTable(segment.table)
    : segment.text).filter(Boolean).join("\n").trim();
}

export function structuredListItems(value: string): readonly string[] {
  const text = normalizeStructuredText(value);
  return Object.freeze([...text.matchAll(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+([^\n]+)/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean));
}

export function structuredTableCount(value: string): number {
  return parseStructuredText(value).filter((segment) => segment.type === "table").length;
}

/**
 * Data rows of each table, in document order. A caller weighing how much a
 * table actually carries needs the row counts; the header row is excluded
 * because it labels the data rather than adding any.
 */
export function structuredTableRowCounts(value: string): readonly number[] {
  return Object.freeze(parseStructuredText(value)
    .flatMap((segment) => segment.type === "table" ? [segment.table.rows.length] : []));
}

export function structuredProseText(value: string): string {
  return parseStructuredText(value)
    .flatMap((segment) => segment.type === "text" ? [segment.text] : [])
    .join("\n")
    .split("\n")
    .filter((line) => !/^\s*(?:[-*•]|\d+[.)])\s+\S/.test(line))
    .join("\n")
    .trim();
}

function appendMarkdownSegments(value: string, segments: StructuredTextSegment[]): void {
  const text = normalizePlainText(value);
  if (!text) return;
  const lines = text.split("\n");
  const buffer: string[] = [];
  const flush = () => {
    appendText(buffer.join("\n").replace(/\n{3,}/g, "\n\n").trim(), segments);
    buffer.length = 0;
  };

  for (let index = 0; index < lines.length;) {
    const headers = parseMarkdownRow(lines[index]);
    const separator = parseMarkdownRow(lines[index + 1] ?? "");
    const isTable = headers.length > 0
      && separator.length > 0
      && separator.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
    if (!isTable) {
      buffer.push(lines[index]);
      index += 1;
      continue;
    }

    const rows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length) {
      const row = parseMarkdownRow(lines[cursor]);
      if (!row.length || row.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")))) break;
      rows.push(row);
      cursor += 1;
    }
    const table = normalizeStructuredTable({ headers, rows });
    if (!table) {
      buffer.push(lines[index]);
      index += 1;
      continue;
    }
    flush();
    segments.push(Object.freeze({ table, type: "table" }));
    index = cursor;
  }
  flush();
}

function appendText(text: string, segments: StructuredTextSegment[]): void {
  if (text.trim()) segments.push(Object.freeze({ text: text.trim(), type: "text" }));
}

function parseHtmlTable(value: string): StructuredTableData | undefined {
  const caption = inlineText(value.match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1] ?? "");
  const rows = [...value.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => {
    const cells = [...row[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map((cell) => ({ header: cell[1].toLowerCase() === "th", text: inlineText(cell[2]) }));
    return cells;
  }).filter((row) => row.length);
  if (!rows.length) return undefined;
  const headerIndex = Math.max(0, rows.findIndex((row) => row.some((cell) => cell.header)));
  const headers = rows[headerIndex].map((cell) => cell.text);
  const bodyRows = rows.filter((_, index) => index !== headerIndex).map((row) => row.map((cell) => cell.text));
  return normalizeStructuredTable({ caption, headers, rows: bodyRows });
}

function parseMarkdownRow(value: string): string[] {
  let source = value.trim();
  if (!source.includes("|")) return [];
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|") && !source.endsWith("\\|")) source = source.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(normalizeCell(current));
      current = "";
    } else {
      current += character;
    }
  }
  if (escaped) current += "\\";
  cells.push(normalizeCell(current));
  return cells;
}

function listLine(value: string): Readonly<{ marker: string; text: string }> | undefined {
  const match = /^\s*((?:[-*•])|(?:\d+[.)]))\s+(.+?)\s*$/u.exec(value);
  return match?.[2]?.trim() ? Object.freeze({ marker: match[1]!, text: match[2].trim() }) : undefined;
}

/**
 * 캡션은 표를 대신 읽어주는 한 줄이라 한 줄로 읽혀야 한다. 열 이름을 모두 늘어놓으면
 * 그 한 줄이 표보다 길어지는 지점이 있어, 그 앞에서 개수로 줄인다.
 */
const captionLengthLimit = 40;

/**
 * 첫 열은 행 이름표라 비교 대상이 아니다. 나머지 열이 비교하는 것들이다.
 */
function describeTableColumns(headers: readonly string[]): string {
  const compared = headers.slice(1).map(normalizeCell).filter(Boolean);
  if (!compared.length) return normalizeCell(headers[0] ?? "");
  const listed = `${compared.join("·")} 비교`;
  return listed.length <= captionLengthLimit ? listed : `${compared[0]} 외 ${compared.length - 1}개 항목 비교`;
}

function normalizeColumns(cells: readonly string[], columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, index) => cells[index] ?? "");
}

function normalizePlainText(value: string): string {
  const normalized = value.normalize("NFKC");
  if (!htmlPattern.test(normalized) && !entityPattern.test(normalized)) return normalized.trim();
  const text = normalized
    .replace(/<ol\b[^>]*>([\s\S]*?)<\/ol>/gi, (_, body: string) => listBody(body, true))
    .replace(/<ul\b[^>]*>([\s\S]*?)<\/ul>/gi, (_, body: string) => listBody(body, false))
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_, body: string) => `${inlineText(body)}\n`)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|section|article|blockquote|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<(?:div|section|article|blockquote|tr|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function listBody(body: string, ordered: boolean): string {
  const items = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((match) => inlineText(match[1]))
    .filter(Boolean);
  if (!items.length) return `${inlineText(body)}\n`;
  return `${items.map((item, index) => ordered ? `${index + 1}. ${item}` : `- ${item}`).join("\n")}\n`;
}

function inlineText(value: string): string {
  return decodeEntities(value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCell(value: string): string {
  return decodeEntities(value.normalize("NFKC"))
    .replace(/\s+/g, " ")
    .trim();
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
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
