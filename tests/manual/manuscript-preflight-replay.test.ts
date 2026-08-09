import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

import { runApprovalSourcePreflight } from "../../core/ai/ApprovalSourcePreflight";
import { resolveApprovalPolicySnapshot } from "../../core/approval/ApprovalPolicy";

const enabled = process.env.RUN_MANUSCRIPT_PREFLIGHT_REPLAY === "1";
const reproPath = resolve(process.cwd(), "manuscript-preflight-repro.json");
const outputPath = resolve(process.cwd(), "manuscript-preflight-replay.json");

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

describe.skipIf(!enabled)("manuscript preflight deterministic replay", () => {
  it("replays the captured provider response through the production preflight", async () => {
    const repro = JSON.parse(readFileSync(reproPath, "utf8")) as {
      contentId: string;
      captured: { responseContent: string; responseDiagnostics: Record<string, unknown> };
    };
    const studio = JSON.parse(readFileSync(resolve(process.cwd(), ".bright-studio", "studio-data.json"), "utf8")) as unknown;
    const content = findRecord(studio, (candidate) => candidate.id === repro.contentId);
    const opportunity = content?.opportunity as Record<string, unknown> | undefined;
    if (!opportunity) throw new Error("Content opportunity was not found.");
    const snapshot = resolveApprovalPolicySnapshot(
      (content?.contentPurpose as string) ?? "adsense_approval",
      (content?.approvalProfileId as string) ?? "wordpress_life_economy_v1",
    );
    if (!snapshot) throw new Error("Approval policy snapshot was not resolved.");

    const provider = {
      async generate() {
        return {
          content: repro.captured.responseContent,
          model: "captured-production-response",
          diagnostics: repro.captured.responseDiagnostics as never,
        };
      },
    };

    let result: Awaited<ReturnType<typeof runApprovalSourcePreflight>> | undefined;
    let failure: Record<string, unknown> | undefined;
    try {
      result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: opportunity as never,
        platform: "wordpress",
        contentType: "article",
      });
    } catch (error) {
      failure = {
        message: error instanceof Error ? error.message : String(error),
        diagnostic: (error as { diagnostic?: Record<string, unknown> }).diagnostic,
      };
    }

    const diagnostic = failure?.diagnostic as Record<string, unknown> | undefined;
    const summary = {
      outcome: result ? "passed" : "failed",
      message: failure?.message,
      rejectionCode: diagnostic?.rejectionCode,
      rejectionStage: diagnostic?.rejectionStage,
      coveredClaimIds: diagnostic?.coveredClaimIds ?? result?.coverage.coveredClaimIds,
      missingClaimIds: diagnostic?.missingClaimIds ?? result?.coverage.uncoveredClaimIds,
      evidenceAnchorPassCount: diagnostic?.evidenceAnchorPassCount,
      semanticVerificationPassCount: diagnostic?.semanticVerificationPassCount,
      rejectionSamples: diagnostic?.rejectionSamples,
      ...(result ? {
        claimResults: result.verificationSnapshot?.results.map((item) => ({
          claimId: item.claimId,
          status: item.status,
          diagnostics: item.diagnostics,
        })),
      } : {}),
    };
    writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(summary, null, 2));
  }, 180_000);
});
