"use client";

import { useEffect, useMemo, useState } from "react";

import { calculateContentMetrics, type ContentDocument } from "../../core/content";
import { contentRevisionId, type QualityCategory, type QualityReport } from "../../core/quality";
import { PageContainer } from "../shared/ui/PageContainer";
import { applyCanonicalDocument, saveDraft, updateContent, type UserContent, type UserData, type UserProject, type WorkspacePlatform } from "./user-data";
import { normalizeQualityReview, type NormalizedQualityReview } from "./quality-review-ui";

type SafeConnection = Readonly<{ id: string; platform: "tistory" | "wordpress"; displayName: string; status: string }>;
type PreviewMode = "desktop" | "mobile" | "html";
type SafeCategory = Readonly<{ id: string; name: string; depth: number; parentId?: string }>;
type CategoryState = "idle" | "loading" | "ready" | "empty" | "expired" | "error";

export function EditorWorkspace({ content, data, project, onBack, onPersist }: { content: UserContent; data: UserData; project: UserProject; onBack: () => void; onPersist: (data: UserData) => Promise<void> }) {
  const [title, setTitle] = useState(content.title), [body, setBody] = useState(content.body);
  const [notice, setNotice] = useState(content.generationError ? `Generation unavailable: ${content.generationError}. Manual drafting is available.` : "Draft is stored locally.");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [revision, setRevision] = useState(""); const [working, setWorking] = useState(false);
  const [previewHtml, setPreviewHtml] = useState(""); const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]); const [connectionId, setConnectionId] = useState(content.selectedPublishingAccountIds?.[0] ?? "");
  const [enabledPlatforms, setEnabledPlatforms] = useState<readonly WorkspacePlatform[]>([]);
  const initialPreparation = content.publishingPreparation?.tistory;
  const [categoryId, setCategoryId] = useState(initialPreparation ? initialPreparation.platformCategoryId ?? "__uncategorized__" : "");
  const [categoryName, setCategoryName] = useState(initialPreparation?.platformCategoryName ?? "");
  const [categories, setCategories] = useState<readonly SafeCategory[]>([]); const [categoryState, setCategoryState] = useState<CategoryState>("idle"); const [categoryMessage, setCategoryMessage] = useState("");
  const [qualityReport, setQualityReport] = useState<unknown>(content.quality); const [qualityRequestState, setQualityRequestState] = useState<"idle" | "loading" | "error">("idle"); const [qualityError, setQualityError] = useState("");
  const [finalConfirmation, setFinalConfirmation] = useState(false); const [showConfirmation, setShowConfirmation] = useState(false);
  const selectedConnection = enabledPlatforms.includes("tistory") ? connections.find((item) => item.id === connectionId) : undefined;
  const historyCount = useMemo(() => (data.history ?? []).filter((entry) => entry.contentId === content.id).length, [content.id, data.history]);
  const liveDocument = useMemo(() => {
    try { return saveDraft(data, { contentId: content.id, title, body, now: content.updatedAt, reason: "manual" }).contents.find((item) => item.id === content.id)?.document ?? content.document; }
    catch { return content.document; }
  }, [body, content.document, content.id, content.updatedAt, data, title]);
  const metrics = useMemo(() => calculateContentMetrics(liveDocument ?? { id: content.id, title, blocks: [] }), [content.id, liveDocument, title]);
  const currentRevisionId = liveDocument ? contentRevisionId(liveDocument) : "";
  const normalizedQuality = useMemo(() => normalizeQualityReview(qualityReport, { currentRevisionId, requestState: qualityRequestState, errorMessage: qualityError }), [currentRevisionId, qualityError, qualityReport, qualityRequestState]);

  useEffect(() => { void fetch(`/api/connections?workspaceId=${encodeURIComponent(project.workspaceId)}`, { cache: "no-store" }).then((response) => response.json()).then((result: { connections?: SafeConnection[]; enabledPlatforms?: WorkspacePlatform[] }) => { setConnections(result.connections ?? []); setEnabledPlatforms(result.enabledPlatforms ?? []); }); }, [project.workspaceId]);
  useEffect(() => { if (connectionId) void loadCategories(connectionId); }, [connectionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (title === content.title && body === content.body) return;
      setSaveState("saving");
      try {
        const next = saveDraft(data, { contentId: content.id, title, body, now: now(), reason: "autosave" });
        void onPersist(next).then(() => { setSaveState("saved"); setNotice("Autosaved."); }).catch((error) => { setSaveState("error"); setNotice(`Autosave failed: ${message(error)} Your changes remain visible in this editor.`); });
      } catch (error) { setSaveState("error"); setNotice(message(error)); }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [body, content.body, content.id, content.title, data, onPersist, title]);

  const latestData = () => saveDraft(data, { contentId: content.id, title, body, now: now(), reason: "manual" });
  const review = async () => {
    setWorking(true); setQualityRequestState("loading"); setQualityError("");
    try {
      const next = latestData(); await onPersist(next);
      const response = await api("/api/studio", { action: "review-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { quality?: QualityReport; error?: string };
      if (!response.quality) throw new Error(response.error ?? "Quality review failed.");
      const reviewed = updateContent(next, content.id, { quality: response.quality, status: response.quality.approved ? "ready" : "in_review", updatedAt: response.quality.reviewedAt });
      await onPersist({ ...reviewed, qualityReports: [...(reviewed.qualityReports ?? []).filter((item) => item.contentId !== content.id), { contentId: content.id, report: response.quality }] });
      setQualityReport(response.quality); setQualityRequestState("idle"); setNotice("품질 검토가 완료되었습니다. 개선 작업을 반영한 뒤 다시 검토할 수 있습니다.");
    } catch (error) { const detail = message(error); setQualityRequestState("error"); setQualityError(detail); setNotice(detail); } finally { setWorking(false); }
  };
  const revise = async () => {
    if (!revision.trim()) return; setWorking(true);
    try {
      const next = latestData(); await onPersist(next); const current = next.contents.find((item) => item.id === content.id)!;
      const result = await api("/api/studio", { action: "revise", input: { contentId: content.id, projectId: project.id, contentType: content.contentType, primaryKeyword: content.primaryKeyword, document: current.document, instruction: revision } }) as { document?: ContentDocument; error?: string };
      if (!result.document) throw new Error(result.error ?? "Revision failed.");
      const revised = applyCanonicalDocument(next, content.id, result.document, "ai_revision", now()); await onPersist(revised);
      setTitle(result.document.title); setBody(revised.contents.find((item) => item.id === content.id)?.body ?? ""); setRevision(""); setNotice("AI 수정으로 문서 버전이 바뀌어 이전 품질 승인이 무효화되었습니다.");
    } catch (error) { setNotice(message(error)); } finally { setWorking(false); }
  };
  const retryGeneration = async () => {
    setWorking(true);
    try {
      const result = await api("/api/studio", { action: "generate", input: { workspaceId: project.workspaceId, contentId: content.id, contentType: content.contentType ?? "article", keywords: [content.primaryKeyword ?? content.naturalLanguageRequest ?? "content", ...(content.relatedKeywords ?? [])], platform: "canonical", projectId: project.id, editorialContext: JSON.stringify({ request: content.naturalLanguageRequest, intent: content.interpretedIntent, audience: content.targetAudience, goal: content.contentGoal, searchIntent: content.searchIntent }) } }) as { document?: ContentDocument; quality?: QualityReport; error?: string };
      if (!result.document) throw new Error(result.error ?? "Generation failed.");
      let next = applyCanonicalDocument(data, content.id, result.document, "generation", now());
      next = updateContent(next, content.id, { quality: result.quality, status: "draft" });
      await onPersist(next); setTitle(result.document.title); setBody(next.contents.find((item) => item.id === content.id)?.body ?? ""); setQualityReport(result.quality); setNotice("Generation retry updated the existing Content record; no duplicate was created.");
    } catch (error) { setNotice(`${message(error)} The existing Content record and plan remain safe.`); }
    finally { setWorking(false); }
  };
  const refreshPreview = async () => {
    if (!enabledPlatforms.includes("tistory")) { setNotice("Tistory is disabled in Workspace Settings."); return; }
    if (!selectedConnection || !categoryId) { setNotice("Tistory 계정과 카테고리를 먼저 선택해 주세요."); return; }
    try { const next = latestData(); await onPersist(next); const result = await api("/api/studio", { action: "prepare-tistory", input: { contentId: content.id, workspaceId: project.workspaceId, connectionId: selectedConnection.id } }) as { prepared?: { payload: { html: string } }; error?: string }; if (!result.prepared) throw new Error(result.error ?? "Preview failed."); setPreviewHtml(result.prepared.payload.html); setNotice("로컬 문서와 저장된 발행 준비 정보를 사용해 미리보기를 갱신했습니다."); }
    catch (error) { setNotice(message(error)); }
  };
  const saveTistory = async () => {
    if (!enabledPlatforms.includes("tistory")) { setNotice("Tistory is disabled in Workspace Settings."); return; }
    if (!selectedConnection || !finalConfirmation) return; setWorking(true);
    try { const result = await api("/api/tistory", { workspaceId: project.workspaceId, projectId: project.id, contentId: content.id, connectionId: selectedConnection.id, finalConfirmation: true }) as { result?: Record<string, unknown>; error?: string }; if (!result.result) throw new Error(result.error ?? "Draft save failed."); const status = String(result.result.status); setNotice(status === "saved" ? "외부 Tistory 임시저장이 완료되고 다시 확인되었습니다." : status === "partially_verified" ? "외부 임시저장은 실행되었지만 최종 확인이 일부만 완료되었습니다." : "외부 Tistory 임시저장에 실패했습니다."); setShowConfirmation(false); }
    catch (error) { setNotice(message(error)); } finally { setWorking(false); }
  };

  async function loadCategories(accountId: string) {
    setCategoryState("loading"); setCategoryMessage("");
    try { const response = await fetch(`/api/tistory/categories?workspaceId=${encodeURIComponent(project.workspaceId)}&contentId=${encodeURIComponent(content.id)}&connectionId=${encodeURIComponent(accountId)}`, { cache: "no-store" }); const result = await response.json() as { categories?: SafeCategory[]; safeMessage?: string; error?: string; reconnectRequired?: boolean }; if (!response.ok) throw Object.assign(new Error(result.safeMessage ?? result.error ?? "카테고리를 불러오지 못했습니다."), { reconnectRequired: result.reconnectRequired }); setCategories(result.categories ?? []); setCategoryState(result.categories?.length ? "ready" : "empty"); }
    catch (error) { setCategories([]); setCategoryState((error as { reconnectRequired?: boolean }).reconnectRequired ? "expired" : "error"); setCategoryMessage(message(error)); }
  }
  async function selectCategory(value: string) {
    if (!selectedConnection) return; setCategoryId(value); setCategoryState("loading");
    try { const result = await api("/api/tistory/categories", { workspaceId: project.workspaceId, contentId: content.id, connectionId: selectedConnection.id, categoryId: value === "__uncategorized__" ? null : value }) as { preparation?: NonNullable<UserContent["publishingPreparation"]>["tistory"] }; if (!result.preparation) throw new Error("카테고리 선택을 저장하지 못했습니다."); setCategoryName(result.preparation.platformCategoryName); const next = updateContent(data, content.id, { publishingPreparation: { ...content.publishingPreparation, tistory: result.preparation } }); await onPersist(next); setCategoryState(categories.length ? "ready" : "empty"); setNotice("Tistory 카테고리 선택을 발행 준비 정보에 저장했습니다."); }
    catch (error) { setCategoryState(message(error) === "재연결 필요" ? "expired" : "error"); setCategoryMessage(message(error)); }
  }
  return <PageContainer className="py-8 sm:py-10 lg:py-12">
    <button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← Project Dashboard</button>
    <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/6 pb-7"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">{project.name}</p><h1 className="mt-2 text-3xl font-semibold">Editor</h1></div><p className={`text-sm ${saveState === "error" ? "text-red-700" : "text-[#77777f]"}`}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? `Saved · ${historyCount} revisions` : "Save failed"}</p></header>
    {content.generationError ? <section className="mt-6 rounded-[20px] border border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold">AI configuration or generation is required</h2><p className="mt-2 text-sm">{content.generationError}</p><button className="mt-3 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold" disabled={working} onClick={() => void retryGeneration()} type="button">Retry generation without creating a duplicate</button></section> : null}
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><label className="block text-sm font-semibold">제목<input className="mt-2 w-full rounded-xl border px-4 py-3 text-xl" onChange={(event) => { setTitle(event.target.value); setQualityRequestState("idle"); setFinalConfirmation(false); }} value={title} /></label><label className="mt-5 block text-sm font-semibold">본문<textarea className="mt-2 min-h-96 w-full rounded-xl border px-4 py-4 font-normal leading-7" onChange={(event) => { setBody(event.target.value); setQualityRequestState("idle"); setFinalConfirmation(false); }} value={body} /></label><div className="mt-4 flex flex-wrap gap-5 rounded-xl bg-[#f8f8fa] px-4 py-3 text-sm"><span><strong>글자 수</strong> {metrics.charactersWithSpaces.toLocaleString()}</span><span><strong>문단 수</strong> {metrics.paragraphCount}</span><span><strong>예상 읽기 시간</strong> {metrics.estimatedReadingMinutes}분</span></div><details className="mt-3 text-sm text-[#66666f]"><summary className="cursor-pointer font-semibold">상세 글 지표</summary><dl className="mt-3 grid gap-2 sm:grid-cols-3"><Info label="공백 제외 글자 수" value={metrics.charactersWithoutSpaces.toLocaleString()} /><Info label="한국어 글자 수" value={metrics.koreanCharacterCount.toLocaleString()} /><Info label="단어 단위" value={metrics.wordUnits.toLocaleString()} /><Info label="소제목 수" value={metrics.headingCount.toLocaleString()} /></dl></details></section>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><h2 className="text-lg font-semibold">AI-assisted revision</h2><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input className="flex-1 rounded-xl border px-4 py-3" onChange={(event) => setRevision(event.target.value)} placeholder="예: 결론을 강화해줘" value={revision} /><button className="rounded-xl border px-4 py-3 text-sm font-semibold disabled:opacity-50" disabled={working || !revision.trim()} onClick={() => void revise()} type="button">Revise canonical document</button></div></section>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">품질 검토</h2>{normalizedQuality.reviewedAt ? <p className="mt-1 text-sm text-[#77777f]">마지막 검토 {formatReviewTime(normalizedQuality.reviewedAt)} · 문서 {normalizedQuality.revisionId}</p> : null}</div><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={working || normalizedQuality.status === "loading"} onClick={() => void review()} type="button">{normalizedQuality.status === "loading" ? "검토 중…" : "품질 다시 검토"}</button></div><QualityStatus review={normalizedQuality} />{normalizedQuality.dimensions.length ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{normalizedQuality.dimensions.map((dimension) => <article className="rounded-xl border border-black/6 p-4" key={dimension.category}><div className="flex items-center justify-between"><h3 className="font-semibold">{qualityLabel(dimension.category)}</h3><strong>{dimension.score}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eeeeF2]"><div className="h-full bg-[#ff6b6b]" style={{ width: `${dimension.score}%` }} /></div>{dimension.reasons[0] ? <p className="mt-2 text-sm text-[#66666f]">{dimension.reasons[0]}</p> : null}</article>)}</div> : null}{normalizedQuality.actionableTasks.length ? <div className="mt-5"><h3 className="font-semibold">우선 개선 작업</h3><ul className="mt-3 space-y-2">{normalizedQuality.actionableTasks.slice(0, 8).map((task, index) => <li className="rounded-xl bg-[#f8f8fa] px-4 py-3 text-sm" key={`${task.category}-${index}`}>→ {task.message}</li>)}</ul></div> : null}</section>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Tistory Preview</h2><div className="flex flex-wrap gap-2"><button className="rounded-xl border px-3 py-2 text-sm" onClick={() => setPreviewMode("desktop")} type="button">Desktop</button><button className="rounded-xl border px-3 py-2 text-sm" onClick={() => setPreviewMode("mobile")} type="button">Mobile</button><button className="rounded-xl border px-3 py-2 text-sm" onClick={() => setPreviewMode("html")} type="button">Raw HTML</button><button className="rounded-xl border px-3 py-2 text-sm" onClick={() => void refreshPreview()} type="button">Refresh preview</button><button className="rounded-xl border px-3 py-2 text-sm" disabled={!previewHtml} onClick={() => void navigator.clipboard.writeText(previewHtml)} type="button">Copy HTML</button></div></div>
      {previewHtml ? previewMode === "html" ? <pre className="mt-4 max-h-96 overflow-auto rounded-xl bg-[#f8f8fa] p-4 text-xs whitespace-pre-wrap">{previewHtml}</pre> : <div className={`mx-auto mt-4 overflow-hidden rounded-xl border ${previewMode === "mobile" ? "max-w-[390px]" : "w-full"}`}><iframe className="h-[560px] w-full bg-white" sandbox="" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;padding:24px;line-height:1.7;max-width:820px;margin:auto}img{max-width:100%}</style></head><body><h1>${escapeHtml(title)}</h1>${previewHtml}</body></html>`} title="Isolated Tistory preview" /></div> : <p className="mt-4 text-sm text-[#77777f]">Refresh to render the exact HTML that draft save will use.</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Tistory 계정<select className="mt-2 w-full rounded-xl border px-4 py-3" onChange={(event) => { setConnectionId(event.target.value); setCategoryId(""); setCategoryName(""); }} value={connectionId}><option value="">계정 선택</option>{connections.filter((item) => item.platform === "tistory" && (content.selectedPublishingAccountIds ?? []).includes(item.id)).map((item) => <option disabled={item.status !== "connected"} key={item.id} value={item.id}>{item.displayName} · {item.status}</option>)}</select></label><label className="text-sm font-semibold">Tistory 카테고리<select aria-label="Tistory 카테고리" className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={!selectedConnection || categoryState === "loading" || categoryState === "expired" || categoryState === "error"} onChange={(event) => void selectCategory(event.target.value)} value={categoryId}><option value="">{categoryState === "loading" ? "카테고리 불러오는 중…" : "카테고리 선택"}</option><option value="__uncategorized__">카테고리 없음</option>{categories.map((item) => <option key={item.id} value={item.id}>{`${"　".repeat(item.depth)}${item.name}`}</option>)}</select></label></div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><button className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-50" disabled={!selectedConnection || categoryState === "loading"} onClick={() => selectedConnection && void loadCategories(selectedConnection.id)} type="button">카테고리 새로고침</button>{categoryState === "empty" ? <span>등록된 카테고리가 없습니다. ‘카테고리 없음’을 선택할 수 있습니다.</span> : null}{categoryState === "expired" ? <span className="text-amber-800">재연결 필요 · Settings의 플랫폼 연결에서 다시 연결해 주세요.</span> : null}{categoryState === "error" ? <span className="text-red-700">{categoryMessage || "카테고리를 불러오지 못했습니다."}</span> : null}</div>
      <button className="mt-4 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!previewHtml || normalizedQuality.status !== "ready" || !selectedConnection || !categoryId} onClick={() => setShowConfirmation(true)} type="button">Tistory 임시저장</button>
    </section>
    {showConfirmation && selectedConnection ? <section className="mt-6 rounded-[24px] border border-red-200 bg-white p-6"><h2 className="text-lg font-semibold">외부 임시저장 최종 확인</h2><dl className="mt-4 grid gap-2 text-sm"><Info label="Workspace" value={data.workspace?.name ?? ""} /><Info label="Project" value={project.name} /><Info label="대상 계정" value={selectedConnection.displayName} /><Info label="제목" value={title} /><Info label="Tistory 카테고리" value={categoryName || (categoryId === "__uncategorized__" ? "카테고리 없음" : "선택 필요")} /></dl><p className="mt-4 rounded-xl bg-[#fff0f0] p-3 text-sm">공개 발행은 하지 않습니다. 확인한 문서 버전만 Tistory 임시글로 저장합니다.</p><label className="mt-4 flex gap-3 text-sm"><input checked={finalConfirmation} onChange={(event) => setFinalConfirmation(event.target.checked)} type="checkbox" />이 제목, 미리보기, 계정, 카테고리와 임시저장 작업을 최종 확인합니다.</label><div className="mt-4 flex gap-2"><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!finalConfirmation || working} onClick={() => void saveTistory()} type="button">확인하고 임시저장</button><button className="rounded-xl border px-4 py-2.5 text-sm" onClick={() => setShowConfirmation(false)} type="button">취소</button></div></section> : null}
    <p aria-live="polite" className={`mt-4 rounded-xl p-4 text-sm ${saveState === "error" ? "bg-red-50 text-red-800" : "bg-white text-[#77777f]"}`}>{notice}</p>
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
function now() { return new Date().toISOString(); }
function message(error: unknown) { return error instanceof Error ? error.message : "Request failed."; }
function escapeHtml(value: string) { return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!); }
function qualityLabel(category: QualityCategory) { return ({ searchIntent: "검색 의도", seo: "SEO", readability: "가독성", structure: "콘텐츠 구조", completeness: "정보 완성도", usefulness: "정보 유용성", htmlQuality: "HTML 품질", imageStrategy: "이미지 전략", internalLinks: "내부 링크", cta: "CTA" })[category]; }
function formatReviewTime(value: string) { try { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); } catch { return value; } }
