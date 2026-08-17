import { describe, expect, it, vi } from "vitest";
import { ApprovalSourcePreflightError, buildClaimPreflightQueries, runApprovalSourcePreflight, type ApprovalSourcePreflightResult } from "../../../../core/ai/ApprovalSourcePreflight";
import { assessmentsFromExplicitDiscovery } from "../../../../core/approval/ExplicitVerificationPreflight";
import { resolveApprovalPolicySnapshot } from "../../../../core/approval";
import { ensureApprovalEvidenceContract } from "../../../../app/application/ContentPlanningStrategy";
import { createContentOpportunityCandidate, createContentOpportunityVerificationPlan, confirmContentOpportunity } from "../../../../core/content";
import type { AIProvider, AIResponse } from "../../../../core/ai";
import type { VerificationClaimSpec } from "../../../../core/approval";


const snapshot = resolveApprovalPolicySnapshot("adsense_approval", "wordpress_life_economy_v1")!;
const urls = ["https://www.gov.kr/amount", "https://law.go.kr/amount", "https://www.nts.go.kr/amount"];
const defaultExcerpt = "공식 안내에 따르면 지원 금액은 50만원이며 신청 전에 세부 기준을 확인해야 합니다.";
const claim: VerificationClaimSpec = { claimId: "claim-amount", field: "amount", kind: "money", statement: "지원 금액", rawValue: "50만원", qualifiers: {}, required: true, temporalRequirement: { mode: "notRequired" } };
const currentClaim: VerificationClaimSpec = { ...claim, temporalRequirement: { mode: "current" } };

class FixtureProvider implements AIProvider {
  calls = 0;
  requests: Array<{ instruction: string }> = [];
  constructor(private readonly sources: readonly unknown[], private readonly responseDiagnostics: AIResponse["diagnostics"] = { webSources: [] }) {}
  async generate(request: { instruction: string }): Promise<AIResponse> {
    this.calls += 1;
    this.requests.push({ instruction: request.instruction });
    return { content: JSON.stringify({ sources: this.sources }), model: "fixture", diagnostics: this.responseDiagnostics };
  }
}

function opportunity(claims: readonly VerificationClaimSpec[] = [claim]) {
  const candidate = createContentOpportunityCandidate({ sourceRequest: "지원금 안내", selectionMode: "userSpecified", selectedTopic: "지원금", primaryKeyword: "지원금", secondaryKeywords: [], searchIntent: "지원금 확인", audience: "독자", contentType: "article", contentAngle: "공식 기준", readerProblem: "기준 확인", expectedCoverage: ["금액"], selectionRationale: "fixture", opportunityEvidence: [{ source: "unknown", summary: "fixture" }], confidence: 1, cautions: [], projectId: "project-1", verificationPlan: createContentOpportunityVerificationPlan(claims) });
  return confirmContentOpportunity(candidate, { workspaceId: "workspace-1", projectId: "project-1", contentId: "content-1", confirmedAt: "2026-08-07T00:00:00.000Z" });
}

function source(url: string, value = "50만원", excerpt = defaultExcerpt, claimId = "claim-amount") {
  return { url, title: "공식 안내", evidenceExcerpt: excerpt, claims: [{ claimId, value, evidenceExcerpt: excerpt }] };
}

function page(value = "50만원", excerpt = defaultExcerpt): Response {
  const filler = "이 페이지는 공식 지원 제도의 대상, 신청 절차, 제출 서류, 처리 과정과 주의사항을 안내하는 검증용 본문입니다. ".repeat(8);
  return new Response(`<html><body>${excerpt} 적용 기준 ${value}. ${filler}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
}

async function run(sources: readonly unknown[], fetcher: (url: string | URL) => Promise<Response>, claims: readonly VerificationClaimSpec[] = [claim]): Promise<{ result: ApprovalSourcePreflightResult; provider: FixtureProvider }> {
  const provider = new FixtureProvider(sources);
  const result = await runApprovalSourcePreflight({ provider, snapshot, opportunity: opportunity(claims), platform: "wordpress", contentType: "article", fetcher });
  return { result, provider };
}

describe("runApprovalSourcePreflight explicit integration", () => {
  it("skips Source Preflight for NONE and VERIFY-only Claims", async () => {
    const verifyClaim: VerificationClaimSpec = {
      ...claim,
      claimId: "verify-only",
      required: false,
      risk: "verify",
    };
    const { result, provider } = await run([], async () => page(), [verifyClaim]);
    expect(provider.calls).toBe(0);
    expect(result.coverage.status).toBe("not_required");
    expect(result.sourcePolicyCompliance).toBe("not_required");
    expect(result.verificationSnapshot?.overallStatus).toBe("not_required");
  });

  it("keeps raw web-source count distinct from assistant-declared and parsed source counts", async () => {
    const provider = new FixtureProvider([], {
      responseId: "preflight-observability-fixture",
      webSearchCalls: 3,
      webSources: Array.from({ length: 47 }, (_, index) => ({
        url: `https://www.gov.kr/search-${index}`,
        provenance: "search_candidate" as const,
      })),
    });
    await expect(runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    })).rejects.toMatchObject({
      diagnostic: expect.objectContaining({
        rawWebSourceCount: 47,
        assistantDeclaredSourceCount: 0,
        parsedSourceCount: 0,
        normalizedSourceCount: 0,
        canonicalUrlValidCount: 0,
      }),
    });
  });

  it("persists provider diagnostics and Claim-ID coverage when explicit coverage is incomplete", async () => {
    const secondClaim: VerificationClaimSpec = {
      ...claim,
      claimId: "claim-second",
      field: "loanScope",
      kind: "general",
      statement: "지원 기간은 공식 안내에서 확인해야 한다.",
    };
    const providerDiagnostics: AIResponse["diagnostics"] = {
      stage: "source_preflight",
      completionStatus: "completed",
      responseId: "preflight-coverage-fixture",
      configuredMaxOutputTokens: 4_000,
      inputTokens: 120,
      outputTokens: 240,
      reasoningTokens: 0,
      webSearchCalls: 1,
      structuredOutputPresent: true,
    };
    const provider = new FixtureProvider(
      [source(urls[0])],
      { ...providerDiagnostics, webSources: [{ url: urls[0], provenance: "search_candidate" }] },
    );
    await expect(runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity([claim, secondClaim]), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    })).rejects.toMatchObject({
      providerDiagnostics: expect.objectContaining({
        responseId: "preflight-coverage-fixture",
        stage: "source_preflight",
        completionStatus: "completed",
      }),
      diagnostic: expect.objectContaining({
        preflightResponseId: "preflight-coverage-fixture",
        requiredClaimIds: ["claim-amount", "claim-second"],
        coveredClaimIds: ["claim-amount"],
        missingClaimIds: ["claim-second"],
        coverageSources: [expect.objectContaining({
          supportingClaimIds: ["claim-amount"],
          rejectedClaimIds: ["claim-second"],
        })],
      }),
    });
  });

  it("keeps source semantic diagnostics while authoritative coverage remains verified", async () => {
    const provider = new FixtureProvider(
      [source(urls[0], "100留뚯썝")],
      { webSources: [{ url: urls[0], provenance: "search_candidate" }] },
    );
    const result = await runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page("50留뚯썝"),
    });
    expect(result.coverage.status).toBe("covered");
    expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
  });

  it("records missing Claim-ID linkage instead of silently treating a malformed source as covered", async () => {
    const provider = new FixtureProvider([{
      url: urls[0],
      title: "Official fixture",
      evidenceExcerpt: defaultExcerpt,
      claims: [{ field: "amount", value: "50만원", evidenceExcerpt: defaultExcerpt }],
    }], { webSources: [{ url: urls[0], provenance: "search_candidate" }] });
    await expect(runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    })).rejects.toMatchObject({
      diagnostic: expect.objectContaining({
        rejectionSamples: expect.arrayContaining([expect.objectContaining({ rejectionCode: "source_claim_linkage_missing" })]),
      }),
    });
  });

  it.each([
    ["empty claims", { claims: [] }, "source_claim_linkage_missing"],
    ["unknown Claim ID", { claims: [{ claimId: "unknown-claim", value: "50留뚯썝", evidenceExcerpt: defaultExcerpt }] }, "source_claim_id_unknown"],
  ])("fails closed for %s", async (_label, override, rejectionCode) => {
    const provider = new FixtureProvider([{
      ...source(urls[0]),
      ...override,
    }], { webSources: [{ url: urls[0], provenance: "search_candidate" }] });
    await expect(runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    })).rejects.toMatchObject({
      diagnostic: expect.objectContaining({
        rejectionSamples: expect.arrayContaining([expect.objectContaining({ rejectionCode })]),
        missingClaimIds: ["claim-amount"],
      }),
    });
  });

  it("distinguishes a fetched but unextractable document from a fetch failure", async () => {
    const provider = new FixtureProvider([source("https://law.go.kr/LSW/lsPdfPrint.do?lsiSeq=1")], {
      responseId: "preflight-extraction-fixture",
      webSearchCalls: 1,
      webSources: [{ url: "https://law.go.kr/LSW/lsPdfPrint.do?lsiSeq=1", provenance: "search_candidate" }],
    });
    const contracted = ensureApprovalEvidenceContract(opportunity(), snapshot);
    await expect(runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: contracted,
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => new Response("%PDF-1.7\n1 0 obj<</Filter/FlateDecode/Length 8>>stream\ncompressed\nendstream\n%%EOF", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
    })).rejects.toMatchObject({
      diagnostic: expect.objectContaining({
        rejectionStage: "evidence",
        rejectionCode: "source_document_extraction_failed",
        fetchSucceededCount: 1,
        extractionAttemptedCount: 1,
        extractionSucceededCount: 0,
        rejectionSamples: [expect.objectContaining({
          documentFormat: "pdf",
          extractionStatus: "unsupported",
          rejectionCode: "source_document_extraction_failed",
        })],
      }),
    });
  });
  it("returns an explicit empty Snapshot without provider or fetcher calls", async () => {
    const provider = new FixtureProvider([]); let fetchCalls = 0;
    const result = await runApprovalSourcePreflight({ provider, snapshot, opportunity: opportunity([]), platform: "wordpress", contentType: "article", fetcher: async () => { fetchCalls += 1; return page(); } });
    expect(provider.calls).toBe(0); expect(fetchCalls).toBe(0); expect(result.sources).toEqual([]); expect(result.coverage.status).toBe("not_required"); expect(result.verificationSnapshot).toMatchObject({ verificationMode: "explicit", overallStatus: "not_required", results: [] });
  });

  it("keeps explicit unknown temporal requirements fail-closed", async () => {
    const unknownTemporalClaim: VerificationClaimSpec = { ...claim, temporalRequirement: { mode: "unknown" } };
    const { result, provider } = await run(urls.map((url) => source(url)), async () => page(), [unknownTemporalClaim]);
    expect(provider.calls).toBe(1);
    expect(provider.requests[0]?.instruction).toContain("Topic:");
    expect(provider.requests[0]?.instruction).toContain("Primary keyword:");
    expect(provider.requests[0]?.instruction).toContain("Required Claims:");
    expect(result.verificationSnapshot?.results[0]).toMatchObject({ status: "verified", independentInstitutionCount: 0, primarySourceFound: false });
    expect(result.verificationSnapshot?.results[0]?.diagnostics).toContain("freshness_unknown");
    expect(result.claimSources).toHaveLength(3);
  });

  it("retains authoritative coverage when the submitted evidence is not verbatim", async () => {
    const provider = new FixtureProvider([source(urls[0], "50留뚯썝", "怨듭떇 ?덈궡??湲덉븸???댁젙?섏뼱 ?좎껌?섍린 ?쎄쾶 ?섍퀬 ?덈Т ?쨌???", "claim-amount")], {
      webSources: [{ url: urls[0], provenance: "search_candidate" }],
    });
    const result = await runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    });
    expect(result.coverage.status).toBe("covered");
    expect(provider.calls).toBe(1);
    expect(provider.requests[0]?.instruction).toMatch(/verbatim/i);
    expect(provider.requests[0]?.instruction).toMatch(/paraphrase/i);
    expect(provider.requests[0]?.instruction).toMatch(/synthesi[sz]e/i);
    expect(provider.requests[0]?.instruction).toMatch(/claimId/i);
    expect(provider.requests[0]?.instruction).toMatch(/readable HTML/i);
    expect(provider.requests[0]?.instruction).toMatch(/shortest verbatim factual phrase/i);
  });

  it("ignores synthesized evidence mismatch for an authoritative source", async () => {
    const synthesized = "怨듭떇 ?덈궡??吏????곴낵??50留뚯썝?대ŉ ?좎껌??吏???덈궡??湲곗?濡??④릿?섎뒗 ?곹뭹?낅땲??";
    const provider = new FixtureProvider([{
      ...source(urls[0], "50留뚯썝", synthesized),
      claims: [{ claimId: "claim-amount", value: "50留뚯썝", evidenceExcerpt: defaultExcerpt }],
    }], { webSources: [{ url: urls[0], provenance: "search_candidate" }] });
    const result = await runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    });
    expect(result.coverage.status).toBe("covered");
  });

  it("keeps linked Claims covered when authoritative sources have no anchors", async () => {
    const paraphrase = "怨듭떇 ?덈궡??吏????곴낵??50留뚯썝?좎쓣 ?좎껌??吏???덈궡?섎뒗 ?섏씠吏?낅땲??";
    const unrelatedUrl = urls[2];
    const provider = new FixtureProvider(([
      { ...source(urls[0], "50留뚯썝", paraphrase), claims: [{ claimId: "claim-amount", value: "50留뚯썝", evidenceExcerpt: defaultExcerpt }] },
      { ...source(urls[1], "50留뚯썝", paraphrase), claims: [{ claimId: "claim-amount", value: "50留뚯썝", evidenceExcerpt: defaultExcerpt }] },
      source(unrelatedUrl, "50留뚯썝", "留ㅼ슜 ?섏씠吏???댁슜?낅땲??"),
    ] as Array<Record<string, unknown>>), { webSources: urls.map((url) => ({ url, provenance: "search_candidate" })) });
    const result = await runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async (url) => String(url) === unrelatedUrl
        ? new Response("<html><head><title>留ㅼ슜 ?댁슜</title></head><body>留ㅼ슜 ?섏씠吏??寃利앸맂 ?댁슜?낅땲??</body></html>", { status: 200, headers: { "content-type": "text/html" } })
        : page(),
    });
    expect(result.coverage.status).toBe("covered");
    expect(result.coverage.coveredClaimIds).toEqual(["claim-amount"]);
    expect(provider.calls).toBe(1);
  });

  it("verifies a current money Claim from three independent institutions when each Claim excerpt owns an active period", async () => {
    const excerpt = "공식 안내에 따르면 지원 금액 50만원의 적용 기간은 2020-01-01부터 2099-12-31까지입니다.";
    const { result, provider } = await run(urls.map((url) => source(url, "50만원", excerpt)), async () => page("50만원", excerpt), [currentClaim]);
    expect(provider.calls).toBe(1);
    expect(result.verificationSnapshot?.results[0]).toMatchObject({
      status: "verified",
      independentInstitutionCount: 3,
      primarySourceFound: true,
      freshnessPassed: true,
      normalizedValue: { kind: "money", value: { amount: 500_000, currency: "KRW" } },
    });
    expect(result.claimSources).toHaveLength(3);
    expect(result.verificationSnapshot?.results[0]?.sourceAssessments.every((item) => item.freshnessStatus === "fresh")).toBe(true);
  });

  it("processes three synthetic public-sector institutions invariantly to source order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T00:00:00.000Z"));
    try {
    const syntheticSources = [
      "https://future-agency.gov/amount",
      "https://public-office.gov/amount",
      "https://national-service.gov/amount",
    ].map((url) => source(url));
    const activeExcerpt = `${defaultExcerpt} Effective period 2020-01-01 through 2099-12-31.`;
    const verificationSources = syntheticSources.map((item) => ({
      ...item,
      observedAt: "2026-08-08T00:00:00.000Z",
      evidenceExcerpt: activeExcerpt,
      claims: item.claims.map((claim) => ({ ...claim, evidenceExcerpt: activeExcerpt })),
    }));
    const stablePublicSectorPage = () => new Response(`<html><head><meta property="og:site_name" content="Synthetic Public Agency"></head><body>${activeExcerpt} ${"Synthetic official notice with application guidance, eligibility criteria, submission documents, processing steps, and review notes. ".repeat(8)}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    const first = await run(verificationSources, async () => stablePublicSectorPage(), [currentClaim]);
    const second = await run([...verificationSources].reverse(), async () => stablePublicSectorPage(), [currentClaim]);
    expect(first.result.verificationSnapshot?.results[0]).toMatchObject({
      status: "verified",
      independentInstitutionCount: 3,
      primarySourceFound: true,
    });
    expect(second.result.verificationSnapshot?.results[0]).toMatchObject({
      status: "verified",
      independentInstitutionCount: 3,
      primarySourceFound: true,
    });
    expect(first.result.verificationSnapshot?.results[0]?.sourceAssessments).toHaveLength(3);
    expect(second.result.verificationSnapshot?.results[0]?.sourceAssessments).toHaveLength(3);
    expect(second.result.verificationSnapshot?.sourceSnapshotFingerprint)
      .toBe(first.result.verificationSnapshot?.sourceSnapshotFingerprint);
    expect(second.result.verificationSnapshot?.verificationSnapshotFingerprint)
      .toBe(first.result.verificationSnapshot?.verificationSnapshotFingerprint);
    } finally {
      vi.useRealTimers();
    }
  });

  it("isolates malformed and fetch-failed sources when a valid source remains", async () => {
    const validUrl = "https://future-agency.gov/amount";
    const failedUrl = "https://unavailable-office.gov/amount";
    const result = await run([
      source(validUrl),
      source("not-a-url"),
      source(failedUrl),
    ], async (url) => {
      if (String(url) === failedUrl) throw new Error("synthetic fetch failure");
      return page();
    });

    expect(result.result.verificationSnapshot?.overallStatus).toBe("verified");
    expect(result.result.verificationSnapshot?.results[0]?.sourceAssessments)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ sourceId: expect.stringContaining("approval-source-") }),
        expect.objectContaining({ supports: false, diagnostics: expect.arrayContaining(["source_fetch_failed"]) }),
      ]));
  });

  it("does not impose a universal institution quota on an authoritative current Claim", async () => {
    const excerpt = "공식 안내에 따르면 지원 금액 50만원의 적용 기간은 2020-01-01부터 2099-12-31까지입니다.";
    const same = await run([source(urls[0], "50만원", excerpt), source("https://www.gov.kr/amount-2", "50만원", excerpt), source(urls[1], "50만원", excerpt)], async () => page("50만원", excerpt), [currentClaim]);
    expect(same.result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(2);
    expect(same.result.verificationSnapshot?.results[0]?.status).toBe("verified");
  });

  it("preserves fetched-page diagnostics for missing value, excerpt, and raw mismatch", async () => {
    const missingValueExcerpt = "공식 안내에 따르면 지원 금액은 50만원이며 대상 조건을 반드시 확인해야 합니다.";
    const missingValue = await run([source(urls[0], "50만원", missingValueExcerpt)], async () => page("100만원", "공식 안내에 따르면 지원 금액은 100만원이며 대상 조건을 반드시 확인해야 합니다."));
    expect(missingValue.result.verificationSnapshot?.results[0]?.diagnostics).toContain("claim_value_not_found");
    const missingExcerptText = "공식 페이지에는 존재하지 않는 긴 근거 문구이며 검증 실패를 확인하기 위한 문장입니다.";
    const missingExcerpt = await run([source(urls[0], "50만원", missingExcerptText)], async () => page());
    expect(missingExcerpt.result.verificationSnapshot?.results[0]?.diagnostics).toContain("claim_evidence_excerpt_not_found");
    const mismatchExcerpt = "공식 안내에 따르면 지원 금액은 100만원이며 대상 조건을 반드시 확인해야 합니다.";
    const mismatch = await run([source(urls[0], "100만원", mismatchExcerpt)], async () => page("100만원", mismatchExcerpt));
    expect(mismatch.result.verificationSnapshot?.results[0]?.diagnostics).toContain("claim_raw_value_mismatch");
    expect(mismatch.result.verificationSnapshot?.results[0]?.status).toBe("verified");
  });

  it("rejects ambiguous unitless money instead of silently assuming KRW", () => {
    const unitlessClaim: VerificationClaimSpec = { ...claim, rawValue: undefined };
    const excerpt = "공식 안내에 따르면 지원 금액 값은 500000이며 단위 표기는 제공되지 않았습니다.";
    const assessment = assessmentsFromExplicitDiscovery({
      claims: [unitlessClaim],
      sources: [{ requestedUrl: urls[0], pageText: excerpt, evidenceExcerpt: excerpt, claims: [{ claimId: "claim-amount", value: "500000", evidenceExcerpt: excerpt }], role: "primaryOfficial", authoritative: true, fresh: true }],
    })[0]!;
    expect(assessment.supports).toBe(true);
    expect(assessment.normalizedValue).toBeUndefined();
    expect(assessment.diagnostics).toContain("claim_normalization_failed");
  });

  it("isolates fetch failures and returns insufficient required results when all fail", async () => {
    const partial = await run(urls.map((url) => source(url)), async (url) => { if (String(url) === urls[1]) throw new Error("fixture failure"); return page(); });
    expect(partial.result.verificationSnapshot?.results[0]?.diagnostics).toContain("source_fetch_failed");
    await expect(run(urls.map((url) => source(url)), async () => { throw new Error("fixture failure"); })).resolves.toMatchObject({ result: { verificationSnapshot: { overallStatus: "insufficient" } } });
  });

  it("fails closed on unknown claim IDs before coverage can use the source", async () => {
    const plan = opportunity([{ ...claim, claimId: "claim-a" }, { ...claim, claimId: "claim-b", rawValue: undefined }]);
    const provider = new FixtureProvider([{ url: urls[0], title: "공식", evidenceExcerpt: defaultExcerpt, claims: [{ claimId: "unknown", value: "50만원", evidenceExcerpt: defaultExcerpt }, { claimId: "claim-a", value: "50만원", evidenceExcerpt: defaultExcerpt }] }]);
    await expect(runApprovalSourcePreflight({ provider, snapshot, opportunity: plan, platform: "wordpress", contentType: "article", fetcher: async () => page() }))
      .rejects.toMatchObject({ diagnostic: expect.objectContaining({ rejectionCode: "source_claim_id_unknown", missingClaimIds: ["claim-a", "claim-b"] }) });
  });

  it("verifies an authoritative current Claim even when freshness is stale", async () => {
    const excerpt = "공식 안내에 따르면 지원 금액 50만원의 적용 기간은 2020-01-01부터 2021-12-31까지입니다.";
    const result = await run(urls.map((url) => source(url, "50만원", excerpt)), async () => page("50만원", excerpt), [currentClaim]);
    expect(result.result.verificationSnapshot?.results[0]?.status).toBe("verified");
    expect(result.result.verificationSnapshot?.results[0]?.sourceAssessments.every((item) => item.freshnessStatus === "stale")).toBe(true);
  });

  it("does not let one stale source contaminate complete fresh evidence", async () => {
    const freshExcerpt = "공식 안내에 따르면 지원 금액 50만원의 적용 기간은 2020-01-01부터 2099-12-31까지입니다.";
    const staleExcerpt = "공식 안내에 따르면 지원 금액 50만원의 적용 기간은 2020-01-01부터 2021-12-31까지입니다.";
    const fourth = "https://www.moel.go.kr/amount";
    const sources = [...urls.map((url) => source(url, "50만원", freshExcerpt)), source(fourth, "50만원", staleExcerpt)];
    const result = await run(sources, async (url) => String(url) === fourth ? page("50만원", staleExcerpt) : page("50만원", freshExcerpt), [currentClaim]);
    expect(result.result.verificationSnapshot?.results[0]?.status).toBe("verified");
    expect(result.result.verificationSnapshot?.results[0]?.sourceAssessments.some((item) => item.freshnessStatus === "stale")).toBe(true);
  });

  it("uses the observation date of a fetched authoritative current source when no explicit validity interval exists", async () => {
    const unknownExcerpt = defaultExcerpt;
    const freshExcerpt = "공식 안내에 따르면 지원 금액 50만원의 적용 기간은 2020-01-01부터 2099-12-31까지입니다.";
    const result = await run([source(urls[0], "50만원", unknownExcerpt), source(urls[1], "50만원", freshExcerpt), source(urls[2], "50만원", freshExcerpt)], async (url) => String(url) === urls[0] ? page("50만원", unknownExcerpt) : page("50만원", freshExcerpt), [currentClaim]);
    expect(result.result.verificationSnapshot?.results[0]).toMatchObject({ status: "verified", primarySourceFound: true, independentInstitutionCount: 3 });
    expect(result.result.verificationSnapshot?.results[0]?.sourceAssessments.some((assessment) =>
      assessment.diagnostics.includes("freshness_observed_at_authoritative_source"))).toBe(true);
  });

  it("keeps trusted fixture freshness compatibility but never makes effectiveUntil alone fresh", () => {
    const claimWithoutTemporal: VerificationClaimSpec = { ...claim, temporalRequirement: undefined };
    const base = { requestedUrl: urls[0], pageText: defaultExcerpt, evidenceExcerpt: defaultExcerpt, claims: [{ claimId: "claim-amount", value: "50만원", evidenceExcerpt: defaultExcerpt }], role: "primaryOfficial" as const, authoritative: true };
    const trustedFresh = assessmentsFromExplicitDiscovery({ claims: [claimWithoutTemporal], sources: [{ ...base, fresh: true }] })[0]!;
    const stale = assessmentsFromExplicitDiscovery({ claims: [claimWithoutTemporal], sources: [{ ...base, observedAt: "2026-02-01T00:00:00.000Z", effectiveUntil: "2026-01-01" }] })[0]!;
    const noObservation = assessmentsFromExplicitDiscovery({ claims: [claimWithoutTemporal], sources: [{ ...base, effectiveUntil: "2099-01-01" }] })[0]!;
    expect(trustedFresh).toMatchObject({ freshnessStatus: "fresh", fresh: true });
    expect(stale).toMatchObject({ freshnessStatus: "stale", fresh: true }); expect(stale.diagnostics).toContain("claim_stale");
    expect(noObservation).toMatchObject({ freshnessStatus: "unknown", fresh: true }); expect(noObservation.diagnostics).toContain("freshness_unknown");
  });

  describe("corroboration vs authoritative source preflight guard regression", () => {
    it("passes Preflight with one verified official source", async () => {
      const contracted = ensureApprovalEvidenceContract(opportunity(), snapshot);
      const provider = new FixtureProvider(
        [source("https://www.gov.kr/amount")],
        { webSources: [{ url: "https://www.gov.kr/amount", provenance: "search_candidate" }] },
      );
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async () => page("50만원"),
      });
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
      expect(result.sourcePolicyCompliance).toBe("passed");
      expect(result.coverage.status).toBe("covered");
    });

    it("passes Preflight when non-official sources corroborate the claim with verified status from two independent institutions", async () => {
      const nonOfficial1 = "https://news.alpha.com/amount";
      const nonOfficial2 = "https://media.beta.org/amount";
      const contracted = ensureApprovalEvidenceContract(opportunity(), snapshot);
      const provider = new FixtureProvider(
        [source(nonOfficial1), source(nonOfficial2)],
        { webSources: [{ url: nonOfficial1, provenance: "search_candidate" }, { url: nonOfficial2, provenance: "search_candidate" }] },
      );
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async () => page("50만원"),
      });
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(2);
      expect(result.verificationSnapshot?.results[0]?.authoritativeInstitutionCount).toBe(0);
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
      expect(result.sourcePolicyCompliance).toBe("passed");
      expect(result.coverage.status).toBe("covered");
    });
  });

  describe("Mandatory Preflight Verification Specification Tests (A through I)", () => {
    const contracted = ensureApprovalEvidenceContract(opportunity(), snapshot);
    const ddgSearchHtml = (results: readonly string[]) =>
      `<html><body>${results.map((r) => `<a class="result__a" href="${r}">Result</a>`).join("")}</body></html>`;

    it("Test A: 공식 출처 1개 -> verified -> Fallback 실행 안 함", async () => {
      let ddgCalled = false;
      const provider = new FixtureProvider(
        [source("https://www.gov.kr/amount")],
        { webSources: [{ url: "https://www.gov.kr/amount", provenance: "search_candidate" }] },
      );
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          if (String(url).includes("duckduckgo.com")) {
            ddgCalled = true;
            return new Response(ddgSearchHtml([]), { status: 200, headers: { "content-type": "text/html" } });
          }
          return page("50만원");
        },
      });
      expect(ddgCalled).toBe(false);
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
      expect(result.sourcePolicyCompliance).toBe("passed");
      expect(result.coverage.status).toBe("covered");
    });

    it("Test B: 비공식 usable source 1개 -> verified 아님 -> Fallback 실행 -> 독립기관 1개 추가 -> 총 2개 -> PASS", async () => {
      let ddgCalled = false;
      const nonOfficial1 = "https://news.alpha.com/amount";
      const nonOfficial2 = "https://media.beta.org/amount";
      const provider = new FixtureProvider(
        [source(nonOfficial1)],
        { webSources: [{ url: nonOfficial1, provenance: "search_candidate" }] },
      );
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            ddgCalled = true;
            return new Response(ddgSearchHtml([nonOfficial2]), { status: 200, headers: { "content-type": "text/html" } });
          }
          return page("50만원");
        },
      });
      expect(ddgCalled).toBe(true);
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(2);
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
      expect(result.sourcePolicyCompliance).toBe("passed");
    });

    it("Test C: 비공식 usable source 2개 + 서로 다른 기관 + Claim 일치 -> PASS -> 3번째 검색 안 함", async () => {
      let ddgCalled = false;
      const nonOfficial1 = "https://news.alpha.com/amount";
      const nonOfficial2 = "https://media.beta.org/amount";
      const provider = new FixtureProvider(
        [source(nonOfficial1), source(nonOfficial2)],
        { webSources: [{ url: nonOfficial1, provenance: "search_candidate" }, { url: nonOfficial2, provenance: "search_candidate" }] },
      );
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          if (String(url).includes("duckduckgo.com")) {
            ddgCalled = true;
            return new Response(ddgSearchHtml([]), { status: 200, headers: { "content-type": "text/html" } });
          }
          return page("50만원");
        },
      });
      expect(ddgCalled).toBe(false);
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(2);
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
    });

    it("counts fallback fetch attempts separately from successful fetches", async () => {
      const initialUrl = "https://news.alpha.com/initial";
      const failedFallbackUrl = "https://news.alpha.com/fallback-failed";
      const successfulFallbackUrl = "https://news.alpha.com/fallback-success";
      const provider = new FixtureProvider(
        [source(initialUrl)],
        { webSources: [{ url: initialUrl, provenance: "search_candidate" }] },
      );
      await expect(runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        searchProvider: { search: async () => [failedFallbackUrl, successfulFallbackUrl] },
        fetcher: async (url) => {
          const urlString = String(url);
          if (urlString.includes("duckduckgo.com") || urlString.includes("lite.duckduckgo.com")) {
            return new Response(ddgSearchHtml([]), { status: 200, headers: { "content-type": "text/html" } });
          }
          if (urlString === failedFallbackUrl) throw new Error("fallback fetch failed");
          return page("50留뚯썝");
        },
      })).rejects.toMatchObject({
        diagnostic: expect.objectContaining({
          fetchAttemptedCount: 3,
          fetchSucceededCount: 2,
        }),
      });
    });

    it("Test D: 비공식 source 3개지만 같은 기관 -> FAIL", async () => {
      const sameInst1 = "https://news.alpha.com/post-1";
      const sameInst2 = "https://news.alpha.com/post-2";
      const sameInst3 = "https://news.alpha.com/post-3";
      const provider = new FixtureProvider(
        [source(sameInst1), source(sameInst2), source(sameInst3)],
        { webSources: [{ url: sameInst1, provenance: "search_candidate" }, { url: sameInst2, provenance: "search_candidate" }, { url: sameInst3, provenance: "search_candidate" }] },
      );
      await expect(runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async () => page("50만원"),
      })).rejects.toThrow(ApprovalSourcePreflightError);
    });

    it("Test E: 비공식 source 2개가 서로 다른 기관이지만 값 충돌 -> FAIL", async () => {
      const nonOfficial1 = "https://news.alpha.com/amount";
      const nonOfficial2 = "https://media.beta.org/amount";
      const excerpt1 = "공식 안내에 따르면 지원 금액은 50만원이며 신청 전에 세부 기준을 확인해야 합니다.";
      const excerpt2 = "공식 안내에 따르면 지원 금액은 70만원이며 신청 전에 세부 기준을 확인해야 합니다.";
      const provider = new FixtureProvider(
        [
          source(nonOfficial1, "50만원", excerpt1),
          source(nonOfficial2, "70만원", excerpt2),
        ],
        { webSources: [{ url: nonOfficial1, provenance: "search_candidate" }, { url: nonOfficial2, provenance: "search_candidate" }] },
      );
      await expect(runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => String(url) === nonOfficial2 ? page("70만원", excerpt2) : page("50만원", excerpt1),
      })).rejects.toThrow(ApprovalSourcePreflightError);
    });

    it("Test F: Fallback 후보 1개 실패 + 후보 2개 독립기관 A + 후보 3개 독립기관 B -> PASS", async () => {
      const failUrl = "https://invalid.candidate.com/fail";
      const candA = "https://news.alpha.com/amount";
      const candB = "https://media.beta.org/amount";
      const provider = new FixtureProvider(
        [],
        { webSources: [] },
      );
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            return new Response(ddgSearchHtml([failUrl, candA, candB]), { status: 200, headers: { "content-type": "text/html" } });
          }
          if (urlStr === failUrl) {
            return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
          }
          return page("50만원");
        },
      });
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(2);
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
    });

    it("Test G: Fallback 후보 3개까지 시도해도 독립기관 2개 미충족 -> FAIL", async () => {
      const fail1 = "https://fail1.com/a";
      const fail2 = "https://fail2.com/b";
      const onlyOne = "https://news.alpha.com/amount";
      const provider = new FixtureProvider(
        [],
        { webSources: [] },
      );
      await expect(runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            return new Response(ddgSearchHtml([fail1, fail2, onlyOne]), { status: 200, headers: { "content-type": "text/html" } });
          }
          if (urlStr === fail1 || urlStr === fail2) {
            return new Response("Error", { status: 500, headers: { "content-type": "text/plain" } });
          }
          return page("50만원");
        },
      })).rejects.toThrow(ApprovalSourcePreflightError);
    });

    it("Test H: 404 HTML이 extractionStatus=extracted여도 usable로 잘못 판단하지 않고 Fallback 실행", async () => {
      let ddgCalled = false;
      const provider = new FixtureProvider(
        [source("https://www.gov.kr/amount")],
        { webSources: [{ url: "https://www.gov.kr/amount", provenance: "search_candidate" }] },
      );
      const nonOfficial1 = "https://news.alpha.com/amount";
      const nonOfficial2 = "https://media.beta.org/amount";
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            ddgCalled = true;
            return new Response(ddgSearchHtml([nonOfficial1, nonOfficial2]), { status: 200, headers: { "content-type": "text/html" } });
          }
          if (urlStr === "https://www.gov.kr/amount") {
            const body = "<html><head><title>404 Error</title></head><body>요청하신 페이지를 찾을 수 없습니다. 서비스 이용에 불편을 드려 죄송합니다. 다시 확인 후 시도해주시기 바랍니다. ".repeat(6) + "</body></html>";
            return new Response(body, { status: 404, headers: { "content-type": "text/html" } });
          }
          return page("50만원");
        },
      });
      expect(ddgCalled).toBe(true);
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(2);
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
      expect(result.sourcePolicyCompliance).toBe("passed");
    });

    it("Test I: 실제 잘못된 페이지/본문/관련성 오류 -> FAIL", async () => {
      const nonOfficial1 = "https://news.alpha.com/amount";
      const nonOfficial2 = "https://media.beta.org/amount";
      const provider = new FixtureProvider(
        [source(nonOfficial1), source(nonOfficial2)],
        { webSources: [{ url: nonOfficial1, provenance: "search_candidate" }, { url: nonOfficial2, provenance: "search_candidate" }] },
      );
      // nonOfficial2 has irrelevant content / missing excerpt anchor
      await expect(runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          if (String(url) === nonOfficial2) {
            return new Response("<html><body>전혀 관련 없는 우주 여행과 외계인 탐사 기사입니다. ".repeat(10) + "</body></html>", {
              status: 200,
              headers: { "content-type": "text/html" },
            });
          }
          return page("50만원");
        },
      })).rejects.toThrow(ApprovalSourcePreflightError);
    });
  });

  describe("Claim-targeted Fallback Query and Verification Coverage Tests (Tests 1 through 5)", () => {
    const contracted = ensureApprovalEvidenceContract(opportunity(), snapshot);
    const ddgSearchHtml = (results: readonly string[]) =>
      `<html><body>${results.map((r) => `<a class="result__a" href="${r}">Result</a>`).join("")}</body></html>`;

    it("Test 1: 미검증 Claim이 존재할 때 전체 topic이 아니라 Claim-targeted query 생성", () => {
      const queries = buildClaimPreflightQueries(
        [
          { field: "2026년 예금자보호 한도", statement: "2026년 현재 예금자보호 한도 금액은 공식 자료로 확인되어야 한다." },
          { field: "공동명의 등 예외 산정", statement: "공동명의 예금의 한도 산정 방식은 별도 공식 기준으로 확인되어야 한다." },
        ],
        "예금자보호 한도 합산 확인 방법",
        "2026년 예금자보호 한도 합산 확인 방법으로 금융회사별 보호범위 계산하기",
      );
      expect(queries.some((q) => q.includes("2026년 예금자보호 한도"))).toBe(true);
      expect(queries.some((q) => q.includes("공동명의 등 예외 산정") || q.includes("공동명의 예금"))).toBe(true);
      expect(queries[0]).not.toBe("2026년 예금자보호 한도 합산 확인 방법으로 금융회사별 보호범위 계산하기");
    });

    it("Test 2: 다중 Claim 분할 Coverage -> 전체 만족 시 세 번째 검색 생략", async () => {
      let ddgCallCount = 0;
      let candidateFetchCount = 0;
      const candidate1 = "https://www.gov.kr/part1";
      const candidate2 = "https://law.go.kr/part2";
      const candidate3 = "https://www.nts.go.kr/part3";

      const claimA: VerificationClaimSpec = { claimId: "claim-a", field: "partA", kind: "money", statement: "지원금 금액은 50만원이며 지원 대상입니다.", rawValue: "50만원", qualifiers: {}, required: true, temporalRequirement: { mode: "notRequired" } };
      const claimB: VerificationClaimSpec = { claimId: "claim-b", field: "partB", kind: "legal", statement: "지원금 기준은 법률기준이며 적용 대상입니다.", rawValue: "법률기준", qualifiers: {}, required: true, temporalRequirement: { mode: "notRequired" } };
      const multiClaimOpportunity = ensureApprovalEvidenceContract(opportunity([claimA, claimB]), snapshot);

      const provider = new FixtureProvider([], { webSources: [] });
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: multiClaimOpportunity,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            ddgCallCount += 1;
            return new Response(ddgSearchHtml([candidate1, candidate2, candidate3]), { status: 200, headers: { "content-type": "text/html" } });
          }
          candidateFetchCount += 1;
          if (urlStr === candidate1) {
            return page("50만원", "공식 안내에 따르면 지원금 금액은 50만원이며 지원 대상입니다.");
          }
          if (urlStr === candidate2) {
            return page("법률기준", "공식 규정에 따르면 지원금 기준은 법률기준이며 적용 대상입니다.");
          }
          return page("50만원");
        },
      });
      // candidate1 covers claimA, candidate2 covers claimB -> Coverage complete -> candidate3 is never fetched!
      expect(candidateFetchCount).toBe(2);
      expect(result.coverage.status).toBe("covered");
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
    });

    it("Test 3: 비공식 후보 2개로 Corroboration 충족 시 세 번째 후보 검색 생략", async () => {
      let candidateFetchCount = 0;
      const cand1 = "https://news.alpha.com/amount";
      const cand2 = "https://media.beta.org/amount";
      const cand3 = "https://daily.gamma.net/amount";

      const provider = new FixtureProvider([], { webSources: [] });
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            return new Response(ddgSearchHtml([cand1, cand2, cand3]), { status: 200, headers: { "content-type": "text/html" } });
          }
          candidateFetchCount += 1;
          return page("50만원");
        },
      });
      expect(candidateFetchCount).toBe(2);
      expect(result.verificationSnapshot?.results[0]?.independentInstitutionCount).toBe(2);
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
    });

    it("Test 4: 3개 후보 모두 처리했지만 required Claim이 남으면 fail-closed 유지", async () => {
      let candidateFetchCount = 0;
      const cand1 = "https://news.alpha.com/fail";
      const cand2 = "https://media.beta.org/fail";
      const cand3 = "https://daily.gamma.net/fail";

      const provider = new FixtureProvider([], { webSources: [] });
      await expect(runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            return new Response(ddgSearchHtml([cand1, cand2, cand3]), { status: 200, headers: { "content-type": "text/html" } });
          }
          candidateFetchCount += 1;
          // Return irrelevant page lacking required claim value
          return new Response("<html><body>전혀 관련 없는 내용의 웹페이지입니다. ".repeat(10) + "</body></html>", { status: 200, headers: { "content-type": "text/html" } });
        },
      })).rejects.toThrow(ApprovalSourcePreflightError);
      expect(candidateFetchCount).toBeGreaterThanOrEqual(3);
    });

    it("Test 5: 404/5xx 후보가 있어도 정상 후보를 계속 탐색하여 최대 3개 내에서 검증", async () => {
      let candidateFetchCount = 0;
      const errorUrl = "https://www.gov.kr/error-404";
      const validUrl = "https://www.gov.kr/valid";

      const provider = new FixtureProvider([], { webSources: [] });
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: contracted,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            return new Response(ddgSearchHtml([errorUrl, validUrl]), { status: 200, headers: { "content-type": "text/html" } });
          }
          candidateFetchCount += 1;
          if (urlStr === errorUrl) {
            return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
          }
          return page("50만원");
        },
      });
      expect(candidateFetchCount).toBe(2);
      expect(result.verificationSnapshot?.results[0]?.status).toBe("verified");
      expect(result.sourcePolicyCompliance).toBe("passed");
    });

    it("Regression Test: 2026년 예금자보호 한도 및 공동명의 등 예외 산정 Claim에 대한 Fallback 타겟팅 및 분할 검증", async () => {
      let candidateFetchCount = 0;
      const kdicLimitUrl = "https://www.kdic.or.kr/protect/limit";
      const kdicJointUrl = "https://www.kdic.or.kr/protect/joint";

      const claimLimit: VerificationClaimSpec = {
        claimId: "claim-deposit-limit-2026",
        field: "2026년 예금자보호 한도",
        kind: "money",
        statement: "2026년 현재 예금자보호 한도 금액은 5,000만원이다.",
        rawValue: "5,000만원",
        qualifiers: { subject: "예금자보호" },
        required: true,
        temporalRequirement: { mode: "notRequired" },
      };
      const claimJoint: VerificationClaimSpec = {
        claimId: "claim-joint-ownership",
        field: "공동명의 등 예외 산정",
        kind: "general",
        statement: "공동명의 예금은 예금자보호 한도가 지분 비율에 따라 1인당 각각 분할 적용된다.",
        rawValue: "지분 비율 분할",
        qualifiers: { subject: "예금자보호" },
        required: true,
        temporalRequirement: { mode: "notRequired" },
      };
      const depositOpportunity = ensureApprovalEvidenceContract(
        confirmContentOpportunity(
          createContentOpportunityCandidate({
            sourceRequest: "2026년 예금자보호 한도와 금융회사별 합산 확인 방법",
            selectionMode: "userSpecified",
            selectedTopic: "2026년 예금자보호 한도 합산 확인 방법으로 금융회사별 보호범위 계산하기",
            primaryKeyword: "예금자보호 한도 합산 확인 방법",
            secondaryKeywords: ["예금자보호", "공동명의 예금"],
            searchIntent: "예금자보호 한도 계산",
            audience: "예금자",
            contentType: "article",
            contentAngle: "공식 기준",
            readerProblem: "예금자보호 한도 확인",
            expectedCoverage: ["2026년 예금자보호 한도", "공동명의 등 예외 산정"],
            selectionRationale: "fixture",
            opportunityEvidence: [{ source: "unknown", summary: "fixture" }],
            confidence: 1,
            cautions: [],
            projectId: "project-1",
            verificationPlan: createContentOpportunityVerificationPlan([claimLimit, claimJoint]),
          }),
          {
            workspaceId: "workspace-1",
            projectId: "project-1",
            contentId: "content-1",
            confirmedAt: "2026-08-07T00:00:00.000Z",
          },
        ),
        snapshot,
      );

      const searchedQueries: string[] = [];
      const provider = new FixtureProvider([], { webSources: [] });
      const result = await runApprovalSourcePreflight({
        provider,
        snapshot,
        opportunity: depositOpportunity,
        platform: "wordpress",
        contentType: "article",
        fetcher: async (url) => {
          const urlStr = String(url);
          if (urlStr.includes("duckduckgo.com")) {
            const parsed = new URL(urlStr);
            const q = parsed.searchParams.get("q") ?? "";
            searchedQueries.push(q);
            if (q.includes("공동명의") || q.includes("joint")) {
              return new Response(ddgSearchHtml([kdicJointUrl]), { status: 200, headers: { "content-type": "text/html" } });
            }
            return new Response(ddgSearchHtml([kdicLimitUrl]), { status: 200, headers: { "content-type": "text/html" } });
          }
          candidateFetchCount += 1;
          if (urlStr === kdicLimitUrl) {
            return new Response(
              "<html><body>예금자보호법에 따른 금융회사별 2026년 현재 예금자보호 한도 금액은 1인당 최고 5,000만원까지 보호됩니다. 자세한 산정 기준과 법률 규정을 확인하세요. ".repeat(6) + "</body></html>",
              { status: 200, headers: { "content-type": "text/html" } },
            );
          }
          if (urlStr === kdicJointUrl) {
            return new Response(
              "<html><body>공동명의 예금의 경우 각 예금자의 지분 비율에 따라 1인당 한도가 각각 분할 적용되어 계산됩니다. 공동명의 관련 유의사항을 확인하세요. ".repeat(6) + "</body></html>",
              { status: 200, headers: { "content-type": "text/html" } },
            );
          }
          return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } });
        },
      });

      expect(searchedQueries.some((q) => q.includes("2026") || q.includes("예금자보호"))).toBe(true);
      expect(searchedQueries.some((q) => q.includes("공동명의"))).toBe(true);
      expect(candidateFetchCount).toBe(2);
      expect(result.coverage.status).toBe("covered");
      expect(result.verificationSnapshot?.overallStatus).toBe("verified");
      expect(result.sourcePolicyCompliance).toBe("passed");
    });
  });
});
