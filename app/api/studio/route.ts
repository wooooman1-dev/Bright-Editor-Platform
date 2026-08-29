import { NextResponse } from "next/server";

import { studioStore } from "../../application/studio-store";
import { mergeServerMutationSnapshot, mergeUserDataSnapshot } from "../../application/persistence/mergeUserDataSnapshot";
import { AIWorkflow } from "../../../core/ai/AIWorkflow";
import { AIProviderError } from "../../../core/ai";
import { ApprovalSourcePreflightError } from "../../../core/ai/ApprovalSourcePreflight";
import { contentRevisionId, editorialRevisionId, evaluateQualityImprovement, evaluateQualityReviewReadiness, isStandardQualityApproved, qualityImprovementRejectionMessage, QualityEngine } from "../../../core/quality";
import { contentOpportunityAIContext, EditorialGenerationStrategy } from "../../application/EditorialGenerationStrategy";
import { approvalPolicySnapshotFromEditorialContext, withStoredEvidencePassagesInstruction } from "../../../core/approval";
import { OpenAIProvider } from "../../application/OpenAIProvider";
import { openAIGenerationModel, openAIReviewModel } from "../../application/OpenAIModelPolicy";
import { contentDocumentAIContext, EditorialQualityPipeline } from "../../application/EditorialQualityPipeline";
import { preserveCanonicalSeoMetadata } from "../../application/SeoMetadataPolicy";
import { attachApprovalEvidenceContracts, ContentPlanningStrategy, createManualPlanningResult, ensureApprovalEvidenceContract, projectStrategyAIContext } from "../../application/ContentPlanningStrategy";
import { approvalAwareInstruction, contentEditorialContext, preserveContentApprovalPolicy } from "../../application/approval/ApprovalRuntimePolicy";
import { editorialContextWithoutDiversityPolicy } from "../../application/approval/ApprovalContentPolicy";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { WordPressHtmlRenderer } from "../../../apps/wordpress/WordPressHtmlRenderer";
import { analyzeLongFormDocument, applyContentDepthPolicy, applyContentOpportunityPolicy, contentOpportunityKeywords, deriveContentTags, detectContentOpportunitySelectionMode, ensureSeoKeywordPlacement, LongFormValidationError, requiresLongFormValidation, restoreProtectedImageAssets, restoreVerifiedEditorialLinks, type ConfirmedContentOpportunity, type ContentDocument, type LongFormDiagnostic } from "../../../core/content";
import { ContentDeletionService } from "../../application/content/ContentDeletionService";
import { applyCanonicalDocument, completeContentGeneration, completeContentPlanning, failContentPlanning, resolveProjectStrategy, startContentPlanning, updateContent, type UserData } from "../../user-flow/user-data";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { connectionRepository, targetRepository } from "../../application/connections/connection-runtime";
import { PublicPostCatalogApplicationService } from "../../application/publishing/PublicPostCatalogApplicationService";
import {
  applyInternalLinkCatalogResult,
  publishingCategoryIdentities,
  withProjectDefaultPublishingCategories,
  publishingCategoryNames,
  ownPublishedExternalPostIds,
  rankPublishingPostCandidates,
  withInternalLinkCatalogMetadata,
} from "../../application/publishing/InternalLinkCatalogPolicy";
import { resolveCanonicalPublishingConnection } from "../../application/publishing/ProjectPublishingTarget";
import { isPublishingConnectionSelectedForContent } from "../../application/publishing/PublishingTargetSelection";
import { resolveConfirmedGenerationKeywords, resolveConfirmedGenerationOpportunity } from "../../application/ConfirmedGenerationPolicy";
import { OpportunityEvidenceService } from "../../application/data-sources/OpportunityEvidenceService";
import { dataSourceConnectionRepository, opportunityEvidenceRepository, projectDataSourceReferenceRepository } from "../../application/data-sources/data-source-runtime";

const collection = "application";
const stateId = "user-data";
const opportunityEvidenceService = new OpportunityEvidenceService(dataSourceConnectionRepository, projectDataSourceReferenceRepository, opportunityEvidenceRepository);
type PlanningExecutionResult = Readonly<{ plan: import("../../user-flow/user-data").ContentPlanningResult; data: UserData }>;
const activePlanningOperations = new Map<string, Promise<PlanningExecutionResult>>();
const activeGenerationOperations = new Set<string>();

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
      const generationExecutionKey = `${owned.workspace!.id}:${projectId}:${contentId}:${generationOperationId}`;
      if (activeGenerationOperations.has(generationExecutionKey)) {
        return NextResponse.json({ error: "동일한 Content 생성 operation이 이미 실행 중입니다." }, { status: 409 });
      }
      activeGenerationOperations.add(generationExecutionKey);
      try {
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
      const editorialContext = contentEditorialContext(owned, existing);
      const resolvedOpportunity = generationContract.opportunity;
      const approvalSnapshot = approvalPolicySnapshotFromEditorialContext(editorialContext);
      const opportunity = approvalSnapshot
        ? ensureApprovalEvidenceContract(resolvedOpportunity, approvalSnapshot)
        : resolvedOpportunity;
      const keywords = generationContract.keywords;
      const provider = new OpenAIProvider(undefined, openAIGenerationModel());
      const workflow = new AIWorkflow(provider, new EditorialGenerationStrategy());
      const generationStartedAt = new Date();
      const result = await workflow.generate({
        contentId,
        contentType: opportunity.contentType as never,
        contentOpportunity: opportunity,
        editorialContext,
        keywords,
        platform: required(input.platform) as never,
        projectId,
        recentHeroImagePrompts: recentHeroImagePrompts(owned.contents, projectId, contentId),
        structuredLongFormOutput: true,
      });
      const generationCompletedAt = new Date();
      const initialDocument = applyContentPolicy(await placeAvailablePublishingPosts(owned, existing, result.document), existing);
      const context = qualityContext(existing, initialDocument);
      const initialQuality = new QualityEngine().review(initialDocument, context);
      const generationDiagnostic = initialDocument.metadata?.generationDiagnostic
        ?? analyzeLongFormDocument(initialDocument, opportunity.qualityTarget);
      const reviewReadiness = evaluateQualityReviewReadiness(
        initialDocument,
        initialQuality,
        generationDiagnostic,
      );
      if (reviewReadiness.fatal) {
        let persisted = applyCanonicalDocument(owned, existing.id, initialDocument, "ai_revision", initialQuality.reviewedAt);
        persisted = updateContent(persisted, existing.id, {
          quality: initialQuality,
          status: "in_review",
          generationError: undefined,
          reviewError: undefined,
          qualityTarget: opportunity.qualityTarget,
          generationDiagnostic,
        });
        if (existing.planningWorkflow) persisted = completeContentGeneration(persisted, {
          workspaceId: owned.workspace!.id,
          projectId,
          contentId,
          operationId: generationOperationId,
          now: initialQuality.reviewedAt,
        });
        const next = {
          ...persisted,
          qualityReports: [
            ...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id),
            { contentId: existing.id, report: initialQuality },
          ],
        };
        const saved = await persistServerMutation(owned, next);
        return NextResponse.json({
          document: initialDocument,
          initialQuality,
          quality: initialQuality,
          reachedTarget: false,
          qualityTargetBlocked: true,
          callCounts: { generation: 1, review: 0 },
          error: qualityTargetFailure(initialQuality),
          diagnostic: generationDiagnostic,
          executionDiagnostics: {
            generation: {
              startedAt: generationStartedAt.toISOString(),
              completedAt: generationCompletedAt.toISOString(),
              elapsedMs: generationCompletedAt.getTime() - generationStartedAt.getTime(),
              provider: result.providerDiagnostics,
            },
          },
          data: saved,
        });
      }
      try {
        const reviewStartedAt = new Date();
        const pipeline = await new EditorialQualityPipeline(new OpenAIProvider(undefined, openAIReviewModel(), reviewTimeoutMs())).run({
          document: initialDocument,
          finalReviewInstruction: (document, quality) => approvalAwareInstruction(
            finalEditInstruction(document, quality, opportunity),
            owned,
            existing,
          ),
          parseInput: { contentId, contentType: opportunity.contentType as never, contentOpportunity: opportunity, keywords, platform: required(input.platform) as never, projectId },
          placeDocument: async (document) => applyContentPolicy(await placeAvailablePublishingPosts(owned, existing, document), existing),
          qualityContext: context,
          requiredInformation: [...opportunity.expectedCoverage, ...editorialRequirements(editorialContext)],
        });
        const reviewCompletedAt = new Date();
        const executionDiagnostics = {
          generation: {
            startedAt: generationStartedAt.toISOString(),
            completedAt: generationCompletedAt.toISOString(),
            elapsedMs: generationCompletedAt.getTime() - generationStartedAt.getTime(),
            provider: result.providerDiagnostics,
          },
          review: {
            startedAt: reviewStartedAt.toISOString(),
            completedAt: reviewCompletedAt.toISOString(),
            elapsedMs: reviewCompletedAt.getTime() - reviewStartedAt.getTime(),
            provider: pipeline.providerDiagnostics,
          },
        };
        const { document, quality } = pipeline;
        if (!pipeline.reachedTarget || !isStandardQualityApproved(quality)) {
          const failure = qualityTargetFailure(quality);
          const diagnostic = analyzeLongFormDocument(document, opportunity.qualityTarget);
          let persisted = applyCanonicalDocument(owned, existing.id, document, "ai_revision", quality.reviewedAt);
          persisted = updateContent(persisted, existing.id, { quality, status: "in_review", generationError: undefined, reviewError: undefined, qualityTarget: opportunity.qualityTarget, generationDiagnostic, reviewDiagnostic: document.metadata?.reviewDiagnostic ?? diagnostic });
          if (existing.planningWorkflow) persisted = completeContentGeneration(persisted, {
            workspaceId: owned.workspace!.id,
            projectId,
            contentId,
            operationId: generationOperationId,
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
            document,
            reachedTarget: false,
            qualityTargetBlocked: true,
            callCounts: { generation: 1, review: 1 },
            error: failure,
            diagnostic,
            executionDiagnostics,
            data: saved,
          });
        }
        let persisted = applyCanonicalDocument(owned, existing.id, document, "ai_revision", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, {
          quality,
          status: "ready",
          generationError: undefined,
          reviewError: undefined,
          qualityTarget: opportunity.qualityTarget,
          generationDiagnostic: initialDocument.metadata?.generationDiagnostic,
          reviewDiagnostic: document.metadata?.reviewDiagnostic ?? analyzeLongFormDocument(document, opportunity.qualityTarget),
        });
        if (existing.planningWorkflow) persisted = completeContentGeneration(persisted, { workspaceId: owned.workspace!.id, projectId, contentId, operationId: generationOperationId, now: quality.reviewedAt });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        const saved = await persistServerMutation(owned, next);
        return NextResponse.json({ document, initialQuality, quality, finalReviewQuality: pipeline.finalReviewQuality, qualityHistory: pipeline.qualityHistory, attemptHistory: pipeline.attemptHistory, automaticImprovementCount: 0, reachedTarget: true, finalRevisionId: contentRevisionId(document), callCounts: { generation: 1, review: 1 }, executionDiagnostics, data: saved });
      } catch (error) {
        const quality = new QualityEngine().review(initialDocument, context);
        const failure = `최종 품질 검토·편집에 실패했습니다: ${message(error)}`;
        const diagnostic = analyzeLongFormDocument(initialDocument, opportunity.qualityTarget);
        let persisted = applyCanonicalDocument(owned, existing.id, initialDocument, "ai_revision", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, { quality, status: "in_review", generationError: undefined, reviewError: failure, qualityTarget: opportunity.qualityTarget, generationDiagnostic });
        if (existing.planningWorkflow) persisted = failContentPlanning(persisted, {
          workspaceId: owned.workspace!.id,
          projectId,
          contentId,
          operationId: generationOperationId,
          error: failure,
          retryFrom: "review",
          now: quality.reviewedAt,
          diagnostic,
        });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        const saved = await persistServerMutation(owned, next);
        return NextResponse.json({
          aiReviewError: message(error),
          document: initialDocument,
          initialQuality,
          quality,
          reachedTarget: false,
          qualityTargetBlocked: true,
          callCounts: { generation: 1, review: 1 },
          error: failure,
          diagnostic,
          executionDiagnostics: {
            generation: {
              startedAt: generationStartedAt.toISOString(),
              completedAt: generationCompletedAt.toISOString(),
              elapsedMs: generationCompletedAt.getTime() - generationStartedAt.getTime(),
              provider: result.providerDiagnostics,
            },
            review: { requestTimeoutMs: reviewTimeoutMs() },
          },
          data: saved,
        });
      }
      } finally {
        activeGenerationOperations.delete(generationExecutionKey);
      }
    }
    if (body.action === "final-review") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      ownedProject(data, content.projectId);
      const keywords = content.opportunity ? contentOpportunityKeywords(content.opportunity) : resolveConfirmedGenerationKeywords(content, [content.primaryKeyword]);
      const initialDocument = await placeAvailablePublishingPosts(data, content, content.document);
      const initialQuality = new QualityEngine().review(initialDocument, qualityContext(content));
      const finalEdit = await new OpenAIProvider(undefined, openAIReviewModel(), reviewTimeoutMs()).generate({
        instruction: approvalAwareInstruction(
          finalEditInstruction(initialDocument, initialQuality, content.opportunity),
          data,
          content,
        ),
        metadata: { task: "quality-final-edit" },
      });
      let document = preserveCanonicalSeoMetadata(content.document, restoreProtectedImageAssets(content.document, new EditorialGenerationStrategy().parse(finalEdit.content, { contentId, contentType: (content.contentType ?? "article") as never, ...(content.opportunity ? { contentOpportunity: content.opportunity } : {}), keywords, platform: (content.platform ?? "tistory") as never, projectId: content.projectId })));
      document = applyContentPolicy(await placeAvailablePublishingPosts(data, content, document), content);
      const reviewedAt = new Date().toISOString();
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: editorialRevisionId(document), reviewedAt });
      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", reviewedAt);
      next = updateContent(next, contentId, { quality, status: isPublishReady(document, quality) ? "ready" : "in_review", generationError: opportunityFailure(quality), updatedAt: reviewedAt });
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
        instruction: withStoredEvidencePassagesInstruction(approvalAwareInstruction(`Revise the canonical ContentDocument according to the user's instruction. The confirmed Content Opportunity is immutable: ${JSON.stringify(current.opportunity ?? { primaryKeyword: current.primaryKeyword, searchIntent: current.searchIntent })}. Keep the selected topic, primary keyword, search intent, secondary keywords, and expected coverage aligned as one article; never satisfy this by attaching a keyword to an unrelated title. Preserve unaffected blocks and every attached image source, assetId, ALT, prompt, purpose, and media field. For source-empty recommendations, keep each prompt grounded in its nearest H2 and make image scenes differ in at least two of subject, action, background, composition, viewpoint, or information expression. Never publish or invoke browser automation. Return the complete revised document as JSON only in {"title":"...","blocks":[...]} form.\nUser instruction: ${required(input.instruction)}\nCurrent document: ${JSON.stringify(contentDocumentAIContext(current.document))}`, data, current), current.document),
        metadata: { task: "content-revision" },
      });
      const parsed = new EditorialGenerationStrategy().parse(response.content, {
        contentId: required(input.contentId), contentType: (typeof input.contentType === "string" ? input.contentType : "article") as never,
        ...(current.opportunity ? { contentOpportunity: current.opportunity } : {}), keywords,
        platform: "editor" as never, projectId,
      });
      const document = applyContentPolicy(preserveCanonicalSeoMetadata(current.document, restoreProtectedImageAssets(current.document, parsed)), current, true);
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
        instruction: approvalAwareInstruction(`This is the only quality-improvement AI call. Return a fully approved final manuscript in this response. Improve this complete canonical ContentDocument using only the Quality Review tasks below. Preserve the immutable Content Opportunity as one plan: ${JSON.stringify(content.opportunity ? contentOpportunityAIContext(content.opportunity) : { primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent })}. Correct topic drift across title, headings, body, images, links, and CTA instead of mechanically prefixing the keyword. Preserve every unaffected block ID and the user's existing block order. Do not create, remove, replace, or edit internal_link or related_post blocks; verified links are protected and restored by the server. Preserve every attached image source, assetId, ALT, prompt, purpose, and media field. For source-empty image recommendations, resolve image-strategy tasks by grounding each prompt in its nearest H2 and differentiating subject, action, background, composition, viewpoint, and information expression while keeping one brand style. Never return an empty internal-link placeholder. Do not add monetization links. Preserve existing metadata exactly unless the SEO or search-intent task requires a change. Return the complete revised document as JSON only in {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"blocks":[...]} form. Do not return commentary.
Mandatory approval contract: overallScore >= 95; searchIntent, SEO, readability, and completeness >= 95; every other dimension >= 80; no blocked finding. Do not raise completeness or usefulness by lowering readability below 95. Break long sentences and paragraphs while adding concrete criteria, sequence, examples, cautions, and alternatives.
Current Rule Quality report: ${JSON.stringify(currentQuality)}
Quality tasks: ${JSON.stringify(currentQuality.tasks)}
  Current document: ${JSON.stringify(contentDocumentAIContext(content.document))}`, data, content),
        metadata: { task: "quality-improvement" },
      });
      const parsed = new EditorialGenerationStrategy().parse(response.content, {
        contentId, contentType: (content.contentType ?? "article") as never,
        ...(content.opportunity ? { contentOpportunity: content.opportunity } : {}), keywords, platform: (content.platform ?? "canonical") as never, projectId: content.projectId,
      });
      let document = preserveCanonicalSeoMetadata(content.document, restoreProtectedImageAssets(content.document, restoreVerifiedEditorialLinks(content.document, parsed)));
      document = applyContentPolicy(await placeAvailablePublishingPosts(data, content, document), content);
      const appliedAt = new Date().toISOString();
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: editorialRevisionId(document), reviewedAt: appliedAt });
      const improvement = evaluateQualityImprovement(currentQuality, quality);
      if (isPublishReady(document, quality)) {
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
      let document = preserveCanonicalSeoMetadata(content.document, restoreProtectedImageAssets(content.document, restoreVerifiedEditorialLinks(content.document, candidate)));
      document = applyContentPolicy(await placeAvailablePublishingPosts(data, content, document), content);
      const baselineQuality = new QualityEngine().review(content.document, qualityContext(content));
      const appliedAt = new Date().toISOString();
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: editorialRevisionId(document), reviewedAt: appliedAt });
      const improvement = evaluateQualityImprovement(baselineQuality, quality);
      if (!improvement.accepted) throw new Error(qualityImprovementRejectionMessage(improvement));
      if (!isPublishReady(document, quality)) throw new Error(`개선안이 standard 품질 승인 및 Planning 품질 목표를 충족하지 못했습니다. 전체 ${quality.overallScore}점, 승인 유형 ${quality.approvalType ?? "none"}입니다.`);
      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", appliedAt);
      next = updateContent(next, contentId, { quality, status: isPublishReady(document, quality) ? "ready" : "in_review", updatedAt: appliedAt });
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
    if (body.action === "render-platform" || body.action === "render-tistory") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      const requestedPlatform = body.action === "render-tistory"
        ? "tistory"
        : required(body.input?.platform);
      if (requestedPlatform !== "tistory" && requestedPlatform !== "wordpress") {
        throw new Error("지원하지 않는 Preview 플랫폼입니다.");
      }
      const html = requestedPlatform === "wordpress"
        ? new WordPressHtmlRenderer().render(content.document)
        : (await new TistoryPublishingAdapter().prepare({
            content: content.document,
            platform: "tistory",
          })).payload.html;
      return NextResponse.json({
        html,
        platform: requestedPlatform,
        revisionId: contentRevisionId(content.document),
      });
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
      const document = await placeAvailablePublishingPosts(data, content, content.document);
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: editorialRevisionId(document) });
      let next = contentRevisionId(document) === contentRevisionId(content.document) ? data : applyCanonicalDocument(data, contentId, document, "autosave", quality.reviewedAt);
      next = updateContent(next, contentId, { quality, status: isPublishReady(document, quality) ? "ready" : "in_review", updatedAt: quality.reviewedAt });
      const persisted = { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] };
      const saved = await persistServerMutation(data, persisted);
      return NextResponse.json({ document, quality, data: saved });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    await persistWorkflowFailure(body, error);
    const status = message(error).includes("OPENAI_API_KEY") ? 503 : 400;
    const diagnostic = longFormDiagnostic(error);
    if (diagnostic) {
      console.error("[studio-generation] long-form validation failed", {
        code: diagnostic.code,
        totalProseCharacters: diagnostic.totalProseCharacters,
        headingCount: diagnostic.headingCount,
        sections: diagnostic.sections,
        violations: diagnostic.violations,
      });
    }
    const code = error instanceof ApprovalSourcePreflightError
      ? error.code
      : undefined;
    const approvalDiagnostic = approvalSourcePreflightDiagnostic(error);
    return NextResponse.json({
      error: message(error),
      ...(code ? { code } : {}),
      ...(diagnostic ? { diagnostic } : {}),
      ...(approvalDiagnostic ? { approvalSourcePreflightDiagnostic: approvalDiagnostic } : {}),
      ...(aiProviderDiagnostic(error) ? { aiProviderDiagnostic: aiProviderDiagnostic(error) } : {}),
    }, { status });
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
  const qualityTarget = content.qualityTarget ?? content.opportunity?.qualityTarget ?? aligned.document.metadata?.qualityTarget;
  const baseMetadata = aligned.document.metadata ?? content.document?.metadata;
  const policyApplied: ContentDocument = {
    ...aligned.document,
    ...(baseMetadata ? { metadata: {
      ...baseMetadata,
      ...(qualityTarget ? { qualityTarget } : {}),
      longFormStructure: aligned.document.metadata?.longFormStructure ?? content.document?.metadata?.longFormStructure,
      tags,
    } } : {}),
  };
  return preserveContentApprovalPolicy(policyApplied, content);
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
  const planningContent = contentId
    ? data.contents.find((content) =>
        content.id === contentId
        && content.projectId === project.id)
    : undefined;
  const projectContext = planningContent
    ? contentEditorialContext(data, planningContent)
    : JSON.stringify(projectStrategyAIContext(resolveProjectStrategy(project)));
  const rawPlan = manual
    ? createManualPlanningResult(planningRequest, { projectId: project.id, selectionMode: "userSpecified" })
    : await new ContentPlanningStrategy(new OpenAIProvider(undefined, openAIGenerationModel())).analyze(planningRequest, resolveWorkspaceSettings(data).enabledPlatforms, {
      projectId: project.id,
      selectionMode,
      projectContext,
      existingContent: data.contents.filter((content) => content.projectId === project.id && content.id !== contentId).map((content) => `${content.title} | ${content.primaryKeyword ?? ""}`),
      hasVerifiedKeywordData: evidenceBundle.some((value) => value.provider !== "brightStudio" && value.verified),
      evidenceBundle,
    });
  const approvalSnapshot = approvalPolicySnapshotFromEditorialContext(projectContext);
  const contractedPlan = approvalSnapshot
    ? attachApprovalEvidenceContracts(rawPlan, approvalSnapshot)
    : rawPlan;
  const classification = opportunityEvidenceService.classifyCandidates(contractedPlan.opportunityCandidates ?? [], evidenceBundle, data, project);
  const classified = classification.candidates
    .map((candidate) => applyContentDepthPolicy(candidate, {
      domain: rawPlan.domain,
      projectStrategy: editorialContextWithoutDiversityPolicy(projectContext),
    }));
  const plan = withClassifiedCandidates(contractedPlan, classified, classification.excluded);
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
      ...(longFormDiagnostic(error) ? { diagnostic: longFormDiagnostic(error) } : {}),
      ...(approvalSourcePreflightDiagnostic(error)
        ? { approvalSourcePreflightDiagnostic: approvalSourcePreflightDiagnostic(error) }
        : {}),
      ...(aiProviderDiagnostic(error)
        ? { aiProviderDiagnostic: aiProviderDiagnostic(error) }
        : {}),
      now: new Date().toISOString(),
    }) : (() => { throw new Error("Workspace was not found."); })());
  } catch (persistenceError) {
    console.error("[studio-workflow] failed to persist recoverable workflow error", { error: message(persistenceError) });
  }
}

function longFormDiagnostic(error: unknown): LongFormDiagnostic | undefined {
  return error instanceof LongFormValidationError ? error.diagnostic : undefined;
}

function approvalSourcePreflightDiagnostic(error: unknown) {
  return error instanceof ApprovalSourcePreflightError ? error.diagnostic : undefined;
}

function aiProviderDiagnostic(error: unknown) {
  if (error instanceof AIProviderError) return error.diagnostic;
  return error instanceof ApprovalSourcePreflightError ? error.providerDiagnostics : undefined;
}

function isPublishReady(document: ContentDocument, quality: ReturnType<QualityEngine["review"]>): boolean {
  if (!requiresLongFormValidation(document)) return isStandardQualityApproved(quality);
  const diagnostic = analyzeLongFormDocument(document, document.metadata?.qualityTarget);
  return isStandardQualityApproved(quality)
    && diagnostic.violations.length === 0;
}

function qualityContext(content: UserData["contents"][number], document = content.document) {
  return { contentType: content.contentType, platform: content.platform ?? "canonical", primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent, categoryName: publishingCategoryNames(content).join(", ") || undefined, availableInternalLinkCandidates: document?.metadata?.availableRelatedContentCandidates, internalLinkCatalogStatus: document?.metadata?.internalLinkCatalogStatus, qualityTarget: content.qualityTarget ?? content.opportunity?.qualityTarget ?? document?.metadata?.qualityTarget, ...(content.opportunity ? { opportunity: content.opportunity } : {}), revisionId: document ? editorialRevisionId(document) : undefined };
}

function opportunityFailure(quality: ReturnType<QualityEngine["review"]>): string | undefined {
  return quality.opportunityReview && !quality.opportunityReview.pass
    ? "콘텐츠 기획 불일치가 남아 있어 품질 승인을 차단했습니다. 선택한 주제·대표 키워드·검색 의도에 맞게 원고 전체를 검토해 주세요."
    : undefined;
}

async function ownedWorkspace(workspaceId: string) {
  const data = await studioStore.get<UserData>(collection, stateId);
  if (!data?.workspace || data.workspace.id !== workspaceId) throw new Error("Workspace was not found.");
  return withProjectDefaultPublishingPreparation(data);
}

/**
 * Resolves the Project's declared publishing category onto contents that have
 * no preparation of their own, once per request and before anything reads it.
 *
 * Six places ask a content which category it publishes to, and two of them —
 * the approval persistence store and the readiness execution identity — only
 * ever receive a content, never a Project. Passing the Project to some callers
 * and not others would make `internalLinkCatalogContextKey` disagree with
 * itself and the catalog would look permanently stale. Filling the content in
 * one place keeps every reader consistent without changing any signature.
 *
 * This is derived on load rather than stored. Contents that already carry a
 * preparation, or whose account has no declared default, are returned as the
 * same object, so nothing here registers as a change to persist.
 */
function withProjectDefaultPublishingPreparation(data: UserData): UserData {
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  let changed = false;
  const contents = data.contents.map((content) => {
    const resolved = withProjectDefaultPublishingCategories(content, projects.get(content.projectId));
    if (resolved !== content) changed = true;
    return resolved;
  });
  return changed ? Object.freeze({ ...data, contents: Object.freeze(contents) }) : data;
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

function withClassifiedCandidates(plan: import("../../user-flow/user-data").ContentPlanningResult, candidates: readonly import("../../../core/content").ContentOpportunityCandidate[], excludedOpportunities: readonly import("../../application/data-sources/OpportunityEvidenceService").ExcludedOpportunity[] = []): import("../../user-flow/user-data").ContentPlanningResult {
  const first = candidates[0];
  if (!first) throw new Error("안전 기준과 Project 정책을 통과한 Content Opportunity가 없습니다. 직접 입력한 주제라면 검색 의도와 안전 문구를 확인해 주세요.");
  return Object.freeze({ ...plan, opportunityCandidates: Object.freeze(candidates), excludedOpportunities: Object.freeze(excludedOpportunities), qualityTarget: first.qualityTarget, recommendedPrimaryKeyword: first.primaryKeyword, keywordCandidates: Object.freeze(candidates.map((value) => value.primaryKeyword)), providerSearchIntent: first.providerSearchIntent, searchIntent: first.searchIntent, recommendedContentType: first.contentType, relatedKeywords: first.secondaryKeywords, targetAudience: first.audience, contentGoal: first.contentAngle, recommendationReason: first.selectionRationale, confidence: first.confidence });
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

async function placeAvailablePublishingPosts(
  data: UserData,
  content: UserData["contents"][number],
  document: ContentDocument,
): Promise<ContentDocument> {
  if (!data.workspace) {
    console.info("[internal-link-trace] skipped before workspace resolution", {
      contentId: content.id,
    });
    return document;
  }

  const connections = await connectionRepository.listByWorkspace(data.workspace.id);
  const connection = resolveCanonicalPublishingConnection(data, content, connections);
  if (!connection || !isPlatformEnabled(data, connection.platform)) {
    console.info("[internal-link-trace] skipped before canonical connection resolution", {
      contentId: content.id,
      platform: connection?.platform ?? null,
    });
    return document;
  }

  const categories = publishingCategoryIdentities(content);
  if (!categories.length) {
    console.warn("[internal-link-trace] publishing category is missing", {
      contentId: content.id,
      platform: connection.platform,
    });
    return withInternalLinkCatalogMetadata(document, 0, "category_missing");
  }

  const targets = targetRepository.listByProject
    ? await targetRepository.listByProject(content.projectId)
    : [];
  const connectionSelected = isPublishingConnectionSelectedForContent(
    data,
    content,
    connection.id,
  );
  const targetRegistered = targets.some((target) =>
    target.platformConnectionId === connection.id
    && target.platform === connection.platform);
  const selectedTarget = connectionSelected && targetRegistered;

  console.info("[internal-link-trace] canonical catalog resolution", {
    connectionId: connection.id,
    contentId: content.id,
    platform: connection.platform,
    selectedTarget,
    categories,
  });

  try {
    const catalog = await new PublicPostCatalogApplicationService().read({
      workspaceId: data.workspace.id,
      projectId: content.projectId,
      contentId: content.id,
      content,
      connection,
      selectedTarget,
    });
    const ranked = rankPublishingPostCandidates(document, catalog.posts, content,
      ownPublishedExternalPostIds(data, content));
    const placed = applyInternalLinkCatalogResult(document, ranked, "evaluated");
    console.info("[internal-link-trace] platform catalog evaluated", {
      cached: catalog.cached,
      catalogPostCount: catalog.posts.length,
      contentId: content.id,
      internalLinkCount: placed.blocks.filter((block) =>
        block.type === "button" && block.purpose === "internal_link").length,
      platform: connection.platform,
      rankedCount: ranked.length,
      relatedPostCount: placed.blocks.filter((block) =>
        block.type === "button" && block.purpose === "related_post").length,
    });
    return placed;
  } catch (error) {
    console.error("[studio-generation] Public post catalog unavailable", {
      connectionId: connection.id,
      contentId: content.id,
      error: message(error),
      platform: connection.platform,
      selectedTarget,
    });
    return withInternalLinkCatalogMetadata(document, 0, "catalog_unavailable");
  }
}

// 같은 Project 의 최근 대표 이미지 프롬프트. 시각 계열이 반복되지 않게 하는 데만 쓴다.
// 지금 생성 중인 Content 자신은 제외한다.
function recentHeroImagePrompts(contents: UserData["contents"], projectId: string, contentId: string): readonly string[] {
  return contents
    .filter((content) => content.projectId === projectId && content.id !== contentId)
    .map((content) => ({
      prompt: content.document?.blocks.flatMap((block) => (
        block.type === "image" && block.purpose === "hero" && block.prompt?.trim()
          ? [block.prompt.trim()]
          : []))[0] ?? "",
      updatedAt: content.document?.metadata?.updatedAt ?? content.updatedAt ?? "",
    }))
    .filter((item) => Boolean(item.prompt))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8)
    .map((item) => item.prompt);
}

function qualityTargetFailure(quality: ReturnType<QualityEngine["review"]>): string {
  const missing = quality.dimensions
    .filter((item) => quality.weights[item.category] > 0)
    .filter((item) => item.status === "blocked" || item.score < (["searchIntent", "seo", "readability", "completeness"].includes(item.category) ? 95 : 80))
    .map((item) => `${item.category} ${item.score}`);
  return `원고가 자동 품질 승인 기준에 도달하지 못했습니다. 전체 ${quality.overallScore}점${missing.length ? `, 미달 항목: ${missing.join(", ")}` : ""}. Content 기록과 진단은 보존되지만 표준 승인 기준을 충족하기 전에는 Editor 준비 상태로 전환되지 않습니다.`;
}

function finalEditInstruction(document: ContentDocument, quality: ReturnType<QualityEngine["review"]>, opportunity?: ConfirmedContentOpportunity): string {
  return `Act as the Senior Editor performing the second and final AI call for this Korean canonical ContentDocument. Rewrite the complete manuscript in one pass so it directly resolves the confirmed search intent, opens with the core answer, removes repetition and generic AI phrasing, deepens only the sections that are genuinely incomplete, connects paragraphs naturally, improves the conclusion, and unifies polite Korean tone. Do not expose planning notes or editorial commentary.
  The confirmed Content Opportunity is immutable: ${JSON.stringify(opportunity ? contentOpportunityAIContext(opportunity) : null)}. Keep the title, headings, body, image recommendations, link context, and CTA aligned to that one Opportunity. If the manuscript drifts to another topic, correct the complete manuscript rather than mechanically inserting the primary keyword.
Fix every actionable server rule-quality issue without gaming scores. Remove fabricated first-person experience, unsupported statistics, overconfident claims, keyword stuffing, empty headings, repeated one-sentence paragraphs, and placeholder prose. For health topics, preserve concrete practical guidance while avoiding diagnosis, treatment promises, fabricated evidence, and repetitive disclaimers. Use observable criteria, conditions, sequence, exceptions, and next actions when exact external evidence is not supplied.
Preserve all verified internal_link and related_post labels, URLs, purposes, targets, and sourceExternalPostId values exactly. Preserve every attached image source, assetId, ALT, prompt, purpose, and media field exactly. Source-empty image recommendations may be revised or removed when they are redundant, but every retained recommendation must have a distinct editorial purpose and section context. Keep the title as the only H1 and use semantic H2/H3 structure. Return the complete final article as JSON only in the same canonical shape accepted by the generator, with no commentary.
Server rule report: ${JSON.stringify({ overallScore: quality.overallScore, dimensions: quality.dimensions, tasks: quality.tasks })}
  Canonical document: ${JSON.stringify(contentDocumentAIContext(document))}`;
}
