"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import { PageContainer } from "../shared/ui/PageContainer";
import { completeConfirmedGeneration } from "./confirmed-generation";
import {
  createContentFromPlan, resolveProjectStrategy, updateContent, updateProjectTargets,
  type ContentPlanningResult, type UserData, type UserProject,
} from "./user-data";

type SafeConnection = Readonly<{ id: string; platform: "tistory" | "wordpress"; displayName: string; status: string; lastVerifiedAt?: string; publicMetadata?: Readonly<{ sessionStateAvailable?: boolean }> }>;

export function ContentCreationFlow({ automatic = false, data, project, onBack, onOpenEditor, onPersist }: {
  automatic?: boolean; data: UserData; project: UserProject; onBack: () => void; onOpenEditor: (contentId: string) => void; onPersist: (data: UserData) => Promise<void>;
}) {
  const [request, setRequest] = useState("");
  const [plan, setPlan] = useState<ContentPlanningResult>();
  const [keyword, setKeyword] = useState("");
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]);
  const [selected, setSelected] = useState<readonly string[]>(project.selectedPublishingAccountIds ?? []);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);
  const [contentId] = useState(() => createId("content"));
  const connected = useMemo(() => connections.filter((connection) => connection.status === "connected"), [connections]);

  useEffect(() => { void fetch(`/api/connections?workspaceId=${encodeURIComponent(project.workspaceId)}`, { cache: "no-store" }).then((response) => response.json()).then((result: { connections?: SafeConnection[] }) => { const values = result.connections ?? []; setConnections(values); const usableTistory = values.filter((connection) => connection.platform === "tistory" && connection.status === "connected" && connection.lastVerifiedAt && connection.publicMetadata?.sessionStateAvailable === true); if (usableTistory.length === 1) setSelected((current) => current.length ? current : [usableTistory[0].id]); }); }, [project.workspaceId]);

  const analyze = async (manual = false) => {
    setWorking(true); setNotice(manual ? "수동 기획을 준비하고 있습니다." : "요청을 분석하고 있습니다.");
    try {
      const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: manual ? "manual-plan" : "plan", input: { naturalLanguageRequest: request, workspaceId: project.workspaceId, projectId: project.id } }) });
      const result = await response.json() as { plan?: ContentPlanningResult; error?: string };
      if (!response.ok || !result.plan) throw new Error(result.error ?? "Planning failed.");
      setPlan(result.plan); setKeyword(result.plan.recommendedPrimaryKeyword); setNotice(manual ? "수동 기획이 준비되었습니다. 모든 항목을 수정할 수 있습니다." : "추천 내용을 확인한 뒤 원고 생성을 승인해 주세요.");
    } catch (error) { setNotice(`${message(error)} 입력한 요청은 보존되었습니다. 수동으로 계속하거나 AI 제공자 설정을 확인해 주세요.`); }
    finally { setWorking(false); }
  };

  const confirm = async (generate: boolean, confirmedPlan = plan, confirmedRequest = request) => {
    if (!confirmedPlan) return;
    const readyAccountIds = selected.filter((id) => connected.some((connection) => connection.id === id));
    setWorking(true); setNotice("원고 생성 전에 콘텐츠 기록을 저장하고 있습니다.");
    const confirmedKeyword = keyword || confirmedPlan.recommendedPrimaryKeyword;
    let next = createContentFromPlan(data, { id: contentId, projectId: project.id, naturalLanguageRequest: confirmedRequest, plan: confirmedPlan, primaryKeyword: confirmedKeyword, selectedPublishingAccountIds: readyAccountIds, now: now() });
    next = updateProjectTargets(next, project.id, readyAccountIds, now());
    try {
      await onPersist(next);
      const tistoryAccountIds = readyAccountIds.filter((id) => connected.some((connection) => connection.id === id && connection.platform === "tistory"));
      const preparationResponse = await fetch("/api/tistory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", workspaceId: project.workspaceId, projectId: project.id, contentId, ...(tistoryAccountIds.length === 1 ? { connectionId: tistoryAccountIds[0] } : {}) }) });
      const preparationResult = await preparationResponse.json() as { data?: UserData; error?: string };
      if (!preparationResponse.ok) throw new Error(preparationResult.error ?? "티스토리 발행 계정 자동 적용에 실패했습니다.");
      if (preparationResult.data) { next = preparationResult.data; await onPersist(next); }
      const persistedAccountIds = next.contents.find((item) => item.id === contentId)?.selectedPublishingAccountIds ?? readyAccountIds;
      for (const connectionId of persistedAccountIds) {
        const targetResponse = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select-target", workspaceId: project.workspaceId, projectId: project.id, connectionId }) });
        if (!targetResponse.ok) { const result = await targetResponse.json() as { error?: string }; throw new Error(result.error ?? "Publishing-account selection failed."); }
      }
      if (!generate) { onOpenEditor(contentId); return; }
      setNotice("canonical ContentDocument 원고를 생성하고 있습니다.");
      const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", input: {
        contentId, contentType: confirmedPlan.recommendedContentType, keywords: [confirmedKeyword, ...confirmedPlan.relatedKeywords], platform: confirmedPlan.recommendedPlatforms[0] ?? "canonical",
        workspaceId: project.workspaceId, projectId: project.id, editorialContext: JSON.stringify({ request: confirmedRequest, interpretedIntent: confirmedPlan.interpretedIntent, targetAudience: confirmedPlan.targetAudience, contentGoal: confirmedPlan.contentGoal, searchIntent: confirmedPlan.searchIntent }),
      } }) });
      const result = await response.json() as { document?: ContentDocument; quality?: QualityReport; data?: UserData; error?: string };
      if (!response.ok || !result.document) throw new Error(result.error ?? "Generation failed.");
      if (result.data) { next = result.data; await onPersist(next); onOpenEditor(contentId); }
      else next = await completeConfirmedGeneration(next, { contentId, generated: { document: result.document, quality: result.quality }, now: now() }, { persist: onPersist, openEditor: onOpenEditor });
    } catch (error) {
      const configurationRequired = message(error).includes("OPENAI_API_KEY");
      next = updateContent(next, contentId, { status: configurationRequired ? "configuration_required" : "draft", generationError: message(error), updatedAt: now() });
      let recoveryNotice = "콘텐츠 기록은 안전하게 보존되었습니다. 편집기에서 직접 작성하거나 나중에 다시 시도할 수 있습니다.";
      try {
        await onPersist(next);
      } catch (persistenceError) {
        recoveryNotice = `복구 데이터 저장에도 실패했습니다: ${message(persistenceError)}`;
      }
      setNotice(`${message(error)} ${recoveryNotice}`); onOpenEditor(contentId);
    } finally { setWorking(false); }
  };

  useEffect(() => {
    if (!automatic || autoStarted) return; const strategy = resolveProjectStrategy(project); const automaticRequest = `${strategy.primaryTopic} 프로젝트에서 아직 다루지 않은 주제를 선정해 ${strategy.targetAudience}을 위한 ${strategy.defaultContentType} 원고를 작성해줘. 세부 주제: ${strategy.subtopics.join(", ") || strategy.primaryTopic}. 제외 주제: ${strategy.excludedTopics.join(", ") || "없음"}.`;
    void Promise.resolve().then(() => { setAutoStarted(true); setRequest(automaticRequest); setWorking(true); setNotice("주제를 선정하고 있습니다. 기존 게시글과 중복 여부를 확인하고 있습니다."); return fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", input: { naturalLanguageRequest: automaticRequest, workspaceId: project.workspaceId, projectId: project.id } }) }); }).then(async (response) => { const result = await response.json() as { plan?: ContentPlanningResult; error?: string }; if (!response.ok || !result.plan) throw new Error(result.error ?? "주제를 선정하지 못했습니다."); setPlan(result.plan); setKeyword(result.plan.recommendedPrimaryKeyword); setNotice("Google SEO 원고를 작성하고 있습니다. 내부링크·이미지·CTA 구성과 품질검토를 함께 진행합니다."); setWorking(false); await confirm(true, result.plan, automaticRequest); }).catch((error) => { setWorking(false); setNotice(`${message(error)} 기존 데이터는 변경되지 않았습니다. 다시 시도할 수 있습니다.`); });
  }, [automatic, autoStarted]); // eslint-disable-line react-hooks/exhaustive-deps

  return <PageContainer className="py-8 sm:py-10 lg:py-12">
    <button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← 프로젝트 대시보드</button>
    <header className="mt-6 border-b border-black/6 pb-7"><p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{project.name}</p><h1 className="mt-2 text-3xl font-semibold">어떤 콘텐츠를 만들까요?</h1><p className="mt-2 text-sm text-[#77777f]">원하는 결과를 자연스럽게 설명해 주세요. SEO나 프롬프트 용어를 알 필요가 없습니다.</p></header>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6">
      <textarea autoFocus className="min-h-32 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-4 leading-7" onChange={(event) => setRequest(event.target.value)} placeholder="예: 50대를 위한 혈당 관리 글을 만들고 싶어" value={request} />
      <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={working || !request.trim()} onClick={() => void analyze(false)} type="button">분석하고 추천받기</button><button className="rounded-xl border border-black/8 px-5 py-3 text-sm font-semibold disabled:opacity-50" disabled={working || !request.trim()} onClick={() => void analyze(true)} type="button">직접 설정하기</button></div>
      <p aria-live="polite" className="mt-3 text-sm text-[#77777f]">{notice}</p>
      {working ? <div aria-busy="true" className="mt-3 rounded-xl border border-[#ffb3b3] bg-[#fff7f7] p-4"><p className="font-semibold">{plan ? "원고를 생성하고 있습니다." : "요청을 분석하고 있습니다."}</p><p className="mt-1 text-sm text-[#66666f]">{plan ? "콘텐츠 구조와 SEO, 이미지, 링크, CTA를 함께 구성하고 자동 품질 검토까지 진행합니다." : "검색 의도와 독자, 콘텐츠 방향을 확인하고 있습니다."}</p></div> : null}
      <p className="mt-3 text-xs text-[#92929a]">연결된 계정이 없어도 AI 기획, 콘텐츠 생성과 편집은 계속할 수 있습니다. <Link className="font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/settings?section=connections`}>설정에서 연결 관리</Link></p>
    </section>
    {plan ? <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6">
      <h2 className="text-xl font-semibold">AI 분석 및 추천</h2>
      <label className="mt-5 block text-sm font-semibold">해석된 요청<textarea className="mt-2 min-h-20 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setRequest(event.target.value)} value={request} /></label>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2"><Info label="의도" value={plan.interpretedIntent} /><Info label="분야" value={plan.domain} /><Info label="대상 독자" value={plan.targetAudience} /><Info label="목표" value={plan.contentGoal} /><Info label="검색 의도" value={plan.searchIntent} /><Info label="콘텐츠 유형" value={plan.recommendedContentType} /></dl>
      <label className="mt-5 block text-sm font-semibold">대표 키워드<input className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setKeyword(event.target.value)} value={keyword} /></label>
      <div className="mt-3 flex flex-wrap gap-2">{plan.keywordCandidates.map((candidate) => <button className={`rounded-full border px-3 py-2 text-sm ${candidate === keyword ? "border-[#ff6b6b] bg-[#fff0f0]" : ""}`} key={candidate} onClick={() => setKeyword(candidate)} type="button">{candidate}</button>)}</div>
      <p className="mt-4 text-sm leading-6 text-[#77777f]">{plan.recommendationReason}</p><p className="mt-2 text-xs text-[#92929a]">신뢰도 {Math.round(plan.confidence * 100)}% · {plan.estimateDisclosure}</p>
      <h3 className="mt-6 font-semibold">발행 계정</h3>{connected.length ? <div className="mt-3 space-y-2">{connected.map((connection) => <label className="flex gap-3 rounded-xl border p-3 text-sm" key={connection.id}><input checked={selected.includes(connection.id)} onChange={() => setSelected(toggle(selected, connection.id))} type="checkbox" />{connection.platform}: {connection.displayName}</label>)}</div> : <p className="mt-2 text-sm text-[#77777f]">연결된 발행 계정이 없어도 AI 기획, 콘텐츠 생성과 편집은 계속할 수 있습니다. 실제 미리보기와 임시저장만 준비 상태에 따라 제한됩니다.</p>}
      <Link className="mt-3 inline-block text-sm font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/settings?section=connections`}>설정에서 플랫폼 연결 관리</Link>
      <div className="mt-6 flex flex-wrap gap-2"><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" disabled={working} onClick={() => void analyze(false)} type="button">추천 다시 생성</button><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" disabled={working || !keyword.trim()} onClick={() => void confirm(false)} type="button">확인 후 직접 작성</button><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white" disabled={working || !keyword.trim()} onClick={() => void confirm(true)} type="button">확인 후 원고 생성</button></div>
    </section> : null}
  </PageContainer>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase text-[#92929a]">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>; }
function toggle(values: readonly string[], id: string) { return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]; }
function createId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function now() { return new Date().toISOString(); }
function message(error: unknown) { return error instanceof Error ? error.message : "Request failed."; }
