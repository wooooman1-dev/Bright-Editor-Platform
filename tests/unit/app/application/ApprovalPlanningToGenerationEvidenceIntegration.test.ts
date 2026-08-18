import { describe, expect, it } from "vitest";

import type { AIProvider, AIResponse } from "../../../../core/ai";
import { ApprovalSourcePreflightError, runApprovalSourcePreflight } from "../../../../core/ai/ApprovalSourcePreflight";
import { requireApprovalGenerationEvidence } from "../../../../core/ai/VerificationGenerationBundle";
import {
  evaluateApprovalSourceRelevance,
  resolveApprovalPolicySnapshot,
  type ApprovalSourcePage,
} from "../../../../core/approval";
import {
  createContentOpportunityCandidate,
  type ConfirmedContentOpportunity,
} from "../../../../core/content";
import { InMemoryPersistenceStore } from "../../../../core/data";
import {
  attachApprovalEvidenceContracts,
  createManualPlanningResult,
} from "../../../../app/application/ContentPlanningStrategy";
import { OpportunityEvidenceService } from "../../../../app/application/data-sources/OpportunityEvidenceService";
import { mergeUserDataSnapshot } from "../../../../app/application/persistence/mergeUserDataSnapshot";
import {
  completeContentPlanning,
  createContentFromPlan,
  createProject,
  createWorkspace,
  emptyUserData,
  startContentPlanning,
  type ContentPlanningResult,
  type UserData,
} from "../../../../app/user-flow/user-data";
import {
  DurableDataSourceConnectionRepository,
  DurableOpportunityEvidenceRepository,
  DurableProjectDataSourceReferenceRepository,
} from "../../../../app/application/data-sources/DataSourceRepositories";

const snapshot = resolveApprovalPolicySnapshot(
  "adsense_approval",
  "wordpress_life_economy_v1",
)!;
const projectId = "project-production-path";
const workspaceId = "workspace-production-path";
const contentId = "content-production-path";
const sourceUrl = "https://www.gov.kr/portal/service/serviceInfo/production-path";
const sourceTitle = "정부 지원금 신청 자격과 지원 금액 공식 안내";
const topic = "정부 지원금 신청 자격과 지원 금액";
const amountExcerpt = "지원 금액은 100만원이며 신청 자격을 충족한 대상에게 지급됩니다.";
const unrelatedExcerpt = "공공기관 조직 현황과 회계 공시 자료를 안내합니다.";

type Scenario = "valid" | "unrelated" | "incomplete";

class FixtureProvider implements AIProvider {
  readonly requests: Array<{ metadata?: Readonly<Record<string, string>> }> = [];

  constructor(private readonly response: AIResponse) {}

  async generate(request: { metadata?: Readonly<Record<string, string>> }): Promise<AIResponse> {
    this.requests.push(request);
    return this.response;
  }
}

function baseData(): UserData {
  return createProject(createWorkspace(emptyUserData, "Production Path Workspace", workspaceId), {
    id: projectId,
    name: "Production Path Project",
    brandIdFactory: () => "brand-production-path",
    now: "2026-08-08T00:00:00.000Z",
  });
}

function planningWithStructuredCoverage(): ContentPlanningResult {
  const planning = createManualPlanningResult(topic, {
    projectId,
    selectionMode: "userSpecified",
  });
  const candidate = planning.opportunityCandidates![0]!;
  const structured = createContentOpportunityCandidate({
    ...candidate,
    expectedCoverage: Object.freeze([
      "지원 대상: 신청 자격",
      "지원 금액: 100만원",
    ]),
  });
  return Object.freeze({
    ...planning,
    opportunityCandidates: Object.freeze([structured]),
  });
}

function productionOpportunity(): Readonly<{
  plan: ContentPlanningResult;
  confirmed: ConfirmedContentOpportunity;
  contractId: string;
}> {
  const attached = attachApprovalEvidenceContracts(
    planningWithStructuredCoverage(),
    snapshot,
  );
  const planned = attached.opportunityCandidates![0]!;
  expect(planned.requiredEvidenceContract).toBeDefined();
  const contractId = planned.requiredEvidenceContract!.contractId;

  const store = new InMemoryPersistenceStore();
  const service = new OpportunityEvidenceService(
    new DurableDataSourceConnectionRepository(store),
    new DurableProjectDataSourceReferenceRepository(store),
    new DurableOpportunityEvidenceRepository(store),
  );
  const classifiedCandidate = service.classifyCandidates(
    [planned],
    [],
    baseData(),
    baseData().projects[0]!,
  ).candidates[0]!;
  expect(classifiedCandidate.requiredEvidenceContract?.contractId).toBe(contractId);

  const classifiedPlan = Object.freeze({
    ...attached,
    opportunityCandidates: Object.freeze([classifiedCandidate]),
  });
  const started = startContentPlanning(baseData(), {
    id: contentId,
    projectId,
    request: topic,
    selectionMode: "userSpecified",
    operationId: "planning-production-path",
    now: "2026-08-08T00:01:00.000Z",
  });
  const completed = completeContentPlanning(started, {
    workspaceId,
    projectId,
    contentId,
    operationId: "planning-production-path",
    plan: classifiedPlan,
    now: "2026-08-08T00:02:00.000Z",
  });
  const restored = mergeUserDataSnapshot(
    undefined,
    JSON.parse(JSON.stringify(completed)),
  );
  const restoredPlan = restored.contents[0]!.planning!;
  const restoredCandidate = restoredPlan.opportunityCandidates![0]!;
  expect(restoredCandidate.requiredEvidenceContract?.contractId).toBe(contractId);

  const confirmedData = createContentFromPlan(restored, {
    id: contentId,
    projectId,
    naturalLanguageRequest: topic,
    plan: restoredPlan,
    opportunity: restoredCandidate,
    selectedPublishingAccountIds: [],
    now: "2026-08-08T00:03:00.000Z",
  });
  const confirmed = confirmedData.contents[0]!.opportunity!;
  expect(confirmed.requiredEvidenceContract?.contractId).toBe(contractId);

  return { plan: restoredPlan, confirmed, contractId };
}

function pageFor(scenario: Scenario): ApprovalSourcePage {
  const relevant = scenario !== "unrelated";
  const excerpt = relevant ? amountExcerpt : unrelatedExcerpt;
  return Object.freeze({
    requestedUrl: sourceUrl,
    finalUrl: sourceUrl,
    status: 200,
    contentType: "text/html; charset=utf-8",
    title: relevant ? sourceTitle : "공식 공시 자료 안내",
    publisher: "gov.kr",
    text: `${excerpt} ${excerpt} ${excerpt} ${excerpt} ${excerpt} ${excerpt}`,
    documentFormat: "html",
    extractionStatus: "extracted",
    contentLength: 512,
  });
}

function responseFor(scenario: Scenario): AIResponse {
  const claims = scenario === "incomplete"
    ? [{ field: "amount", value: "100만원", evidenceExcerpt: amountExcerpt }]
    : [
      { field: "eligibility", value: "신청 자격", evidenceExcerpt: amountExcerpt },
      { field: "amount", value: "100만원", evidenceExcerpt: amountExcerpt },
    ];
  const canonicalClaims = claims.map((claim) => ({ claimId: claim.field, ...claim }));
  const excerpt = scenario === "unrelated" ? unrelatedExcerpt : amountExcerpt;
  return {
    content: JSON.stringify({
      sources: [{
        url: sourceUrl,
        title: scenario === "unrelated" ? "공식 공시 자료 안내" : sourceTitle,
        evidenceExcerpt: excerpt,
        claims: canonicalClaims,
      }],
    }),
    model: "fixture",
    diagnostics: {
      responseId: "preflight-response-fixture",
      webSearchCalls: 1,
      webSources: [{ url: sourceUrl, title: "Official fixture", provenance: "search_candidate" }],
    },
  };
}

function fetcherFor(scenario: Scenario): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  const page = pageFor(scenario);
  return async () => new Response(
    `<html><head><title>${page.title}</title></head><body>${page.text}</body></html>`,
    { status: page.status, headers: { "content-type": page.contentType } },
  );
}

async function runScenario(scenario: Scenario) {
  const pipeline = productionOpportunity();
  const provider = new FixtureProvider(responseFor(scenario));
  const manuscriptProvider = new FixtureProvider({ content: "synthetic manuscript", model: "fixture" });
  const page = pageFor(scenario);
  const relevance = evaluateApprovalSourceRelevance({
    profileId: snapshot.profileId,
    opportunity: pipeline.confirmed,
    page,
  });

  try {
    const preflight = await runApprovalSourcePreflight({
      provider,
      snapshot,
      opportunity: pipeline.confirmed,
      platform: "wordpress",
      contentType: "article",
      fetcher: fetcherFor(scenario),
    });
    const gate = requireApprovalGenerationEvidence({
      preflight,
      contract: pipeline.confirmed.requiredEvidenceContract,
    });
    await manuscriptProvider.generate({ metadata: { task: "content-generation" } });
    return { pipeline, provider, manuscriptProvider, relevance, preflight, gate };
  } catch (error) {
    return { pipeline, provider, manuscriptProvider, relevance, error };
  }
}

describe("Planning to Generation Evidence production path", () => {
  it("keeps one contract through Planning, classification, persistence, Preflight, coverage, and Gate", async () => {
    const result = await runScenario("valid");
    expect(result.relevance.status).toBe("passed");
    expect(result.provider.requests).toHaveLength(1);
    expect(result.provider.requests[0]?.metadata?.task).toBe("approval-source-preflight");
    expect(result.error).toBeUndefined();
    expect(result.preflight?.coverage.status).toBe("covered");
    expect(result.gate).toBeDefined();
    expect(result.manuscriptProvider.requests).toHaveLength(1);
    expect(result.manuscriptProvider.requests[0]?.metadata?.task).toBe("content-generation");
  });

  it("rejects an official but unrelated source before coverage and manuscript entry", async () => {
    const result = await runScenario("unrelated");
    expect(result.relevance.status).toBe("rejected");
    expect(result.error).toBeInstanceOf(ApprovalSourcePreflightError);
    expect(result.error).toMatchObject({
      diagnostic: {
        contractId: result.pipeline.contractId,
        canonicalSourceUrl: sourceUrl,
        evidenceExcerpt: unrelatedExcerpt,
        rejectionStage: "relevance",
        rejectionCode: "source_topic_relevance_unverified",
        preflightResponseId: "preflight-response-fixture",
        webSearchCalls: 1,
        webSourceCount: 1,
      },
    });
    expect(result.provider.requests).toHaveLength(1);
    expect(result.gate).toBeUndefined();
    expect(result.manuscriptProvider.requests).toHaveLength(0);
  });

  it("blocks incomplete Claim coverage and never enters manuscript Generation", async () => {
    const result = await runScenario("incomplete");
    expect(result.relevance.status).toBe("passed");
    expect(result.error).toBeInstanceOf(ApprovalSourcePreflightError);
    expect(result.error).toMatchObject({
      diagnostic: {
        contractId: result.pipeline.contractId,
        requiredClaimId: "eligibility",
        rejectionStage: "coverage",
        rejectionCode: "coverage_incomplete",
      },
    });
    expect(result.provider.requests).toHaveLength(1);
    expect(result.gate).toBeUndefined();
    expect(result.manuscriptProvider.requests).toHaveLength(0);
  });
});
