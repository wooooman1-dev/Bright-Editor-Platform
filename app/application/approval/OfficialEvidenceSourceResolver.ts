import type { ApprovalSourcePage } from "../../../core/approval";

export type OfficialEvidenceSourceFallback = Readonly<{
  requestUrl: string;
  accept: string;
  normalize: (response: Response, requestedUrl: string) => Promise<ApprovalSourcePage | undefined>;
}>;

/**
 * Resolves official machine-readable endpoints for institutions whose public
 * HTML pages reject server-side verification requests.
 *
 * A fallback is allowed only when the institution itself publishes the
 * endpoint. Third-party reader proxies and cached copies are intentionally not
 * accepted as approval Evidence.
 */
export function resolveOfficialEvidenceSourceFallback(
  requestedUrl: string,
): OfficialEvidenceSourceFallback | undefined {
  let url: URL;
  try {
    url = new URL(requestedUrl);
  } catch {
    return undefined;
  }

  const host = url.hostname.toLocaleLowerCase("en-US");
  if (host !== "nga.gov" && host !== "www.nga.gov") return undefined;

  const artworkMatch = /^\/artworks\/(\d+)(?:-|\/|$)/i.exec(url.pathname);
  const artworkId = Number(artworkMatch?.[1]);
  if (!Number.isSafeInteger(artworkId) || artworkId < 0) return undefined;

  return Object.freeze({
    requestUrl: ngaObjectsDatasetUrl,
    accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
    normalize: (response, originalUrl) => normalizeNgaOpenDataRecord(
      response,
      originalUrl,
      artworkId,
    ),
  });
}

async function normalizeNgaOpenDataRecord(
  response: Response,
  requestedUrl: string,
  artworkId: number,
): Promise<ApprovalSourcePage | undefined> {
  if (!response.ok) return undefined;

  const record = await findNgaObjectRecord(response, artworkId);
  if (!record) return undefined;

  const title = record.title?.trim() || "National Gallery of Art collection record";
  const date = record.displaydate?.trim() || yearRange(record.beginyear, record.endyear);
  const datasetUrl = response.url || ngaObjectsDatasetUrl;
  const text = [
    `Object ID: ${record.objectid ?? artworkId}`,
    `Title: ${title}`,
    `Date: ${date}`,
    `Begin Year: ${record.beginyear ?? ""}`,
    `End Year: ${record.endyear ?? ""}`,
    `Medium: ${record.medium ?? ""}`,
    `Dimensions: ${record.dimensions ?? ""}`,
    `Artist: ${record.attribution ?? ""}`,
    `Accession Number: ${record.accessionnum ?? ""}`,
    `Credit Line: ${record.creditline ?? ""}`,
    `Classification: ${record.classification ?? ""}`,
    "Institution: National Gallery of Art",
    `Official Open Data: ${datasetUrl}`,
  ].filter((value) => !value.endsWith(": ")).join(" ").replace(/\s+/g, " ").trim();

  if (text.length < 80) return undefined;

  return Object.freeze({
    requestedUrl,
    // The fetched record comes from the NGA-owned Open Data repository and
    // describes the canonical artwork URL supplied by the manuscript.
    finalUrl: requestedUrl,
    status: response.status,
    contentType: "text/html; normalized-from=text/csv",
    title,
    publisher: "National Gallery of Art Open Data",
    text,
  });
}

async function findNgaObjectRecord(
  response: Response,
  artworkId: number,
): Promise<Readonly<Record<string, string>> | undefined> {
  const scanner = new CsvObjectRecordScanner(artworkId);
  const reader = response.body?.getReader();

  if (!reader) {
    const text = (await response.text()).slice(0, ngaCsvReadLimitBytes);
    scanner.push(text);
    scanner.finish();
    return scanner.result;
  }

  const decoder = new TextDecoder("utf-8");
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > ngaCsvReadLimitBytes) return undefined;

      scanner.push(decoder.decode(value, { stream: true }));
      if (scanner.result || scanner.stopped) {
        await reader.cancel();
        return scanner.result;
      }
    }

    scanner.push(decoder.decode());
    scanner.finish();
    return scanner.result;
  } finally {
    if (!scanner.result && !scanner.stopped) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed.
      }
    }
  }
}

class CsvObjectRecordScanner {
  result: Readonly<Record<string, string>> | undefined;
  stopped = false;

  private header: string[] | undefined;
  private fields: string[] = [];
  private field = "";
  private inQuotes = false;
  private pendingQuote = false;

  constructor(private readonly targetObjectId: number) {}

  push(chunk: string): void {
    for (const character of chunk) {
      if (this.result || this.stopped) return;
      this.consume(character);
    }
  }

  finish(): void {
    if (this.result || this.stopped) return;
    if (this.pendingQuote) {
      this.pendingQuote = false;
      this.inQuotes = false;
    }
    if (this.field.length || this.fields.length) this.completeRecord();
  }

  private consume(character: string): void {
    if (this.inQuotes) {
      if (this.pendingQuote) {
        if (character === '"') {
          this.field += '"';
          this.pendingQuote = false;
          return;
        }
        this.pendingQuote = false;
        this.inQuotes = false;
        this.consumeOutsideQuotes(character);
        return;
      }
      if (character === '"') {
        this.pendingQuote = true;
        return;
      }
      this.field += character;
      return;
    }

    this.consumeOutsideQuotes(character);
  }

  private consumeOutsideQuotes(character: string): void {
    if (character === '"' && this.field.length === 0) {
      this.inQuotes = true;
      return;
    }
    if (character === ",") {
      this.fields.push(this.field);
      this.field = "";
      return;
    }
    if (character === "\n") {
      this.completeRecord();
      return;
    }
    if (character !== "\r") this.field += character;
  }

  private completeRecord(): void {
    const record = [...this.fields, this.field];
    this.fields = [];
    this.field = "";

    if (record.length === 1 && !record[0]?.trim()) return;
    if (!this.header) {
      this.header = record.map((value, index) => index === 0
        ? value.replace(/^\uFEFF/, "").trim()
        : value.trim());
      return;
    }

    const objectId = Number(record[0]);
    if (!Number.isFinite(objectId)) return;
    if (objectId > this.targetObjectId) {
      this.stopped = true;
      return;
    }
    if (objectId !== this.targetObjectId) return;

    this.result = Object.freeze(Object.fromEntries(
      this.header.map((name, index) => [name, record[index] ?? ""]),
    ));
  }
}

function yearRange(beginYear: string | undefined, endYear: string | undefined): string {
  const begin = beginYear?.trim() ?? "";
  const end = endYear?.trim() ?? "";
  if (begin && end && begin !== end) return `${begin}/${end}`;
  return begin || end;
}

const ngaObjectsDatasetUrl = "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/objects.csv";
const ngaCsvReadLimitBytes = 8_000_000;
