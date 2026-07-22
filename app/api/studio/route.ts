import { NextResponse } from "next/server";

import { studioStore } from "../../application/studio-store";
import { mergeServerMutationSnapshot, mergeUserDataSnapshot } from "../../application/persistence/mergeUserDataSnapshot";
import { AIWorkflow } from "../../../core/ai";
import { contentRevisionId, evaluateQualityImprovement, qualityImprovementRejectionMessage, QualityEngine } from "../../../core/quality";
import { EditorialGenerationStrategy } from "../../application/EditorialGenerationStrategy";
import { OpenAIProvider } from "../../application/OpenAIProvider";
import { openAIGenerationModel, openAIReviewModel } from "../../application/OpenAIModelPolicy";
import { EditorialQualityPipeline } from "../../application/EditorialQualityPipeline";
import { ContentPlanningStrategy, createManualPlanningResult } from "../../application/ContentPlanningStrategy";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { applyContentOpportunityPolicy, calculateContentMetrics, contentOpportunityKeywords, deriveContentTags, detectContentOpportunitySelectionMode, ensureSeoKeywordPlacement, placeRecommendedPosts, rankRelatedPosts, restoreProtectedImageAssets, restoreVerifiedEditorialLinks, type ConfirmedContentOpportunity, type ContentDocument } from "../../../core/content";
import { ContentDeletionService } from "../../application/content/ContentDeletionService";
import { applyCanonicalDocument, completeContentGeneration, completeContentPlanning, failContentPlanning, resolveProjectStrategy, startContentPlanning, updateContent, type UserData } from "../../user-flow/user-data";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { connectionRepository, targetRepository } from "../../application/connections/connection-runtime";
import { TistoryPostCatalogApplicationService } from "../../application/publishing/TistoryPostCatalogApplicationService";
import { isConnectionSelectedForContent, resolveTistoryConnectionId } from "../../application/publishing/TistoryConnectionSelection";
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
      const generationContract = resolveGenerationOpportunity(existing, {
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
      const provider = new OpenAIProvider(undefined, openAIGenerationModel());
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
        const pipeline = await new EditorialQualityPipeline(new OpenAIProvider(undefined, openAIReviewModel(), reviewTimeoutMs())).run({
          document: initialDocument,
          finalReviewInstruction: (document, quality) => finalEditInstruction(document, quality, opportunity),
          parseInput: { contentId, contentType: opportunity.contentType as never, contentOpportunity: opportunity, keywords, platform: required(input.platform) as never, projectId },
          placeDocument: async (document) => applyContentPolicy(await placeAvailableTistoryPosts(owned, existing, document), existing),
          qualityContext: context,
          requiredInformation: [...opportunity.expectedCoverage, ...editorialRequirements(typeof input.editorialContext === "string" ? input.editorialContext : undefined)],
        });
        const { document, quality } = pipeline;
        let persisted = applyCanonicalDocument(owned, existing.id, document, "ai_revision", quality.reviewedAt);
        if (!pipeline.reachedTarget || !quality.approved) {
          const failure = qualityTargetFailure(quality);
          persisted = updateContent(persisted, existing.id, { quality, status: "draft", generationError: failure });
          if (existing.planningWorkflow) persisted = failContentPlanning(persisted, {
            workspaceId: owned.workspace!.id,
            projectId,
            contentId,
            operationId: generationOperationId,
            error: failure,
            retryFrom: "generation",
            now: quality.reviewedAt,
          });
          const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
          const saved = await persistServerMutation(owned, next);
          return NextResponse.json({
            initialQuality,
            quality,
            finalReviewQuality: pipeline.finalReviewQuality,
            qualityHistory: pipeline.qualityHistory,
            attemptHistory: pipeline.attemptHistory,
            automaticImprovementCount: 0,
            reachedTarget: false,
            qualityTargetBlocked: true,
            error: failure,
            recoveryRevisionId: contentRevisionId(document),
            data: saved,
          });
        }
        persisted = updateContent(persisted, existing.id, { quality, status: "ready", generationError: undefined });
        if (existing.planningWorkflow) persisted = completeContentGeneration(persisted, { workspaceId: owned.workspace!.id, projectId, contentId, operationId: generationOperationId, now: quality.reviewedAt });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        const saved = await persistServerMutation(owned, next);
        return NextResponse.json({ document, initialQuality, quality, finalReviewQuality: pipeline.finalReviewQuality, qualityHistory: pipeline.qualityHistory, attemptHistory: pipeline.attemptHistory, automaticImprovementCount: 0, reachedTarget: true, finalRevisionId: contentRevisionId(document), data: saved });
      } catch (error) {
        const quality = new QualityEngine().review(initialDocument, context);
        const failure = `최종 품질 검토·편집에 실패했습니다: ${message(error)}`;
        let persisted = applyCanonicalDocument(owned, existing.id, initialDocument, "generation", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, { quality, status: "draft", generationError: failure });
        if (existing.planningWorkflow) persisted = failContentPlanning(persisted, {
          workspaceId: owned.workspace!.id,
          projectId,
          contentId,
          operationId: generationOperationId,
          error: failure,
          retryFrom: "generation",
          now: quality.reviewedAt,
        });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        const saved = await persistServerMutation(owned, next);
        return NextResponse.json({ aiReviewError: message(error), initialQuality, quality, reachedTarget: false, qualityTargetBlocked: true, error: failure, recoveryRevisionId: contentRevisionId(initialDocument), data: saved });
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
      const finalEdit = await new OpenAIProvider(undefined, openAIReviewModel(), reviewTimeoutMs()).generate({ instruction: finalEditInstruction(initialDocument, initialQuality, content.opportunity), metadata: { task: "quality-final-edit" } });
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
      const provider = new OpenAIProvider(undefined, openAIGenerationModel());
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
      const response = await new OpenAIProvider(undefined, openAIReviewModel(), reviewTimeoutMs()).generate({
        instruction: `This is the only quality-improvement AI call. Return a fully approved final manuscript in this response. Improve this complete canonical ContentDocument using only the Quality Review tasks below. Preserve the immutable Content Opportunity as one plan: ${JSON.stringify(content.opportunity ?? { primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent })}. Correct topic drift across title, headings, body, images, links, and CTA instead of mechanically prefixing the keyword. Preserve every unaffected block ID and the user's existing block order. Do not create, remove, replace, or edit internal_link or related_post blocks; verified links are protected and restored by the server. Preserve every attached image source, assetId, ALT, prompt, purpose, and media field. For source-empty image recommendations, resolve image-strategy tasks by grounding each prompt in its nearest H2 and differentiating subject, action, background, composition, viewpoint, and information expression while keeping one brand style. Never return an empty internal-link placeholder. Do not add monetization links. Preserve existing metadata exactly unless the SEO or search-intent task requires a change. Return the complete revised document as JSON only in {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"blocks":[...]} form. Do not return commentary.
Mandatory approval contract: overallScore >= 95; searchIntent, SEO, readability, and completeness >= 95; every other dimension >= 80; no blocked finding. Do not raise completeness or usefulness by lowering readability below 95. Break long sentences and paragraphs while adding concrete criteria, sequence, examples, cautions, and alternatives.
Current Rule Quality report: ${JSON.stringify(currentQuality)}
Quality tasks: ${JSON.stringify(currentQuality.tasks)}
Current document: ${JSON.stringify(content.document)}`,
        metadata: { task: "quality-improvement" },
      });
      const parsed = new EditorialGenerationStrategy().parse(response.content, {
        contentId, contentType: (content.contentType ?? "article") as never,
        ...(content.opportunity ? { contentOpportunity: content.opportunity } : {}), keywords, platform: (content.platform ?? "canonical") as never, projectId: content.projectId,
      });
      let document = restoreProtectedImageAssets(content.document, restoreVerifiedEditorialLinks(content.document, parsed));
      document = applyContentPolicy(await placeAvailableTistoryPosts(data, content, document), content);
      const appliedAt = new Date().toISOString();
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document), reviewedAt: appliedAt });
      const improvement = evaluateQualityImprovement(currentQuality, quality);
      if (quality.approved) {
        let next = applyCanonicalDocument(data, contentId, document, "ai_revision", appliedAt);
        next = updateContent(next, contentId, { quality, status: "ready", generationError: undefined, updatedAt: appliedAt });
        next = { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] };
        const saved = await persistServerMutation(data, next);
        return NextResponse.json({ document, basedOnRevisionId: contentRevisionId(content.document), baselineQuality: currentQuality, quality, improvement, applied: true, revisionId: contentRevisionId(document), data: saved });
      }
      return NextResponse.json({ document, basedOnRevisionId: contentRevisionId(content.document), baselineQuality: currentQuality, quality, improvement, applied: false });
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


function resolveGenerationOpportunity(
  content: UserData["contents"][number],
  input: Parameters<typeof resolveConfirmedGenerationOpportunity>[1],
): ReturnType<typeof resolveConfirmedGenerationOpportunity> {
  try {
    return resolveConfirmedGenerationOpportunity(content, input);
  } catch (error) {
    const stored = content.opportunity;
    const sameIdentity = Boolean(
      stored
      && typeof input.opportunityId === "string"
      && input.opportunityId === stored.opportunityId
      && String(input.opportunityVersion) === String(stored.version)
      && typeof input.opportunityFingerprint === "string"
      && input.opportunityFingerprint === stored.fingerprint
    );
    const mismatchMessage = message(error);
    const isCurrentDraftMismatch = mismatchMessage.includes("선택한 콘텐츠 전략이 현재 원고와 일치하지 않습니다")
      || mismatchMessage.includes("선택한 콘텐츠 전략이 요청한 현재 원고와 일치하지 않습니다");
    if (!stored || !sameIdentity || !isCurrentDraftMismatch) throw error;
    return resolveConfirmedGenerationOpportunity(content, {
      ...input,
      opportunityId: stored.opportunityId,
      opportunityVersion: stored.version,
      opportunityFingerprint: stored.fingerprint,
      primaryKeyword: stored.primaryKeyword,
      topic: stored.selectedTopic,
      searchIntent: stored.searchIntent,
      secondaryKeywords: stored.secondaryKeywords,
      keywords: [stored.primaryKeyword, ...stored.secondaryKeywords],
    });
  }
}

function applyContentPolicy(document: ContentDocument, content: UserData["contents"][number], rejectMismatch = false): ContentDocument {
  const aligned = content.opportunity
    ? applyContentOpportunityPolicy(document, content.opportunity)
    : { document: ensureSeoKeywordPlacement(document, content.primaryKeyword), alignment: undefined };
  if (rejectMismatch && aligned.alignment?.status === "mismatch") {
    throw new Error("AI 수정 결과가 확정된 콘텐츠 기획과 일치하지 않아 적용하지 않았습니다.");
  }
  const tags = deriveContentTags(aligned.document, content.primaryKeyword);
  return {
    ...aligned.document,
    ...(aligned.document.metadata ? { metadata: { ...aligned.document.metadata, tags } } : {}),
  };
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
    : await new ContentPlanningStrategy(new OpenAIProvider(undefined, openAIGenerationModel())).analyze(planningRequest, resolveWorkspaceSettings(data).enabledPlatforms, {
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
  return { contentType: content.contentType, platform: content.platform ?? "canonical", primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent, categoryName: content.publishingPreparation?.tistory?.platformCategoryName ?? undefined, availableInternalLinkCandidates: document?.metadata?.availableRelatedContentCandidates, internalLinkCatalogStatus: document?.metadata?.internalLinkCatalogStatus, ...(content.opportunity ? { opportunity: content.opportunity } : {}), revisionId: document ? contentRevisionId(document) : undefined };
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
  if (!first) throw new Error("안전 기준과 Project 정책을 통과한 Content Opportunity가 없습니다. 직접 입력한 주제라면 검색 의도와 안전 문구를 확인해 주세요.");
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
function editorialRequirements(context?: string): string[] { const marker = context?.match(/필수 정보:\s*([^\n]+)/); return marker ? marker[1].split("|").map((item) => item.trim()).filter(Boolean) : []; }

async function placeAvailableTistoryPosts(data: UserData, content: UserData["contents"][number], document: ContentDocument): Promise<ContentDocument> {
  if (!data.workspace || !isPlatformEnabled(data, "tistory")) {
    console.info("[internal-link-trace] skipped before connection resolution", {
      contentId: content.id,
      hasWorkspace: Boolean(data.workspace),
      tistoryEnabled: isPlatformEnabled(data, "tistory"),
    });
    return document;
  }

  const connectionId = resolveTistoryConnectionId(data, content);
  console.info("[internal-link-trace] connection resolution", {
    connectionId: connectionId ?? null,
    contentId: content.id,
    contentPublishingAccountId: content.publishingAccountId ?? null,
    contentSelectedPublishingAccountIds: content.selectedPublishingAccountIds ?? [],
    projectId: content.projectId,
  });
  if (!connectionId) {
    console.warn("[studio-generation] No selected Tistory connection for internal-link placement", { contentId: content.id, projectId: content.projectId });
    return document;
  }

  const connection = await connectionRepository.findById(connectionId);
  if (!connection || connection.workspaceId !== data.workspace.id || connection.platform !== "tistory") {
    console.warn("[internal-link-trace] resolved connection is unavailable or invalid", {
      connectionFound: Boolean(connection),
      connectionId,
      connectionPlatform: connection?.platform ?? null,
      connectionWorkspaceId: connection?.workspaceId ?? null,
      contentId: content.id,
      expectedWorkspaceId: data.workspace.id,
    });
    return document;
  }

  const preparation = content.publishingPreparation?.tistory;
  console.info("[internal-link-trace] category preparation", {
    categoryId: preparation?.platformCategoryId ?? null,
    categoryName: preparation?.platformCategoryName ?? null,
    contentId: content.id,
  });
  if (!preparation?.platformCategoryName?.trim()) {
    console.warn("[internal-link-trace] category is missing", { contentId: content.id });
    return withInternalLinkCatalogMetadata(document, 0, "category_missing");
  }

  const targets = targetRepository.listByProject ? await targetRepository.listByProject(content.projectId) : [];
  const connectionSelected = isConnectionSelectedForContent(data, content, connection.id);
  const targetRegistered = targets.some((target) => target.platformConnectionId === connection.id);
  const selectedTarget = connectionSelected && targetRegistered;
  console.info("[internal-link-trace] publishing target resolution", {
    connectionId: connection.id,
    connectionSelected,
    contentId: content.id,
    selectedTarget,
    targetCount: targets.length,
    targetRegistered,
    targetConnectionIds: targets.map((target) => target.platformConnectionId),
  });

  try {
    const catalog = await new TistoryPostCatalogApplicationService().read({ workspaceId: data.workspace.id, projectId: content.projectId, contentId: content.id, connection, selectedTarget });
    console.info("[internal-link-trace] catalog loaded", {
      cached: catalog.cached,
      catalogPostCount: catalog.posts.length,
      categories: [...new Set(catalog.posts.map((post) => `${post.categoryId ?? ""}|${post.categoryName ?? ""}`))].slice(0, 20),
      contentId: content.id,
    });

    console.info("[internal-link-trace] current category", {
      categoryId: preparation.platformCategoryId,
      categoryName: preparation.platformCategoryName,
      catalogCategories: [
        ...new Set(
          catalog.posts.map(
            (post) => `${post.categoryId ?? "null"}|${post.categoryName ?? "null"}`
          ),
        ),
      ],
    });

    const ranked = rankRelatedPosts(document, catalog.posts, { primaryKeyword: content.primaryKeyword, categoryId: preparation.platformCategoryId, categoryName: preparation.platformCategoryName ?? undefined });
    const placed = placeRecommendedPosts(document, ranked);
    console.info("[internal-link-trace] ranking and placement completed", {
      contentId: content.id,
      internalLinkCount: placed.blocks.filter((block) => block.type === "button" && block.purpose === "internal_link").length,
      rankedCount: ranked.length,
      rankedPosts: ranked.slice(0, 10).map((post) => ({ categoryId: post.categoryId ?? null, categoryName: post.categoryName ?? null, title: post.title, url: post.publishedUrl })),
      relatedPostCount: placed.blocks.filter((block) => block.type === "button" && block.purpose === "related_post").length,
    });
    return withInternalLinkCatalogMetadata(placed, ranked.length, "evaluated");
  } catch (error) {
    console.error("[studio-generation] Tistory post catalog unavailable", {
      connectionId: connection.id,
      contentId: content.id,
      error: message(error),
      selectedTarget,
    });
    return withInternalLinkCatalogMetadata(document, 0, "catalog_unavailable");
  }
}

function withInternalLinkCatalogMetadata(document: ContentDocument, count: number, status: "evaluated" | "category_missing" | "catalog_unavailable"): ContentDocument {
  const now = new Date().toISOString();
  const metrics = calculateContentMetrics(document);
  return {
    ...document,
    metadata: {
      buttonCount: document.metadata?.buttonCount ?? document.blocks.filter((block) => block.type === "button").length,
      createdAt: document.metadata?.createdAt ?? now,
      generator: document.metadata?.generator ?? "bright-studio",
      imageCount: document.metadata?.imageCount ?? document.blocks.filter((block) => block.type === "image").length,
      language: document.metadata?.language ?? "ko",
      readingTime: document.metadata?.readingTime ?? metrics.estimatedReadingMinutes,
      source: document.metadata?.source ?? "generated",
      updatedAt: now,
      version: document.metadata?.version ?? 1,
      videoCount: document.metadata?.videoCount ?? document.blocks.filter((block) => block.type === "video").length,
      wordCount: document.metadata?.wordCount ?? metrics.wordUnits,
      ...document.metadata,
      availableRelatedContentCandidates: count,
      internalLinkCatalogStatus: status,
    },
  };
}

function qualityTargetFailure(quality: ReturnType<QualityEngine["review"]>): string {
  const missing = quality.dimensions
    .filter((item) => quality.weights[item.category] > 0)
    .filter((item) => item.status === "blocked" || item.score < (["searchIntent", "seo", "readability", "completeness"].includes(item.category) ? 95 : 80))
    .map((item) => `${item.category} ${item.score}`);
  return `원고가 자동 품질 승인 기준에 도달하지 못했습니다. 전체 ${quality.overallScore}점${missing.length ? `, 미달 항목: ${missing.join(", ")}` : ""}. 품질 미승인 원고는 진단을 위해 편집기에서 확인할 수 있지만, 품질 승인 전에는 임시저장과 발행이 차단됩니다.`;
}

function finalEditInstruction(document: ContentDocument, quality: ReturnType<QualityEngine["review"]>, opportunity?: ConfirmedContentOpportunity): string {
  return `Act as the Senior Editor performing the second and final AI call for this Korean canonical ContentDocument. Rewrite the complete manuscript in one pass so it directly resolves the confirmed search intent, opens with the core answer, removes repetition and generic AI phrasing, deepens only the sections that are genuinely incomplete, connects paragraphs naturally, improves the conclusion, and unifies polite Korean tone. Do not expose planning notes or editorial commentary.
The confirmed Content Opportunity is immutable: ${JSON.stringify(opportunity ?? null)}. Keep the title, headings, body, image recommendations, link context, and CTA aligned to that one Opportunity. If the manuscript drifts to another topic, correct the complete manuscript rather than mechanically inserting the primary keyword.
Fix every actionable server rule-quality issue without gaming scores. Remove fabricated first-person experience, unsupported statistics, overconfident claims, keyword stuffing, empty headings, repeated one-sentence paragraphs, and placeholder prose. For health topics, preserve concrete practical guidance while avoiding diagnosis, treatment promises, fabricated evidence, and repetitive disclaimers. Use observable criteria, conditions, sequence, exceptions, and next actions when exact external evidence is not supplied.
Preserve all verified internal_link and related_post labels, URLs, purposes, targets, and sourceExternalPostId values exactly. Preserve every attached image source, assetId, ALT, prompt, purpose, and media field exactly. Source-empty image recommendations may be revised or removed when they are redundant, but every retained recommendation must have a distinct editorial purpose and section context. Keep the title as the only H1 and use semantic H2/H3 structure. Return the complete final article as JSON only in the same canonical shape accepted by the generator, with no commentary.
Server rule report: ${JSON.stringify({ overallScore: quality.overallScore, dimensions: quality.dimensions, tasks: quality.tasks })}
Canonical document: ${JSON.stringify(document)}`;
}
