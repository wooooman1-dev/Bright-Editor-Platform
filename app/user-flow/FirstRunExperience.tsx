"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GlobalHeader } from "../shared/ui/GlobalHeader";
import { PageContainer } from "../shared/ui/PageContainer";
import { WorkspacePlatformOnboarding } from "../onboarding/WorkspacePlatformOnboarding";
import type { WorkspaceSummary } from "../shared/view-models/workspace";
import { applyTheme } from "../settings/theme";
import { ContentCreationFlow } from "./ContentCreationFlow";
import { resolveContentOpenDestination } from "./content-navigation";
import { DangerZone } from "./DangerZone";
import { EditorWorkspace } from "./EditorWorkspace";
import { ProjectCardActions } from "./ProjectCardActions";
import { contentRevisionId } from "../../core/quality";
import { normalizeQualityReview } from "./quality-review-ui";
import {
  createProject,
  createWorkspace,
  emptyUserData,
  hasConfiguredEnabledPlatforms,
  parseStoredUserData,
  renameProject,
  resolveProjectStrategy,
  saveDraft,
  updateProjectTargets,
  type UserContent,
  type UserData,
  type UserProject,
} from "./user-data";

type Screen =
  | Readonly<{ name: "home" }>
  | Readonly<{ name: "connections" }>
  | Readonly<{ name: "project"; projectId: string }>
  | Readonly<{ name: "create"; projectId: string; automatic?: boolean; contentId?: string }>
  | Readonly<{ name: "editor"; projectId: string; contentId: string }>;

export function FirstRunExperience() {
  const [data, setData] = useState<UserData>(emptyUserData);
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const [hydrated, setHydrated] = useState(false);
  const locationInitialized = useRef(false);
  const restoringHistory = useRef(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => response.json() as Promise<{ data?: UserData | null }>)
      .then((result) => { if (active) { const next = result.data ? parseStoredUserData(JSON.stringify(result.data)) : emptyUserData; setData(next); setScreen(screenFromLocation(next)); applyTheme(next.workspace?.settings?.appearance.theme ?? "system"); } })
      .finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  const persist = async (next: UserData) => {
    setData(next);
    const response = await fetch("/api/studio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const result = await response.json() as { data?: UserData; error?: string };
    if (!response.ok) throw new Error(result.error ?? "Local persistence failed.");
    if (result.data) setData((current) => mergePersistedData(current, parseStoredUserData(JSON.stringify(result.data))));
  };
  const refreshData = useCallback(async (): Promise<UserData> => {
    const response = await fetch("/api/studio", { cache: "no-store" });
    const result = await response.json() as { data?: UserData | null; error?: string };
    if (!response.ok || !result.data) throw new Error(result.error ?? "작업 공간을 새로 불러오지 못했습니다.");
    const next = parseStoredUserData(JSON.stringify(result.data));
    setData(next);
    return next;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (restoringHistory.current) { restoringHistory.current = false; return; }
    syncLocation(screen, locationInitialized.current ? "push" : "replace");
    locationInitialized.current = true;
  }, [hydrated, screen]);

  useEffect(() => {
    if (!hydrated) return;
    const onPopState = () => {
      restoringHistory.current = true;
      setScreen(screenFromLocation(data));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [data, hydrated]);

  const workspaces: readonly WorkspaceSummary[] = data.workspace ? [{ id: data.workspace.id, name: data.workspace.name }] : [];

  if (!hydrated) {
    return <main className="min-h-screen bg-[#f8f8fa]" aria-busy="true" />;
  }

  if (!data.workspace) {
    return <WorkspaceCreation onCreate={(name) => persist(createWorkspace(data, name, createId("workspace")))} />;
  }

  if (!hasConfiguredEnabledPlatforms(data)) return <WorkspacePlatformOnboarding workspaceId={data.workspace.id} />;

  const requestedProjectId = screen.name === "project" || screen.name === "create" || screen.name === "editor" ? screen.projectId : undefined;
  const activeProject = requestedProjectId ? data.projects.find((project) => project.id === requestedProjectId && project.workspaceId === data.workspace!.id) : undefined;
  const activeContent = screen.name === "editor" && activeProject ? data.contents.find((content) => content.id === screen.contentId && content.workspaceId === data.workspace!.id && content.projectId === activeProject.id) : undefined;
  const activePlanningContent = screen.name === "create" && screen.contentId && activeProject ? data.contents.find((content) => content.id === screen.contentId && content.workspaceId === data.workspace!.id && content.projectId === activeProject.id) : undefined;

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Home" selectedWorkspaceId={data.workspace.id} workspaces={workspaces} />
      {screen.name === "home" ? (
        <WorkspaceHome data={data} onCreateToday={(projectId) => setScreen({ name: "create", projectId, automatic: true })} onOpenProject={(projectId) => setScreen({ name: "project", projectId })} onPersist={persist} onRefresh={refreshData} />
      ) : null}
      {screen.name === "connections" ? <PlatformConnections onBack={() => setScreen({ name: "home" })} workspaceId={data.workspace.id} /> : null}
      {screen.name === "project" && activeProject ? (
        <ProjectScreen
          data={data}
          project={activeProject}
          onBack={() => setScreen({ name: "home" })}
          onOpenContent={(contentId) => {
            const target = data.contents.find((item) => item.id === contentId);
            if (!target) return;
            const destination = resolveContentOpenDestination(target);
            setScreen(destination === "planning" ? { name: "create", projectId: activeProject.id, contentId } : { name: "editor", projectId: activeProject.id, contentId });
          }}
          onCreateContent={(automatic) => setScreen({ name: "create", projectId: activeProject.id, automatic })}
          onDeleted={() => { window.location.assign("/"); }}
          onPersist={persist}
          onRename={async (name) => persist(renameProject(data, activeProject.id, name, nowLabel()))}
        />
      ) : null}
      {screen.name === "create" && activeProject ? <ContentCreationFlow key={activeProject.id} automatic={screen.automatic === true} content={activePlanningContent} data={data} onBack={() => setScreen({ name: "project", projectId: activeProject.id })} onContentStarted={(contentId) => setScreen((current) => current.name === "create" ? { ...current, contentId } : current)} onOpenEditor={(contentId) => setScreen({ name: "editor", projectId: activeProject.id, contentId })} onPersist={persist} onRefresh={refreshData} onRestore={setData} project={activeProject} /> : null}
      {screen.name === "editor" && activeProject && activeContent ? (
        <EditorWorkspace
          key={`${activeProject.id}:${activeContent.id}`}
          content={activeContent}
          data={data}
          onBack={() => setScreen({ name: "project", projectId: activeProject.id })}
          onPersist={persist}
          project={activeProject}
        />
      ) : null}
      {(screen.name === "project" || screen.name === "create" || screen.name === "editor") && (!activeProject || (screen.name === "editor" && !activeContent)) ? <PageContainer className="py-16"><section className="rounded-2xl border border-red-200 bg-white p-6"><h1 className="text-xl font-semibold">프로젝트 또는 콘텐츠를 찾을 수 없습니다.</h1><p className="mt-2 text-sm text-[#77777f]">현재 작업 공간에 속한 프로젝트와 콘텐츠인지 확인해 주세요.</p><button className="mt-4 rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => setScreen({ name: "home" })} type="button">작업 공간으로 돌아가기</button></section></PageContainer> : null}
    </main>
  );
}

function WorkspaceCreation({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Home" workspaces={[]} />
      <PageContainer className="py-12 sm:py-16 lg:py-20">
        <section className="mx-auto max-w-2xl rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_16px_50px_rgba(24,24,27,0.06)] sm:p-9">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">처음 시작하기</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">나만의 작업 공간을 만들어 주세요</h1>
          <p className="mt-3 text-sm leading-6 text-[#77777f] sm:text-base">작업 공간 안에서 프로젝트와 콘텐츠를 관리할 수 있습니다.</p>
          <form className="mt-8" onSubmit={(event) => { event.preventDefault(); try { onCreate(name); } catch (reason) { setError(getErrorMessage(reason)); } }}>
            <label className="block text-sm font-semibold" htmlFor="workspace-name">작업 공간 이름</label>
            <input autoFocus className="mt-2 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-3 outline-none focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10" id="workspace-name" onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="예: 나의 콘텐츠 작업실" value={name} />
            {error ? <p className="mt-2 text-sm font-medium text-[#d94848]">{error}</p> : null}
            <button className="mt-5 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)]" type="submit">작업 공간 만들기</button>
          </form>
        </section>
      </PageContainer>
    </main>
  );
}

function WorkspaceHome({ data, onCreateToday, onOpenProject, onPersist, onRefresh }: { data: UserData; onCreateToday: (projectId: string) => void; onOpenProject: (projectId: string) => void; onPersist: (data: UserData) => Promise<void>; onRefresh: () => Promise<unknown> }) {
  const [showForm, setShowForm] = useState(data.projects.length === 0);
  const [notice, setNotice] = useState("");
  const brandsById = useMemo(() => new Map(data.brands.map((brand) => [brand.id, brand])), [data.brands]);
  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <header className="flex flex-col gap-5 border-b border-black/6 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">작업 공간</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{data.workspace!.name}</h1>
          <p className="mt-2 text-sm leading-6 text-[#77777f]">프로젝트를 만들고 필요하면 브랜드 이름을 함께 입력하세요.</p>
        </div>
        <div className="flex gap-2"><Link className="rounded-xl border border-black/8 bg-white px-5 py-3 text-sm font-semibold" href={`/workspaces/${data.workspace!.id}/settings`}>설정</Link><button className="w-fit rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" onClick={() => setShowForm((value) => !value)} type="button">새 프로젝트</button></div>
      </header>

      {showForm ? <ProjectCreationForm data={data} onCancel={data.projects.length > 0 ? () => setShowForm(false) : undefined} onCreate={(next) => { const created = next.projects.find((project) => !data.projects.some((current) => current.id === project.id)); void onPersist(next).then(() => { setShowForm(false); if (created) onOpenProject(created.id); }); }} /> : null}

      {data.projects.length === 0 ? (
        <section className="mt-8 rounded-[24px] border border-dashed border-black/10 bg-white p-7 text-center sm:p-10">
          <h2 className="text-xl font-semibold">아직 프로젝트가 없습니다</h2>
          <p className="mt-2 text-sm text-[#77777f]">프로젝트 이름은 필수이고 브랜드 이름은 선택입니다.</p>
        </section>
      ) : (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">프로젝트</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((project) => (
              <article className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]" key={project.id}>
                <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-[#d94848]">{project.brandId ? brandsById.get(project.brandId)?.name : "브랜드 없음"}</p><ProjectCardActions brandName={project.brandId ? brandsById.get(project.brandId)?.name : undefined} onCreateToday={() => onCreateToday(project.id)} onDeleted={async () => { await onRefresh(); setNotice(`${project.name} 프로젝트를 백업 후 삭제했습니다.`); }} onRename={async (name) => { await onPersist(renameProject(data, project.id, name, nowLabel())); setNotice("프로젝트 이름을 저장했습니다."); }} project={project} workspaceId={data.workspace!.id} /></div>
                <h3 className="mt-3 text-lg font-semibold">{project.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-[#77777f]">{project.description || "설명이 없습니다."}</p>
                <button className="mt-5 text-sm font-semibold text-[#d94848]" onClick={() => onOpenProject(project.id)} type="button">프로젝트 열기 →</button>
              </article>
            ))}
          </div>
          {notice ? <p aria-live="polite" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
        </section>
      )}
      <DangerZone onDeleted={() => { window.location.assign("/"); }} scope="workspace" workspaceId={data.workspace!.id} />
    </PageContainer>
  );
}

function ProjectCreationForm({ data, onCancel, onCreate }: { data: UserData; onCancel?: () => void; onCreate: (data: UserData) => void }) {
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  return (
    <form className="mt-8 rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-8" onSubmit={(event) => { event.preventDefault(); try { onCreate(createProject(data, { id: createId("project"), name, brandName, description, brandIdFactory: () => createId("brand"), now: nowLabel() })); } catch (reason) { setError(getErrorMessage(reason)); } }}>
      <h2 className="text-xl font-semibold">새 프로젝트 만들기</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field label="프로젝트 이름 *" onChange={setName} placeholder="예: 건강검진 콘텐츠 시리즈" value={name} />
        <Field label="브랜드 이름 (선택)" onChange={setBrandName} placeholder="예: 밝은건강" value={brandName} />
      </div>
      <label className="mt-5 block text-sm font-semibold">프로젝트 설명 (선택)<textarea className="mt-2 min-h-28 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-3 font-normal outline-none" onChange={(event) => setDescription(event.target.value)} value={description} /></label>
      {error ? <p className="mt-3 text-sm font-medium text-[#d94848]">{error}</p> : null}
      <div className="mt-5 flex gap-3"><button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" type="submit">프로젝트 만들기</button>{onCancel ? <button className="rounded-xl border border-black/8 px-5 py-3 text-sm font-semibold" onClick={onCancel} type="button">취소</button> : null}</div>
    </form>
  );
}

function ProjectScreen({ data, onBack, onCreateContent, onDeleted, onOpenContent, onPersist, onRename, project }: { data: UserData; onBack: () => void; onCreateContent: (automatic: boolean) => void; onDeleted: () => void; onOpenContent: (contentId: string) => void; onPersist: (data: UserData) => Promise<void>; onRename: (name: string) => Promise<void>; project: UserProject }) {
  const contents = data.contents.filter((content) => content.projectId === project.id);
  const brand = project.brandId ? data.brands.find((item) => item.id === project.brandId) : undefined;
  const strategy = resolveProjectStrategy(project);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [renameState, setRenameState] = useState<"idle" | "saving" | "error" | "saved">("idle");
  const latestContentId = [...contents].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.id;
  const selectedConnectionIds = useMemo(() => project.selectedPublishingAccountIds ?? [], [project.selectedPublishingAccountIds]);

  useEffect(() => {
    if (!latestContentId || selectedConnectionIds.length === 0) return;

    const controller = new AbortController();
    void fetch(`/api/connections?workspaceId=${encodeURIComponent(project.workspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { connections?: SafeConnection[] };
        if (!response.ok) return [];
        return (result.connections ?? []).filter((connection) => connection.platform === "tistory" && connection.status === "connected" && selectedConnectionIds.includes(connection.id));
      })
      .then(async (connections) => {
        await Promise.allSettled(connections.map((connection) => fetch(
          `/api/tistory/posts?workspaceId=${encodeURIComponent(project.workspaceId)}&contentId=${encodeURIComponent(latestContentId)}&connectionId=${encodeURIComponent(connection.id)}&refresh=false`,
          { cache: "no-store", signal: controller.signal },
        )));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.warn("Tistory post catalog auto-sync failed.", error);
      });

    return () => controller.abort();
  }, [latestContentId, project.workspaceId, selectedConnectionIds]);

  const saveName = async () => {
    setRenameState("saving");
    try { await onRename(nameDraft); setRenameState("saved"); setEditingName(false); }
    catch { setRenameState("error"); }
  };
  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← 작업 공간으로 돌아가기</button>
      <header className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-black/6 pb-8">
        <div>
        <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{brand?.name ?? "브랜드 없음"}</p>
        {editingName ? <div className="mt-2 flex flex-wrap items-center gap-2"><input aria-label="프로젝트 이름" autoFocus className="rounded-xl border px-3 py-2 text-2xl font-semibold tracking-[-0.04em]" onChange={(event) => { setNameDraft(event.target.value); setRenameState("idle"); }} value={nameDraft} /><button className="rounded-lg bg-[#ff6b6b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={renameState === "saving" || !nameDraft.trim()} onClick={() => void saveName()} type="button">{renameState === "saving" ? "저장 중" : "저장"}</button><button className="rounded-lg border px-3 py-2 text-sm" disabled={renameState === "saving"} onClick={() => { setEditingName(false); setNameDraft(project.name); setRenameState("idle"); }} type="button">취소</button></div> : <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{project.name}</h1><button className="rounded-lg border px-3 py-1.5 text-sm font-semibold" onClick={() => { setNameDraft(project.name); setEditingName(true); setRenameState("idle"); }} type="button">프로젝트명 수정</button></div>}
        <p className="mt-2 text-sm text-[#77777f]">{project.description || "프로젝트 설명이 없습니다."}</p>
        </div>
        <div className="flex flex-wrap gap-2"><button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" onClick={() => onCreateContent(true)} type="button">오늘 글 작성</button><button className="rounded-xl border bg-white px-5 py-3 text-sm font-semibold" onClick={() => onCreateContent(false)} type="button">주제를 직접 입력해 작성</button></div>
      {renameState === "error" ? <p className="w-full text-sm text-red-700">프로젝트 이름을 저장하지 못했습니다. 이름을 확인한 뒤 다시 시도해 주세요.</p> : null}{renameState === "saved" ? <p className="w-full text-sm text-emerald-700">프로젝트 이름을 저장했습니다.</p> : null}
      </header>
      <section className="mt-6 rounded-[20px] border border-black/6 bg-white p-5"><h2 className="font-semibold">{project.name} 프로젝트의 콘텐츠 전략을 사용합니다.</h2><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-[#77777f]">대표 주제</dt><dd className="mt-1 font-semibold">{strategy.primaryTopic}</dd></div><div><dt className="text-[#77777f]">기본 플랫폼</dt><dd className="mt-1 font-semibold">{strategy.defaultPlatform === "tistory" ? "티스토리" : strategy.defaultPlatform}</dd></div><div><dt className="text-[#77777f]">기본 카테고리</dt><dd className="mt-1 font-semibold">{strategy.defaultTistoryCategory?.name ?? "첫 임시저장 준비에서 선택"}</dd></div><div><dt className="text-[#77777f]">품질 원칙</dt><dd className="mt-1 font-semibold">독자 문제 해결과 정보 충분성</dd></div></dl></section>
      <PublishingTargetSelector data={data} onPersist={onPersist} project={project} workspaceId={data.workspace!.id} />
      <section className="mt-8">
        <h2 className="text-lg font-semibold">콘텐츠</h2>
        {contents.length === 0 ? <p className="mt-4 rounded-[20px] border border-dashed border-black/10 bg-white p-6 text-sm text-[#77777f]">아직 콘텐츠가 없습니다.</p> : <div className="mt-4 space-y-3">{contents.map((content) => { const destination = resolveContentOpenDestination(content); const resumable = destination === "planning"; const needsRevision = Boolean(content.document && content.quality?.approved === false); return <button className="flex w-full items-center justify-between rounded-[20px] border border-black/6 bg-white p-5 text-left" key={content.id} onClick={() => onOpenContent(content.id)} type="button"><span><span className="block font-semibold">{content.title}</span><span className="mt-1 block text-xs text-[#92929a]">{resumable ? `Planning · ${planningStatusLabel(content.planningWorkflow!.status)}` : needsRevision ? "품질 미달 · 수정 필요" : "임시저장"} · {content.updatedAt}</span></span><span className="text-sm font-semibold text-[#d94848]">{resumable ? "이어서 작성 →" : content.document ? "계속 수정 →" : "편집 →"}</span></button>; })}</div>}
      </section>
      <section className="mt-8 rounded-[20px] border border-black/6 bg-white p-5"><h2 className="font-semibold">Project settings</h2><p className="mt-2 text-sm text-[#77777f]">Project name: {project.name} · Brand: {brand?.name ?? "None"}</p></section>
      <DangerZone onDeleted={onDeleted} projectId={project.id} scope="project" workspaceId={data.workspace!.id} />
    </PageContainer>
  );
}

export function LegacyEditorScreen({ content, data, onBack, onPersist, project }: { content: UserContent; data: UserData; onBack: () => void; onPersist: (data: UserData) => void | Promise<void>; project: UserProject }) {
  const [title, setTitle] = useState(content.title);
  const [body, setBody] = useState(content.body);
  const [notice, setNotice] = useState("Drafts are stored locally and durably.");
  const [platform, setPlatform] = useState(content.platform ?? "tistory");
  const [contentType, setContentType] = useState(content.contentType ?? "article");
  const [keywords, setKeywords] = useState("");
  const normalizedQuality = normalizeQualityReview(content.quality, { currentRevisionId: content.document ? contentRevisionId(content.document) : undefined });
  const [generating, setGenerating] = useState(false);
  const [preparedHtml, setPreparedHtml] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (title !== content.title || body !== content.body) {
        try { onPersist(saveDraft(data, { contentId: content.id, title, body, now: nowLabel() })); setNotice("Autosaved."); } catch { /* wait for valid input */ }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [body, content.body, content.id, content.title, data, onPersist, title]);

  const generate = async () => {
    setGenerating(true);
    setNotice("Generating editorial package...");
    try {
      const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", input: { workspaceId: project.workspaceId, contentId: content.id, contentType, keywords: keywords.split(",").map((value) => value.trim()).filter(Boolean), platform, projectId: project.id } }) });
      const result = await response.json() as { document?: import("../../core/content").ContentDocument; quality?: import("../../core/quality").QualityReport; error?: string };
      if (!response.ok || !result.document) throw new Error(result.error ?? "Generation failed.");
      const generatedBody = result.document.blocks.filter((block) => block.type === "paragraph").map((block) => block.text).join("\n\n");
      const next: UserData = { ...data, contents: data.contents.map((item) => item.id === content.id ? { ...item, body: generatedBody, contentType, document: result.document, platform, quality: result.quality, title: result.document!.title, updatedAt: nowLabel() } : item), qualityReports: result.quality ? [...(data.qualityReports ?? []).filter((item) => item.contentId !== content.id), { contentId: content.id, report: result.quality }] : data.qualityReports };
      setTitle(result.document.title); setBody(generatedBody); onPersist(next);
      setNotice("Generated, quality-reviewed, and persisted as a draft.");
    } catch (reason) { setNotice(getErrorMessage(reason)); } finally { setGenerating(false); }
  };
  const prepare = async () => {
    if (!content.document) { setNotice("Generate or save canonical content first."); return; }
    const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare-tistory", input: { document: content.document, workspaceId: project.workspaceId } }) });
    const result = await response.json() as { prepared?: { payload: { html: string } }; error?: string };
    if (!response.ok || !result.prepared) { setNotice(result.error ?? "Publishing preparation failed."); return; }
    setPreparedHtml(result.prepared.payload.html); setNotice("Tistory draft-save command is ready.");
  };
  const reviewQuality = async () => {
    const latest = saveDraft(data, { contentId: content.id, title, body, now: nowLabel() });
    await onPersist(latest);
    const response = await fetch("/api/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) });
    const result = await response.json() as { quality?: import("../../core/quality").QualityReport; error?: string };
    if (!response.ok || !result.quality) { setNotice(result.error ?? "Quality review failed."); return; }
    const next: UserData = { ...latest, contents: latest.contents.map((item) => item.id === content.id ? { ...item, quality: result.quality } : item), qualityReports: [...(latest.qualityReports ?? []).filter((item) => item.contentId !== content.id), { contentId: content.id, report: result.quality }] };
    onPersist(next); setNotice("Quality review completed.");
  };
  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      <button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← 프로젝트로 돌아가기</button>
      <header className="mt-6 border-b border-black/6 pb-7"><p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{project.name}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">콘텐츠 편집기</h1></header>
      <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-5 sm:p-8">
        <h2 className="text-lg font-semibold">AI Workflow</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-semibold">Platform<select className="mt-2 w-full rounded-xl border border-black/8 px-3 py-3" value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="tistory">Tistory</option></select></label>
          <label className="text-sm font-semibold">Content type<select className="mt-2 w-full rounded-xl border border-black/8 px-3 py-3" value={contentType} onChange={(event) => setContentType(event.target.value)}><option value="article">Article</option><option value="guide">Guide</option><option value="review">Review</option></select></label>
          <Field label="Keywords" onChange={setKeywords} placeholder="keyword, intent" value={keywords} />
        </div>
        <button className="mt-4 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={generating} onClick={() => void generate()} type="button">{generating ? "Generating..." : "Generate content"}</button>
        {normalizedQuality.overallScore !== null ? <p className="mt-4 text-sm">Quality score: <strong>{normalizedQuality.overallScore}</strong> · {normalizedQuality.status === "ready" ? "Publishing gate passed" : "Publishing preparation blocked"}</p> : content.quality ? <p className="mt-4 text-sm">기존 품질 데이터는 현재 형식의 근거가 없어 재검토가 필요합니다.</p> : null}
        <button className="mt-4 ml-3 rounded-xl border border-black/8 px-5 py-3 text-sm font-semibold" onClick={() => void prepare()} type="button">Prepare Tistory draft</button>
        <button className="mt-4 ml-3 rounded-xl border border-black/8 px-5 py-3 text-sm font-semibold" onClick={() => void reviewQuality()} type="button">Review quality</button>
        {preparedHtml ? <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Prepared HTML</summary><pre className="mt-2 overflow-auto rounded-xl bg-[#f8f8fa] p-4 text-xs whitespace-pre-wrap">{preparedHtml}</pre></details> : null}
      </section>
      <form className="mt-6" onSubmit={(event) => { event.preventDefault(); try { const next = saveDraft(data, { contentId: content.id, title, body, now: nowLabel() }); onPersist(next); setNotice("임시저장되었습니다. 새로고침 후에도 유지됩니다."); } catch (reason) { setNotice(getErrorMessage(reason)); } }}>
        <div className="rounded-[24px] border border-black/6 bg-white p-5 sm:p-8"><Field label="제목" onChange={setTitle} value={title} /><label className="mt-6 block text-sm font-semibold">본문<textarea className="mt-2 min-h-96 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-4 font-normal leading-7 outline-none" onChange={(event) => setBody(event.target.value)} value={body} /></label></div>
        <div className="mt-4 flex flex-col gap-3 rounded-[20px] border border-black/6 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><p aria-live="polite" className="text-sm text-[#77777f]">{notice}</p><button className="w-fit rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" type="submit">임시저장</button></div>
      </form>
    </PageContainer>
  );
}

type SafeConnection = Readonly<{ id: string; platform: "tistory" | "wordpress"; displayName: string; status: string; publicMetadata: Record<string, unknown>; lastVerifiedAt?: string }>;

function PlatformConnections({ onBack, workspaceId }: { onBack: () => void; workspaceId: string }) {
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]);
  const [blogAddress, setBlogAddress] = useState("");
  const [siteUrl, setSiteUrl] = useState(""); const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(""); const [jobId, setJobId] = useState<string>();
  const refresh = useCallback(async () => { const response = await fetch(`/api/connections?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }); const result = await response.json() as { connections?: SafeConnection[]; error?: string }; if (response.ok) setConnections(result.connections ?? []); else setNotice(result.error ?? "Connections could not be loaded."); }, [workspaceId]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => { if (!jobId) return; const timer = window.setInterval(() => { void fetch(`/api/connections?jobId=${encodeURIComponent(jobId)}&workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }).then((response) => response.json()).then((result: { job?: { state: string; message: string } }) => { if (!result.job) return; setNotice(result.job.message); if (["completed", "failed", "cancelled", "timed_out"].includes(result.job.state)) { window.clearInterval(timer); setJobId(undefined); void refresh(); } }); }, 1000); return () => window.clearInterval(timer); }, [jobId, refresh, workspaceId]);
  const action = async (body: Record<string, unknown>) => { const response = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, workspaceId }) }); const result = await response.json() as { error?: string; job?: { id: string; message: string }; verification?: { siteTitle: string }; connection?: SafeConnection }; if (!response.ok) { setNotice(result.error ?? "Connection failed."); return result; } setNotice(result.job?.message ?? (result.verification ? `Verified ${result.verification.siteTitle}.` : "Connection saved.")); if (result.job) setJobId(result.job.id); await refresh(); return result; };
  return <PageContainer className="py-8 sm:py-10"><button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← Workspace</button><h1 className="mt-6 text-3xl font-semibold">Platform Connections</h1><p className="mt-2 text-sm text-[#77777f]">Connect publishing accounts without terminal setup.</p>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-[24px] border border-black/6 bg-white p-6"><h2 className="text-xl font-semibold">Tistory</h2><Field label="Tistory blog address" onChange={setBlogAddress} placeholder="https://example.tistory.com" value={blogAddress} /><div className="mt-4 flex gap-2"><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => void action({ action: "tistory-connect", blogAddress })} type="button">Connect</button>{jobId ? <button className="rounded-xl border px-4 py-2.5 text-sm" onClick={() => void action({ action: "cancel", connectionId: jobId })} type="button">Cancel</button> : null}</div></section>
      <section className="rounded-[24px] border border-black/6 bg-white p-6"><h2 className="text-xl font-semibold">WordPress</h2><div className="mt-4 space-y-3"><Field label="Site address" onChange={setSiteUrl} placeholder="https://example.com" value={siteUrl} /><Field label="WordPress username" onChange={setUsername} value={username} /><label className="block text-sm font-semibold">Application Password<input autoComplete="new-password" className="mt-2 w-full rounded-xl border border-black/8 px-4 py-3" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label></div><div className="mt-4 flex gap-2"><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => void action({ action: "wordpress-test", siteUrl, username, applicationPassword: password })} type="button">Test connection</button><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => void action({ action: "wordpress-save", siteUrl, username, applicationPassword: password }).then(() => setPassword(""))} type="button">Save connection</button></div></section>
    </div><p aria-live="polite" className="mt-4 text-sm text-[#77777f]">{notice}</p><div className="mt-6 space-y-3">{connections.map((connection) => <article className="rounded-[20px] border border-black/6 bg-white p-5" key={connection.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{connection.displayName}</p><p className="text-sm text-[#77777f]">{connection.platform} · {connection.status}{connection.lastVerifiedAt ? ` · verified ${connection.lastVerifiedAt}` : ""}</p></div><div className="flex gap-2"><button className="rounded-xl border px-3 py-2 text-sm" onClick={() => void action({ action: "verify", connectionId: connection.id })} type="button">Verify connection</button><button className="rounded-xl border px-3 py-2 text-sm" onClick={() => { if (connection.platform === "tistory") { const address = String(connection.publicMetadata.blogUrl ?? ""); setBlogAddress(address); void action({ action: "tistory-connect", blogAddress: address, connectionId: connection.id }); } else { setSiteUrl(String(connection.publicMetadata.siteUrl ?? "")); setUsername(String(connection.publicMetadata.username ?? "")); setNotice("Enter a new Application Password, then save the connection."); } }} type="button">Reconnect</button><button className="rounded-xl border px-3 py-2 text-sm" onClick={() => { if (window.confirm("Disconnect this account from Bright Studio? Local content will be preserved.")) void action({ action: "disconnect", connectionId: connection.id }); }} type="button">Disconnect</button></div></div></article>)}</div>
  </PageContainer>;
}

function PublishingTargetSelector({ data, onPersist, project, workspaceId }: { data: UserData; onPersist: (data: UserData) => Promise<void>; project: UserProject; workspaceId: string }) {
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]); const [notice, setNotice] = useState("");
  useEffect(() => { void fetch(`/api/connections?workspaceId=${encodeURIComponent(workspaceId)}`).then((response) => response.json()).then((result: { connections?: SafeConnection[] }) => setConnections(result.connections ?? [])); }, [workspaceId]);
  const selected = project.selectedPublishingAccountIds ?? [];
  const toggleTarget = async (connection: SafeConnection) => {
    const nextIds = selected.includes(connection.id) ? selected.filter((id) => id !== connection.id) : [...selected, connection.id];
    if (!selected.includes(connection.id)) {
      const response = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select-target", workspaceId, projectId: project.id, connectionId: connection.id }) });
      const result = await response.json() as { error?: string }; if (!response.ok) { setNotice(result.error ?? "Target selection failed."); return; }
    }
    await onPersist(updateProjectTargets(data, project.id, nextIds, nowLabel())); setNotice("Project publishing-account defaults updated. Credentials were not copied.");
  };
  return <section className="mt-6 rounded-[20px] border border-black/6 bg-white p-5"><h2 className="font-semibold">Selected Publishing Accounts</h2>{connections.length ? <div className="mt-3 space-y-2">{connections.map((connection) => <label className={`flex gap-3 rounded-xl border p-3 text-sm ${connection.status !== "connected" ? "opacity-60" : ""}`} key={connection.id}><input checked={selected.includes(connection.id)} disabled={connection.status !== "connected"} onChange={() => void toggleTarget(connection)} type="checkbox" /><span>{connection.platform}: {connection.displayName} · {connection.status}</span></label>)}</div> : <p className="mt-2 text-sm text-[#77777f]">No connected account. Content creation remains available.</p>}<p className="mt-2 text-sm">{notice}</p></section>;
}

function Field({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return <label className="block text-sm font-semibold">{label}<input className="mt-2 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-3 font-normal outline-none" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} /></label>;
}

function screenFromLocation(data: UserData): Screen {
  if (typeof window === "undefined") return { name: "home" };
  const query = new URLSearchParams(window.location.search);
  const name = query.get("view");
  const projectId = query.get("projectId") ?? "";
  const contentId = query.get("contentId") ?? "";
  const project = data.projects.find((item) => item.id === projectId && item.workspaceId === data.workspace?.id);
  if (!project) return { name: "home" };
  if (name === "create") {
    const content = contentId ? data.contents.find((item) => item.id === contentId && item.projectId === project.id && item.workspaceId === project.workspaceId) : undefined;
    if (content?.document) return { name: "editor", projectId, contentId: content.id };
    return contentId && !content ? { name: "project", projectId } : { name: "create", projectId, ...(content ? { contentId: content.id } : {}) };
  }
  if (name === "editor") {
    const content = data.contents.find((item) => item.id === contentId && item.projectId === project.id && item.workspaceId === project.workspaceId);
    if (content) return { name: "editor", projectId, contentId: content.id };
  }
  return { name: "project", projectId };
}

function syncLocation(screen: Screen, mode: "push" | "replace"): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("view");
  url.searchParams.delete("projectId");
  url.searchParams.delete("contentId");
  if (screen.name === "project" || screen.name === "create" || screen.name === "editor") {
    url.searchParams.set("view", screen.name);
    url.searchParams.set("projectId", screen.projectId);
    if ((screen.name === "create" || screen.name === "editor") && screen.contentId) url.searchParams.set("contentId", screen.contentId);
  }
  const target = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (target === current) return;
  if (mode === "push") window.history.pushState({ brightStudioScreen: screen.name }, "", target);
  else window.history.replaceState({ brightStudioScreen: screen.name }, "", target);
}

function planningStatusLabel(status: NonNullable<UserContent["planningWorkflow"]>["status"]): string {
  return ({
    requested: "요청 저장됨",
    planning: "분석 중",
    candidatesReady: "후보 준비 완료",
    opportunitySelected: "후보 선택됨",
    opportunityConfirmed: "기획 확정됨",
    generating: "원고 생성 중",
    generated: "생성 완료",
    failed: "오류 · 재시도 가능",
    cancelled: "취소됨",
  })[status];
}

function mergePersistedData(local: UserData, server: UserData): UserData {
  const localById = new Map(local.contents.map((content) => [content.id, content]));
  return {
    ...server,
    contents: server.contents.map((content) => {
      const localContent = localById.get(content.id);
      const localRevision = localContent?.planningWorkflow?.revision ?? -1;
      const serverRevision = content.planningWorkflow?.revision ?? -1;
      return localContent && localRevision > serverRevision ? localContent : content;
    }),
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowLabel(): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
}

function getErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "요청을 처리하지 못했습니다.";
}
