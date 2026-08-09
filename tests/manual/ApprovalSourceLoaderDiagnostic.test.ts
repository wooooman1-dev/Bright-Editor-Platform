import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

import { fetchPreflightPage } from "../../core/ai/ApprovalSourcePreflight";

const enabled = process.env.RUN_SOURCE_LOADER_DIAGNOSTIC === "1";
const persistedContentId = "content-mskhbt4q-g4ossz";

function findValue(value: unknown, predicate: (candidate: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValue(item, predicate);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (predicate(record)) return record;
  for (const child of Object.values(record)) {
    const found = findValue(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function readPersistedSourceUrl(): string {
  const persisted = JSON.parse(readFileSync(resolve(process.cwd(), ".bright-studio", "studio-data.json"), "utf8")) as unknown;
  const content = findValue(persisted, (candidate) => candidate.id === persistedContentId);
  const sample = findValue(content, (candidate) => candidate.rejectionCode === "source_fetch_failed" && typeof candidate.url === "string");
  if (!sample || typeof sample.url !== "string" || !sample.url.trim()) {
    throw new Error("Persisted source_fetch_failed sample was not found for the target Content.");
  }
  return sample.url;
}

describe.skipIf(!enabled)("persisted official source loader diagnostic", () => {
  it("runs the production preflight page loader once without AI or source search", async () => {
    const persistedCanonicalUrl = readPersistedSourceUrl();
    const page = await fetchPreflightPage(persistedCanonicalUrl, fetch);
    const diagnostic = {
      requestedUrl: page.requestedUrl,
      finalUrl: page.finalUrl,
      redirected: page.finalUrl !== page.requestedUrl,
      httpStatus: page.status,
      contentType: page.contentType,
      bodyPresent: (page.contentLength ?? 0) > 0,
      contentLength: page.contentLength ?? 0,
      responseBodyLength: page.contentLength ?? 0,
      detectedDocumentFormat: page.documentFormat,
      selectedAdapter: page.documentFormat === "html"
        ? "extractHtml"
        : page.documentFormat === "plain_text"
          ? "extractPlainText"
          : page.documentFormat === "json"
            ? "extractJson"
            : page.documentFormat === "xml"
              ? "extractXml"
              : page.documentFormat === "csv"
                ? "extractCsv"
                : page.documentFormat === "pdf"
                  ? "extractPdf"
                  : "unsupported",
      extractionStatus: page.extractionStatus,
      extractionReason: page.extractionReason,
      extractedTextLength: page.text.length,
      normalizedTextLength: page.text.trim().length,
      failureBoundary: page.fetchError
        ? "fetchPreflightPage:fetch"
        : page.extractionStatus === "extracted"
          ? "none"
          : "normalizeApprovalSourceDocument:extraction",
    };
    writeFileSync(
      resolve(process.cwd(), "evidence-loader-diagnostic.json"),
      `${JSON.stringify(diagnostic, null, 2)}\n`,
      "utf8",
    );
  }, 30_000);
});
