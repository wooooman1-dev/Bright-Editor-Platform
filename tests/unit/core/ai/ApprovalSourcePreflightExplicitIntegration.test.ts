import { describe, expect, it, vi } from "vitest";
import { runApprovalSourcePreflight, type ApprovalSourcePreflightResult } from "../../../../core/ai/ApprovalSourcePreflight";
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

  /**
   * D-045: 커버리지가 비어도 생성을 막지 않는다. 무엇이 비었는지는 결과의
   * coverage 로 남는다.
   */
  it("reports incomplete Claim coverage in the result instead of rejecting", async () => {
    const secondClaim: VerificationClaimSpec = {
      ...claim,
      claimId: "claim-second",
      field: "loanScope",
      kind: "general",
      statement: "지원 기간은 공식 안내에서 확인해야 한다.",
    };
    const provider = new FixtureProvider([source(urls[0])]);
    const result = await runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity([claim, secondClaim]), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    });
    expect(result.coverage?.status).toBe("incomplete");
    expect(result.sources.length).toBeGreaterThan(0);
  });

  /**
   * D-045: 의미 검증 실패는 더 이상 Preflight 를 멈추지 않는다.
   */
  it("does not reject when the fetched page fails semantic verification", async () => {
    const provider = new FixtureProvider([source(urls[0])]);
    const result = await runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity([claim]), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async () => page(),
    });
    expect(result.sources.length).toBeGreaterThan(0);
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
    expect(result.verificationSnapshot?.results[0]).toMatchObject({ status: "insufficient", independentInstitutionCount: 0, primarySourceFound: false });
    expect(result.verificationSnapshot?.results[0]?.diagnostics).toContain("freshness_unknown");
    expect(result.claimSources).toEqual([]);
  });

  it("requires explicit source evidence to be a verbatim page passage", async () => {
    const provider = new FixtureProvider([source(urls[0], "50留뚯썝", "怨듭떇 ?덈궡??湲덉븸???댁젙?섏뼱 ?좎껌?섍린 ?쎄쾶 ?섍퀬 ?덈Т ?쨌???", "claim-amount")], {
      webSources: [{ url: urls[0], provenance: "search_candidate" }],
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
        rejectionStage: "evidence",
        rejectionCode: "evidence_anchor_unverified",
        evidenceAnchorPassCount: 0,
      }),
    });
    // Two calls: a rejected candidate now buys one more discovery attempt, and
    // this fixture returns the same unusable source both times.
    expect(provider.calls).toBe(2);
    expect(provider.requests[0]?.instruction).toMatch(/verbatim/i);
    expect(provider.requests[0]?.instruction).toMatch(/paraphrase/i);
    expect(provider.requests[0]?.instruction).toMatch(/synthesi[sz]e/i);
    expect(provider.requests[0]?.instruction).toMatch(/claimId/i);
    expect(provider.requests[0]?.instruction).toMatch(/readable HTML/i);
    expect(provider.requests[0]?.instruction).toMatch(/shortest verbatim factual phrase/i);
  });

  it("rejects synthesized evidence while preserving exact claim evidence", async () => {
    const synthesized = "怨듭떇 ?덈궡??吏????곴낵??50留뚯썝?대ŉ ?좎껌??吏???덈궡??湲곗?濡??④릿?섎뒗 ?곹뭹?낅땲??";
    const provider = new FixtureProvider([{
      ...source(urls[0], "50留뚯썝", synthesized),
      claims: [{ claimId: "claim-amount", value: "50留뚯썝", evidenceExcerpt: defaultExcerpt }],
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
        rejectionCode: "evidence_anchor_unverified",
        evidenceAnchorPassCount: 0,
      }),
    });
  });

  it("selects anchor failure when two relevant sources have no anchors and one official source is irrelevant", async () => {
    const paraphrase = "怨듭떇 ?덈궡??吏????곴낵??50留뚯썝?좎쓣 ?좎껌??吏???덈궡?섎뒗 ?섏씠吏?낅땲??";
    const unrelatedUrl = urls[2];
    const provider = new FixtureProvider(([
      { ...source(urls[0], "50留뚯썝", paraphrase), claims: [{ claimId: "claim-amount", value: "50留뚯썝", evidenceExcerpt: defaultExcerpt }] },
      { ...source(urls[1], "50留뚯썝", paraphrase), claims: [{ claimId: "claim-amount", value: "50留뚯썝", evidenceExcerpt: defaultExcerpt }] },
      source(unrelatedUrl, "50留뚯썝", "留ㅼ슜 ?섏씠吏???댁슜?낅땲??"),
    ] as Array<Record<string, unknown>>), { webSources: urls.map((url) => ({ url, provenance: "search_candidate" })) });
    await expect(runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: ensureApprovalEvidenceContract(opportunity(), snapshot),
      platform: "wordpress",
      contentType: "article",
      fetcher: async (url) => String(url) === unrelatedUrl
        ? new Response("<html><head><title>留ㅼ슜 ?댁슜</title></head><body>留ㅼ슜 ?섏씠吏??寃利앸맂 ?댁슜?낅땲??</body></html>", { status: 200, headers: { "content-type": "text/html" } })
        : page(),
    })).rejects.toMatchObject({
      diagnostic: expect.objectContaining({
        rejectionCode: "evidence_anchor_unverified",
        rejectionStage: "evidence",
        officialnessPassCount: 3,
        relevancePassCount: 2,
        evidenceAnchorEvaluatedCount: 3,
        evidenceAnchorPassCount: 0,
        semanticVerificationEvaluatedCount: 0,
        semanticVerificationPassCount: 0,
      }),
    });
    // The retry attempt runs and returns the same three unusable sources.
    expect(provider.calls).toBe(2);
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

  /**
   * 세 가지는 진단으로 남지만 판정을 막지 않는다 (D-045). 기획 rawValue 와
   * 출처 값이 다르면 출처를 따르므로 (50656c7) raw mismatch 도 상태를 내리지
   * 않는다. 판정을 막는 것은 발췌가 페이지에 없을 때뿐이다.
   */
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
  });

  it("rejects ambiguous unitless money instead of silently assuming KRW", () => {
    const unitlessClaim: VerificationClaimSpec = { ...claim, rawValue: undefined };
    const excerpt = "공식 안내에 따르면 지원 금액 값은 500000이며 단위 표기는 제공되지 않았습니다.";
    const assessment = assessmentsFromExplicitDiscovery({
      claims: [unitlessClaim],
      sources: [{ requestedUrl: urls[0], pageText: excerpt, evidenceExcerpt: excerpt, claims: [{ claimId: "claim-amount", value: "500000", evidenceExcerpt: excerpt }], role: "primaryOfficial", authoritative: true, fresh: true }],
    })[0]!;
    expect(assessment.supports).toBe(false);
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

  it("treats an expired current Claim as stale when no fresh proof remains", async () => {
    const excerpt = "공식 안내에 따르면 지원 금액 50만원의 적용 기간은 2020-01-01부터 2021-12-31까지입니다.";
    const result = await run(urls.map((url) => source(url, "50만원", excerpt)), async () => page("50만원", excerpt), [currentClaim]);
    expect(result.result.verificationSnapshot?.results[0]?.status).toBe("stale");
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
    expect(stale).toMatchObject({ freshnessStatus: "stale", fresh: false }); expect(stale.diagnostics).toContain("claim_stale");
    expect(noObservation).toMatchObject({ freshnessStatus: "unknown", fresh: false }); expect(noObservation.diagnostics).toContain("freshness_unknown");
  });
});
