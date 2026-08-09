import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  runApprovalSourcePreflight,
  type ApprovalSourcePreflightResult,
} from "../../core/ai/ApprovalSourcePreflight";
import { normalizeApprovalSourceDocumentServer } from "../../core/approval/ApprovalSourceDocumentServerAdapter";
import { resolveApprovalPolicySnapshot } from "../../core/approval/ApprovalPolicy";

type HistoricalSource = {
  sourceIndex: number;
  url: string;
  title?: string;
  evidenceExcerpt: string;
};

type HistoricalDiagnostic = {
  responseId: string;
  sources: HistoricalSource[];
  webSourceUrls: string[];
};

const responseDiagnosticPath = resolve(process.cwd(), "historical-preflight-response-diagnostic.json");
const outputPath = resolve(process.cwd(), "historical-anchor-production-replay.json");
const contentId = "content-mskiuomo-byigyw";

function findRecord(value: unknown, predicate: (candidate: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecord(item, predicate);
      if (found) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (predicate(record)) return record;
  for (const child of Object.values(record)) {
    const found = findRecord(child, predicate);
    if (found) return found;
  }
  return undefined;
}

function selectedAdapter(format: string | undefined): string {
  return format === "html" ? "extractHtml"
    : format === "plain_text" ? "extractPlainText"
      : format === "json" ? "extractJson"
        : format === "xml" ? "extractXml"
          : format === "csv" ? "extractCsv"
            : format === "pdf" ? "extractPdf"
              : "unsupported";
}

describe("historical production anchor replay", () => {
  it("replays each historical source through the production preflight path", async () => {
    const historical = JSON.parse(readFileSync(responseDiagnosticPath, "utf8")) as HistoricalDiagnostic;
    const studio = JSON.parse(readFileSync(resolve(process.cwd(), ".bright-studio", "studio-data.json"), "utf8")) as unknown;
    const content = findRecord(studio, (candidate) => candidate.id === contentId);
    const opportunity = content?.opportunity as Record<string, unknown> | undefined;
    if (!opportunity) throw new Error("Target Content opportunity was not found.");
    const snapshot = resolveApprovalPolicySnapshot(
      content?.contentPurpose ?? "adsense_approval",
      content?.approvalProfileId ?? "wordpress_life_economy_v1",
    );
    if (!snapshot) throw new Error("Approval policy snapshot was not resolved.");

    const replay: Record<string, unknown>[] = [];
    for (const source of historical.sources) {
      const captured = { requestedUrl: source.url, finalUrl: source.url, status: 0, responseBodyLength: 0, contentType: "", document: undefined as ReturnType<typeof normalizeApprovalSourceDocumentServer> | undefined };
      const provider = {
        async generate() {
          return {
            content: JSON.stringify({ sources: [{ url: source.url, title: source.title ?? "", evidenceExcerpt: source.evidenceExcerpt, claims: [] }] }),
            model: "historical-response-fixture",
            diagnostics: { webSources: historical.webSourceUrls.map((url) => ({ url, provenance: "search_candidate" as const })) },
          };
        },
      };
      const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const response = await fetch(input, init);
        captured.finalUrl = response.url || source.url;
        captured.status = response.status;
        captured.contentType = response.headers.get("content-type") ?? "";
        const clone = response.clone();
        const bytes = new Uint8Array(await clone.arrayBuffer());
        captured.responseBodyLength = bytes.byteLength;
        captured.document = normalizeApprovalSourceDocumentServer({
          requestedUrl: source.url,
          finalUrl: captured.finalUrl,
          status: response.status,
          contentType: captured.contentType,
          bytes,
          tooLarge: false,
        });
        return response;
      };

      let result: ApprovalSourcePreflightResult | undefined;
      let diagnostic: Record<string, unknown> | undefined;
      try {
        result = await runApprovalSourcePreflight({
          provider,
          snapshot,
          opportunity: opportunity as never,
          platform: "wordpress",
          contentType: "article",
          fetcher,
        });
      } catch (error) {
        diagnostic = (error as { diagnostic?: Record<string, unknown> }).diagnostic;
      }

      const metrics = diagnostic ?? {};
      const anchorCount = metrics.evidenceAnchorPassCount;
      const rejectionSamples = Array.isArray(metrics.rejectionSamples) ? metrics.rejectionSamples : [];
      replay.push({
        sourceIndex: source.sourceIndex,
        requestedUrl: source.url,
        finalUrl: captured.finalUrl,
        redirected: captured.finalUrl !== source.url,
        httpStatus: captured.status,
        contentType: captured.contentType,
        responseBodyLength: captured.responseBodyLength,
        documentFormat: captured.document?.format,
        selectedAdapter: selectedAdapter(captured.document?.format),
        extractionStatus: captured.document?.extractionStatus,
        extractionReason: captured.document?.extractionReason,
        extractedTextLength: captured.document?.text.length,
        normalizedTextLength: captured.document?.text.trim().length,
        evidenceExcerpt: source.evidenceExcerpt,
        normalizedEvidenceExcerptLength: source.evidenceExcerpt.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]+/gu, "").trim().length,
        evidenceAnchorPassCount: anchorCount,
        rejectionSamples,
        productionDiagnosticStage: metrics.rejectionStage,
        productionDiagnosticCode: metrics.rejectionCode,
        resultReturned: Boolean(result),
      });
    }

    writeFileSync(outputPath, `${JSON.stringify({ responseId: historical.responseId, sources: replay }, null, 2)}\n`, "utf8");
    expect(replay).toHaveLength(3);
  }, 120_000);
});
