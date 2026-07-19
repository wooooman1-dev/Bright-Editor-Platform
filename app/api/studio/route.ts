import { NextResponse } from "next/server";

import { studioStore } from "../../application/studio-store";
import { mergeServerMutationSnapshot, mergeUserDataSnapshot } from "../../application/persistence/mergeUserDataSnapshot";
import { AIWorkflow } from "../../../core/ai";
import { contentRevisionId, evaluateQualityImprovement, qualityImprovementRejectionMessage, QualityEngine } from "../../../core/quality";
import { EditorialGenerationStrategy } from "../../application/EditorialGenerationStrategy";
import { OpenAIProvider } from "../../application/OpenAIProvider";
import { EditorialQualityPipeline } from "../../application/EditorialQualityPipeline";
import { ContentPlanningStrategy, createManualPlanningResult } from "../../application/ContentPlanningStrategy";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { applyContentOpportunityPolicy, contentOpportunityKeywords, detectContentOpportunitySelectionMode, ensureSeoKeywordPlacement, placeRecommendedPosts, rankRelatedPosts, restoreProtectedImageAssets, restoreVerifiedEditorialLinks, type ConfirmedContentOpportunity, type ContentDocument } from "../../../core/content";
import { ContentDeletionService } from "../../application/content/ContentDeletionService";
import { applyCanonicalDocument, completeContentGeneration, completeContentPlanning, failContentPlanning, resolveProjectStrategy, startContentPlanning, updateContent, type UserData } from "../../user-flow/user-data";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { connectionRepository, targetRepository } from "../../application/connections/connection-runtime";
import { TistoryPostCatalogApplicationService } from "../../application/publishing/TistoryPostCatalogApplicationService";
import { resolveConfirmedGenerationKeywords, resolveConfirmedGenerationOpportunity } from "../../application/ConfirmedGenerationPolicy";
import { OpportunityEvidenceService } from "../../application/data-sources/OpportunityEvidenceService";
import { dataSourceConnectionRepository, opportunityEvidenceRepository, projectDataSourceReferenceRepository } from "../../application/data-sources/data-source-runtime";

const collection = "application";
const stateId = "user-data";
const opportunityEvidenceService = new OpportunityEvidenceService(dataSourceConnectionRepository, projectDataSourceReferenceRepository, opportunityEvidenceRepository);
type PlanningExecutionResult = Readonly<{ plan: import("../../user-flow/user-data").ContentPlanningResult; data: UserData }>;
const activePlanningOperations = new Map<string, Promise<PlanningExecutionResult>>();

export async function GET() {
  try {
    return NextResponse.json({ data: (await studioStore.get(collection, stateId)) ?? null });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const current = await studioStore.get<UserData>(collection, stateId);
    if (current?.workspace) await opportunityEvidenceService.assertOpportunityEvidenceBindings(current.workspace.id, collectOpportunities(body));
    const data = await studioStore.update<UserData>(collection, stateId, (current) => mergeUserDataSnapshot(current, body));
    return NextResponse.json({ saved: true, data });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

export async function POST(request: Request) {
  let body: { action?: string; input?: Record<string, unknown> } | undefined;
  try {
    body = await request.json() as { action?: string; input?: Record<string, unknown> };
    if (body.action === "start-planning") {
      const workspaceId = required(body.input?.workspaceId);
      const projectId = required(body.input?.projectId);
      const current = await ownedWorkspace(workspaceId);
      ownedProject(current, projectId);
      const data = await studioStore.update<UserData>(collection, stateId, (latest) => startContentPlanning(latest ?? current, {
        id: required(body?.input?.contentId),
        projectId,
        request: required(body?.input?.naturalLanguageRequest),
        selectionMode: body?.input?.selectionMode === "userSpecified" ? "userSpecified" : "automatic",
        operationId: required(body?.input?.operationId),
        now: new Date().toISOString(),
      }));
      return NextResponse.json({ data });
    }
    if (body.action === "plan") {
      return NextResponse.json(await executePlanning(body.input, false));
    }
    if (body.action === "manual-plan") {
      return NextResponse.json(await executePlanning(body.input, true));
    }
    if (body.action === "generate") {
      const input = body.input ?? {};
      const owned = await ownedWorkspace(required(input.workspaceId));
      const projectId = required(input.projectId);
      ownedProject(owned, projectId);
      const contentId = required(input.contentId);
      const existing = owned.contents.find((item) => item.id === contentId && item.workspaceId === owned.workspace!.id && item.projectId === projectId);
      if (!existing) throw new Error("Content does not belong to the requested Project.");
      const generationOperationId = typeof input.operationId === "string" ? input.operationId.trim() : "";
      if (existing.planningWorkflow && (existing.planningWorkflow.status !== "generating" || existing.planningWorkflow.operationId !== generationOperationId)) {
        throw new Error("현재 Content의 생성 operation과 요청이 일치하지 않습니다.");
      }
      const generationContract = resolveConfirmedGenerationOpportunity(existing, {
        workspaceId: owned.workspace!.id,
        projectId,
        contentId,
        opportunityId: input.opportunityId,
        opportunityVersion: input.opportunityVersion,
        opportunityFingerprint: input.opportunityFingerprint,
        primaryKeyword: input.primaryKeyword,
        topic: input.topic,
        searchIntent: input.searchIntent,
        secondaryKeywords: input.secondaryKeywords,
        keywords: input.keywords,
      });
      const { keywords, opportunity } = generationContract;
      const provider = new OpenAIProvider(undefined, generationModel());
      const workflow = new AIWorkflow(provider, new EditorialGenerationStrategy());
      const result = await workflow.generate({
        contentId,
        contentType: opportunity.contentType as never,
        contentOpportunity: opportunity,
        editorialContext: JSON.stringify({ projectStrategy: resolveProjectStrategy(ownedProject(owned, projectId)) }),
        keywords,
        platform: required(input.platform) as never,
        projectId,
      });
      const initialDocument = applyContentPolicy(await placeAvailableTistoryPosts(owned, existing, result.document), existing);
      const context = qualityContext(existing, initialDocument);
      const initialQuality = new QualityEngine().review(initialDocument, context);
      try {
        const pipeline = await new EditorialQualityPipeline(new OpenAIProvider(undefined, reviewModel(), reviewTimeoutMs())).run({
          document: initialDocument,
          finalReviewInstruction: (document, quality) => finalEditInstruction(document, quality, opportunity),
          parseInput: { contentId, contentType: opportunity.contentType as never, contentOpportunity: opportunity, keywords, platform: required(input.platform) as never, projectId },
          placeDocument: async (document) => applyContentPolicy(await placeAvailableTistoryPosts(owned, existing, document), existing),
          qualityContext: context,
          requiredInformation: [...opportunity.expectedCoverage, ...editorialRequirements(typeof input.editorialContext === "string" ? input.editorialContext : undefined)],
        });
        const { document, quality } = pipeline;
        let persisted = applyCanonicalDocument(owned, existing.id, document, "ai_revision", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, { quality, status: quality.approved ? "ready" : "in_review", generationError: opportunityFailure(quality) });
        if (existing.planningWorkflow) persisted = completeContentGeneration(persisted, { workspaceId: owned.workspace!.id, projectId, contentId, operationId: generationOperationId, now: quality.reviewedAt });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        const saved = await persistServerMutation(owned, next);
        return NextResponse.json({ document, initialQuality, quality, finalReviewQuality: pipeline.finalReviewQuality, qualityHistory: pipeline.qualityHistory, attemptHistory: pipeline.attemptHistory, automaticImprovementCount: pipeline.automaticImprovementCount, reachedTarget: pipeline.reachedTarget, finalRevisionId: contentRevisionId(document), data: saved });
      } catch (error) {
        const quality = new QualityEngine().review(initialDocument, context);
        let persisted = applyCanonicalDocument(owned, existing.id, initialDocument, "generation", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, { quality, status: "in_review", generationError: `자동 Final Review 실패: ${message(error)}` });
        if (existing.planningWorkflow) persisted = completeContentGeneration(persisted, { workspaceId: owned.workspace!.id, projectId, contentId, operationId: generationOperationId, now: quality.reviewedAt });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        const saved = await persistServerMutation(owned, next);
        return NextResponse.json({ aiReviewError: message(error), document: initialDocument, initialQuality, quality, data: saved });
      }
    }
    if (body.action === "final-review") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      ownedProject(data, content.projectId);
      const keywords = content.opportunity ? contentOpportunityKeywords(content.opportunity) : resolveConfirmedGenerationKeywords(content, [content.primaryKeyword]);
      const initialDocument = await placeAvailableTistoryPosts(data, content, content.document);
      const initialQuality = new QualityEngine().review(initialDocument, qualityContext(content));
      const finalEdit = await new OpenAIProvider(undefined, undefined, reviewTimeoutMs()).generate({ instruction: finalEditInstruction(initialDocument, initialQuality, content.opportunity), metadata: { task: "quality-final-edit" } });
      let document = restoreProtectedImageAssets(content.document, new EditorialGenerationStrategy().parse(finalEdit.content, { contentId, contentType: (content.contentType ?? "article") as never, ...(content.opportunity ? { contentOpportunity: content.opportunity } : {}), keywords, platform: (content.platform ?? "tistory") as never, projectId: content.projectId }));
      document = applyContentPolicy(await placeAvailableTistoryPosts(data, content, document), content);
      const reviewedAt = new Date().toISOString();
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document), reviewedAt });
      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", reviewedAt);
      next = updateContent(next, contentId, { quality, status: quality.approved ? "ready" : "in_review", generationError: opportunityFailure(quality), updatedAt: reviewedAt });
      next = { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] };
      const saved = await persistServerMutation(data, next);
      return NextResponse.json({ document, initialQuality, quality, revisionId: contentRevisionId(document), data: saved });
    }
    if (body.action === "revise") {
      const input = body.input ?? {};
      const data = await ownedWorkspace(required(input.workspaceId));
      const projectId = required(input.projectId);
      ownedProject(data, projectId);
      const current = data.contents.find((item) => item.id === required(input.contentId) && item.workspaceId === data.workspace!.id && item.projectId === projectId);
      if (!current?.document) throw new Error("Content does not belong to the requested Project.");
      const keywords = current.opportunity ? contentOpportunityKeywords(current.opportunity) : resolveConfirmedGenerationKeywords(current, [input.primaryKeyword]);
      const provider = new OpenAIProvider();
      const response = await provider.generate({
        instruction: `Revise the canonical ContentDocument according to the user's instruction. The confirmed Content Opportunity is immutable: ${JSON.stringify(current.opportunity ?? { primaryKeyword: current.primaryKeyword, searchIntent: current.searchIntent })}. Keep the selected topic, primary keyword, search intent, secondary keywords, and expected coverage aligned as one article; never satisfy this by attaching a keyword to an unrelated title. Preserve unaffected blocks and every attached image source, assetId, ALT, prompt, purpose, and media field. For source-empty recommendations, keep each prompt grounded in its nearest H2 and make image scenes differ in at least two of subject, action, background, composition, viewpoint, or information expression. Never publish or invoke browser automation. Return the complete revised document as JSON only in {"title":"...","blocks":[...]} form.\nUser instruction: ${required(input.instruction)}\nCurrent document: ${JSON.stringify(input.document)}`,
        metadata: { task: "content-revision" },
      });
      const parsed = new EditorialGenerationStrategy().parse(response.content, {
        contentId: required(input.contentId), contentType: (typeof input.contentType === "string" ? input.contentType : "article") as never,
        ...(current.opportunity ? { contentOpportunity: current.opportunity } : {}), keywords,
        platform: "editor" as never, projectId,
      });
      const document = applyContentPolicy(restoreProtectedImageAssets(current.document, parsed), current, true);
      return NextResponse.json({ document });
    }
    if (body.action === "improve-quality") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      const keywords = content.opportunity ? contentOpportunityKeywords(content.opportunity) : resolveConfirmedGenerationKeywords(content, [content.primaryKeyword]);
      const currentQuality = new QualityEngine().review(content.document, qualityContext(content));
      if (!currentQuality.tasks.length) throw new Error("현재 원고에는 AI로 개선할 품질 항목이 없습니다.");
      const response = await new OpenAIProvider().generate({
        instruction: `Improve this complete canonical ContentDocument using only the Quality Review tasks below. Preserve the immutable Content Opportunity as one plan: ${JSON.stringify(content.opportunity ?? { primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent })}. Correct topic drift across title, headings, body, images, links, and CTA instead of mechanically prefixing the keyword. Preserve every unaffected block ID and the user's existing block order. Do not create, remove, replace, or edit internal_link or related_post blocks; verified links are protected and restored by the server. Preserve every attached image source, assetId, ALT, prompt, purpose, and media field. For source-empty image recommendations, resolve image-strategy tasks by grounding each prompt in its nearest H2 and differentiating subject, action, background, composition, viewpoint, and information expression while keeping one brand style. Never return an empty internal-link placeholder. Do not add monetization links. Preserve existing metadata exactly unless the SEO or search-intent task requires a change. Return the complete revised document as JSON only in {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"blocks":[...]} form. Do not return commentary.\nQuality tasks: ${JSON.stringify(currentQuality.tasks)}\nCurrent document: ${JSON.stringify(content.document)}`,
        metadata: { task: "quality-improvement" },
      });
      const parsed = new EditorialGenerationStrategy().parse(response.content, {
        contentId, contentType: (content.contentType ?? "article") as never,
        ...(content.opportunity ? { contentOpportunity: content.opportunity } : {}), keywords, platform: (content.platform ?? "canonical") as never, projectId: content.projectId,
      });
      let document = restoreProtectedImageAssets(content.document, restoreVerifiedEditorialLinks(content.document, parsed));
      document = applyContentPolicy(await placeAvailableTistoryPosts(data, content, document), content);
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document) });
      const improvement = evaluateQualityImprovement(currentQuality, quality);
      return NextResponse.json({ document, basedOnRevisionId: contentRevisionId(content.document), baselineQuality: currentQuality, quality, improvement });
    }
    if (body.action === "accept-improvement") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId), basedOnRevisionId = required(body.input?.basedOnRevisionId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document || contentRevisionId(content.document) !== basedOnRevisionId) throw new Error("현재 문서가 변경되어 개선안을 적용할 수 없습니다. 새 개선안을 만들어 주세요.");
      const raw = body.input?.document;
      if (!raw || typeof raw !== "object") throw new Error("개선 문서가 없습니다.");
      const candidate = raw as import("../../../core/content").ContentDocument;
      if (candidate.id !== content.document.id) throw new Error("개선 문서 ID가 현재 문서와 일치하지 않습니다.");
      let document = restoreProtectedImageAssets(content.document, restoreVerifiedEditorialLinks(content.document, candidate));
      document = applyContentPolicy(await placeAvailableTistoryPosts(data, content, document), content);
      const baselineQuality = new QualityEngine().review(content.document, qualityContext(content));
      const appliedAt = new Date().toISOString();
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document), reviewedAt: appliedAt });
      const improvement = evaluateQualityImprovement(baselineQuality, quality);
      if (!improvement.accepted) throw new Error(qualityImprovementRejectionMessage(improvement));
      if (!quality.approved) throw new Error(`개선안이 품질 승인 기준을 충족하지 못했습니다. 전체 ${quality.overallScore}점이며 모든 필수 항목이 기준을 충족해야 합니다.`);
      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", appliedAt);
      next = updateContent(next, contentId, { quality, status: quality.approved ? "ready" : "in_review", updatedAt: appliedAt });
      next = { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] };
      const saved = await persistServerMutation(data, next);
      return NextResponse.json({ document, quality, improvement, revisionId: contentRevisionId(document), data: saved });
    }
    if (body.action === "content-deletion-impact") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const impact = new ContentDeletionService().impact(data, data.workspace!.id, required(body.input?.contentId));
      return NextResponse.json({ impact });
    }
    if (body.action === "delete-content") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const result = await new ContentDeletionService().delete(data, {
        workspaceId: data.workspace!.id,
        contentId: required(body.input?.contentId),
      });
      await studioStore.set(collection, stateId, result.data);
      return NextResponse.json(result);
    }
    if (body.action === "render-tistory") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      const prepared = await new TistoryPublishingAdapter().prepare({ content: content.document, platform: "tistory" });
      return NextResponse.json({ html: prepared.payload.html, revisionId: contentRevisionId(content.document) });
    }
    if (body.action === "prepare-tistory") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      if (!isPlatformEnabled(data, "tistory")) throw new Error("Tistory is disabled in Workspace Settings.");
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      const connectionId = required(body.input?.connectionId);
      if (content.publishingPreparation?.tistory?.publishingAccountId !== connectionId) throw new Error("Tistory 카테고리를 선택하거나 '카테고리 없음'을 명시해 주세요.");
      const quality = new QualityEngine().review(content.document, qualityContext(content));
      const prepared = await new TistoryPublishingAdapter().prepare({ content: content.document, platform: "tistory" });
      return NextResponse.json({ prepared, quality, preparation: content.publishingPreparation?.tistory ?? null });
    }
    if (body.action === "review-quality") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      const document = await placeAvailableTistoryPosts(data, content, content.document);
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document) });
      let next = contentRevisionId(document) === contentRevisionId(content.document) ? data : applyCanonicalDocument(data, contentId, document, "autosave", quality.reviewedAt);
      next = updateContent(next, contentId, { quality, status: quality.approved ? "ready" : "in_review", updatedAt: quality.reviewedAt });
      const persisted = { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] };
      const saved = await persistServerMutation(data, persisted);
      return NextResponse.json({ document, quality, data: saved });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    await persistWorkflowFailure(body, error);
    const status = message(error).includes("OPENAI_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message(error) }, { status });
  }
}

function applyContentPolicy(document: ContentDocument, content: UserData["contents"][number], rejectMismatch = false): ContentDocument {
  if (!content.opportunity) return ensureSeoKeywordPlacement(document, content.primaryKeyword);
  const result = applyContentOpportunityPolicy(document, content.opportunity);
  if (rejectMismatch && result.alignment.status === "mismatch") {
    throw new Error("AI 수정 결과가 확정된 콘텐츠 기획과 일치하지 않아 적용하지 않았습니다.");
  }
  return result.document;
}

async function persistPlanningResult(data: UserData, input: Record<string, unknown> | undefined, plan: import("../../user-flow/user-data").ContentPlanningResult): Promise<UserData> {
  if (typeof input?.contentId !== "string" || typeof input.operationId !== "string") return data;
  const completedAt = new Date().toISOString();
  return studioStore.update<UserData>(collection, stateId, (current) => completeContentPlanning(current ?? data, {
    workspaceId: required(input.workspaceId),
    projectId: required(input.projectId),
    contentId: required(input.contentId),
    operationId: required(input.operationId),
    plan,
    now: completedAt,
  }));
}

async function executePlanning(input: Record<string, unknown> | undefined, manual: boolean): Promise<PlanningExecutionResult> {
  const workspaceId = required(input?.workspaceId);
  const projectId = required(input?.projectId);
  const planningRequest = required(input?.naturalLanguageRequest);
  const requestedSelectionMode = manual || input?.selectionMode === "userSpecified"
    ? "userSpecified"
    : detectContentOpportunitySelectionMode(planningRequest, input?.selectionMode === "automatic");
  const contentId = typeof input?.contentId === "string" ? input.contentId.trim() : "";
  const operationId = typeof input?.operationId === "string" ? input.operationId.trim() : "";
  const data = await ownedWorkspace(workspaceId);
  const project = ownedProject(data, projectId);

  if (contentId || operationId) {
    if (!contentId || !operationId) throw new Error("Planning contentId and operationId must be supplied together.");
    const content = data.contents.find((value) => value.id === contentId && value.workspaceId === workspaceId && value.projectId === projectId);
    if (!content?.planningWorkflow || content.planningWorkflow.operationId !== operationId) throw new Error("This Planning operation is no longer current.");
    if (content.planningWorkflow.request !== planningRequest || content.planningWorkflow.selectionMode !== requestedSelectionMode) {
      throw new Error("This Planning operation does not match the persisted request context.");
    }
    if (content.planningWorkflow.status === "failed") throw new Error(content.planningWorkflow.error ?? "This Planning operation already failed. Start an explicit retry.");
    if (content.planningWorkflow.status !== "planning") {
      if (content.planning) return { plan: content.planning, data };
      throw new Error("This Planning operation is no longer accepting a Provider result.");
    }
    const key = `${workspaceId}:${projectId}:${contentId}:${operationId}`;
    const active = activePlanningOperations.get(key);
    if (active) return active;
    const execution = performPlanning(data, project, input, manual);
    activePlanningOperations.set(key, execution);
    try {
      return await execution;
    } finally {
      if (activePlanningOperations.get(key) === execution) activePlanningOperations.delete(key);
    }
  }
  return performPlanning(data, project, input, manual);
}

async function performPlanning(data: UserData, project: UserData["projects"][number], input: Record<string, unknown> | undefined, manual: boolean): Promise<PlanningExecutionResult> {
  const planningRequest = required(input?.naturalLanguageRequest);
  const selectionMode = manual || input?.selectionMode === "userSpecified"
    ? "userSpecified"
    : detectContentOpportunitySelectionMode(planningRequest, input?.selectionMode === "automatic");
  const contentId = typeof input?.contentId === "string" ? input.contentId : undefined;
  const evidenceBundle = await opportunityEvidenceService.buildPlanningBundle(data, project, contentId);
  const rawPlan = manual
    ? createManualPlanningResult(planningRequest, { projectId: project.id, selectionMode: "userSpecified" })
    : await new ContentPlanningStrategy(new OpenAIProvider()).analyze(planningRequest, resolveWorkspaceSettings(data).enabledPlatforms, {
      projectId: project.id,
      selectionMode,
      projectContext: JSON.stringify(resolveProjectStrategy(project)),
      existingContent: data.contents.filter((content) => content.projectId === project.id && content.id !== contentId).map((content) => `${content.title} | ${content.primaryKeyword ?? ""}`),
      hasVerifiedKeywordData: evidenceBundle.some((value) => value.provider !== "brightStudio" && value.verified),
      evidenceBundle,
    });
  const plan = withClassifiedCandidates(rawPlan, opportunityEvidenceService.classifyCandidates(rawPlan.opportunityCandidates ?? [], evidenceBundle, data, project));
  const saved = await persistPlanningResult(data, input, plan);
  return { plan, data: saved };
}

async function persistWorkflowFailure(body: { action?: string; input?: Record<string, unknown> } | undefined, error: unknown): Promise<void> {
  const retryFrom = body?.action === "plan" || body?.action === "manual-plan" ? "planning" : body?.action === "generate" ? "generation" : undefined;
  const input = body?.input;
  if (!retryFrom || typeof input?.workspaceId !== "string" || typeof input.projectId !== "string" || typeof input.contentId !== "string" || typeof input.operationId !== "string") return;
  try {
    await studioStore.update<UserData>(collection, stateId, (current) => current ? failContentPlanning(current, {
      workspaceId: input.workspaceId as string,
      projectId: input.projectId as string,
      contentId: input.contentId as string,
      operationId: input.operationId as string,
      error: message(error),
      retryFrom,
      now: new Date().toISOString(),
    }) : (() => { throw new Error("Workspace was not found."); })());
  } catch (persistenceError) {
    console.error("[studio-workflow] failed to persist recoverable workflow error", { error: message(persistenceError) });
  }
}

function qualityContext(content: UserData["contents"][number], document = content.document) {
  return { contentType: content.contentType, platform: content.platform ?? "canonical", primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent, ...(content.opportunity ? { opportunity: content.opportunity } : {}), revisionId: document ? contentRevisionId(document) : undefined };
}

function opportunityFailure(quality: ReturnType<QualityEngine["review"]>): string | undefined {
  return quality.opportunityReview && !quality.opportunityReview.pass
    ? "콘텐츠 기획 불일치가 남아 있어 품질 승인을 차단했습니다. 선택한 주제·대표 키워드·검색 의도에 맞게 원고 전체를 검토해 주세요."
    : undefined;
}

async function ownedWorkspace(workspaceId: string) {
  const data = await studioStore.get<UserData>(collection, stateId);
  if (!data?.workspace || data.workspace.id !== workspaceId) throw new Error("Workspace was not found.");
  return data;
}
function ownedProject(data: UserData, projectId: string) {
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === data.workspace!.id);
  if (!project) throw new Error("Project does not belong to this Workspace.");
  return project;
}

async function persistServerMutation(base: UserData, next: UserData): Promise<UserData> {
  return studioStore.update<UserData>(collection, stateId, (current) => mergeServerMutationSnapshot(current, base, next));
}

function message(error: unknown): string { return error instanceof Error ? error.message : "Request failed."; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("Required generation input is missing."); return value.trim(); }

function withClassifiedCandidates(plan: import("../../user-flow/user-data").ContentPlanningResult, candidates: readonly import("../../../core/content").ContentOpportunityCandidate[]): import("../../user-flow/user-data").ContentPlanningResult {
  const first = candidates[0];
  if (!first) throw new Error("현재 저장된 Evidence로 검증 가능한 Content Opportunity가 없습니다. Data Source 또는 Project 전략을 확인해 주세요.");
  return Object.freeze({ ...plan, opportunityCandidates: Object.freeze(candidates), recommendedPrimaryKeyword: first.primaryKeyword, keywordCandidates: Object.freeze(candidates.map((value) => value.primaryKeyword)), searchIntent: first.searchIntent, recommendedContentType: first.contentType, relatedKeywords: first.secondaryKeywords, targetAudience: first.audience, contentGoal: first.contentAngle, recommendationReason: first.selectionRationale, confidence: first.confidence });
}

function collectOpportunities(input: unknown): readonly import("../../../core/content").ContentOpportunityCandidate[] {
  if (!input || typeof input !== "object") return [];
  const data = input as Partial<UserData>;
  return Object.freeze((data.contents ?? []).flatMap((content) => [
    ...(content.opportunity ? [content.opportunity] : []),
    ...(content.planning?.opportunityCandidates ?? []),
  ]));
}
function reviewTimeoutMs(): number {
  const parsed = Number(process.env.OPENAI_REVIEW_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 240_000;
}
function generationModel(): string { return process.env.OPENAI_GENERATION_MODEL ?? "gpt-5.6-luna"; }
function reviewModel(): string { return process.env.OPENAI_REVIEW_MODEL ?? "gpt-5.6-terra"; }
function editorialRequirements(context?: string): string[] { const marker = context?.match(/필수 정보:\s*([^\n]+)/); return marker ? marker[1].split("|").map((item) => item.trim()).filter(Boolean) : []; }

async function placeAvailableTistoryPosts(data: UserData, content: UserData["contents"][number], document: ContentDocument): Promise<ContentDocument> {
  if (!data.workspace || !isPlatformEnabled(data, "tistory")) return document;
  const connectionId = content.publishingAccountId ?? (content.selectedPublishingAccountIds?.length === 1 ? content.selectedPublishingAccountIds[0] : undefined);
  if (!connectionId) return document;
  const connection = await connectionRepository.findById(connectionId);
  if (!connection || connection.workspaceId !== data.workspace.id || connection.platform !== "tistory") return document;
  const targets = targetRepository.listByProject ? await targetRepository.listByProject(content.projectId) : [];
  const selectedTarget = targets.some((target) => target.platformConnectionId === connection.id);
  try {
    const catalog = await new TistoryPostCatalogApplicationService().read({ workspaceId: data.workspace.id, projectId: content.projectId, contentId: content.id, connection, selectedTarget });
    const ranked = rankRelatedPosts(document, catalog.posts, { primaryKeyword: content.primaryKeyword, categoryName: content.publishingPreparation?.tistory?.platformCategoryName ?? undefined });
    return placeRecommendedPosts(document, ranked);
  } catch (error) {
    console.error("[studio-generation] Tistory post catalog unavailable", { error: message(error), contentId: content.id });
    return document;
  }
}

function finalEditInstruction(document: ContentDocument, quality: ReturnType<QualityEngine["review"]>, opportunity?: ConfirmedContentOpportunity): string {
  return `Act as the Senior Editor performing the second and final AI call for this Korean canonical ContentDocument. Do not merely score or summarize it. Rewrite the complete manuscript in one pass so it directly resolves the confirmed search intent, opens with the core answer, deepens shallow H2 sections, removes repetition and generic AI phrases, connects paragraphs naturally, improves the conclusion, and unifies polite Korean tone. For a Tistory long-form article, keep 4,500–6,000 Korean characters and five to eight developed H2 sections. After every H2 write two or three prose paragraphs, each with three to five connected sentences, so each H2 contains roughly 600–850 Korean characters of actual explanation; use H3 only when useful. Before returning JSON, count the prose characters and expand concrete criteria, examples, mistakes, cautions, or alternatives when the body is below 4,500 characters. Do not expose planning notes or editorial commentary.
The confirmed Content Opportunity is immutable: ${JSON.stringify(opportunity ?? null)}. Evaluate topicFidelity, primaryKeywordAlignment, searchIntentFulfillment, secondaryKeywordSupport, titleTopicAlignment, headingCoverage, bodyCoverage, contentOpportunityConsistency, crossTopicDrift, and unsupportedKeywordUsage while editing. If the current manuscript follows another topic, rewrite the complete title, outline, paragraphs, source-empty image recommendations, link context, and CTA so they fulfill this Opportunity; never hide drift by merely prefixing the primary keyword.
Fix every actionable server rule-quality issue without lowering standards or gaming scores. Remove every fabricated first-person experience, including phrases such as “제가”, “저는”, or “직접 해봤습니다”; do not replace them with another invented narrator. Remove unsupported statistics, overconfident claims, keyword stuffing, empty headings, repeated one-sentence paragraphs, and placeholder prose. For health topics, preserve practical value while avoiding diagnosis, treatment promises, fabricated evidence, and excessive disclaimers; distinguish warning signs and professional consultation when relevant. Put the exact primary keyword naturally in the title, introduction, and relevant heading without repeating it excessively. Ensure the 60–180-character meta description truthfully matches the final body and uses the primary keyword naturally.
Preserve all verified internal_link and related_post labels, URLs, purposes, targets, and sourceExternalPostId values exactly; never invent, replace, duplicate, or move all links to the end. Keep one contextual internal link in the relevant middle section and at most three related posts at the end. Review CTA necessity: retain only a useful CTA with a real approved URL, otherwise do not fabricate one. Preserve every attached image source, assetId, ALT, prompt, purpose, and media field exactly. Image blocks may remain source-empty recommendations when they have specific ALT text because upload readiness is separate from manuscript quality. Ground every source-empty image prompt in its nearest H2 and use meaningfully different editorial roles, subjects, actions, backgrounds, compositions, viewpoints, or information expressions without losing the shared brand style. Keep the title as the only H1 and use sequential semantic H2/H3 structure. Return the complete final article as JSON only in the same canonical shape accepted by the generator, with no commentary.\nServer rule report: ${JSON.stringify({ overallScore: quality.overallScore, dimensions: quality.dimensions, tasks: quality.tasks })}\nCanonical document: ${JSON.stringify(document)}`;
}
