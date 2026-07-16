import { NextResponse } from "next/server";

import { studioStore } from "../../application/studio-store";
import { AIWorkflow } from "../../../core/ai";
import { contentRevisionId, QualityEngine } from "../../../core/quality";
import { EditorialGenerationStrategy } from "../../application/EditorialGenerationStrategy";
import { OpenAIProvider } from "../../application/OpenAIProvider";
import { ContentPlanningStrategy, createManualPlanningResult } from "../../application/ContentPlanningStrategy";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { placeRecommendedPosts, rankRelatedPosts, type ContentDocument } from "../../../core/content";
import { applyCanonicalDocument, updateContent, type UserData } from "../../user-flow/user-data";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";
import { connectionRepository, targetRepository } from "../../application/connections/connection-runtime";
import { TistoryPostCatalogApplicationService } from "../../application/publishing/TistoryPostCatalogApplicationService";

const collection = "application";
const stateId = "user-data";

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
    if (!body || typeof body !== "object") throw new Error("Application state is required.");
    const current = await studioStore.get<UserData>(collection, stateId);
    await studioStore.set(collection, stateId, preserveServerQuality(current, body));
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function preserveServerQuality(current: UserData | undefined, input: unknown): unknown {
  if (!current || !input || typeof input !== "object" || !Array.isArray((input as Partial<UserData>).contents)) return input;
  const incoming = input as UserData;
  const contents = incoming.contents.map((content) => {
    const serverContent = current.contents.find((item) => item.id === content.id);
    if (serverContent?.quality) return { ...content, quality: serverContent.quality };
    const { quality: _clientQuality, ...withoutClientQuality } = content; void _clientQuality;
    return withoutClientQuality;
  });
  return { ...incoming, contents, qualityReports: current.qualityReports ?? [] };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; input?: Record<string, unknown> };
    if (body.action === "plan") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      ownedProject(data, required(body.input?.projectId));
      const plan = await new ContentPlanningStrategy(new OpenAIProvider()).analyze(required(body.input?.naturalLanguageRequest), resolveWorkspaceSettings(data).enabledPlatforms);
      return NextResponse.json({ plan });
    }
    if (body.action === "manual-plan") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      ownedProject(data, required(body.input?.projectId));
      return NextResponse.json({ plan: createManualPlanningResult(required(body.input?.naturalLanguageRequest)) });
    }
    if (body.action === "generate") {
      const input = body.input ?? {};
      const owned = await ownedWorkspace(required(input.workspaceId));
      const projectId = required(input.projectId);
      ownedProject(owned, projectId);
      const contentId = required(input.contentId);
      const existing = owned.contents.find((item) => item.id === contentId && item.workspaceId === owned.workspace!.id && item.projectId === projectId);
      if (!existing) throw new Error("Content does not belong to the requested Project.");
      const provider = new OpenAIProvider();
      const workflow = new AIWorkflow(provider, new EditorialGenerationStrategy());
      const result = await workflow.generate({
        contentId,
        contentType: required(input.contentType) as never,
        editorialContext: typeof input.editorialContext === "string" ? input.editorialContext : undefined,
        keywords: Array.isArray(input.keywords) ? input.keywords.map(String) : [],
        platform: required(input.platform) as never,
        projectId,
      });
      const initialDocument = await placeAvailableTistoryPosts(owned, existing, result.document);
      const context = { contentType: String(input.contentType), platform: String(input.platform), primaryKeyword: existing.primaryKeyword ?? (Array.isArray(input.keywords) ? String(input.keywords[0] ?? "") : undefined), searchIntent: existing.searchIntent };
      const initialQuality = new QualityEngine().review(initialDocument, context);
      try {
        const reviewProvider = new OpenAIProvider(undefined, undefined, reviewTimeoutMs());
        const finalEdit = await reviewProvider.generate({ instruction: finalEditInstruction(initialDocument, initialQuality), metadata: { task: "quality-final-edit" } });
        let document = new EditorialGenerationStrategy().parse(finalEdit.content, {
          contentId, contentType: required(input.contentType) as never, keywords: Array.isArray(input.keywords) ? input.keywords.map(String) : [], platform: required(input.platform) as never, projectId,
        });
        document = await placeAvailableTistoryPosts(owned, existing, document);
        const quality = new QualityEngine().review(document, context);
        let persisted = applyCanonicalDocument(owned, existing.id, document, "ai_revision", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, { quality, status: quality.approved ? "ready" : "in_review" });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        await studioStore.set(collection, stateId, next);
        return NextResponse.json({ document, initialQuality, quality, finalRevisionId: contentRevisionId(document), data: next });
      } catch (error) {
        const quality = new QualityEngine().review(initialDocument, context);
        let persisted = applyCanonicalDocument(owned, existing.id, initialDocument, "generation", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, { quality, status: "in_review", generationError: `자동 Final Review 실패: ${message(error)}` });
        const next = { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] };
        await studioStore.set(collection, stateId, next);
        return NextResponse.json({ aiReviewError: message(error), document: initialDocument, initialQuality, quality, data: next });
      }
    }
    if (body.action === "final-review") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      ownedProject(data, content.projectId);
      const initialDocument = await placeAvailableTistoryPosts(data, content, content.document);
      const initialQuality = new QualityEngine().review(initialDocument, qualityContext(content));
      const finalEdit = await new OpenAIProvider(undefined, undefined, reviewTimeoutMs()).generate({ instruction: finalEditInstruction(initialDocument, initialQuality), metadata: { task: "quality-final-edit" } });
      let document = new EditorialGenerationStrategy().parse(finalEdit.content, { contentId, contentType: (content.contentType ?? "article") as never, keywords: [content.primaryKeyword ?? "content", ...(content.relatedKeywords ?? [])], platform: (content.platform ?? "tistory") as never, projectId: content.projectId });
      document = await placeAvailableTistoryPosts(data, content, document);
      const reviewedAt = new Date().toISOString();
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document), reviewedAt });
      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", reviewedAt);
      next = updateContent(next, contentId, { quality, status: quality.approved ? "ready" : "in_review", generationError: undefined, updatedAt: reviewedAt });
      next = { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] };
      await studioStore.set(collection, stateId, next);
      return NextResponse.json({ document, initialQuality, quality, revisionId: contentRevisionId(document), data: next });
    }
    if (body.action === "revise") {
      const input = body.input ?? {};
      const data = await ownedWorkspace(required(input.workspaceId));
      const projectId = required(input.projectId);
      ownedProject(data, projectId);
      const current = data.contents.find((item) => item.id === required(input.contentId) && item.workspaceId === data.workspace!.id && item.projectId === projectId);
      if (!current?.document) throw new Error("Content does not belong to the requested Project.");
      const provider = new OpenAIProvider();
      const response = await provider.generate({
        instruction: `Revise the canonical ContentDocument according to the user's instruction. Preserve unaffected blocks. Never publish or invoke browser automation. Return the complete revised document as JSON only in {"title":"...","blocks":[...]} form.\nUser instruction: ${required(input.instruction)}\nCurrent document: ${JSON.stringify(input.document)}`,
        metadata: { task: "content-revision" },
      });
      const document = new EditorialGenerationStrategy().parse(response.content, {
        contentId: required(input.contentId), contentType: (typeof input.contentType === "string" ? input.contentType : "article") as never,
        keywords: [typeof input.primaryKeyword === "string" ? input.primaryKeyword : "content"],
        platform: "editor" as never, projectId,
      });
      return NextResponse.json({ document });
    }
    if (body.action === "improve-quality") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      const currentQuality = new QualityEngine().review(content.document, qualityContext(content));
      const response = await new OpenAIProvider().generate({
        instruction: `Improve this complete canonical ContentDocument using only the Quality Review tasks below. Preserve every unaffected block ID and the user's existing block order. Insert a needed internal link immediately after the most relevant heading section, never all at the document end. Keep the conclusion followed only by related_post links. Do not invent URLs: without an approved real URL, preserve a recommendation with empty targetUrl. Do not add monetization links. Return the complete revised document as JSON only in {"title":"...","blocks":[...]} form. Do not return commentary.\nQuality tasks: ${JSON.stringify(currentQuality.tasks)}\nCurrent document: ${JSON.stringify(content.document)}`,
        metadata: { task: "quality-improvement" },
      });
      const document = new EditorialGenerationStrategy().parse(response.content, {
        contentId, contentType: (content.contentType ?? "article") as never,
        keywords: [content.primaryKeyword ?? "content"], platform: (content.platform ?? "canonical") as never, projectId: content.projectId,
      });
      return NextResponse.json({ document, basedOnRevisionId: contentRevisionId(content.document), quality: currentQuality });
    }
    if (body.action === "accept-improvement") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const contentId = required(body.input?.contentId), basedOnRevisionId = required(body.input?.basedOnRevisionId);
      const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace!.id);
      if (!content?.document || contentRevisionId(content.document) !== basedOnRevisionId) throw new Error("현재 문서가 변경되어 개선안을 적용할 수 없습니다. 새 개선안을 만들어 주세요.");
      const raw = body.input?.document;
      if (!raw || typeof raw !== "object") throw new Error("개선 문서가 없습니다.");
      const document = raw as import("../../../core/content").ContentDocument;
      if (document.id !== content.document.id) throw new Error("개선 문서 ID가 현재 문서와 일치하지 않습니다.");
      const appliedAt = new Date().toISOString();
      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", appliedAt);
      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document), reviewedAt: appliedAt });
      next = updateContent(next, contentId, { quality, status: quality.approved ? "ready" : "in_review", updatedAt: appliedAt });
      next = { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] };
      await studioStore.set(collection, stateId, next);
      return NextResponse.json({ document, quality, revisionId: contentRevisionId(document), data: next });
    }
    if (body.action === "render-tistory") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      const content = data.contents.find((item) => item.id === required(body.input?.contentId) && item.workspaceId === data.workspace!.id);
      if (!content?.document) throw new Error("Canonical content was not found.");
      const prepared = await new TistoryPublishingAdapter().prepare({ content: content.document, platform: "tistory" });
      return NextResponse.json({ html: prepared.payload.html, revisionId: contentRevisionId(content.document) });
    }
    if (body.action === "prepare-tistory") {
      const data = await ownedWorkspace(required(body.input?.workspaceId));
      if (!isPlatformEnabled(data, "tistory")) throw new Error("Tistory is disabled in Workspace Settings.");
      const content = data.contents.find((item) => item.id === required(body.input?.contentId) && item.workspaceId === data.workspace!.id);
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
      await studioStore.set(collection, stateId, persisted);
      return NextResponse.json({ document, quality, data: persisted });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    const status = message(error).includes("OPENAI_API_KEY") ? 503 : 400;
    return NextResponse.json({ error: message(error) }, { status });
  }
}

function qualityContext(content: UserData["contents"][number]) {
  return { contentType: content.contentType, platform: content.platform ?? "canonical", primaryKeyword: content.primaryKeyword, searchIntent: content.searchIntent, revisionId: content.document ? contentRevisionId(content.document) : undefined };
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

function message(error: unknown): string { return error instanceof Error ? error.message : "Request failed."; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("Required generation input is missing."); return value.trim(); }
function reviewTimeoutMs(): number {
  const parsed = Number(process.env.OPENAI_REVIEW_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 120_000;
}

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

function finalEditInstruction(document: ContentDocument, quality: ReturnType<QualityEngine["review"]>): string {
  return `Perform the single final Quality Review and Final Edit for this canonical ContentDocument. Fix every actionable rule-quality issue in one pass. Preserve all verified internal_link and related_post labels, URLs, purposes, and sourceExternalPostId values exactly; never invent or replace URLs. Image blocks may remain source-empty recommendations when they have specific ALT text because upload readiness is separate from manuscript quality. Add a CTA only when this topic genuinely needs an external action and only when a real approved URL already exists. Keep the title as the only H1, use sequential H2/H3 sections, keep paragraphs readable, meet the requested depth, include a truthful meta description, and directly satisfy the confirmed search intent and primary keyword. Return the complete final article as JSON only in the same canonical shape accepted by the generator, with no commentary.\nServer rule report: ${JSON.stringify({ overallScore: quality.overallScore, dimensions: quality.dimensions, tasks: quality.tasks })}\nCanonical document: ${JSON.stringify(document)}`;
}
