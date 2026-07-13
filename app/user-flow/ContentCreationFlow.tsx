"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import { PageContainer } from "../shared/ui/PageContainer";
import { completeConfirmedGeneration } from "./confirmed-generation";
import {
  createContentFromPlan, updateContent, updateProjectTargets,
  type ContentPlanningResult, type UserData, type UserProject,
} from "./user-data";

type SafeConnection = Readonly<{ id: string; platform: "tistory" | "wordpress"; displayName: string; status: string }>;

export function ContentCreationFlow({ data, project, onBack, onOpenEditor, onPersist }: {
  data: UserData; project: UserProject; onBack: () => void; onOpenEditor: (contentId: string) => void; onPersist: (data: UserData) => Promise<void>;
}) {
  const [request, setRequest] = useState("");
  const [plan, setPlan] = useState<ContentPlanningResult>();
  const [keyword, setKeyword] = useState("");
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]);
  const [selected, setSelected] = useState<readonly string[]>(project.selectedPublishingAccountIds ?? []);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [contentId] = useState(() => createId("content"));
  const connected = useMemo(() => connections.filter((connection) => connection.status === "connected"), [connections]);

  useEffect(() => { void fetch(`/api/connections?workspaceId=${encodeURIComponent(project.workspaceId)}`, { cache: "no-store" }).then((response) => response.json()).then((result: { connections?: SafeConnection[] }) => setConnections(result.connections ?? [])); }, [project.workspaceId]);

  const analyze = async (manual = false) => {
    setWorking(true); setNotice(manual ? "Manual planning is ready." : "Analyzing your request...");
    try {
      const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: manual ? "manual-plan" : "plan", input: { naturalLanguageRequest: request, workspaceId: project.workspaceId } }) });
      const result = await response.json() as { plan?: ContentPlanningResult; error?: string };
      if (!response.ok || !result.plan) throw new Error(result.error ?? "Planning failed.");
      setPlan(result.plan); setKeyword(result.plan.recommendedPrimaryKeyword); setNotice(manual ? "Continue with a manual plan. You can edit everything." : "Review and confirm the recommendation before generation.");
    } catch (error) { setNotice(`${message(error)} Your request is preserved. Continue manually or configure the AI provider.`); }
    finally { setWorking(false); }
  };

  const confirm = async (generate: boolean) => {
    if (!plan) return;
    const readyAccountIds = selected.filter((id) => connected.some((connection) => connection.id === id));
    setWorking(true); setNotice("Saving the Content record before generation...");
    let next = createContentFromPlan(data, { id: contentId, projectId: project.id, naturalLanguageRequest: request, plan, primaryKeyword: keyword, selectedPublishingAccountIds: readyAccountIds, now: now() });
    next = updateProjectTargets(next, project.id, readyAccountIds, now());
    try {
      await onPersist(next);
      for (const connectionId of readyAccountIds) {
        const targetResponse = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select-target", workspaceId: project.workspaceId, projectId: project.id, connectionId }) });
        if (!targetResponse.ok) { const result = await targetResponse.json() as { error?: string }; throw new Error(result.error ?? "Publishing-account selection failed."); }
      }
      if (!generate) { onOpenEditor(contentId); return; }
      setNotice("Generating the canonical ContentDocument...");
      const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", input: {
        contentId, contentType: plan.recommendedContentType, keywords: [keyword, ...plan.relatedKeywords], platform: plan.recommendedPlatforms[0] ?? "canonical",
        workspaceId: project.workspaceId, projectId: project.id, editorialContext: JSON.stringify({ request, interpretedIntent: plan.interpretedIntent, targetAudience: plan.targetAudience, contentGoal: plan.contentGoal, searchIntent: plan.searchIntent }),
      } }) });
      const result = await response.json() as { document?: ContentDocument; quality?: QualityReport; error?: string };
      if (!response.ok || !result.document) throw new Error(result.error ?? "Generation failed.");
      next = await completeConfirmedGeneration(next, { contentId, generated: { document: result.document, quality: result.quality }, now: now() }, { persist: onPersist, openEditor: onOpenEditor });
    } catch (error) {
      const configurationRequired = message(error).includes("OPENAI_API_KEY");
      next = updateContent(next, contentId, { status: configurationRequired ? "configuration_required" : "draft", generationError: message(error), updatedAt: now() });
      let recoveryNotice = "The Content record is safe; open the Editor to draft manually or retry later.";
      try {
        await onPersist(next);
      } catch (persistenceError) {
        recoveryNotice = `Recovery persistence also failed: ${message(persistenceError)}`;
      }
      setNotice(`${message(error)} ${recoveryNotice}`); onOpenEditor(contentId);
    } finally { setWorking(false); }
  };

  return <PageContainer className="py-8 sm:py-10 lg:py-12">
    <button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← Project Dashboard</button>
    <header className="mt-6 border-b border-black/6 pb-7"><p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{project.name}</p><h1 className="mt-2 text-3xl font-semibold">What would you like to create?</h1><p className="mt-2 text-sm text-[#77777f]">Describe the result naturally. You do not need SEO or prompt terminology.</p></header>
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6">
      <textarea autoFocus className="min-h-32 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-4 leading-7" onChange={(event) => setRequest(event.target.value)} placeholder="예: 50대를 위한 혈당 관리 글을 만들고 싶어" value={request} />
      <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={working || !request.trim()} onClick={() => void analyze(false)} type="button">Analyze and recommend</button><button className="rounded-xl border border-black/8 px-5 py-3 text-sm font-semibold disabled:opacity-50" disabled={working || !request.trim()} onClick={() => void analyze(true)} type="button">Continue manually</button></div>
      <p aria-live="polite" className="mt-3 text-sm text-[#77777f]">{notice}</p>
      <p className="mt-3 text-xs text-[#92929a]">연결된 계정이 없어도 AI 기획, 콘텐츠 생성과 편집은 계속할 수 있습니다. <Link className="font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/settings?section=connections`}>Settings에서 연결 관리</Link></p>
    </section>
    {plan ? <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6">
      <h2 className="text-xl font-semibold">AI analysis and recommendation</h2>
      <label className="mt-5 block text-sm font-semibold">Interpreted request<textarea className="mt-2 min-h-20 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setRequest(event.target.value)} value={request} /></label>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2"><Info label="Intent" value={plan.interpretedIntent} /><Info label="Domain" value={plan.domain} /><Info label="Audience" value={plan.targetAudience} /><Info label="Goal" value={plan.contentGoal} /><Info label="Search intent" value={plan.searchIntent} /><Info label="Content type" value={plan.recommendedContentType} /></dl>
      <label className="mt-5 block text-sm font-semibold">Primary keyword<input className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setKeyword(event.target.value)} value={keyword} /></label>
      <div className="mt-3 flex flex-wrap gap-2">{plan.keywordCandidates.map((candidate) => <button className={`rounded-full border px-3 py-2 text-sm ${candidate === keyword ? "border-[#ff6b6b] bg-[#fff0f0]" : ""}`} key={candidate} onClick={() => setKeyword(candidate)} type="button">{candidate}</button>)}</div>
      <p className="mt-4 text-sm leading-6 text-[#77777f]">{plan.recommendationReason}</p><p className="mt-2 text-xs text-[#92929a]">Confidence {Math.round(plan.confidence * 100)}% · {plan.estimateDisclosure}</p>
      <h3 className="mt-6 font-semibold">Publishing accounts</h3>{connected.length ? <div className="mt-3 space-y-2">{connected.map((connection) => <label className="flex gap-3 rounded-xl border p-3 text-sm" key={connection.id}><input checked={selected.includes(connection.id)} onChange={() => setSelected(toggle(selected, connection.id))} type="checkbox" />{connection.platform}: {connection.displayName}</label>)}</div> : <p className="mt-2 text-sm text-[#77777f]">연결된 발행 계정이 없어도 AI 기획, 콘텐츠 생성과 편집은 계속할 수 있습니다. 실제 미리보기와 임시저장만 준비 상태에 따라 제한됩니다.</p>}
      <Link className="mt-3 inline-block text-sm font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/settings?section=connections`}>Settings에서 플랫폼 연결 관리</Link>
      <div className="mt-6 flex flex-wrap gap-2"><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" disabled={working} onClick={() => void analyze(false)} type="button">Regenerate recommendations</button><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" disabled={working || !keyword.trim()} onClick={() => void confirm(false)} type="button">Confirm and draft manually</button><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white" disabled={working || !keyword.trim()} onClick={() => void confirm(true)} type="button">Confirm and generate</button></div>
    </section> : null}
  </PageContainer>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-semibold uppercase text-[#92929a]">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>; }
function toggle(values: readonly string[], id: string) { return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]; }
function createId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function now() { return new Date().toISOString(); }
function message(error: unknown) { return error instanceof Error ? error.message : "Request failed."; }
