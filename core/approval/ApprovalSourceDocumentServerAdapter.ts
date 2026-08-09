import "server-only";

import { inflateSync } from "node:zlib";

import {
  decodePdfBytesAsLatin1,
  extractPdfTextFragments,
  normalizeApprovalSourceDocument,
  type ApprovalSourceDocumentExtraction,
  type ApprovalSourceDocumentInput,
} from "./ApprovalSourceDocumentAdapter";

/**
 * Server-only document normalization. Node compression support is deliberately
 * kept outside the browser-safe approval barrel and is consumed by server
 * evidence acquisition paths only.
 */
export function normalizeApprovalSourceDocumentServer(
  input: ApprovalSourceDocumentInput,
): ApprovalSourceDocumentExtraction {
  return normalizeApprovalSourceDocument({
    ...input,
    pdfTextExtractor: extractFlatePdfText,
  });
}

function extractFlatePdfText(bytes: Uint8Array): string {
  const raw = decodePdfBytesAsLatin1(bytes);
  const fragments: string[] = [];
  for (const match of raw.matchAll(/stream(?:\r\n|\n|\r)([\s\S]*?)(?:\r\n|\n|\r)endstream/gu)) {
    const streamStart = match.index ?? 0;
    const dictionaryStart = raw.lastIndexOf("<<", streamStart);
    const dictionary = dictionaryStart >= 0 ? raw.slice(dictionaryStart, streamStart) : "";
    if (!/\/Filter\s*(?:\[[^\]]*\]\s*)?\/FlateDecode\b/u.test(dictionary)) continue;
    try {
      const inflated = inflateSync(latin1Bytes(match[1] ?? ""));
      const text = extractPdfTextFragments(decodePdfBytesAsLatin1(inflated));
      if (text) fragments.push(text);
    } catch {
      // Unsupported compression remains fail-closed in the shared adapter.
    }
  }
  return fragments.join(" ");
}

function latin1Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}
