import { describe, expect, it } from "vitest";
import { runApprovalSourcePreflight, type ApprovalSourcePreflightResult } from "../../../../core/ai/ApprovalSourcePreflight";
import { assessmentsFromExplicitDiscovery } from "../../../../core/approval/ExplicitVerificationPreflight";
import { resolveApprovalPolicySnapshot } from "../../../../core/approval";
import { createContentOpportunityCandidate, createContentOpportunityVerificationPlan, confirmContentOpportunity } from "../../../../core/content";
import type { AIProvider, AIResponse } from "../../../../core/ai";
import type { VerificationClaimSpec } from "../../../../core/approval";

const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
const urls = ["https://www.gov.kr/amount", "https://law.go.kr/amount", "https://www.nts.go.kr/amount"];
const claim: VerificationClaimSpec = { claimId: "claim-amount", field: "amount", kind: "money", statement: "지원 금액", rawValue: "50만원", qualifiers: {}, required: true };

class FixtureProvider implements AIProvider {
  calls = 0;
  constructor(private readonly sources: readonly unknown[]) {}
  async generate(): Promise<AIResponse> {
    this.calls += 1;
    return { content: JSON.stringify({ sources: this.sources }), model: "fixture", diagnostics: { webSources: [] } };
  }
}

function opportunity(claims: readonly VerificationClaimSpec[] = [claim]) {
  const candidate = createContentOpportunityCandidate({ sourceRequest: "지원금 안내", selectionMode: "userSpecified", selectedTopic: "지원금", primaryKeyword: "지원금", secondaryKeywords: [], searchIntent: "지원금 확인", audience: "독자", contentType: "article", contentAngle: "공식 기준", readerProblem: "기준 확인", expectedCoverage: ["금액"], selectionRationale: "fixture", opportunityEvidence: [{ source: "unknown", summary: "fixture" }], confidence: 1, cautions: [], projectId: "project-1", verificationPlan: createContentOpportunityVerificationPlan(claims) });
  return confirmContentOpportunity(candidate, { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-08-07T00:00:00.000Z" });
}

function source(url: string, value = "50만원", excerpt = "지원 금액은 50만원입니다.") {
  return { url, title: "공식 안내", evidenceExcerpt: excerpt, claims: [{ claimId: "claim-amount", value, evidenceExcerpt: excerpt }] };
}

function page(value = "50만원", excerpt = "지원 금액은 50만원입니다."): Response {
  return new Response(`<html><body>${excerpt} 적용 기준 ${value}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
}

async function run(sources: readonly unknown[], fetcher: (url: string | URL) => Promise<Response>): Promise<{ result: ApprovalSourcePreflightResult; provider: FixtureProvider }> {
  const provider = new FixtureProvider(sources);
  const result = await runApprovalSourcePreflight({ provider, snapshot, opportunity: opportunity(), platform: "wordpress", contentType: "article", fetcher });
  return { result, provider };
}

describe("runApprovalSourcePreflight explicit integration", () => {
  it("returns an explicit empty Snapshot without provider or fetcher calls", async () => {
    const provider = new FixtureProvider([]); let fetchCalls = 0;
    const result = await runApprovalSourcePreflight({ provider, snapshot, opportunity: opportunity([]), platform: "wordpress", contentType: "article", fetcher: async () => { fetchCalls += 1; return page(); } });
    expect(provider.calls).toBe(0); expect(fetchCalls).toBe(0); expect(result.sources).toEqual([]); expect(result.verificationSnapshot?.overallStatus).toBe("not_required");
  });

  it("verifies three independent institutions and excludes same-institution URLs", async () => {
    const { result, provider } = await run(urls.map((url) => source(url)), async () => page());
    expect(provider.calls).toBe(1); expect(result.verificationSnapshot?.results[0]).toMatchObject({ status: "stale", independentInstitutionCount: 0, primarySourceFound: false });
    expect(result.claimSources).toEqual([]);
    const same = await run([source(urls[0]), source("https://www.gov.kr/amount-2"), source(urls[1])], async () => page());
    expect(same.result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(0);
  });

  it("preserves fetched-page diagnostics for missing value, excerpt, and raw mismatch", async () => {
    const missingValue = await run([source(urls[0], "50만원")], async () => page("100만원", "지원 금액은 100만원입니다."));
    expect(missingValue.result.verificationSnapshot?.results[0]?.diagnostics).toContain("claim_value_not_found");
    const missingExcerpt = await run([source(urls[0], "50만원", "없는 문구")], async () => page());
    expect(missingExcerpt.result.verificationSnapshot?.results[0]?.diagnostics).toContain("claim_evidence_excerpt_not_found");
    const mismatch = await run([source(urls[0], "100만원")], async () => page("100만원", "지원 금액은 100만원입니다."));
    expect(mismatch.result.verificationSnapshot?.results[0]?.diagnostics).toContain("claim_raw_value_mismatch");
    expect(mismatch.result.verificationSnapshot?.results[0]?.status).not.toBe("verified");
  });

  it("isolates fetch failures and returns insufficient required results when all fail", async () => {
    const partial = await run(urls.map((url) => source(url)), async (url) => { if (String(url) === urls[1]) throw new Error("fixture failure"); return page(); });
    expect(partial.result.verificationSnapshot?.results[0]?.diagnostics).toContain("source_fetch_failed");
    await expect(run(urls.map((url) => source(url)), async () => { throw new Error("fixture failure"); })).resolves.toMatchObject({ result: { verificationSnapshot: { overallStatus: "insufficient" } } });
  });

  it("does not crash on unknown claim IDs and keeps same-field claim identities separate", async () => {
    const plan = opportunity([{ ...claim, claimId: "claim-a" }, { ...claim, claimId: "claim-b", rawValue: undefined }]);
    const provider = new FixtureProvider([{ url: urls[0], title: "공식", evidenceExcerpt: "지원 금액은 50만원입니다.", claims: [{ claimId: "unknown", value: "50만원", evidenceExcerpt: "지원 금액은 50만원입니다." }, { claimId: "claim-a", value: "50만원", evidenceExcerpt: "지원 금액은 50만원입니다." }] }]);
    const result = await runApprovalSourcePreflight({ provider, snapshot, opportunity: plan, platform: "wordpress", contentType: "article", fetcher: async () => page() });
    expect(result.verificationSnapshot?.results.map((item) => item.claimId)).toEqual(["claim-a", "claim-b"]);
    expect(result.verificationSnapshot?.results[1]?.sourceAssessments).toEqual([]);
  });

  it("distinguishes fresh, stale, and unknown source freshness", () => {
    const base = { requestedUrl: urls[0], pageText: "지원 금액은 50만원입니다.", evidenceExcerpt: "지원 금액은 50만원입니다.", claims: [{ claimId: "claim-amount", value: "50만원", evidenceExcerpt: "지원 금액은 50만원입니다." }], role: "primaryOfficial" as const, authoritative: true };
    const fresh = assessmentsFromExplicitDiscovery({ claims: [claim], sources: [{ ...base, observedAt: "2026-01-01", effectiveUntil: "2026-02-01" }] })[0]!;
    const stale = assessmentsFromExplicitDiscovery({ claims: [claim], sources: [{ ...base, observedAt: "2026-02-01", effectiveUntil: "2026-01-01" }] })[0]!;
    const unknown = assessmentsFromExplicitDiscovery({ claims: [claim], sources: [base] })[0]!;
    expect(fresh).toMatchObject({ freshnessStatus: "fresh", fresh: true });
    expect(stale).toMatchObject({ freshnessStatus: "stale", fresh: false }); expect(stale.diagnostics).toContain("claim_stale");
    expect(unknown).toMatchObject({ freshnessStatus: "unknown", fresh: false }); expect(unknown.diagnostics).toContain("freshness_unknown");
  });
});
