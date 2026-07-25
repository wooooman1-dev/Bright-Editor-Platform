import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  createContentFromPlan,
  startContentGeneration,
  type ContentPlanningResult,
  type UserData,
} from "../../app/user-flow/user-data";
import { assertConfirmedContentOpportunity, createContentOpportunityCandidate } from "../../core/content";
import { mergeUserDataSnapshot } from "../../app/application/persistence/mergeUserDataSnapshot";

const enabled = process.env.RUN_DYNAMIC_CONTENT_FINAL === "1";
const debugEnabled = process.env.RUN_DYNAMIC_CONTENT_DEBUG === "1";
const baseUrl = process.env.BRIGHT_STUDIO_URL ?? "http://localhost:3000";
const workspaceId = "workspace-mroi1bjs-4r6ulf";
const projectId = "project-mroi30xh-spr2on";
const connectionId = "3ff2f014-66a1-4100-a6ff-59575c3ee627";
const results: LiveMeasurement[] = [];

const cases = [
  {
    depth: "deep",
    request: "건강정보 프로젝트에서 갑상선 기능검사 결과표를 처음 받은 일반 독자가 TSH와 유리 T4의 의미, 두 항목을 함께 보는 이유, 대표적인 결과 조합과 해석 한계, 검사기관 기준 차이, 약물·임신·기저질환 등 영향 요인, 재검 또는 의료진 상담을 준비할 조건과 다음 행동을 이해하도록 심층 가이드를 기획해줘. 근거 없는 정상 수치나 진단 기준은 만들지 말아줘.",
  },
  {
    depth: "standard",
    request: "건강정보 프로젝트에서 매일 물 마신 시간과 산책 여부를 건강 기록 노트에 적기 시작하는 간단 사용법 체크리스트를 기획해줘. 짧고 바로 실행할 수 있는 답변으로 구성해줘.",
  },
] as const;

describe.runIf(enabled)("live dynamic content verification against the current Bright Studio state", () => {
  for (const liveCase of cases) {
    it(`${liveCase.depth}: one generation and one quality review`, async () => {
      const initial = await getStudioData();
      const workspace = initial.workspace?.id === workspaceId ? initial.workspace : undefined;
      const project = initial.projects.find((item) => item.id === projectId && item.workspaceId === workspaceId);
      if (!workspace || !project) throw new Error("The required Bright Studio Workspace/Project was not found.");
      if (!(project.selectedPublishingAccountIds ?? []).includes(connectionId)) {
        throw new Error("The required existing Tistory Connection is not selected by the Project.");
      }

      const suffix = `${Date.now().toString(36)}-${liveCase.depth}`;
      const contentId = `live-final-${suffix}`;
      const planningOperationId = `planning-${suffix}`;
      const generationOperationId = `generation-${Date.now().toString(36)}-${liveCase.depth}`;
      const selectionMode = "automatic" as const;

      const started = await requestJson<{ data?: UserData; error?: string }>("/api/studio", {
          method: "POST",
          body: {
            action: "start-planning",
            input: {
              naturalLanguageRequest: liveCase.request,
              workspaceId: workspace.id,
              projectId: project.id,
              contentId,
              operationId: planningOperationId,
              selectionMode,
            },
          },
      });
      expect(started.status, started.payload.error).toBe(200);

      const planned = await requestJson<{ plan?: ContentPlanningResult; data?: UserData; error?: string }>("/api/studio", {
          method: "POST",
          body: {
            action: "plan",
            input: {
              naturalLanguageRequest: liveCase.request,
              workspaceId: workspace.id,
              projectId: project.id,
              contentId,
              operationId: planningOperationId,
              selectionMode,
            },
          },
      });
      expect(planned.status, planned.payload.error).toBe(200);
      if (!planned.payload.plan || !planned.payload.data) throw new Error(planned.payload.error ?? "Planning did not return its persisted state.");
      const persistedContent = planned.payload.data.contents.find((item) => item.id === contentId);
      const plan = persistedContent?.planning ?? planned.payload.plan;
      const plannedData = planned.payload.data;
      const opportunity = plan.opportunityCandidates?.find((item) => liveCase.depth === "deep"
        ? item.qualityTarget.contentDepth === "deep"
        : item.qualityTarget.contentDepth === "standard");
      if (!opportunity) {
        throw new Error(`Planning did not produce a ${liveCase.depth} opportunity: ${JSON.stringify(plan.opportunityCandidates?.map((item) => ({
          title: item.selectedTopic,
          contentDepth: item.qualityTarget.contentDepth,
        })))}`);
      }

      const confirmed = createContentFromPlan(plannedData, {
        id: contentId,
        projectId: project.id,
        naturalLanguageRequest: liveCase.request,
        plan,
        opportunity,
        selectedPublishingAccountIds: project.selectedPublishingAccountIds ?? [],
        now: new Date().toISOString(),
      });
      const confirmedSave = await requestJson<{ data?: UserData; error?: string }>("/api/studio", {
        method: "PUT",
        body: confirmed,
      });
      expect(confirmedSave.status, confirmedSave.payload.error).toBe(200);
      if (!confirmedSave.payload.data) throw new Error("Confirmed Content state was not persisted.");

      const generating = startContentGeneration(confirmedSave.payload.data, {
        workspaceId: workspace.id,
        projectId: project.id,
        contentId,
        operationId: generationOperationId,
        now: new Date().toISOString(),
      });
      const generatingSave = await requestJson<{ data?: UserData; error?: string }>("/api/studio", {
        method: "PUT",
        body: generating,
      });
      expect(generatingSave.status, generatingSave.payload.error).toBe(200);

      let generationRequests = 0;
      generationRequests += 1;
      const generationRequestStartedAt = new Date();
      const generated = await requestJson<GenerationResponse>("/api/studio", {
        method: "POST",
        body: {
          action: "generate",
          input: {
            contentId,
            contentType: opportunity.contentType,
            opportunityId: opportunity.opportunityId,
            opportunityVersion: opportunity.version,
            opportunityFingerprint: opportunity.fingerprint,
            primaryKeyword: opportunity.primaryKeyword,
            topic: opportunity.selectedTopic,
            searchIntent: opportunity.searchIntent,
            secondaryKeywords: opportunity.secondaryKeywords,
            keywords: [opportunity.primaryKeyword, ...opportunity.secondaryKeywords],
            platform: plan.recommendedPlatforms[0] ?? "canonical",
            workspaceId: workspace.id,
            projectId: project.id,
            operationId: generationOperationId,
            editorialContext: JSON.stringify({
              request: liveCase.request,
              opportunityId: opportunity.opportunityId,
            }),
          },
        },
        timeoutMs: 900_000,
      });
      const generationRequestCompletedAt = new Date();

      const stored = generated.payload.data?.contents.find((item) => item.id === contentId)
        ?? (await getStudioData()).contents.find((item) => item.id === contentId);
      if (!stored) throw new Error("Generated Content was not found in the persisted state.");
      const generationDiagnostic = stored.generationDiagnostic;
      const reviewDiagnostic = stored.reviewDiagnostic;
      const quality = generated.payload.quality ?? stored.quality;
      const measurement: LiveMeasurement = {
        depth: liveCase.depth,
        contentId,
        planning: {
          selectedTopic: opportunity.selectedTopic,
          primaryKeyword: opportunity.primaryKeyword,
          contentDepth: opportunity.qualityTarget.contentDepth,
          providerSearchIntent: opportunity.providerSearchIntent,
          canonicalSearchIntent: opportunity.searchIntent,
          coreQuestions: opportunity.qualityTarget.coreQuestions,
          decisionCriteria: opportunity.qualityTarget.decisionCriteria,
          actionableNextSteps: opportunity.qualityTarget.actionableNextSteps,
          requiredContentElements: opportunity.qualityTarget.requiredContentElements,
          topicComplexity: opportunity.qualityTarget.topicComplexity,
          readerProblem: opportunity.qualityTarget.readerProblem,
        },
        calls: {
          studioGenerateRequests: generationRequests,
          planningProviderCalls: 1,
          generationProviderCalls: generated.payload.callCounts?.generation ?? 1,
          reviewProviderCalls: generated.payload.callCounts?.review ?? 0,
        },
        requestTiming: {
          startedAt: generationRequestStartedAt.toISOString(),
          completedAt: generationRequestCompletedAt.toISOString(),
          elapsedMs: generationRequestCompletedAt.getTime() - generationRequestStartedAt.getTime(),
        },
        executionDiagnostics: generated.payload.executionDiagnostics,
        generation: diagnosticMeasurement(generationDiagnostic),
        review: diagnosticMeasurement(reviewDiagnostic),
        qualityBefore: generated.payload.initialQuality ? qualityMeasurement(generated.payload.initialQuality) : undefined,
        qualityAfter: quality ? qualityMeasurement(quality) : undefined,
        reviewAttempt: generated.payload.attemptHistory?.[0],
        reachedTarget: generated.payload.reachedTarget,
        responseStatus: generated.status,
        responseError: generated.payload.error ?? generated.payload.aiReviewError,
        finalContent: {
          status: stored.status,
          workflowStatus: stored.planningWorkflow?.status,
          failedStep: stored.planningWorkflow?.failedStep,
          retryFrom: stored.planningWorkflow?.retryFrom,
          generationError: stored.generationError,
          reviewError: stored.reviewError,
          hasDocument: Boolean(stored.document),
          ready: stored.status === "ready" && stored.quality?.approved === true && stored.quality.approvalType === "standard",
          editorEligibleFromSavedState: Boolean(stored.document) && stored.status === "ready" && stored.quality?.approved === true && stored.quality.approvalType === "standard",
          title: stored.title,
        },
      };
      results.push(measurement);
      await persistResults();
      console.log(`LIVE_DYNAMIC_RESULT ${JSON.stringify(measurement)}`);

      expect(generationRequests).toBe(1);
      expect(generated.payload.callCounts).toEqual({ generation: 1, review: 1 });
      expect(generated.payload.attemptHistory).toHaveLength(1);
      expect(generated.payload.qualityHistory).toHaveLength(2);
      expect(generationDiagnostic?.actualSectionCount).toBeGreaterThan(0);
      expect(reviewDiagnostic?.violations).toHaveLength(0);
      expect(generated.payload.reachedTarget, generated.payload.error).toBe(true);
      expect(quality).toMatchObject({ approved: true, approvalType: "standard" });
      expect(stored).toMatchObject({
        status: "ready",
        planningWorkflow: { status: "generated" },
      });
      expect(stored.document).toBeDefined();
    }, 1_000_000);
  }
});

describe.runIf(debugEnabled)("non-mutating live confirmation diagnostic", () => {
  it("checks the persisted Planning candidate fingerprint and confirmed binding", async () => {
    const data = await getStudioData();
    console.log(`LIVE_STALE_OPPORTUNITIES ${JSON.stringify(data.contents.flatMap((item) => {
      if (!item.opportunity) return [];
      const recomputed = createContentOpportunityCandidate(item.opportunity);
      return recomputed.fingerprint === item.opportunity.fingerprint ? [] : [{
        contentId: item.id,
        status: item.status,
        workflowStatus: item.planningWorkflow?.status,
        storedFingerprint: item.opportunity.fingerprint,
        recomputedFingerprint: recomputed.fingerprint,
      }];
    }))}`);
    const content = [...data.contents].reverse().find((item) => item.id.startsWith("live-dynamic-") && item.planning?.opportunityCandidates?.length);
    if (!content?.planning || !content.planningWorkflow || !data.workspace) throw new Error("A persisted live Planning candidate was not found.");
    const candidate = content.planning.opportunityCandidates?.find((item) => item.qualityTarget.contentDepth === (content.id.endsWith("-quick") ? "quick" : "deep"))
      ?? content.planning.opportunityCandidates?.[0];
    if (!candidate) throw new Error("A persisted Planning candidate was not found.");
    const confirmed = createContentFromPlan(data, {
      id: content.id,
      projectId: content.projectId,
      naturalLanguageRequest: content.naturalLanguageRequest ?? content.planningWorkflow.request,
      plan: content.planning,
      opportunity: candidate,
      selectedPublishingAccountIds: data.projects.find((item) => item.id === content.projectId)?.selectedPublishingAccountIds ?? [],
      now: new Date().toISOString(),
    }).contents.find((item) => item.id === content.id)!;
    const verified = createContentOpportunityCandidate(confirmed.opportunity!);
    console.log(`LIVE_CONFIRMATION_DEBUG ${JSON.stringify({
      contentId: content.id,
      candidateFingerprint: candidate.fingerprint,
      confirmedFingerprint: confirmed.opportunity?.fingerprint,
      verifiedFingerprint: verified.fingerprint,
      candidateOpportunityId: candidate.opportunityId,
      confirmedOpportunityId: confirmed.opportunity?.opportunityId,
      verifiedOpportunityId: verified.opportunityId,
      contentFields: {
        workspaceId: confirmed.workspaceId,
        projectId: confirmed.projectId,
        contentId: confirmed.id,
        primaryKeyword: confirmed.primaryKeyword,
        selectedTopic: confirmed.opportunity?.selectedTopic,
        searchIntent: confirmed.searchIntent,
        secondaryKeywords: confirmed.relatedKeywords,
      },
    })}`);
    assertConfirmedContentOpportunity(confirmed.opportunity, {
      workspaceId: confirmed.workspaceId ?? "",
      projectId: confirmed.projectId,
      contentId: confirmed.id,
      opportunityId: confirmed.opportunity?.opportunityId,
      opportunityVersion: confirmed.opportunity?.version,
      opportunityFingerprint: confirmed.opportunity?.fingerprint,
      primaryKeyword: confirmed.primaryKeyword,
      selectedTopic: confirmed.opportunity?.selectedTopic,
      searchIntent: confirmed.searchIntent,
      secondaryKeywords: confirmed.relatedKeywords,
    });
    const confirmedSnapshot = createContentFromPlan(data, {
      id: content.id,
      projectId: content.projectId,
      naturalLanguageRequest: content.naturalLanguageRequest ?? content.planningWorkflow.request,
      plan: content.planning,
      opportunity: candidate,
      selectedPublishingAccountIds: data.projects.find((item) => item.id === content.projectId)?.selectedPublishingAccountIds ?? [],
      now: new Date().toISOString(),
    });
    try {
      mergeUserDataSnapshot(data, confirmedSnapshot);
    } catch (error) {
      const afterOpportunity = confirmedSnapshot.contents.find((item) => item.id === content.id)?.opportunity;
      console.log(`LIVE_CONFIRMATION_AFTER_MERGE ${JSON.stringify({
        fingerprint: afterOpportunity?.fingerprint,
        recomputedFingerprint: afterOpportunity ? createContentOpportunityCandidate(afterOpportunity).fingerprint : undefined,
        error: error instanceof Error ? error.message : String(error),
      })}`);
      throw error;
    }
  });
});

async function requestJson<T>(
  path: string,
  options: Readonly<{ method: "POST" | "PUT"; body: unknown; timeoutMs?: number }>,
): Promise<{ status: number; payload: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs ?? 240_000),
  });
  return { status: response.status, payload: await response.json() as T };
}

async function getStudioData(): Promise<UserData> {
  const response = await fetch(`${baseUrl}/api/studio`, { signal: AbortSignal.timeout(30_000) });
  const payload = await response.json() as { data?: UserData; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "Bright Studio state was not available.");
  return payload.data;
}

function diagnosticMeasurement(value: UserData["contents"][number]["generationDiagnostic"] | undefined) {
  if (!value) return undefined;
  return {
    actualTotalProseCharacters: value.actualTotalProseCharacters,
    actualSectionCount: value.actualSectionCount,
    introductionCharacters: value.introductionCharacters,
    conclusionCharacters: value.conclusionCharacters,
    requiredContentElements: value.requiredContentElements,
    repetitionWarnings: value.repetitionWarnings,
    sections: value.sections.map((section) => ({
      heading: section.heading,
      sectionType: section.sectionType,
      proseCharacters: section.proseCharacters,
      listItemCount: section.listItemCount,
      tableCount: section.tableCount,
      informationElementCount: section.informationElementCount,
      expectedGuidance: section.expectedGuidance,
    })),
    warningCodes: value.warningCodes,
    violations: value.violations,
  };
}

function qualityMeasurement(value: NonNullable<GenerationResponse["quality"]>) {
  return {
    overallScore: value.overallScore,
    approved: value.approved,
    approvalType: value.approvalType,
    dimensions: Object.fromEntries(value.dimensions.map((item) => [item.category, item.score])),
    tasks: value.tasks.map((item) => `${item.category}: ${item.message}`),
  };
}

async function persistResults() {
  await mkdir(".bright-studio/benchmarks", { recursive: true });
  await writeFile(
    ".bright-studio/benchmarks/dynamic-content-final-verification.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, results }, null, 2),
    "utf8",
  );
}

type GenerationResponse = Readonly<{
  aiReviewError?: string;
  error?: string;
  reachedTarget?: boolean;
  initialQuality?: QualityResult;
  quality?: QualityResult;
  qualityHistory?: readonly QualityResult[];
  attemptHistory?: readonly Readonly<{
    accepted: boolean;
    phase: string;
    quality: QualityResult;
    rejectionReason?: string;
  }>[];
  data?: UserData;
  callCounts?: Readonly<{ generation: number; review: number }>;
  executionDiagnostics?: unknown;
}>;

type QualityResult = Readonly<{
  overallScore: number;
  approved: boolean;
  approvalType?: string;
  dimensions: readonly Readonly<{ category: string; score: number }>[];
  tasks: readonly Readonly<{ category: string; message: string }>[];
}>;

type LiveMeasurement = Readonly<{
  depth: "deep" | "standard";
  contentId: string;
  planning: unknown;
  calls: unknown;
  requestTiming: unknown;
  executionDiagnostics?: unknown;
  generation: unknown;
  review: unknown;
  qualityBefore?: unknown;
  qualityAfter?: unknown;
  reviewAttempt?: unknown;
  reachedTarget?: boolean;
  responseStatus: number;
  responseError?: string;
  finalContent: unknown;
}>;
