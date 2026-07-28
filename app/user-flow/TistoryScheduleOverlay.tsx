"use client";

import { useEffect, useMemo, useState } from "react";

type StudioSnapshot = Readonly<{
  workspace?: Readonly<{ id: string; name: string }>;
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
      tistory?: Readonly<{
        publishingAccountId: string;
        platformCategoryName: string | null;
      }>;
    }>;
  }>[]>;
}>;

type ScheduleConnection = Readonly<{
  id: string;
  platform: string;
  displayName: string;
  status: string;
  automationPermissions?: readonly string[];
  permissions?: readonly string[];
  publicMetadata?: Readonly<{ sessionStateAvailable?: boolean }>;
}>;

type Readiness = Readonly<{
  ready: boolean;
  executable: boolean;
  checks: readonly Readonly<{ key: string; passed: boolean; message: string }>[]>;
}>;

type Context = Readonly<{
  projectId: string;
  contentId: string;
}>;

export function TistoryScheduleOverlay() {
  const [locationKey, setLocationKey] = useState("");
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<StudioSnapshot>();
  const [connections, setConnections] = useState<readonly ScheduleConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState(defaultScheduleLocal);
  const [readiness, setReadiness] = useState<Readiness>();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");

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
  const project = context ? snapshot?.projects.find((item) => item.id === context.projectId && (!workspaceId || item.workspaceId === workspaceId)) : undefined;
  const content = context ? snapshot?.contents.find((item) => item.id === context.contentId && item.projectId === context.projectId) : undefined;
  const availableConnections = useMemo(() => connections.filter((item) => item.platform === "tistory"), [connections]);
  const selectedConnection = availableConnections.find((item) => item.id === connectionId);
  const scheduledAt = scheduledLocal ? `${scheduledLocal}:00+09:00` : "";

  useEffect(() => {
    if (!open || !context) return;
    let active = true;
    setLoading(true);
    setReadiness(undefined);
    setNotice("예약 발행 정보를 불러오고 있습니다.");
    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { data?: StudioSnapshot; error?: string };
        if (!response.ok || !result.data?.workspace) throw new Error(result.error ?? "작업 공간을 불러오지 못했습니다.");
        const currentProject = result.data.projects.find((item) => item.id === context.projectId && item.workspaceId === result.data!.workspace!.id);
        const currentContent = result.data.contents.find((item) => item.id === context.contentId && item.projectId === context.projectId);
        if (!currentProject || !currentContent) throw new Error("현재 편집 중인 Project 또는 Content를 찾지 못했습니다.");
        const connectionResponse = await fetch(`/api/connections?workspaceId=${encodeURIComponent(result.data.workspace.id)}`, { cache: "no-store" });
        const connectionResult = await connectionResponse.json() as { connections?: ScheduleConnection[]; error?: string };
        if (!connectionResponse.ok) throw new Error(connectionResult.error ?? "Tistory 연결 정보를 불러오지 못했습니다.");
        if (!active) return;
        const values = connectionResult.connections ?? [];
        setSnapshot(result.data);
        setConnections(values);
        const preferred = currentContent.publishingAccountId
          ?? currentProject.strategy?.defaultPublishingAccountId
          ?? (currentContent.selectedPublishingAccountIds?.length === 1 ? currentContent.selectedPublishingAccountIds[0] : undefined)
          ?? values.find((item) => item.platform === "tistory")?.id
          ?? "";
        setConnectionId(preferred);
        setNotice("");
      })
      .catch((error) => { if (active) setNotice(message(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [context, open]);

  useEffect(() => {
    if (!open || !context || !workspaceId || !connectionId || !scheduledAt) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch("/api/publishing/schedules/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          projectId: context.projectId,
          contentId: context.contentId,
          connectionId,
          scheduledAt,
          timezone: "Asia/Seoul",
          finalConfirmation: false,
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = await response.json() as { readiness?: Readiness; error?: string };
          if (!response.ok || !result.readiness) throw new Error(result.error ?? "예약 발행 준비 상태를 확인하지 못했습니다.");
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
  }, [connectionId, context, open, scheduledAt, workspaceId]);

  if (!context) return null;

  const submit = async () => {
    if (!readiness?.ready || !confirm || !connectionId || !scheduledAt || !workspaceId) return;
    setLoading(true);
    setNotice("Tistory에 예약 발행을 등록하고 외부 상태를 확인하고 있습니다.");
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
          finalConfirmation: true,
        }),
      });
      const result = await response.json() as {
        error?: string;
        readiness?: Readiness;
        result?: Readonly<{ status?: string; error?: string }>;
        schedule?: Readonly<{ status?: string }>;
      };
      if (result.readiness) setReadiness(result.readiness);
      if (!response.ok) throw new Error(result.error ?? result.result?.error ?? "예약 발행 등록에 실패했습니다.");
      const status = result.schedule?.status ?? result.result?.status;
      setNotice(status === "scheduled_verified"
        ? "Tistory 예약 발행 등록과 외부 상태 확인이 완료되었습니다."
        : status === "existing"
          ? "동일한 활성 예약이 이미 등록되어 있습니다."
          : "예약 등록 클릭은 완료됐지만 Tistory 외부 상태를 다시 확인해야 합니다. 자동 재시도하지 않습니다.");
      setConfirm(false);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setLoading(false);
    }
  };

  return <>
    <button
      className="fixed bottom-6 right-6 z-[70] rounded-2xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_38px_rgba(255,107,107,0.35)] disabled:opacity-50"
      onClick={() => { setOpen(true); setConfirm(false); setNotice(""); }}
      type="button"
    >
      예약발행
    </button>

    {open ? <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 p-4 sm:items-center" role="presentation">
      <section aria-labelledby="tistory-schedule-title" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white p-6 shadow-2xl sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">Tistory Native Schedule</p>
            <h2 className="mt-2 text-2xl font-semibold" id="tistory-schedule-title">예약 발행</h2>
            <p className="mt-2 text-sm leading-6 text-[#66666f]">Bright Studio가 로컬에서 기다리지 않고 Tistory 자체 예약 기능에 현재 Revision을 등록합니다.</p>
          </div>
          <button aria-label="닫기" className="rounded-xl border px-3 py-2 text-sm" disabled={loading} onClick={() => setOpen(false)} type="button">닫기</button>
        </div>

        <dl className="mt-5 grid gap-3 rounded-2xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2">
          <Info label="Project" value={project?.name ?? context.projectId} />
          <Info label="Content" value={content?.title ?? context.contentId} />
          <Info label="품질 점수" value={content?.quality?.overallScore !== undefined ? String(content.quality.overallScore) : "검토 필요"} />
          <Info label="카테고리" value={content?.publishingPreparation?.tistory?.platformCategoryName ?? "카테고리 없음 또는 선택 필요"} />
        </dl>

        <label className="mt-5 block text-sm font-semibold">Tistory 계정
          <select className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={loading} onChange={(event) => { setConnectionId(event.target.value); setConfirm(false); }} value={connectionId}>
            <option value="">계정을 선택해 주세요</option>
            {availableConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.displayName} · {connection.status}</option>)}
          </select>
        </label>

        <label className="mt-4 block text-sm font-semibold">예약 날짜와 시간
          <input className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={loading} min={minimumScheduleLocal()} onChange={(event) => { setScheduledLocal(event.target.value); setConfirm(false); }} type="datetime-local" value={scheduledLocal} />
          <span className="mt-2 block text-xs font-normal text-[#77777f]">Asia/Seoul 기준 · {scheduledAt || "시간을 선택해 주세요"}</span>
        </label>

        {selectedConnection && !schedulePermission(selectedConnection) ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">설정 → 예약 권한에서 이 계정의 예약 등록을 허용해 주세요.</p> : null}

        <div className="mt-5">
          <h3 className="font-semibold">등록 준비 상태</h3>
          {readiness?.checks.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <article className={`rounded-xl border p-3 text-sm ${check.passed ? "bg-emerald-50/60" : "bg-amber-50"}`} key={check.key}><div className="flex items-center justify-between gap-3"><strong>{readinessLabel(check.key)}</strong><span className={check.passed ? "text-emerald-700" : "text-amber-800"}>{check.passed ? "통과" : "확인 필요"}</span></div><p className="mt-1 leading-5 text-[#66666f]">{check.message}</p></article>)}</div> : <p className="mt-3 rounded-xl bg-[#f8f8fa] p-3 text-sm text-[#77777f]">{loading ? "준비 상태를 확인하고 있습니다." : "계정과 예약 시간을 선택해 주세요."}</p>}
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6">
          <input checked={confirm} className="mt-1" disabled={!readiness?.ready || loading} onChange={(event) => setConfirm(event.target.checked)} type="checkbox" />
          <span>현재 제목, 본문, 카테고리, 계정, 예약 시각을 확인했습니다. Tistory 예약 등록 버튼을 실행하는 데 동의합니다.</span>
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!readiness?.ready || !confirm || loading} onClick={() => void submit()} type="button">{loading ? "예약 등록 중…" : "확인하고 예약발행"}</button>
          <button className="rounded-xl border px-5 py-3 text-sm font-semibold" disabled={loading} onClick={() => setOpen(false)} type="button">취소</button>
        </div>

        {notice ? <p aria-live="polite" className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">{notice}</p> : null}
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

function readinessLabel(key: string): string {
  return ({
    enabled_tistory: "Tistory 활성화",
    publishing_account: "발행 계정",
    category: "카테고리",
    quality: "원고 품질",
    media_upload_permission: "이미지",
    draft_only: "Draft Only",
    review_first: "Review First",
    schedule_permission: "예약 권한",
    schedule_timezone_policy: "시간대",
    schedule_time: "예약 시각",
    active_schedule: "중복 예약",
    approval_readiness: "승인 준비",
    final_confirmation: "최종 확인",
  } as Record<string, string>)[key] ?? key;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-semibold text-[#77777f]">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "예약 발행 요청을 처리하지 못했습니다.";
}
