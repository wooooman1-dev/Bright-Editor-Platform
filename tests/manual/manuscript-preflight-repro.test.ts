import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

import { OpenAIProvider } from "../../app/application/OpenAIProvider";
import { runApprovalSourcePreflight } from "../../core/ai/ApprovalSourcePreflight";
import { resolveApprovalPolicySnapshot } from "../../core/approval/ApprovalPolicy";
import type { AIRequest, AIResponse } from "../../core/ai/AIProvider";

const enabled = process.env.RUN_MANUSCRIPT_PREFLIGHT_REPRO === "1";
const contentId = process.env.REPRO_CONTENT_ID ?? "content-mslwq0nk-kogpam";
const outputPath = resolve(process.cwd(), "manuscript-preflight-repro.json");

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

describe.skipIf(!enabled)("manuscript preflight production reproduction", () => {
  it("captures the first failure boundary with the real provider", async () => {
    const studio = JSON.parse(readFileSync(resolve(process.cwd(), ".bright-studio", "studio-data.json"), "utf8")) as unknown;
    const content = findRecord(studio, (candidate) => candidate.id === contentId);
    const opportunity = content?.opportunity as Record<string, unknown> | undefined;
    if (!opportunity) throw new Error(`Content opportunity was not found for ${contentId}.`);
    const snapshot = resolveApprovalPolicySnapshot(
      (content?.contentPurpose as string) ?? "adsense_approval",
      (content?.approvalProfileId as string) ?? "wordpress_life_economy_v1",
    );
    if (!snapshot) throw new Error("Approval policy snapshot was not resolved.");

    const inner = new OpenAIProvider();
    const captured: Record<string, unknown> = {};
    const provider = {
      async generate(request: AIRequest): Promise<AIResponse> {
        const response = await inner.generate(request);
        captured.instruction = request.instruction;
        captured.metadata = request.metadata;
        captured.responseContent = response.content;
        captured.responseDiagnostics = response.diagnostics;
        return response;
      },
    };

    const fetchLog: Record<string, unknown>[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      try {
        const response = await fetch(input, init);
        fetchLog.push({ url, status: response.status, finalUrl: response.url, contentType: response.headers.get("content-type") });
        return response;
      } catch (error) {
        fetchLog.push({ url, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
        throw error;
      }
    };

    let result: unknown;
    let failure: Record<string, unknown> | undefined;
    try {
      result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: opportunity as never,
        platform: (content?.platform as string) ?? "wordpress",
        contentType: (content?.contentType as string) ?? "article",
        fetcher,
      });
    } catch (error) {
      failure = {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : String(error),
        diagnostic: (error as { diagnostic?: unknown }).diagnostic,
        providerDiagnostics: (error as { providerDiagnostics?: unknown }).providerDiagnostics,
      };
    }

    writeFileSync(outputPath, `${JSON.stringify({
      contentId,
      selectedTopic: opportunity.selectedTopic,
      verificationPlan: opportunity.verificationPlan,
      requiredEvidenceContract: opportunity.requiredEvidenceContract,
      captured,
      fetchLog,
      failure,
      ...(result ? { resultSummary: { sourceCount: (result as { sources: unknown[] }).sources.length } } : {}),
    }, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ FIRST_FAILURE: failure?.message, CODE: (failure?.diagnostic as { rejectionCode?: string } | undefined)?.rejectionCode }));
  }, 600_000);
});
