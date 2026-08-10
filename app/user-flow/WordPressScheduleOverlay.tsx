"use client";

import { useEffect, useMemo, useState } from "react";

type StudioSnapshot = Readonly<{
  workspace?: Readonly<{
    id: string;
    name: string;
    settings?: Readonly<{ publishing?: Readonly<{ wordpressSchedulePublicPublish?: boolean }> }>;
  }>;
  projects: readonly Readonly<{
    id: string;
    workspaceId: string;
    name: string;
    selectedPublishingAccountIds?: readonly string[];
    strategy?: Readonly<{ defaultPublishingAccountId?: string }>;
  }>[];
  contents: readonly Readonly<{
    id: string;
    projectId: string;
    workspaceId?: string;
    title: string;
    publishingAccountId?: string;
    selectedPublishingAccountIds?: readonly string[];
    quality?: Readonly<{ overallScore?: number; approved?: boolean }>;
    publishingPreparation?: Readonly<{
      wordpress?: Readonly<{
        publishingAccountId: string;
        categoryNames: readonly string[];
      }>;
    }>;
  }>[];
}>;

type ScheduleConnection = Readonly<{
  id: string;
  platform: string;
  displayName: string;
  status: string;
  automationPermissions?: readonly string[];
  permissions?: readonly string[];
}>;

type Readiness = Readonly<{
  ready: boolean;
  executable: boolean;
  checks: readonly Readonly<{ key: string; passed: boolean; message: string }>[];
}>;

type Context = Readonly<{ projectId: string; contentId: string }>;

type PostStatus = "draft" | "future";

type ScheduleOutcome = "scheduled_verified" | "existing" | "scheduled_unverified" | "failed";

/**
 * WordPress scheduling registers through the official REST API, so this collects
 * the schedule time and post state and delegates to the shared schedule route.
 * `future` is only offered when the Workspace allows scheduled public release.
 */
export function WordPressScheduleOverlay({ stacked = false }: Readonly<{ stacked?: boolean }>) {
  const [locationKey, setLocationKey] = useState("");
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<StudioSnapshot>();
  const [connections, setConnections] = useState<readonly ScheduleConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState(defaultScheduleLocal);
  const [postStatus, setPostStatus] = useState<PostStatus>("draft");
  const [readiness, setReadiness] = useState<Readiness>();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<ScheduleOutcome>();

  useEffect(() => {
    let previous = "";
    const sync = () => {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== previous) {
        previous = current;
        setLocationKey(current);
      }
    };
    sync();
    const timer = window.setInterval(sync, 250);
    window.addEventListener("popstate", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const context = useMemo(() => editorContext(locationKey), [locationKey]);
  const workspaceId = snapshot?.workspace?.id ?? "";
  const publicScheduleAllowed = snapshot?.workspace?.settings?.publishing?.wordpressSchedulePublicPublish === true;
  const project = context ? snapshot?.projects.find((item) => item.id === context.projectId && (!workspaceId || item.workspaceId === workspaceId)) : undefined;
  const content = context ? snapshot?.contents.find((item) => item.id === context.contentId && item.projectId === context.projectId) : undefined;
  const availableConnections = useMemo(() => connections.filter((item) => item.platform === "wordpress"), [connections]);
  const selectedConnection = availableConnections.find((item) => item.id === connectionId);
  const scheduledAt = scheduledLocal ? `${scheduledLocal}:00+09:00` : "";
  const outcomePresentation = outcome ? scheduleOutcomePresentation(outcome) : undefined;
  const effectivePostStatus: PostStatus = publicScheduleAllowed ? postStatus : "draft";

  useEffect(() => {
    if (!open || !context) return;
    let active = true;
    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { data?: StudioSnapshot; error?: string };
        if (!response.ok || !result.data?.workspace) throw new Error(result.error ?? "작업 공간을 불러오지 못했습니다.");
        const currentProject = result.data.projects.find((item) => item.id === context.projectId && item.workspaceId === result.data!.workspace!.id);
        const currentContent = result.data.contents.find((item) => item.id === context.contentId && item.projectId === context.projectId);
        if (!currentProject || !currentContent) throw new Error("현재 편집 중인 Project 또는 Content를 찾지 못했습니다.");
        const connectionResponse = await fetch(`/api/connections?workspaceId=${encodeURIComponent(result.data.workspace.id)}`, { cache: "no-store" });
        const connectionResult = await connectionResponse.json() as { connections?: ScheduleConnection[]; error?: string };
        if (!connectionResponse.ok) throw new Error(connectionResult.error ?? "워드프레스 연결 정보를 불러오지 못했습니다.");
        if (!active) return;
        const values = connectionResult.connections ?? [];
        setSnapshot(result.data);
        setConnections(values);
        setConnectionId(currentContent.publishingPreparation?.wordpress?.publishingAccountId
          ?? currentContent.publishingAccountId
          ?? currentProject.strategy?.defaultPublishingAccountId
          ?? values.find((item) => item.platform === "wordpress")?.id
          ?? "");
        setNotice("");
      })
      .catch((error) => { if (active) setNotice(message(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [context, open]);

  useEffect(() => {
    if (!open || outcome || !context || !workspaceId || !connectionId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({
        workspaceId,
        projectId: context.projectId,
        contentId: context.contentId,
        connectionId,
        finalConfirmation: "false",
      });
      void fetch(`/api/publishing/wordpress?${query.toString()}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as { readiness?: Readiness; readinessError?: string; error?: string };
          if (!response.ok || !result.readiness) throw new Error(result.error ?? result.readinessError ?? "예약 발행 준비 상태를 확인하지 못했습니다.");
          setReadiness(result.readiness);
          setNotice("");
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setReadiness(undefined);
            setNotice(message(error));
          }
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [connectionId, context, open, outcome, workspaceId]);

  if (!context) return null;

  const submit = async () => {
    if (!readiness?.ready || !confirm || !connectionId || !scheduledAt || !workspaceId) return;
    setLoading(true);
    setNotice("워드프레스에 예약을 등록하고 외부 상태를 확인하고 있습니다.");
    try {
      const response = await fetch("/api/publishing/schedules/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          projectId: context.projectId,
          contentId: context.contentId,
          connectionId,
          scheduledAt,
          timezone: "Asia/Seoul",
          postStatus: effectivePostStatus,
          finalConfirmation: true,
        }),
      });
      const result = await response.json() as {
        error?: string;
        result?: Readonly<{ status?: string; error?: string }>;
        schedule?: Readonly<{ status?: string }>;
      };
      if (!response.ok) throw new Error(result.error ?? result.result?.error ?? "예약 등록에 실패했습니다.");
      const nextOutcome = scheduleOutcome(result.schedule?.status ?? result.result?.status);
      setOutcome(nextOutcome);
      setNotice(scheduleOutcomePresentation(nextOutcome).description);
      setConfirm(false);
    } catch (error) {
      setOutcome(undefined);
      setNotice(message(error));
    } finally {
      setLoading(false);
    }
  };

  return <>
    <button
      className={`fixed ${stacked ? "bottom-24" : "bottom-6"} right-6 z-[70] rounded-2xl border border-[#ff6b6b] bg-white px-5 py-3 text-sm font-semibold text-[#d94848] shadow-[0_14px_38px_rgba(255,107,107,0.22)] disabled:opacity-50`}
      onClick={() => {
        setLoading(true);
        setReadiness(undefined);
        setNotice("예약 정보를 불러오고 있습니다.");
        setOutcome(undefined);
        setOpen(true);
        setConfirm(false);
      }}
      type="button"
    >
      워드프레스 예약
    </button>

    {open ? <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-4 sm:items-center" role="presentation">
      <section aria-labelledby="wordpress-schedule-title" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white p-6 shadow-2xl sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">WordPress REST Schedule</p>
            <h2 className="mt-2 text-2xl font-semibold" id="wordpress-schedule-title">{outcome ? "예약 처리 결과" : "워드프레스 예약"}</h2>
            <p className="mt-2 text-sm leading-6 text-[#66666f]">{outcome ? "워드프레스 예약 등록 결과를 확인해 주세요." : "워드프레스 공식 REST API로 현재 Revision의 예약을 등록합니다. 브라우저 자동화를 사용하지 않습니다."}</p>
          </div>
          <button aria-label="닫기" className="rounded-xl border px-3 py-2 text-sm" disabled={loading} onClick={() => setOpen(false)} type="button">닫기</button>
        </div>

        {outcome && outcomePresentation ? <div className="mt-6">
          <div aria-live="polite" className={`rounded-2xl border p-5 ${outcomePresentation.panelClassName}`}>
            <p className={`text-sm font-semibold ${outcomePresentation.accentClassName}`}>{outcomePresentation.eyebrow}</p>
            <h3 className="mt-2 text-xl font-semibold">{outcomePresentation.title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#55555f]">{outcomePresentation.description}</p>
          </div>

          <dl className="mt-5 grid gap-3 rounded-2xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2">
            <Info label="제목" value={content?.title ?? context.contentId} />
            <Info label="워드프레스 계정" value={selectedConnection?.displayName ?? connectionId} />
            <Info label="카테고리" value={content?.publishingPreparation?.wordpress?.categoryNames.join(", ") || "카테고리 선택 필요"} />
            <Info label="예약 시각" value={`${formatScheduleLocal(scheduledLocal)} · Asia/Seoul`} />
            <Info label="발행 상태" value={postStatusLabel(effectivePostStatus)} />
          </dl>

          <div className="mt-6">
            <button className="w-full rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" onClick={() => setOpen(false)} type="button">{outcomePresentation.actionLabel}</button>
          </div>
        </div> : <>
          <dl className="mt-5 grid gap-3 rounded-2xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2">
            <Info label="Project" value={project?.name ?? context.projectId} />
            <Info label="Content" value={content?.title ?? context.contentId} />
            <Info label="품질 점수" value={content?.quality?.overallScore !== undefined ? String(content.quality.overallScore) : "검토 필요"} />
            <Info label="카테고리" value={content?.publishingPreparation?.wordpress?.categoryNames.join(", ") || "카테고리 선택 필요"} />
          </dl>

          <label className="mt-5 block text-sm font-semibold">워드프레스 계정
            <select className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={loading} onChange={(event) => { setConnectionId(event.target.value); setConfirm(false); }} value={connectionId}>
              <option value="">계정을 선택해 주세요</option>
              {availableConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName} · {connection.status}</option>)}
            </select>
          </label>

          <label className="mt-4 block text-sm font-semibold">예약 날짜와 시간
            <input className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={loading} min={minimumScheduleLocal()} onChange={(event) => { setScheduledLocal(event.target.value); setConfirm(false); }} type="datetime-local" value={scheduledLocal} />
            <span className="mt-2 block text-xs font-normal text-[#77777f]">Asia/Seoul 기준 · {scheduledAt || "시간을 선택해 주세요"}</span>
          </label>

          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">예약 발행 상태</legend>
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-3 rounded-xl border p-4 text-sm">
                <input checked={effectivePostStatus === "draft"} className="mt-1" disabled={loading} name="wordpress-post-status" onChange={() => { setPostStatus("draft"); setConfirm(false); }} type="radio" />
                <span><strong>초안 예약</strong><span className="mt-1 block text-xs leading-5 text-[#77777f]">글을 초안으로 유지하고 예약 시각만 기록합니다. 실제 공개는 직접 승인해야 합니다.</span></span>
              </label>
              <label className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${publicScheduleAllowed ? "" : "opacity-60"}`}>
                <input checked={effectivePostStatus === "future"} className="mt-1" disabled={loading || !publicScheduleAllowed} name="wordpress-post-status" onChange={() => { setPostStatus("future"); setConfirm(false); }} type="radio" />
                <span><strong>공개 예약</strong><span className="mt-1 block text-xs leading-5 text-[#77777f]">{publicScheduleAllowed ? "지정한 시각에 글이 자동으로 공개됩니다." : "설정 → 발행에서 ‘WordPress 예약 공개 발행 허용’을 켜야 사용할 수 있습니다."}</span></span>
              </label>
            </div>
          </fieldset>

          {selectedConnection && !schedulePermission(selectedConnection) ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">설정 → 예약 권한에서 이 계정의 예약 등록을 허용해 주세요.</p> : null}

          <div className="mt-5">
            <h3 className="font-semibold">등록 준비 상태</h3>
            {readiness?.checks.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <article className={`rounded-xl border p-3 text-sm ${check.passed ? "bg-emerald-50/60" : "bg-amber-50"}`} key={check.key}><div className="flex items-center justify-between gap-3"><strong>{readinessLabel(check.key)}</strong><span className={check.passed ? "text-emerald-700" : "text-amber-800"}>{check.passed ? "통과" : "확인 필요"}</span></div><p className="mt-1 leading-5 text-[#66666f]">{check.message}</p></article>)}</div> : <p className="mt-3 rounded-xl bg-[#f8f8fa] p-3 text-sm text-[#77777f]">{loading ? "준비 상태를 확인하고 있습니다." : "계정을 선택해 주세요."}</p>}
          </div>

          <label className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6">
            <input checked={confirm} className="mt-1" disabled={!readiness?.ready || loading} onChange={(event) => setConfirm(event.target.checked)} type="checkbox" />
            <span>현재 제목, 본문, 카테고리, 계정, 예약 시각과 발행 상태를 확인했습니다. 워드프레스 예약 등록을 실행하는 데 동의합니다.</span>
          </label>

          <div className="mt-5 flex flex-wrap gap-2">
            <button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!readiness?.ready || !confirm || loading} onClick={() => void submit()} type="button">{loading ? "예약 등록 중…" : "확인하고 예약 등록"}</button>
            <button className="rounded-xl border px-5 py-3 text-sm font-semibold" disabled={loading} onClick={() => setOpen(false)} type="button">취소</button>
          </div>

          {notice ? <p aria-live="polite" className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">{notice}</p> : null}
        </>}
      </section>
    </div> : null}
  </>;
}

function editorContext(locationKey: string): Context | undefined {
  if (!locationKey || typeof window === "undefined") return undefined;
  const query = new URLSearchParams(window.location.search);
  if (query.get("view") !== "editor") return undefined;
  const projectId = query.get("projectId")?.trim();
  const contentId = query.get("contentId")?.trim();
  if (!projectId || !contentId) return undefined;
  return { projectId, contentId };
}

function schedulePermission(connection: ScheduleConnection): boolean {
  return [...(connection.automationPermissions ?? []), ...(connection.permissions ?? [])].includes("schedule.create");
}

function defaultScheduleLocal(): string {
  const future = new Date(Date.now() + 90 * 60 * 1000);
  future.setMinutes(Math.ceil(future.getMinutes() / 10) * 10, 0, 0);
  return kstWallValue(future);
}

function minimumScheduleLocal(): string {
  return kstWallValue(new Date(Date.now() + 10 * 60 * 1000));
}

function kstWallValue(value: Date): string {
  return new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function formatScheduleLocal(value: string): string {
  return value ? value.replace("T", " ") : "예약 시각 확인 필요";
}

function postStatusLabel(status: PostStatus): string {
  return status === "future" ? "공개 예약" : "초안 예약";
}

function scheduleOutcome(status?: string): ScheduleOutcome {
  if (status === "scheduled_verified" || status === "existing" || status === "failed") return status;
  return "scheduled_unverified";
}

function scheduleOutcomePresentation(outcome: ScheduleOutcome) {
  if (outcome === "scheduled_verified") {
    return {
      eyebrow: "예약 등록 완료",
      title: "워드프레스 예약이 등록되었습니다.",
      description: "예약 등록과 외부 상태 재조회 검증이 모두 완료되었습니다.",
      actionLabel: "완료",
      panelClassName: "border-emerald-200 bg-emerald-50",
      accentClassName: "text-emerald-700",
    } as const;
  }
  if (outcome === "existing") {
    return {
      eyebrow: "기존 예약 확인",
      title: "동일한 활성 예약이 이미 등록되어 있습니다.",
      description: "새 예약을 다시 실행하지 않았습니다. 기존 워드프레스 예약 상태를 확인해 주세요.",
      actionLabel: "닫기",
      panelClassName: "border-sky-200 bg-sky-50",
      accentClassName: "text-sky-700",
    } as const;
  }
  if (outcome === "failed") {
    return {
      eyebrow: "예약 실패",
      title: "워드프레스 예약을 등록하지 못했습니다.",
      description: "예약이 등록되지 않았습니다. 준비 상태와 계정 권한을 확인한 뒤 다시 시도해 주세요.",
      actionLabel: "닫기",
      panelClassName: "border-red-200 bg-red-50",
      accentClassName: "text-red-700",
    } as const;
  }
  return {
    eyebrow: "외부 확인 필요",
    title: "워드프레스 예약 상태를 직접 확인해 주세요.",
    description: "글이 생성되었을 수 있지만 외부 상태를 확인하지 못했습니다. 중복 생성을 막기 위해 자동 재시도하지 않습니다.",
    actionLabel: "닫기",
    panelClassName: "border-amber-200 bg-amber-50",
    accentClassName: "text-amber-800",
  } as const;
}

function readinessLabel(key: string): string {
  return ({
    enabled_wordpress: "WordPress 활성화",
    publishing_account: "발행 계정",
    category: "카테고리",
    category_selection: "카테고리 선택",
    quality: "원고 품질",
    media_upload_permission: "이미지",
    draft_only: "Draft Only",
    review_first: "Review First",
    schedule_permission: "예약 권한",
    approval_readiness: "승인 준비",
    final_confirmation: "최종 확인",
  } as Record<string, string>)[key] ?? key;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-semibold text-[#77777f]">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "예약 요청을 처리하지 못했습니다.";
}
