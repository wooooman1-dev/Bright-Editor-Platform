import { describe, expect, it } from "vitest";

import {
  createContentFromPlan,
  startContentGeneration,
  type ContentPlanningResult,
  type UserData,
} from "../../app/user-flow/user-data";

const enabled = process.env.RUN_BRIGHT_FINANCE_SOURCE_LIVE === "1";
const generationEnabled = process.env.RUN_BRIGHT_FINANCE_SOURCE_GENERATION === "1";
const baseUrl = process.env.BRIGHT_STUDIO_URL ?? "http://localhost:3000";
const projectName = process.env.BRIGHT_FINANCE_PROJECT_NAME?.trim() || "밝은재테크";
const request = process.env.BRIGHT_FINANCE_SOURCE_REQUEST?.trim()
  || "2026년 예금자보호 한도와 금융회사별 합산 확인 방법을 설명하는 글을 기획해줘. 현재 기준과 적용 범위처럼 바뀔 수 있는 사실은 공식 출처로 검증하고, 확인되지 않은 금액이나 날짜는 쓰지 마.";

type GenerationResponse = Readonly<{
  data?: UserData;
  error?: string;
  code?: string;
  approvalSourcePreflightDiagnostic?: Readonly<Record<string, unknown>>;
  aiReviewError?: string;
  callCounts?: Readonly<{ generation: number; review: number }>;
  quality?: UserData["contents"][number]["quality"];
  reachedTarget?: boolean;
}>;

describe.runIf(enabled)("Bright Finance live Source Preflight verification", () => {
  it("uses a fresh planning opportunity and verifies one Generation + one Quality Review", async () => {
    const initial = await getStudioData();
    const matchingProjects = initial.projects.filter((project) =>
      project.name.trim() === projectName,
    );
    if (matchingProjects.length !== 1) {
      throw new Error(`Expected exactly one ${projectName} Project, found ${matchingProjects.length}.`);
    }
    const project = matchingProjects[0]!;
    const workspace = initial.workspace;
    if (!workspace || workspace.id !== project.workspaceId) {
      throw new Error("The Bright Finance Project does not belong to the active Workspace.");
    }

    const suffix = Date.now().toString(36);
    const contentId = `live-bright-finance-source-${suffix}`;
    const planningOperationId = `planning-bright-finance-source-${suffix}`;
    const selectionMode = "userSpecified" as const;

    const started = await requestJson<{ data?: UserData; error?: string }>("/api/studio", {
      method: "POST",
      body: {
        action: "start-planning",
        input: {
          naturalLanguageRequest: request,
          workspaceId: workspace.id,
          projectId: project.id,
          contentId,
          operationId: planningOperationId,
          selectionMode,
        },
      },
    });
    expect(started.status, started.payload.error).toBe(200);

    const planned = await requestJson<{
      plan?: ContentPlanningResult;
      data?: UserData;
      error?: string;
    }>("/api/studio", {
      method: "POST",
      body: {
        action: "plan",
        input: {
          naturalLanguageRequest: request,
          workspaceId: workspace.id,
          projectId: project.id,
          contentId,
          operationId: planningOperationId,
          selectionMode,
        },
      },
      timeoutMs: 900_000,
    });
    expect(planned.status, planned.payload.error).toBe(200);
    if (!planned.payload.data || !planned.payload.plan) {
      throw new Error(planned.payload.error ?? "Planning did not return persisted state.");
    }

    const persistedContent = planned.payload.data.contents.find((item) => item.id === contentId);
    const plan = persistedContent?.planning ?? planned.payload.plan;
    const opportunity = plan.opportunityCandidates?.[0];
    if (!opportunity) throw new Error("Planning did not return a Content Opportunity.");

    console.log(`BRIGHT_FINANCE_SOURCE_PLANNING ${JSON.stringify({
      contentId,
      projectId: project.id,
      selectedTopic: opportunity.selectedTopic,
      primaryKeyword: opportunity.primaryKeyword,
      verificationMode: opportunity.verificationPlan?.mode,
      claimCount: opportunity.verificationPlan?.claims.length ?? 0,
      claims: opportunity.verificationPlan?.claims.map((claim) => ({
        claimId: claim.claimId,
        field: claim.field,
        kind: claim.kind,
        statement: claim.statement,
        required: claim.required,
        temporalRequirement: claim.temporalRequirement,
      })) ?? [],
      generationEnabled,
    })}`);

    if (!generationEnabled) return;

    const confirmed = createContentFromPlan(planned.payload.data, {
      id: contentId,
      projectId: project.id,
      naturalLanguageRequest: request,
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
    if (!confirmedSave.payload.data) throw new Error("Confirmed Content was not persisted.");

    const generationOperationId = `generation-bright-finance-source-${Date.now().toString(36)}`;
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
          platform: "wordpress",
          workspaceId: workspace.id,
          projectId: project.id,
          operationId: generationOperationId,
          editorialContext: JSON.stringify({
            request,
            opportunityId: opportunity.opportunityId,
            liveVerification: "bright-finance-source",
          }),
        },
      },
      timeoutMs: 900_000,
    });

    const latest = generated.payload.data ?? await getStudioData();
    const stored = latest.contents.find((item) => item.id === contentId);
    const approvalEvidence = stored?.document?.metadata?.approvalEvidence;
    const sourceSummary = approvalEvidence?.sources.map((source) => ({
      sourceId: source.sourceId,
      canonicalUrl: source.canonicalUrl ?? source.url,
      title: source.title,
      publisher: source.publisher,
      provenance: source.provenance,
      verified: source.verified,
      verificationStatus: source.verificationStatus,
      factsCount: source.facts.length,
    })) ?? [];

    console.log(`BRIGHT_FINANCE_SOURCE_GENERATION ${JSON.stringify({
      contentId,
      responseStatus: generated.status,
      responseError: generated.payload.error,
      aiReviewError: generated.payload.aiReviewError,
      callCounts: generated.payload.callCounts,
      reachedTarget: generated.payload.reachedTarget,
      quality: generated.payload.quality,
      approvalEvidence: {
        status: approvalEvidence?.status,
        coverageStatus: approvalEvidence?.coverageStatus,
        sourceCount: sourceSummary.length,
        sources: sourceSummary,
      },
      publishingAttempted: false,
      approvalSourcePreflightDiagnostic: generated.payload.approvalSourcePreflightDiagnostic,
    })}`);

    expect(generated.status, generated.payload.error ?? generated.payload.aiReviewError).toBe(200);
    expect(generated.payload.callCounts).toEqual({ generation: 1, review: 1 });
    expect(stored?.document).toBeDefined();
    expect(approvalEvidence?.sources.length ?? 0).toBeGreaterThan(0);
    expect(approvalEvidence?.sources.every((source) =>
      (source.canonicalUrl ?? source.url).startsWith("https://")
      && source.verified === true
      && source.provenance === "system_verified"
      && source.facts.length > 0,
    )).toBe(true);
  }, 1_000_000);
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
  const response = await fetch(`${baseUrl}/api/studio`, {
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json() as { data?: UserData; error?: string };
  if (!response.ok || !payload.data) {
    throw new Error(payload.error ?? "Bright Studio state was not available.");
  }
  return payload.data;
}
