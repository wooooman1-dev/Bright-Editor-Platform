export const approvalSourceDocumentFormats = [
  "html",
  "plain_text",
  "json",
  "xml",
  "csv",
  "pdf",
  "binary",
  "unknown",
] as const;

export type ApprovalSourceDocumentFormat = (typeof approvalSourceDocumentFormats)[number];

export type ApprovalSourceExtractionStatus =
  | "extracted"
  | "empty"
  | "unsupported"
  | "too_large"
  | "malformed"
  | "unavailable";

export type ApprovalSourceDocumentInput = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string;
  bytes: Uint8Array;
  tooLarge?: boolean;
  fetchError?: string;
  pdfTextExtractor?: (bytes: Uint8Array) => string;
}>;

export type ApprovalSourceDocumentExtraction = Readonly<{
  format: ApprovalSourceDocumentFormat;
  extractionStatus: ApprovalSourceExtractionStatus;
  title: string;
  publisher: string;
  text: string;
  contentLength: number;
  extractionReason?: string;
}>;

/**
 * Converts a bounded HTTP response body into deterministic Evidence text.
 *
 * Every byte sequence reaches one terminal extraction status. Unsupported or
 * malformed input is never interpreted as verified Evidence and never throws.
 */
export function normalizeApprovalSourceDocument(
  input: ApprovalSourceDocumentInput,
): ApprovalSourceDocumentExtraction {
  const publisher = sourcePublisher(input.finalUrl || input.requestedUrl);
  if (input.fetchError) {
    return frozenExtraction("unknown", "unavailable", "", publisher, "", input.bytes.byteLength, input.fetchError);
  }
  if (input.tooLarge) {
    return frozenExtraction(
      detectFormat(input.contentType, input.bytes),
      "too_large",
      "",
      publisher,
      "",
      input.bytes.byteLength,
      "출처 응답이 검증 허용 크기를 초과했습니다.",
    );
  }
  if (!input.bytes.byteLength) {
    return frozenExtraction(
      detectFormat(input.contentType, input.bytes),
      "empty",
      "",
      publisher,
      "",
      0,
      "출처 응답 본문이 비어 있습니다.",
    );
  }

  const format = detectFormat(input.contentType, input.bytes);
  try {
    switch (format) {
      case "html":
        return extractHtml(input, publisher);
      case "plain_text":
        return extractPlainText(input, publisher);
      case "json":
        return extractJson(input, publisher);
      case "xml":
        return extractXml(input, publisher);
      case "csv":
        return extractCsv(input, publisher);
      case "pdf":
        return extractPdf(input, publisher);
      case "binary":
        return frozenExtraction(
          format,
          "unsupported",
          "",
          publisher,
          "",
          input.bytes.byteLength,
          "바이너리 형식은 텍스트 Claim 대조에 사용할 수 없습니다.",
        );
      default:
        return frozenExtraction(
          format,
          "unsupported",
          "",
          publisher,
          "",
          input.bytes.byteLength,
          "문서 형식을 식별하거나 안전하게 해석하지 못했습니다.",
        );
    }
  } catch (error) {
    return frozenExtraction(
      format,
      "malformed",
      "",
      publisher,
      "",
      input.bytes.byteLength,
      error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    );
  }
}

function extractHtml(
  input: ApprovalSourceDocumentInput,
  fallbackPublisher: string,
): ApprovalSourceDocumentExtraction {
  const html = decodeUtf8(input.bytes, input.contentType);
  const title = decodeEntities(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/iu));
  const publisher = decodeEntities(
    firstMatch(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["'][^>]*>/iu)
    || firstMatch(html, /<meta[^>]+name=["']application-name["'][^>]+content=["']([^"']+)["'][^>]*>/iu),
  ) || fallbackPublisher;
  const text = htmlToText(html);
  return extractedOrEmpty("html", title, publisher, text, input.bytes.byteLength);
}

function extractPlainText(
  input: ApprovalSourceDocumentInput,
  publisher: string,
): ApprovalSourceDocumentExtraction {
  const text = normalizeWhitespace(decodeUtf8(input.bytes, input.contentType));
  const title = firstMeaningfulLine(text);
  return extractedOrEmpty("plain_text", title, publisher, text, input.bytes.byteLength);
}

function extractJson(
  input: ApprovalSourceDocumentInput,
  publisher: string,
): ApprovalSourceDocumentExtraction {
  const raw = stripBom(decodeUtf8(input.bytes, input.contentType)).trim();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    return frozenExtraction(
      "json",
      "malformed",
      "",
      publisher,
      "",
      input.bytes.byteLength,
      error instanceof Error ? `JSON 해석 실패: ${error.message}` : "JSON 해석 실패",
    );
  }
  const lines: string[] = [];
  flattenJson(value, "", lines, 0);
  const text = normalizeWhitespace(lines.join("\n"));
  const title = jsonTitle(value) || firstMeaningfulLine(text);
  return extractedOrEmpty("json", title, publisher, text, input.bytes.byteLength);
}

function extractXml(
  input: ApprovalSourceDocumentInput,
  publisher: string,
): ApprovalSourceDocumentExtraction {
  const xml = decodeUtf8(input.bytes, input.contentType);
  if (!/^\s*(?:<\?xml\b|<[A-Za-z_][\w:.-]*(?:\s|>|\/))/u.test(xml)) {
    return frozenExtraction(
      "xml",
      "malformed",
      "",
      publisher,
      "",
      input.bytes.byteLength,
      "XML 루트 요소를 확인하지 못했습니다.",
    );
  }
  const title = decodeEntities(
    firstMatch(xml, /<(?:title|dc:title|name)\b[^>]*>([\s\S]*?)<\/(?:title|dc:title|name)>/iu),
  );
  const text = markupToText(xml);
  return extractedOrEmpty("xml", title, publisher, text, input.bytes.byteLength);
}

function extractCsv(
  input: ApprovalSourceDocumentInput,
  publisher: string,
): ApprovalSourceDocumentExtraction {
  const raw = stripBom(decodeUtf8(input.bytes, input.contentType));
  const rows = parseDelimitedText(raw, delimiterFor(input.contentType, raw));
  if (!rows.length) {
    return frozenExtraction(
      "csv",
      "empty",
      "",
      publisher,
      "",
      input.bytes.byteLength,
      "CSV/TSV 레코드가 없습니다.",
    );
  }
  const text = normalizeWhitespace(rows
    .slice(0, maximumDelimitedRows)
    .map((row) => row.slice(0, maximumDelimitedColumns).join(" | "))
    .join("\n"));
  const title = rows[0]?.filter(Boolean).join(" | ").slice(0, 240) ?? "";
  return extractedOrEmpty("csv", title, publisher, text, input.bytes.byteLength);
}

function extractPdf(
  input: ApprovalSourceDocumentInput,
  publisher: string,
): ApprovalSourceDocumentExtraction {
  const raw = decodeLatin1(input.bytes);
  const title = decodePdfLiteral(firstMatch(raw, /\/Title\s*\(((?:\\.|[^\\)])*)\)/u));
  const fragments = [extractPdfTextFragments(raw)];
  const extractedServerText = input.pdfTextExtractor?.(input.bytes) ?? "";
  if (extractedServerText) fragments.push(extractedServerText);
  const text = normalizeWhitespace(fragments.join(" "));
  if (text.length < minimumExtractedTextLength) {
    return frozenExtraction(
      "pdf",
      "unsupported",
      title,
      publisher,
      "",
      input.bytes.byteLength,
      "PDF에 안전하게 추출할 수 있는 텍스트 레이어가 없습니다.",
    );
  }
  return frozenExtraction("pdf", "extracted", title, publisher, text, input.bytes.byteLength);
}

export function extractPdfTextFragments(source: string): string {
  const fragments: string[] = [];
  for (const match of source.matchAll(/BT([\s\S]*?)ET/gu)) {
    const segment = match[1] ?? "";
    for (const literal of segment.matchAll(/\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/gu)) {
      const value = decodePdfLiteral(literal[1] ?? "");
      if (value) fragments.push(value);
    }
    for (const array of segment.matchAll(/\[((?:[^\]]|\](?!\s*TJ))*)\]\s*TJ/gu)) {
      for (const literal of (array[1] ?? "").matchAll(/\(((?:\\.|[^\\)])*)\)/gu)) {
        const value = decodePdfLiteral(literal[1] ?? "");
        if (value) fragments.push(value);
      }
    }
    if (fragments.length >= maximumPdfFragments) break;
  }
  return fragments.slice(0, maximumPdfFragments).join(" ");
}

function detectFormat(contentType: string, bytes: Uint8Array): ApprovalSourceDocumentFormat {
  const declared = contentType.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US") ?? "";
  const prefix = decodeUtf8(bytes.slice(0, Math.min(bytes.byteLength, 4096))).trimStart();
  const latinPrefix = decodeLatin1(bytes.slice(0, Math.min(bytes.byteLength, 16)));

  if (latinPrefix.startsWith("%PDF-")) return "pdf";
  if (/^(?:<!doctype\s+html\b|<html\b)/iu.test(prefix)) return "html";
  if (/^<\?xml\b/iu.test(prefix)) return "xml";
  if (/^[\[{]/u.test(prefix) && (declared.includes("json") || looksLikeJson(prefix))) return "json";

  if (declared === "text/html" || declared === "application/xhtml+xml") return "html";
  if (declared === "application/json" || declared.endsWith("+json")) return "json";
  if (declared === "application/xml" || declared === "text/xml" || declared.endsWith("+xml")) return "xml";
  if (declared === "text/csv" || declared === "text/tab-separated-values" || declared === "application/csv") return "csv";
  if (declared === "application/pdf") return "pdf";
  if (declared.startsWith("text/") || declared === "application/rtf") {
    return looksDelimited(prefix) ? "csv" : "plain_text";
  }
  if (looksLikeHtml(prefix)) return "html";
  if (looksLikeXml(prefix)) return "xml";
  if (looksLikeJson(prefix)) return "json";
  if (looksTextual(bytes)) return looksDelimited(prefix) ? "csv" : "plain_text";
  if (bytes.byteLength) return "binary";
  return "unknown";
}

function extractedOrEmpty(
  format: ApprovalSourceDocumentFormat,
  title: string,
  publisher: string,
  text: string,
  contentLength: number,
): ApprovalSourceDocumentExtraction {
  const normalized = normalizeWhitespace(text);
  return normalized
    ? frozenExtraction(format, "extracted", title, publisher, normalized, contentLength)
    : frozenExtraction(
        format,
        "empty",
        title,
        publisher,
        "",
        contentLength,
        "문서에서 Claim 대조에 사용할 텍스트를 추출하지 못했습니다.",
      );
}

function frozenExtraction(
  format: ApprovalSourceDocumentFormat,
  extractionStatus: ApprovalSourceExtractionStatus,
  title: string,
  publisher: string,
  text: string,
  contentLength: number,
  extractionReason?: string,
): ApprovalSourceDocumentExtraction {
  return Object.freeze({
    format,
    extractionStatus,
    title: normalizeWhitespace(title).slice(0, 500),
    publisher: normalizeWhitespace(publisher).slice(0, 300),
    text: text.slice(0, maximumExtractedTextLength),
    contentLength,
    ...(extractionReason ? { extractionReason } : {}),
  });
}

function flattenJson(value: unknown, path: string, lines: string[], depth: number): void {
  if (lines.length >= maximumJsonValues || depth > maximumJsonDepth) return;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const rendered = value === null ? "null" : String(value);
    lines.push(path ? `${path}: ${rendered}` : rendered);
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < Math.min(value.length, maximumJsonArrayItems); index += 1) {
      flattenJson(value[index], path ? `${path}[${index}]` : `[${index}]`, lines, depth + 1);
      if (lines.length >= maximumJsonValues) break;
    }
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>).slice(0, maximumJsonObjectKeys)) {
    flattenJson(child, path ? `${path}.${key}` : key, lines, depth + 1);
    if (lines.length >= maximumJsonValues) break;
  }
}

function jsonTitle(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["title", "name", "label", "documentTitle"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function parseDelimitedText(text: string, delimiter: string): readonly (readonly string[])[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      row.push(normalizeWhitespace(field));
      field = "";
    } else if (character === "\n") {
      row.push(normalizeWhitespace(field));
      rows.push(row);
      row = [];
      field = "";
      if (rows.length >= maximumDelimitedRows) break;
    } else if (character !== "\r") {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(normalizeWhitespace(field));
    rows.push(row);
  }
  return Object.freeze(rows.filter((candidate) => candidate.some(Boolean)).map((candidate) => Object.freeze(candidate)));
}

function delimiterFor(contentType: string, text: string): string {
  if (/tab-separated-values/iu.test(contentType)) return "\t";
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? "";
  const tabs = (firstLine.match(/\t/gu) ?? []).length;
  const commas = (firstLine.match(/,/gu) ?? []).length;
  return tabs > commas ? "\t" : ",";
}

function looksLikeHtml(value: string): boolean {
  return /<(?:html|head|body|title|meta|article|main|section|p|h1|h2)\b/iu.test(value.slice(0, 4096));
}

function looksLikeXml(value: string): boolean {
  return /^<[A-Za-z_][\w:.-]*(?:\s|>|\/)/u.test(value) && /<\/[A-Za-z_][\w:.-]*>/u.test(value.slice(0, 4096));
}

function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[\[{]/u.test(trimmed)) return false;
  try {
    JSON.parse(trimmed.slice(0, maximumJsonProbeLength));
    return true;
  } catch {
    return /^(?:\{\s*["']|\[\s*(?:\{|\[|["'\d-]))/u.test(trimmed);
  }
}

function looksDelimited(value: string): boolean {
  const lines = value.split(/\r?\n/u).filter(Boolean).slice(0, 4);
  if (lines.length < 2) return false;
  const commaCounts = lines.map((line) => (line.match(/,/gu) ?? []).length);
  const tabCounts = lines.map((line) => (line.match(/\t/gu) ?? []).length);
  return consistentPositiveCounts(commaCounts) || consistentPositiveCounts(tabCounts);
}

function consistentPositiveCounts(values: readonly number[]): boolean {
  return values.length >= 2 && values[0]! > 0 && values.every((value) => value === values[0]);
}

function looksTextual(bytes: Uint8Array): boolean {
  if (!bytes.byteLength) return false;
  const sample = bytes.slice(0, Math.min(bytes.byteLength, 8192));
  let printable = 0;
  let zeroes = 0;
  for (const value of sample) {
    if (value === 0) zeroes += 1;
    if (value === 9 || value === 10 || value === 13 || (value >= 32 && value !== 127)) printable += 1;
  }
  return zeroes === 0 && printable / sample.byteLength >= 0.85;
}

function htmlToText(html: string): string {
  return markupToText(html
    .replace(/<head\b[\s\S]*?<\/head>/giu, " ")
    .replace(/<script\b[\s\S]*?<\/script>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style>/giu, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/giu, " ")
    .replace(/<!--([\s\S]*?)-->/gu, " "));
}

function markupToText(markup: string): string {
  return normalizeWhitespace(decodeEntities(markup.replace(/<[^>]+>/gu, " ")));
}

function decodePdfLiteral(value: string): string {
  return normalizeWhitespace(value
    .replace(/\\([nrtbf()\\])/gu, (_match, escaped: string) => pdfEscapes[escaped] ?? escaped)
    .replace(/\\([0-7]{1,3})/gu, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\\\r?\n/gu, ""));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (_match, decimal: string) => safeCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, hexadecimal: string) => safeCodePoint(Number.parseInt(hexadecimal, 16)));
}

function safeCodePoint(value: number): string {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : "";
}

function firstMatch(value: string, pattern: RegExp): string {
  return pattern.exec(value)?.[1]?.replace(/\s+/gu, " ").trim() ?? "";
}

function firstMeaningfulLine(value: string): string {
  return value.split(/\r?\n/gu).map((line) => line.trim()).find(Boolean)?.slice(0, 240) ?? "";
}

function sourcePublisher(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

/**
 * Decodes a fetched page with the encoding it declares, the way a browser does.
 *
 * 선언은 두 군데에 올 수 있다. HTTP 헤더의 charset 파라미터와 HTML 안의 meta
 * 선언이다. 헤더만 읽으면 헤더에 charset 을 싣지 않고 meta 로만 알리는 사이트가
 * 그대로 깨진다. 한국 정부·공공 사이트에 그 방식이 흔하고, 2026-08-19 gov.kr
 * 제목이 대체 문자로 저장돼 출처 목록에 그대로 표시됐다.
 *
 * meta 는 문서 앞부분에 오므로 앞 4KB 만 훑는다. 그 구간은 ASCII 마커를 찾는
 * 용도이니 어떤 인코딩으로 읽어도 라벨을 찾을 수 있다. 아무 선언도 없거나 라벨을
 * 알아보지 못하면 지금까지처럼 UTF-8 로 읽는다.
 */
function decodeUtf8(bytes: Uint8Array, contentType = ""): string {
  const declared = charsetOf(contentType) || metaCharsetOf(bytes);
  if (declared && declared !== "utf-8" && declared !== "utf8") {
    try {
      return stripBom(new TextDecoder(declared, { fatal: false }).decode(bytes));
    } catch {
      // Unrecognized charset label falls back to UTF-8 below.
    }
  }
  return stripBom(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
}

function charsetOf(contentType: string): string {
  return /;\s*charset\s*=\s*"?([^;"]+)"?/iu.exec(contentType)?.[1]?.trim().toLocaleLowerCase("en-US") ?? "";
}

function metaCharsetOf(bytes: Uint8Array): string {
  const prefix = new TextDecoder("latin1", { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.byteLength, 4096)));
  const direct = /<meta[^>]+charset\s*=\s*["']?([a-z0-9_-]+)/iu.exec(prefix)?.[1];
  if (direct) return direct.trim().toLocaleLowerCase("en-US");
  const httpEquiv = /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-z0-9_-]+)/iu.exec(prefix)?.[1];
  return httpEquiv?.trim().toLocaleLowerCase("en-US") ?? "";
}

export function decodePdfBytesAsLatin1(bytes: Uint8Array): string {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    value += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 8192, bytes.length)));
  }
  return value;
}

const decodeLatin1 = decodePdfBytesAsLatin1;

function stripBom(value: string): string {
  return value.replace(/^\uFEFF/u, "");
}

function normalizeWhitespace(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ").replace(/\s+/gu, " ").trim();
}

const pdfEscapes: Readonly<Record<string, string>> = Object.freeze({
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  "(": "(",
  ")": ")",
  "\\": "\\",
});

const maximumExtractedTextLength = 1_500_000;
const minimumExtractedTextLength = 20;
const maximumJsonDepth = 12;
const maximumJsonValues = 5_000;
const maximumJsonArrayItems = 500;
const maximumJsonObjectKeys = 500;
const maximumJsonProbeLength = 64_000;
const maximumDelimitedRows = 5_000;
const maximumDelimitedColumns = 200;
const maximumPdfFragments = 5_000;
