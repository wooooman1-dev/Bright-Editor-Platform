"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeContentOpportunityAlignment, calculateContentMetrics, hasCurrentContentOpportunityFingerprint, opportunityEvidenceLabel, placeRecommendedPosts, type ContentDocument, type PublicPostCandidate } from "../../core/content";
import { contentRevisionId, type QualityCategory, type QualityReport } from "../../core/quality";
import { PageContainer } from "../shared/ui/PageContainer";
import { applyCanonicalDocument, type UserContent, type UserData, type UserProject, type WorkspacePlatform } from "./user-data";
import { normalizeQualityReview, type NormalizedQualityReview } from "./quality-review-ui";
import { ContentDocumentEditor } from "./ContentDocumentEditor";
import { ContentDangerZone } from "./ContentDangerZone";
import { ContentSeoTitleStatus } from "./ContentSeoTitleStatus";
import { QualityImprovementPreview } from "./QualityImprovementPreview";

type SafeConnection = Readonly<{ id: string; platform: "tistory" | "wordpress"; displayName: string; status: string; lastVerifiedAt?: string; publicMetadata?: Readonly<{ sessionStateAvailable?: boolean }> }>;
type PreviewMode = "desktop" | "mobile";
type EditorViewMode = "visual" | "html";
type SafeCategory = Readonly<{ id: string; name: string; depth: number; parentId?: string }>;
type CategoryState = "idle" | "loading" | "ready" | "stale" | "empty" | "expired" | "error";
type Operation = "idle" | "quality" | "improving" | "applying" | "preview" | "categories" | "category-save" | "draft-save" | "deleting";
type PostCatalogState = "idle" | "loading" | "success" | "empty" | "partial" | "session_expired" | "selector_error" | "permission_denied" | "connection_error";
type TistoryReadiness = Readonly<{ ready: boolean; checks: readonly Readonly<{ key: string; passed: boolean; message: string }>[] }>;

export function EditorWorkspace({ content, data, project, onBack, onPersist }: { content: UserContent; data: UserData; project: UserProject; onBack: () => void; onPersist: (data: UserData) => Promise<void> }) {
  const [title, setTitle] = useState(content.title);
  const [notice, setNotice] = useState(content.generationError ? `Generation unavailable: ${content.generationError}. Manual drafting is available.` : "Draft is stored locally.");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [revision, setRevision] = useState(""); const [working, setWorking] = useState(false);
  const [improvementPreview, setImprovementPreview] = useState<ContentDocument>();
  const [improvementBaseRevision, setImprovementBaseRevision] = useState("");
  const [improvementBaselineQuality, setImprovementBaselineQuality] = useState<QualityReport>();
  const [improvementCandidateQuality, setImprovementCandidateQuality] = useState<QualityReport>();
  const [improvementDecision, setImprovementDecision] = useState<Readonly<{ accepted: boolean; reasons: readonly string[] }>>();
  const [improvementFeedback, setImprovementFeedback] = useState<Readonly<{ tone: "info" | "warning" | "error" | "success"; message: string }>>();
  const [documentDraft, setDocumentDraft] = useState<ContentDocument | undefined>(content.document);
  const [operation, setOperation] = useState<Operation>("idle");
  const [previewHtml, setPreviewHtml] = useState(""); const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>("visual");
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]); const [connectionId, setConnectionId] = useState(content.publishingAccountId ?? project.strategy?.defaultPublishingAccountId ?? (content.selectedPublishingAccountIds?.length === 1 ? content.selectedPublishingAccountIds[0] : ""));
  const [enabledPlatforms, setEnabledPlatforms] = useState<readonly WorkspacePlatform[]>([]);
  const initialPreparation = content.publishingPreparation?.tistory;
  const [categoryId, setCategoryId] = useState(initialPreparation ? initialPreparation.platformCategoryId ?? "__uncategorized__" : "");
  const [categoryName, setCategoryName] = useState<string | null>(initialPreparation?.platformCategoryName ?? null);
  const [categories, setCategories] = useState<readonly SafeCategory[]>([]); const [categoryState, setCategoryState] = useState<CategoryState>("idle"); const [categoryMessage, setCategoryMessage] = useState("");
  const [postCandidates, setPostCandidates] = useState<readonly PublicPostCandidate[]>([]); const [postCatalogState, setPostCatalogState] = useState<PostCatalogState>("idle"); const [postCatalogMessage, setPostCatalogMessage] = useState(""); const [postsRetrievedAt, setPostsRetrievedAt] = useState("");
  const [qualityReport, setQualityReport] = useState<unknown>(content.quality); const [qualityRequestState, setQualityRequestState] = useState<"idle" | "loading" | "error">("idle"); const [qualityError, setQualityError] = useState("");
  const [automaticQualityAttempted, setAutomaticQualityAttempted] = useState(Boolean(content.quality));
  const [finalConfirmation, setFinalConfirmation] = useState(false); const [showConfirmation, setShowConfirmation] = useState(false);
  const [readiness, setReadiness] = useState<TistoryReadiness>();
  const selectedConnection = enabledPlatforms.includes("tistory") ? connections.find((item) => item.id === connectionId && item.status === "connected" && item.lastVerifiedAt && item.publicMetadata?.sessionStateAvailable === true) : undefined;
  const historyCount = useMemo(() => (data.history ?? []).filter((entry) => entry.contentId === content.id).length, [content.id, data.history]);
  const liveDocument = useMemo(() => normalizeVisualDocument(documentDraft ? { ...documentDraft, title } : content.document), [content.document, documentDraft, title]);
  const metrics = useMemo(() => calculateContentMetrics(liveDocument ?? { id: content.id, title, blocks: [] }), [content.id, liveDocument, title]);
  const currentRevisionId = liveDocument ? contentRevisionId(liveDocument) : "";
  const normalizedQuality = useMemo(() => normalizeQualityReview(qualityReport, { currentRevisionId, requestState: qualityRequestState, errorMessage: qualityError }), [currentRevisionId, qualityError, qualityReport, qualityRequestState]);
  const categoryOptions = useMemo(() => {
    if (!categoryId || categoryId === "__uncategorized__" || categories.some((item) => String(item.id) === categoryId)) return categories;
    return [{ id: categoryId, name: categoryName ?? "현재 적용된 카테고리", depth: 0 }, ...categories];
  }, [categories, categoryId, categoryName]);
  useEffect(() => { void fetch(`/api/connections?workspaceId=${encodeURIComponent(project.workspaceId)}`, { cache: "no-store" }).then((response) => response.json()).then(async (result: { connections?: SafeConnection[]; enabledPlatforms?: WorkspacePlatform[] }) => { const values = result.connections ?? []; setConnections(values); setEnabledPlatforms(result.enabledPlatforms ?? []); const response = await api("/api/tistory", { action: "prepare", workspaceId: project.workspaceId, projectId: project.id, contentId: content.id, ...(connectionId ? { connectionId } : {}) }) as { data?: UserData; connectionId?: string | null; readiness?: TistoryReadiness }; setConnectionId(response.connectionId ?? ""); if (response.readiness) setReadiness(response.readiness); if (response.data) await onPersist(response.data); }).catch((error) => setNotice(message(error))); }, [content.id, project.id, project.workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (connectionId && connections.some((item) => item.id === connectionId)) { void loadCategories(connectionId); void loadPostCandidates(false); } }, [connectionId, connections]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (connectionId) void loadReadiness(connectionId, finalConfirmation); }, [categoryId, connectionId, finalConfirmation, qualityReport]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!content.document) return;
    let active = true;
    void Promise.resolve().then(() => { if (active) setOperation("preview"); return api("/api/studio", { action: "render-tistory", input: { contentId: content.id, workspaceId: project.workspaceId } }); }).then((result) => { if (active && typeof (result as { html?: unknown }).html === "string") setPreviewHtml((result as { html: string }).html); }).catch((error) => { if (active) setNotice(`미리보기를 자동 생성하지 못했습니다. ${message(error)}`); }).finally(() => { if (active) setOperation("idle"); });
    return () => { active = false; };
  }, [content.document, content.id, project.workspaceId]);
  useEffect(() => { if (liveDocument && !qualityReport && !automaticQualityAttempted && operation === "idle") void Promise.resolve().then(() => { setAutomaticQualityAttempted(true); return review(); }); }, [automaticQualityAttempted, liveDocument, operation, qualityReport]); // eslint-disable-line react-hooks/exhaustive-deps
  const latestData = () => liveDocument ? applyCanonicalDocument(data, content.id, liveDocument, "manual", now()) : data;
  const commitDocument = async (document: ContentDocument, success: string) => {
    const next = applyCanonicalDocument(data, content.id, document, "manual", now());
    setSaveState("saving");
    try { await onPersist(next); setDocumentDraft(document); setTitle(document.title); setQualityReport(undefined); setAutomaticQualityAttempted(false); setPreviewHtml(""); setFinalConfirmation(false); setSaveState("saved"); setNotice(success); }
    catch (error) { setSaveState("error"); throw error; }
  };
  const review = async () => {
    setWorking(true); setOperation("quality"); setQualityRequestState("loading"); setQualityError("");
    try {
      const next = latestData(); await onPersist(next);
      const response = await api("/api/studio", { action: "review-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { document?: ContentDocument; quality?: QualityReport; data?: UserData; error?: string };
      if (!response.quality || !response.data) throw new Error(response.error ?? "Quality review failed.");
      await onPersist(response.data);
      const priorTitle = next.contents.find((item) => item.id === content.id)?.title;
      if (response.document) { setDocumentDraft(response.document); setTitle(response.document.title); }
      setQualityReport(response.quality); setQualityRequestState("idle"); setNotice(response.document && response.document.title !== priorTitle ? "대표 키워드를 포함하도록 제목을 보정하고 품질 검토를 완료했습니다." : "품질 검토가 완료되었습니다. 개선 작업을 반영한 뒤 다시 검토할 수 있습니다.");
    } catch (error) { const detail = message(error); setQualityRequestState("error"); setQualityError(detail); setNotice(detail); } finally { setWorking(false); setOperation("idle"); }
  };
  const revise = async () => {
    if (!revision.trim()) return; setWorking(true);
    try {
      const next = latestData(); await onPersist(next); const current = next.contents.find((item) => item.id === content.id)!;
      const result = await api("/api/studio", { action: "revise", input: { workspaceId: project.workspaceId, contentId: content.id, projectId: project.id, contentType: content.contentType, primaryKeyword: content.primaryKeyword, document: current.document, instruction: revision } }) as { document?: ContentDocument; error?: string };
      if (!result.document) throw new Error(result.error ?? "Revision failed.");
      const revised = applyCanonicalDocument(next, content.id, result.document, "ai_revision", now()); await onPersist(revised);
      setDocumentDraft(result.document); setTitle(result.document.title); setRevision(""); setNotice("AI 수정으로 문서 버전이 바뀌어 이전 품질 승인이 무효화되었습니다.");
    } catch (error) { setNotice(message(error)); } finally { setWorking(false); }
  };
  const retryGeneration = async () => {
    setWorking(true);
    try {
      const opportunity = content.opportunity;
      const result = await api("/api/studio", { action: "generate", input: { workspaceId: project.workspaceId, contentId: content.id, contentType: content.contentType ?? "article", opportunityId: opportunity?.opportunityId, opportunityVersion: opportunity?.version, opportunityFingerprint: opportunity?.fingerprint, primaryKeyword: opportunity?.primaryKeyword ?? content.primaryKeyword, topic: opportunity?.selectedTopic, searchIntent: opportunity?.searchIntent, secondaryKeywords: opportunity?.secondaryKeywords, keywords: [content.primaryKeyword ?? "", ...(content.relatedKeywords ?? [])], platform: "canonical", projectId: project.id } }) as { document?: ContentDocument; quality?: QualityReport; data?: UserData; error?: string };
      if (!result.document || !result.data) throw new Error(result.error ?? "Generation failed.");
      await onPersist(result.data); setDocumentDraft(result.document); setTitle(result.document.title); setQualityReport(result.quality); setNotice("Generation retry updated the existing Content record; no duplicate was created.");
    } catch (error) { setNotice(`${message(error)} The existing Content record and plan remain safe.`); }
    finally { setWorking(false); }
  };
  const requestQualityImprovement = async () => {
    setWorking(true); setOperation("improving"); setNotice("AI가 현재 품질 검토 결과를 바탕으로 개선안을 만들고 있습니다."); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setImprovementDecision(undefined); setImprovementFeedback({ tone: "info", message: "AI 개선안을 생성하고 품질 점수를 비교하고 있습니다." });
    try {
      const next = latestData(); await onPersist(next);
      const result = await api("/api/studio", { action: "improve-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { document?: ContentDocument; basedOnRevisionId?: string; baselineQuality?: QualityReport; quality?: QualityReport; improvement?: Readonly<{ accepted: boolean; reasons: readonly string[] }>; error?: string };
      if (!result.document || !result.baselineQuality || !result.quality || !result.improvement) throw new Error(result.error ?? "AI 개선안을 만들지 못했습니다.");
      const feedback = result.improvement.accepted
        ? result.quality.approved ? "품질 승인 기준을 충족한 개선안을 확인했습니다." : "개선안 점수는 올랐지만 품질 승인 기준에는 미달합니다. 현재 원고에는 적용되지 않습니다."
        : `AI 후보를 생성했지만 현재 원고보다 좋아지지 않아 적용할 수 없습니다. ${result.improvement.reasons.join(" ")}`;
      setImprovementPreview(result.document); setImprovementBaseRevision(result.basedOnRevisionId ?? ""); setImprovementBaselineQuality(result.baselineQuality); setImprovementCandidateQuality(result.quality); setImprovementDecision(result.improvement); setImprovementFeedback({ tone: result.improvement.accepted ? result.quality.approved ? "success" : "warning" : "warning", message: feedback }); setNotice(feedback);
    } catch (error) { const detail = message(error); setImprovementFeedback({ tone: "error", message: `AI 개선안 생성에 실패했습니다. ${detail}` }); setNotice(detail); } finally { setWorking(false); setOperation("idle"); }
  };
  const approveQualityImprovement = async () => {
    if (!improvementPreview || !improvementCandidateQuality?.approved || !improvementDecision?.accepted) return; setWorking(true); setOperation("applying");
    try {
      const result = await api("/api/studio", { action: "accept-improvement", input: { workspaceId: project.workspaceId, contentId: content.id, basedOnRevisionId: improvementBaseRevision, document: improvementPreview } }) as { document?: ContentDocument; quality?: QualityReport; data?: UserData; error?: string };
      if (!result.document || !result.quality || !result.data) throw new Error(result.error ?? "개선 문서를 저장하지 못했습니다.");
      await onPersist(result.data); setDocumentDraft(result.document); setTitle(result.document.title); setQualityReport(result.quality); setPreviewHtml(""); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setImprovementDecision(undefined); setImprovementFeedback({ tone: "success", message: "개선안을 새 Revision으로 적용했습니다. 현재 Revision의 품질 승인이 자동 완료되었습니다." }); setNotice("개선안을 새 Revision으로 적용했습니다. 현재 Revision의 품질 승인이 자동 완료되었습니다.");
    } catch (error) { setNotice(message(error)); } finally { setWorking(false); setOperation("idle"); }
  };
  const refreshPreview = async () => {
    setOperation("preview");
    try { if (liveDocument) await commitDocument(liveDocument, "현재 문서를 저장했습니다."); const result = await api("/api/studio", { action: "render-tistory", input: { contentId: content.id, workspaceId: project.workspaceId } }) as { html?: string; error?: string }; if (typeof result.html !== "string") throw new Error(result.error ?? "미리보기 생성에 실패했습니다."); setPreviewHtml(result.html); setNotice("현재 Revision의 티스토리 HTML 미리보기를 생성했습니다."); }
    catch (error) { setNotice(message(error)); } finally { setOperation("idle"); }
  };
  const saveTistory = async () => {
    if (!enabledPlatforms.includes("tistory")) { setNotice("Tistory is disabled in Workspace Settings."); return; }
    if (!selectedConnection || !finalConfirmation) return; setWorking(true); setOperation("draft-save");
    try { const response = await api("/api/tistory", { workspaceId: project.workspaceId, projectId: project.id, contentId: content.id, connectionId: selectedConnection.id, finalConfirmation: true }) as { result?: Record<string, unknown>; error?: string }; if (!response.result) throw new Error(response.error ?? "Draft save failed."); const status = String(response.result.status); if (status === "saved") { setNotice("외부 Tistory 임시저장이 완료되고 다시 확인되었습니다."); setShowConfirmation(false); } else { setNotice(draftFailureMessage(response.result)); } }
    catch (error) { setNotice(message(error)); } finally { setWorking(false); setOperation("idle"); }
  };

  async function loadReadiness(accountId: string, confirmed = false) {
    try {
      const response = await fetch(`/api/tistory?workspaceId=${encodeURIComponent(project.workspaceId)}&projectId=${encodeURIComponent(project.id)}&contentId=${encodeURIComponent(content.id)}&connectionId=${encodeURIComponent(accountId)}&finalConfirmation=${confirmed}`, { cache: "no-store" });
      const result = await response.json() as { readiness?: TistoryReadiness; error?: string };
      if (!response.ok || !result.readiness) throw new Error(result.error ?? "임시저장 준비 상태를 확인하지 못했습니다.");
      setReadiness(result.readiness);
    } catch (error) { setReadiness(undefined); setNotice(message(error)); }
  }
  async function selectConnection(accountId: string) {
    setConnectionId(accountId); setCategoryId(""); setCategoryName(null); setReadiness(undefined);
    if (!accountId) return;
    try {
      const result = await api("/api/tistory", { action: "prepare", workspaceId: project.workspaceId, projectId: project.id, contentId: content.id, connectionId: accountId }) as { data?: UserData; readiness?: TistoryReadiness; error?: string };
      if (!result.data) throw new Error(result.error ?? "티스토리 계정을 적용하지 못했습니다.");
      await onPersist(result.data); if (result.readiness) setReadiness(result.readiness); setNotice("티스토리 계정이 적용되었습니다.");
    } catch (error) { setNotice(message(error)); }
  }

  async function loadCategories(accountId: string) {
    setCategoryState("loading"); setOperation("categories"); setCategoryMessage("");
    try { const response = await fetch(`/api/tistory/categories?workspaceId=${encodeURIComponent(project.workspaceId)}&contentId=${encodeURIComponent(content.id)}&connectionId=${encodeURIComponent(accountId)}`, { cache: "no-store" }); const result = await response.json() as { categories?: SafeCategory[]; preparation?: NonNullable<UserContent["publishingPreparation"]>["tistory"] | null; data?: UserData; safeMessage?: string; error?: string; reconnectRequired?: boolean; stale?: boolean; failureCode?: string }; if (!response.ok) throw Object.assign(new Error(result.safeMessage ?? result.error ?? "카테고리 목록을 불러오지 못했습니다."), { reconnectRequired: result.reconnectRequired }); setCategories(result.categories ?? []); if (result.preparation) { setCategoryId(result.preparation.platformCategoryId ?? "__uncategorized__"); setCategoryName(result.preparation.platformCategoryName); } if (result.data) await onPersist(result.data); setCategoryState(result.stale ? "stale" : result.categories?.length ? "ready" : "empty"); setCategoryMessage(result.stale ? `마지막으로 확인된 카테고리 목록을 표시합니다. 저장된 ${result.preparation?.platformCategoryName ?? categoryName ?? "현재"} 카테고리는 계속 적용됩니다.` : ""); await loadReadiness(accountId); }
    catch (error) { setCategoryState((error as { reconnectRequired?: boolean }).reconnectRequired ? "expired" : "error"); setCategoryMessage(categoryId ? `카테고리 목록을 새로 불러오지 못했습니다. 저장된 ${categoryName ?? "현재"} 카테고리는 계속 적용됩니다.` : "카테고리 목록을 불러오지 못했습니다. 다시 시도하거나 카테고리 없음을 선택해 주세요."); } finally { setOperation("idle"); }
  }
  async function selectCategory(value: string) {
    if (!selectedConnection) return; setCategoryState("loading"); setOperation("category-save"); setCategoryMessage("");
    try { const result = await api("/api/tistory/categories", { workspaceId: project.workspaceId, contentId: content.id, connectionId: selectedConnection.id, categoryId: value === "__uncategorized__" ? null : value }) as { preparation?: NonNullable<UserContent["publishingPreparation"]>["tistory"]; data?: UserData }; if (!result.preparation || !result.data) throw new Error("카테고리를 저장하지 못했습니다. 다시 시도해 주세요."); setCategoryId(result.preparation.platformCategoryId ?? "__uncategorized__"); setCategoryName(result.preparation.platformCategoryName); await onPersist(result.data); await loadReadiness(selectedConnection.id); setCategoryState(categories.length ? "ready" : "empty"); setNotice(`카테고리 적용 완료: ${result.preparation.platformCategoryName ?? "카테고리 없음"}`); }
    catch (error) { setCategoryState(message(error) === "재연결 필요" ? "expired" : "error"); setCategoryMessage("카테고리를 저장하지 못했습니다. 다시 시도해 주세요."); } finally { setOperation("idle"); }
  }
  async function loadPostCandidates(refresh = false) {
    if (!selectedConnection) return; setPostCatalogState("loading"); setPostCatalogMessage("");
    try { const response = await fetch(`/api/tistory/posts?workspaceId=${encodeURIComponent(project.workspaceId)}&contentId=${encodeURIComponent(content.id)}&connectionId=${encodeURIComponent(selectedConnection.id)}&refresh=${refresh}`, { cache: "no-store" }); const result = await response.json() as { posts?: PublicPostCandidate[]; state?: PostCatalogState; retrievedAt?: string; diagnostic?: string; error?: string; cached?: boolean }; if (!response.ok) throw Object.assign(new Error(result.error ?? "게시글을 불러오지 못했습니다."), { state: result.state }); const posts = result.posts ?? []; setPostCandidates(posts); setPostCatalogState(result.state ?? (posts.length ? "success" : "empty")); setPostsRetrievedAt(result.retrievedAt ?? ""); setPostCatalogMessage(result.diagnostic ?? `${posts.length}개 공개 게시글을 확인했습니다${result.cached ? " · 캐시 사용" : ""}.`); if (liveDocument && posts.length) { const placed = placeRecommendedPosts(liveDocument, posts); if (placed.blocks.length !== liveDocument.blocks.length) await commitDocument(placed, "실제 공개 글을 사용해 내부링크와 관련 글을 자동 배치했습니다."); } }
    catch (error) { setPostCandidates([]); setPostCatalogState((error as { state?: PostCatalogState }).state ?? "connection_error"); setPostCatalogMessage(message(error)); }
  }
  return <PageContainer className="py-8 sm:py-10 lg:py-12">
    <button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← Project Dashboard</button>
    <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/6 pb-7"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">{project.name}</p><h1 className="mt-2 text-3xl font-semibold">편집기</h1></div><p className={`text-sm ${saveState === "error" ? "text-red-700" : "text-[#77777f]"}`}>{saveState === "saving" ? "저장 중…" : saveState === "saved" ? `저장됨 · Revision ${historyCount}개` : "저장 실패"}</p></header>
    <OperationNotice operation={operation} />
    {liveDocument ? <StrategySummary content={content} document={liveDocument} metrics={metrics} quality={normalizedQuality} /> : null}
    {content.generationError ? <section className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold">AI configuration or generation is required</h2><p className="mt-2 text-sm">{content.generationError}</p><button className="mt-3 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold" disabled={working} onClick={() => void retryGeneration()} type="button">Retry generation without creating a duplicate</button></section> : null}
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><label className="block text-sm font-semibold">제목<input className="mt-2 w-full rounded-xl border px-4 py-3 text-xl disabled:opacity-60" disabled={working} onBlur={() => liveDocument && void commitDocument({ ...liveDocument, title }, "문서 제목을 저장했습니다.")} onChange={(event) => { setTitle(event.target.value); setQualityRequestState("idle"); setFinalConfirmation(false); }} value={title} /></label><ContentSeoTitleStatus currentTitle={title} disabled={working || !liveDocument} onApply={async (seoTitle) => { if (liveDocument) await commitDocument({ ...liveDocument, title: seoTitle }, "대표 키워드를 포함한 제목으로 보정했습니다."); }} primaryKeyword={content.primaryKeyword} /><p className="mt-3 text-sm text-[#77777f]">본문은 아래 canonical 블록 편집기에서 수정합니다. 블록 순서가 Preview와 Draft HTML에 그대로 반영됩니다.</p><div className="mt-4 flex flex-wrap gap-5 rounded-xl bg-[#f8f8fa] px-4 py-3 text-sm"><span><strong>글자 수</strong> {metrics.charactersWithSpaces.toLocaleString()}</span><span><strong>문단 수</strong> {metrics.paragraphCount}</span><span><strong>예상 읽기 시간</strong> {metrics.estimatedReadingMinutes}분</span></div><details className="mt-3 text-sm text-[#66666f]"><summary className="cursor-pointer font-semibold">상세 글 지표</summary><dl className="mt-3 grid gap-2 sm:grid-cols-3"><Info label="공백 제외 글자 수" value={metrics.charactersWithoutSpaces.toLocaleString()} /><Info label="한국어 글자 수" value={metrics.koreanCharacterCount.toLocaleString()} /><Info label="단어 단위" value={metrics.wordUnits.toLocaleString()} /><Info label="소제목 수" value={metrics.headingCount.toLocaleString()} /></dl></details></section>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><h2 className="text-lg font-semibold">AI 문서 수정</h2><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className="flex-1 rounded-xl border px-4 py-3" onChange={(event) => setRevision(event.target.value)} placeholder="예: 결론을 강화해줘" value={revision} /><button className="rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={working || !revision.trim()} onClick={() => void revise()} type="button">canonical 문서 수정</button></div></section>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">편집 보기</h2><p className="mt-1 text-sm text-[#77777f]">시각 편집과 현재 Renderer HTML을 전환합니다.</p></div><div className="flex gap-2"><button aria-pressed={editorViewMode === "visual"} className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => setEditorViewMode("visual")} type="button">시각 편집</button><button aria-pressed={editorViewMode === "html"} className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => setEditorViewMode("html")} type="button">HTML 보기</button></div></div></section>
    {editorViewMode === "visual" && liveDocument ? <><section className="mt-4 rounded-[20px] border border-black/6 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">티스토리 공개 게시글 동기화</h2><p className="mt-1 text-sm text-[#77777f]">{postCatalogState === "loading" ? "티스토리 게시글을 불러오는 중입니다." : postCatalogMessage || "계정을 선택한 뒤 공개 게시글을 불러오세요."}{postsRetrievedAt ? ` · 마지막 동기화 ${formatReviewTime(postsRetrievedAt)}` : ""}</p></div><button className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!selectedConnection || postCatalogState === "loading"} onClick={() => void loadPostCandidates(true)} type="button">후보 새로고침</button></div>{postCatalogState === "session_expired" ? <p className="mt-2 text-sm text-amber-800">세션이 만료되었습니다. 플랫폼 연결에서 다시 연결해 주세요.</p> : null}{postCatalogState === "partial" ? <p className="mt-2 text-sm text-amber-800">일부 게시글만 불러왔습니다. 현재 후보는 사용할 수 있으며 새로고침할 수 있습니다.</p> : null}</section><ContentDocumentEditor candidates={postCandidates} disabled={working || operation !== "idle"} document={liveDocument} onChange={commitDocument} /></> : null}
    {editorViewMode === "html" ? <section className="mt-4 rounded-[24px] border border-black/6 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">현재 문서 HTML</h2><p className="mt-1 text-sm text-[#77777f]">티스토리 미리보기와 임시저장에 사용하는 읽기 전용 Renderer 결과입니다.</p></div><button className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!previewHtml} onClick={() => void navigator.clipboard.writeText(previewHtml).then(() => setNotice("HTML을 클립보드에 복사했습니다."))} type="button">HTML 복사</button></div><pre className="mt-4 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#17171a] p-4 text-xs text-white">{previewHtml || "HTML을 생성하고 있습니다. 잠시 후 다시 확인해 주세요."}</pre></section> : null}
    {editorViewMode === "visual" && !liveDocument ? <VisualEditorRecovery onReload={() => window.location.reload()} /> : null}
    <PlacementSummary blocks={liveDocument?.blocks ?? []} />
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">품질 검토</h2>{normalizedQuality.reviewedAt ? <p className="mt-1 text-sm text-[#77777f]">마지막 검토 {formatReviewTime(normalizedQuality.reviewedAt)} · 문서 {normalizedQuality.revisionId}</p> : null}</div><div className="flex gap-2"><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={working || !normalizedQuality.actionableTasks.length} onClick={() => void requestQualityImprovement()} type="button">{operation === "improving" ? "개선안 생성 중…" : "AI 개선안 만들기"}</button><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={working || normalizedQuality.status === "loading"} onClick={() => void review()} type="button">{normalizedQuality.status === "loading" ? "검토 중…" : "품질 다시 검토"}</button></div></div><QualityStatus review={normalizedQuality} />{improvementFeedback ? <p aria-live="polite" className={`mt-4 rounded-xl px-4 py-3 text-sm ${improvementFeedback.tone === "error" ? "bg-red-50 text-red-800" : improvementFeedback.tone === "success" ? "bg-emerald-50 text-emerald-800" : improvementFeedback.tone === "warning" ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-800"}`}>{improvementFeedback.message}</p> : null}{improvementPreview && improvementBaselineQuality && improvementCandidateQuality && improvementDecision ? <QualityImprovementPreview baseline={improvementBaselineQuality} candidate={improvementCandidateQuality} disabled={working} document={improvementPreview} improvementAccepted={improvementDecision.accepted} rejectionReasons={improvementDecision.reasons} onApply={() => void approveQualityImprovement()} onCancel={() => { setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setImprovementDecision(undefined); setImprovementFeedback(undefined); }} /> : null}{normalizedQuality.dimensions.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{normalizedQuality.dimensions.map((dimension) => <article className="rounded-xl border border-black/6 p-4" key={dimension.category}><div className="flex items-center justify-between"><h3 className="font-semibold">{qualityLabel(dimension.category)}</h3><strong>{dimension.score}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eeeeF2]"><div className="h-full bg-[#ff6b6b]" style={{ width: `${dimension.score}%` }} /></div>{dimension.reasons[0] ? <p className="mt-2 text-sm text-[#66666f]">{dimension.reasons[0]}</p> : null}</article>)}</div> : null}{normalizedQuality.actionableTasks.length ? <div className="mt-5"><h3 className="font-semibold">우선 개선 작업</h3><ul className="mt-3 space-y-2">{normalizedQuality.actionableTasks.slice(0, 8).map((task, index) => <li className="rounded-xl bg-[#f8f8fa] px-4 py-3 text-sm" key={`${task.category}-${index}`}>→ {task.message}</li>)}</ul></div> : null}</section>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">티스토리 미리보기</h2><div className="relative z-10 flex flex-wrap gap-2"><button aria-pressed={previewMode === "desktop"} className="rounded-xl border px-3 py-2 text-sm" onClick={() => setPreviewMode("desktop")} type="button">데스크톱</button><button aria-pressed={previewMode === "mobile"} className="rounded-xl border px-3 py-2 text-sm" onClick={() => setPreviewMode("mobile")} type="button">모바일</button><button className="rounded-xl border px-3 py-2 text-sm" disabled={operation === "preview"} onClick={() => void refreshPreview()} type="button">미리보기 새로고침</button></div></div>
      {previewHtml ? <div className={`mx-auto mt-4 overflow-hidden rounded-xl border bg-[#f4f1eb] p-3 ${previewMode === "mobile" ? "max-w-[390px]" : "w-full"}`}><iframe className="h-[680px] w-full rounded-lg bg-white" sandbox="" srcDoc={`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif;padding:clamp(22px,5vw,56px);line-height:1.82;max-width:860px;margin:auto;color:#262626;background:#fff}h1{font-size:clamp(30px,5vw,46px);line-height:1.25;margin:0 0 42px;letter-spacing:-.035em}h2{font-size:27px;margin:52px 0 20px;border-bottom:1px solid #eee;padding-bottom:12px}h3{font-size:21px;margin:36px 0 14px}p{font-size:17px;margin:0 0 22px}img{display:block;max-width:100%;height:auto;margin:30px auto;border-radius:8px}.bright-toc{margin:28px 0 42px;padding:22px 24px;border:1px solid #e7e3dc;border-radius:8px;background:#faf9f7}.bright-toc a{color:#333;text-decoration:none}.bright-toc-level-3{margin-left:18px}.bright-cta,.bright-internal_link,.bright-monetization,.bright-related_post{margin:30px 0}.bright-cta a,.bright-monetization a{display:block;padding:15px 20px;border-radius:8px;background:#ff6b6b;color:white;text-align:center;text-decoration:none;font-weight:700}.bright-image-placeholder,.bright-link-required{padding:22px;border:2px dashed #d9bc7c;border-radius:8px;background:#fffaf0}.bright-link-required span{display:block;color:#7b6537;font-size:13px}</style></head><body><article><h1>${escapeHtml(title)}</h1>${previewHtml}</article></body></html>`} title="격리된 티스토리 미리보기" /></div> : <p className="mt-4 text-sm text-[#77777f]">현재 문서의 미리보기를 자동 생성하고 있습니다. 실패하면 ‘미리보기 새로고침’을 눌러 주세요.</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">티스토리 계정<select className="mt-2 w-full rounded-xl border px-4 py-3" onChange={(event) => void selectConnection(event.target.value)} value={connectionId}><option value="">계정 선택</option>{connections.filter((item) => item.platform === "tistory").map((item) => <option disabled={item.status !== "connected"} key={item.id} value={item.id}>{item.displayName} · {item.status === "connected" ? "연결됨" : item.status}</option>)}</select>{selectedConnection ? <span className="mt-2 block font-normal text-emerald-700">연결됨 · {connections.filter((item) => item.platform === "tistory" && item.status === "connected" && item.lastVerifiedAt && item.publicMetadata?.sessionStateAvailable).length === 1 ? "자동 적용" : "적용 완료"}</span> : null}</label><label className="text-sm font-semibold">티스토리 카테고리<select aria-label="Tistory 카테고리" className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={!selectedConnection || categoryState === "loading" || categoryState === "expired"} onChange={(event) => void selectCategory(event.target.value)} value={categoryId}><option value="">{categoryState === "loading" ? "카테고리 불러오는 중…" : "카테고리 선택"}</option><option value="__uncategorized__">카테고리 없음</option>{categoryOptions.map((item) => <option key={String(item.id)} value={String(item.id)}>{`${"　".repeat(item.depth)}${item.name}${categories.some((category) => String(category.id) === String(item.id)) ? "" : " · 현재 적용됨"}`}</option>)}</select>{categoryId ? <span className="mt-2 block font-normal text-emerald-700">카테고리 적용 완료: {categoryName ?? "카테고리 없음"}</span> : null}</label></div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><button className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50" disabled={!selectedConnection || categoryState === "loading"} onClick={() => selectedConnection && void loadCategories(selectedConnection.id)} type="button">{categoryState === "error" || categoryState === "stale" ? "다시 시도" : "카테고리 새로고침"}</button>{categoryState === "empty" ? <span>등록된 카테고리가 없습니다. ‘카테고리 없음’을 선택할 수 있습니다.</span> : null}{categoryState === "expired" ? <span className="text-amber-800">재연결 필요 · Settings의 플랫폼 연결에서 다시 연결해 주세요.</span> : null}{categoryState === "stale" ? <span className="text-amber-800">{categoryMessage}</span> : null}{categoryState === "error" ? <span className="text-red-700">{categoryMessage}</span> : null}</div>
      <div className={`mt-4 rounded-xl p-4 text-sm ${readiness?.ready ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}><p className="font-semibold">티스토리 임시저장 준비</p><p className="mt-1 text-xs opacity-80">품질 승인은 현재 Revision이 기준을 통과하면 자동 완료됩니다. 최종 확인은 아래 임시저장 버튼을 누른 뒤 사용자가 직접 체크합니다.</p>{readiness ? <ul className="mt-2 space-y-1">{readiness.checks.map((check) => <li key={check.key}>{check.passed ? "✓" : "○"} {check.message}</li>)}</ul> : <p className="mt-2">서버 준비 상태를 확인하고 있습니다.</p>}</div>
      <button className="mt-4 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!readiness?.ready} onClick={() => setShowConfirmation(true)} type="button">Tistory 임시저장</button>
    </section>
    {showConfirmation && selectedConnection ? <section className="mt-6 rounded-[24px] border border-red-200 bg-white p-6"><h2 className="text-lg font-semibold">외부 임시저장 최종 확인 · 사용자 확인 필요</h2><dl className="mt-4 grid gap-2 text-sm"><Info label="Workspace" value={data.workspace?.name ?? ""} /><Info label="Project" value={project.name} /><Info label="대상 계정" value={selectedConnection.displayName} /><Info label="제목" value={title} /><Info label="Tistory 카테고리" value={categoryName || (categoryId === "__uncategorized__" ? "카테고리 없음" : "선택 필요")} /></dl><p className="mt-4 rounded-xl bg-[#fff0f0] p-3 text-sm">공개 발행은 하지 않습니다. 확인한 문서 버전만 Tistory 임시글로 저장합니다.</p><label className="mt-4 flex gap-3 text-sm"><input checked={finalConfirmation} onChange={(event) => setFinalConfirmation(event.target.checked)} type="checkbox" />이 제목, 미리보기, 계정, 카테고리와 임시저장 작업을 최종 확인합니다.</label><div className="mt-4 flex gap-2"><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!finalConfirmation || working} onClick={() => void saveTistory()} type="button">확인하고 임시저장</button><button className="rounded-xl border px-4 py-2.5 text-sm" onClick={() => setShowConfirmation(false)} type="button">취소</button></div></section> : null}
    <p aria-live="polite" className={`mt-4 rounded-xl p-4 text-sm ${saveState === "error" ? "bg-red-50 text-red-800" : "bg-white text-[#77777f]"}`}>{notice}</p>
    <ContentDangerZone contentId={content.id} disabled={working || operation !== "idle"} onDeleted={async (next) => { await onPersist(next); onBack(); }} onDeletingChange={(active) => setOperation(active ? "deleting" : "idle")} workspaceId={project.workspaceId} />
  </PageContainer>;
}

async function api(url: string, body: unknown) { const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok && !(result as { result?: unknown }).result) throw new Error((result as { error?: string }).error ?? "Request failed."); return result; }
function QualityStatus({ review }: { review: NormalizedQualityReview }) {
  if (review.status === "loading") return <p className="mt-4 rounded-xl bg-[#f8f8fa] p-4 text-sm">현재 문서 버전을 검토하고 있습니다.</p>;
  if (review.status === "error") return <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">품질 검토 중 오류가 발생했습니다.</p><p className="mt-1">{review.issues[0] ?? "잠시 후 다시 시도해 주세요."}</p></div>;
  if (review.status === "no_review") return <div className="mt-4 rounded-xl bg-[#f8f8fa] p-4 text-sm"><p className="font-semibold">아직 현재 문서 버전에 대한 품질 검토가 없습니다.</p><p className="mt-1 text-[#66666f]">품질 검토를 실행하면 세부 점수가 표시됩니다.</p></div>;
  if (review.status === "stale") return <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">문서가 수정되어 이전 품질 검토가 만료되었습니다.</p><p className="mt-1">현재 버전을 다시 검토해야 합니다.</p></div>;
  if (review.status === "not_evaluated") return <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">재검토 필요</p><p className="mt-1">현재 형식에서는 세부 품질 근거를 확인할 수 없거나 평가하지 못한 항목이 있습니다.</p>{review.overallScore !== null ? <p className="mt-2">서버 검토 점수 <strong>{review.overallScore}</strong></p> : null}</div>;
  return <div className="mt-4 flex items-end gap-3"><strong className="text-4xl">{review.overallScore}</strong><span className={`mb-1 rounded-full px-3 py-1 text-sm font-semibold ${review.status === "ready" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{review.status === "ready" ? "목표 점수 충족 · 게시 준비 완료" : "개선 필요"}</span></div>;
}
function Info({ label, value }: { label: string; value: string }) { return <div><dt className="font-semibold text-[#77777f]">{label}</dt><dd>{value}</dd></div>; }
function VisualEditorRecovery({ onReload }: { onReload: () => void }) { return <section className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold">시각 편집 데이터를 불러오지 못했습니다.</h2><p className="mt-2 text-sm text-amber-900">원고 데이터는 삭제되지 않았습니다. 원고를 다시 불러오거나 복구할 수 있습니다.</p><button className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold" onClick={onReload} type="button">원고 다시 불러오기</button></section>; }
function normalizeVisualDocument(value: unknown): ContentDocument | undefined { if (!value || typeof value !== "object") return undefined; const candidate = value as Partial<ContentDocument>; if (typeof candidate.id !== "string" || typeof candidate.title !== "string" || !Array.isArray(candidate.blocks)) return undefined; return candidate as ContentDocument; }
function now() { return new Date().toISOString(); }
function message(error: unknown) { return error instanceof Error ? error.message : "Request failed."; }
function draftFailureMessage(result: Record<string, unknown>) {
  const failedStep = typeof result.failedStep === "string" ? result.failedStep : "";
  const messages: Record<string, string> = { session_loaded: "저장된 Tistory 세션을 불러오지 못했습니다.", editor_opened: "Tistory 에디터를 열지 못했습니다.", editor_ready: "Tistory 에디터 입력 영역을 준비하지 못했습니다.", category_applied: "Tistory 에디터는 열렸지만 카테고리를 적용하지 못했습니다.", title_filled: "Tistory 에디터는 열렸지만 제목을 입력하지 못했습니다.", body_filled: "Tistory 에디터는 열렸지만 본문을 입력하지 못했습니다.", draft_save_clicked: "제목과 본문은 입력했지만 임시저장 버튼을 실행하지 못했습니다.", draft_save_confirmed: "임시저장을 실행했지만 저장 완료를 확인하지 못했습니다.", draft_reopened: "임시저장 결과를 다시 열지 못했습니다.", draft_verified: "임시글을 다시 열었지만 저장된 내용을 확인하지 못했습니다." };
  return messages[failedStep] ?? (typeof result.error === "string" ? result.error : "외부 Tistory 임시저장에 실패했습니다. 다시 시도해 주세요.");
}
function escapeHtml(value: string) { return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!); }
function qualityLabel(category: QualityCategory) { return ({ searchIntent: "검색 의도", seo: "SEO", readability: "가독성", structure: "콘텐츠 구조", completeness: "정보 완성도", usefulness: "정보 유용성", htmlQuality: "HTML 품질", imageStrategy: "이미지 전략", internalLinks: "내부 링크", cta: "CTA" })[category]; }
function PlacementSummary({ blocks }: { blocks: ContentDocument["blocks"] }) { const images = blocks.filter((block) => block.type === "image"), placedImages = images.filter((block) => block.source.trim()).length; const internalLinks = blocks.filter((block) => block.type === "button" && (block.purpose === "internal_link" || (!block.purpose && block.targetUrl.startsWith("/")))).length; return <section className="mt-4 grid gap-3 sm:grid-cols-2"><p className="rounded-xl bg-white p-4 text-sm"><strong>이미지</strong> · {placedImages ? `배치됨 ${placedImages}개` : images.length ? `추천됨 ${images.length}개` : "추천 없음"}</p><p className="rounded-xl bg-white p-4 text-sm"><strong>내부 링크</strong> · {internalLinks ? `배치됨 ${internalLinks}개` : "추천됨"}</p></section>; }
function StrategySummary({ content, document, metrics, quality }: { content: UserContent; document: ContentDocument; metrics: ReturnType<typeof calculateContentMetrics>; quality: NormalizedQualityReview }) {
  const metadata = document.metadata;
  const planning = content.planning;
  const opportunity = content.opportunity;
  const secondary = opportunity?.secondaryKeywords ?? content.relatedKeywords ?? metadata?.secondaryKeywords ?? [];
  const staleOpportunity = opportunity ? opportunity.contentId !== content.id || opportunity.projectId !== content.projectId || opportunity.workspaceId !== content.workspaceId || !hasCurrentContentOpportunityFingerprint(opportunity) : false;
  const alignment = opportunity && !staleOpportunity ? analyzeContentOpportunityAlignment(document, opportunity) : undefined;
  const strategyWarning = staleOpportunity
    ? "저장된 Content Opportunity가 현재 Content 또는 Project에 속하지 않습니다. 전략을 다시 확인해 주세요."
    : alignment?.status === "mismatch"
      ? "제목·목차·본문이 확정된 Content Opportunity와 일치하지 않아 품질 승인이 차단됩니다."
      : undefined;
  const reflected = [content.primaryKeyword, ...secondary].filter((keyword): keyword is string => Boolean(keyword && document.blocks.some((block) => (block.type === "heading" || block.type === "paragraph") && block.text.toLowerCase().includes(keyword.toLowerCase()))));
  const links = document.blocks.filter((block) => block.type === "button");
  return (
    <section className={`mt-6 rounded-[20px] border bg-white p-5 ${strategyWarning ? "border-amber-300" : "border-black/6"}`}>
      <h2 className="font-semibold">콘텐츠 전략</h2>
      {strategyWarning ? <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{strategyWarning}</p> : null}
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <Info label="선정 주제" value={opportunity?.selectedTopic ?? "Legacy 기획"} />
        <Info label="대표 키워드" value={opportunity?.primaryKeyword ?? content.primaryKeyword ?? "확정되지 않음"} />
        <Info label="검색 의도" value={opportunity?.searchIntent ?? content.searchIntent ?? metadata?.primarySearchIntent ?? "자동 분석"} />
        <Info label="보조 키워드" value={secondary.slice(0, 5).join(", ") || "없음"} />
        <Info label="선정 방식" value={opportunity?.selectionMode === "automatic" ? "AI 자동 선정" : opportunity ? "사용자 지정" : "Legacy"} />
        <Info label="데이터 출처" value={opportunity ? [...new Set(opportunity.opportunityEvidence.map((item) => opportunityEvidenceLabel(item.source)))].join(", ") : "기록 없음"} />
      </dl>
      <details className="mt-4 rounded-xl bg-[#f8f8fa] p-4">
        <summary className="cursor-pointer text-sm font-semibold">AI 분석 상세보기</summary>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Info label="해석된 요청" value={content.naturalLanguageRequest ?? "저장된 요청 없음"} />
          <Info label="선정 주제" value={opportunity?.selectedTopic ?? "Legacy 기획"} />
          <Info label="의도" value={planning?.interpretedIntent ?? content.interpretedIntent ?? "자동 분석"} />
          <Info label="분야" value={planning?.domain ?? content.domain ?? "자동 분석"} />
          <Info label="대상 독자" value={planning?.targetAudience ?? content.targetAudience ?? "프로젝트 기본 독자"} />
          <Info label="목표" value={planning?.contentGoal ?? content.contentGoal ?? "자동 분석"} />
          <Info label="검색 의도" value={opportunity?.searchIntent ?? planning?.searchIntent ?? content.searchIntent ?? "자동 분석"} />
          <Info label="콘텐츠 유형" value={opportunity?.contentType ?? planning?.recommendedContentType ?? content.contentType ?? "article"} />
          <Info label="대표 키워드" value={opportunity?.primaryKeyword ?? content.primaryKeyword ?? "확정되지 않음"} />
          <Info label="관련 키워드" value={secondary.slice(0, 8).join(", ") || "없음"} />
          <Info label="독자의 핵심 문제" value={opportunity?.readerProblem ?? "저장된 문제 정의 없음"} />
          <Info label="콘텐츠 방향" value={opportunity?.contentAngle ?? content.contentGoal ?? "자동 분석"} />
          <Info label="예상 범위" value={opportunity?.expectedCoverage.join(", ") || "저장된 범위 없음"} />
          <Info label="추천 근거" value={opportunity?.selectionRationale ?? planning?.recommendationReason ?? "저장된 근거 없음"} />
          <Info label="Opportunity" value={opportunity ? `${opportunity.opportunityId} · v${opportunity.version} · ${opportunity.fingerprint}` : "Legacy 콘텐츠"} />
          <Info label="신뢰도" value={planning ? `${Math.round(planning.confidence * 100)}%` : "Legacy 콘텐츠"} />
          <Info label="주의사항" value={planning?.estimateDisclosure ?? "저장된 분석 주의사항 없음"} />
          <Info label="선택된 플랫폼" value={planning?.recommendedPlatforms.join(", ") || content.platform || "canonical"} />
          <Info label="실제 반영 키워드" value={reflected.slice(0, 6).join(", ") || "검토 필요"} />
          <Info label="롱테일·관련어" value={(metadata?.relatedTerms ?? []).slice(0, 5).join(", ") || "본문 구조에서 파생"} />
          <Info label="분량" value={`목표 4,500~6,000자 · 현재 ${metrics.charactersWithSpaces.toLocaleString()}자`} />
          <Info label="자동 배치" value={`내부링크 ${links.filter((item) => item.type === "button" && item.purpose === "internal_link").length} · 관련 글 ${links.filter((item) => item.type === "button" && item.purpose === "related_post").length} · 이미지 ${document.blocks.filter((item) => item.type === "image").length} · CTA ${links.filter((item) => item.type === "button" && item.purpose === "cta").length}`} />
          <Info label="품질" value={`${quality.overallScore}점 · ${quality.status === "ready" ? "준비 완료" : `개선 필요 ${quality.actionableTasks.length}개`}`} />
        </dl>
      </details>
    </section>
  );
}
function formatReviewTime(value: string) { try { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } }
function OperationNotice({ operation }: { operation: Operation }) { if (operation === "idle") return null; const copy = ({ quality: ["품질을 검토하고 있습니다.", "현재 Revision의 구조와 실제 배치 블록을 확인하고 있습니다."], improving: ["AI 개선안을 만들고 있습니다.", "기존 순서를 보존하며 필요한 부분만 개선하고 있습니다."], applying: ["개선안을 적용하고 있습니다.", "새 Revision 저장과 품질 재검토가 끝날 때까지 기다려 주세요."], preview: ["티스토리 미리보기를 만들고 있습니다.", "현재 canonical 문서를 Draft와 같은 Renderer로 변환하고 있습니다."], categories: ["티스토리 카테고리를 불러오고 있습니다.", "연결된 계정의 실제 목록을 확인하고 있습니다."], "category-save": ["카테고리를 저장하고 있습니다.", "선택값을 발행 준비 정보에 안전하게 저장하고 있습니다."], "draft-save": ["티스토리에 임시저장하고 있습니다.", "외부 Draft 저장과 검증이 끝날 때까지 브라우저를 닫지 마세요."], deleting: ["콘텐츠를 백업하고 정리하고 있습니다.", "로컬 백업과 연결 데이터 정리가 끝날 때까지 기다려 주세요."] } as const)[operation]; return <div aria-busy="true" aria-live="polite" className="bright-operation-notice rounded-xl border border-[#ffb3b3] bg-[#fff7f7] p-4"><p className="font-semibold">↻ {copy[0]}</p><p className="mt-1 text-sm text-[#66666f]">{copy[1]}</p></div>; }
