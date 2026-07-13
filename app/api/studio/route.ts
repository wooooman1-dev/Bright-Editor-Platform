import { NextResponse } from "next/server";

import { studioStore } from "../../application/studio-store";
import { AIWorkflow } from "../../../core/ai";
import { contentRevisionId, QualityEngine } from "../../../core/quality";
import { EditorialGenerationStrategy } from "../../application/EditorialGenerationStrategy";
import { OpenAIProvider } from "../../application/OpenAIProvider";
import { ContentPlanningStrategy, createManualPlanningResult } from "../../application/ContentPlanningStrategy";
import { TistoryPublishingAdapter } from "../../../apps/tistory/publishing/TistoryPublishingAdapter";
import { applyCanonicalDocument, updateContent, type UserData } from "../../user-flow/user-data";
import { isPlatformEnabled, resolveWorkspaceSettings } from "../../application/settings/WorkspaceSettingsService";

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
      const plan = await new ContentPlanningStrategy(new OpenAIProvider()).analyze(required(body.input?.naturalLanguageRequest), resolveWorkspaceSettings(data).enabledPlatforms);
      return NextResponse.json({ plan });
    }
    if (body.action === "manual-plan") {
      await ownedWorkspace(required(body.input?.workspaceId));
      return NextResponse.json({ plan: createManualPlanningResult(required(body.input?.naturalLanguageRequest)) });
    }
    if (body.action === "generate") {
      const input = body.input ?? {};
      const provider = new OpenAIProvider();
      const workflow = new AIWorkflow(provider, new EditorialGenerationStrategy());
      const result = await workflow.generate({
        contentId: typeof input.contentId === "string" ? input.contentId : undefined,
        contentType: required(input.contentType) as never,
        editorialContext: typeof input.editorialContext === "string" ? input.editorialContext : undefined,
        keywords: Array.isArray(input.keywords) ? input.keywords.map(String) : [],
        platform: required(input.platform) as never,
        projectId: required(input.projectId),
      });
      const owned = typeof input.workspaceId === "string" ? await ownedWorkspace(input.workspaceId) : undefined;
      const existing = owned?.contents.find((item) => item.id === input.contentId && item.projectId === input.projectId);
      const quality = new QualityEngine().review(result.document, { contentType: String(input.contentType), platform: String(input.platform), primaryKeyword: existing?.primaryKeyword ?? (Array.isArray(input.keywords) ? String(input.keywords[0] ?? "") : undefined), searchIntent: existing?.searchIntent });
      if (owned && existing) {
        let persisted = applyCanonicalDocument(owned, existing.id, result.document, "generation", quality.reviewedAt);
        persisted = updateContent(persisted, existing.id, { quality, status: quality.approved ? "ready" : "in_review" });
        await studioStore.set(collection, stateId, { ...persisted, qualityReports: [...(persisted.qualityReports ?? []).filter((item) => item.contentId !== existing.id), { contentId: existing.id, report: quality }] });
      }
      try {
        const reviewProvider = new OpenAIProvider(undefined, undefined, reviewTimeoutMs());
        const aiReview = await reviewProvider.generate({ instruction: `Review this canonical content once for SEO, readability, search intent, structure, image placement, internal links, CTA, and factual risk. Return concise JSON only with findings and no rewritten article:\n${JSON.stringify(result.document)}` });
        return NextResponse.json({ aiReview: aiReview.content, document: result.document, quality });
      } catch (error) {
        return NextResponse.json({ aiReviewError: message(error), document: result.document, quality });
      }
    }
    if (body.action === "revise") {
      const input = body.input ?? {};
      const provider = new OpenAIProvider();
      const response = await provider.generate({
        instruction: `Revise the canonical ContentDocument according to the user's instruction. Preserve unaffected blocks. Never publish or invoke browser automation. Return the complete revised document as JSON only in {"title":"...","blocks":[...]} form.\nUser instruction: ${required(input.instruction)}\nCurrent document: ${JSON.stringify(input.document)}`,
        metadata: { task: "content-revision" },
      });
      const document = new EditorialGenerationStrategy().parse(response.content, {
        contentId: required(input.contentId), contentType: (typeof input.contentType === "string" ? input.contentType : "article") as never,
        keywords: [typeof input.primaryKeyword === "string" ? input.primaryKeyword : "content"],
        platform: "editor" as never, projectId: required(input.projectId),
      });
      return NextResponse.json({ document });
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
      const quality = new QualityEngine().review(content.document, qualityContext(content));
      const next = updateContent(data, contentId, { quality, status: quality.approved ? "ready" : "in_review", updatedAt: quality.reviewedAt });
      await studioStore.set(collection, stateId, { ...next, qualityReports: [...(next.qualityReports ?? []).filter((item) => item.contentId !== contentId), { contentId, report: quality }] });
      return NextResponse.json({ quality });
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

function message(error: unknown): string { return error instanceof Error ? error.message : "Request failed."; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("Required generation input is missing."); return value.trim(); }
function reviewTimeoutMs(): number {
  const parsed = Number(process.env.OPENAI_REVIEW_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}
