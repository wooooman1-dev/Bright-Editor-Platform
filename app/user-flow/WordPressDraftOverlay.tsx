"use client";

import { useEffect, useMemo, useState } from "react";

import type { PublishingExecutionRecord } from "../../core/publishing";
import { contentRevisionId } from "../../core/quality";
import type { WordPressDraftReadiness } from "../application/publishing/WordPressDraftReadiness";
import type { UserData } from "./user-data";
import {
  wordpressDraftOutcomePresentation,
} from "./wordpress-draft-ui";
import {
  canExecuteWordPressDraft,
  reduceWordPressDraftOverlayState,
  resetWordPressDraftOverlayState,
  wordpressDraftExecutionIdentityKey,
  type WordPressDraftExecutionIdentity,
} from "./wordpress-draft-overlay-state";

type SafeConnection = Readonly<{
  id: string;
  platform: string;
  displayName: string;
  status: string;
  automationPermissions?: readonly string[];
  permissions?: readonly string[];
  publicMetadata?: Readonly<Record<string, unknown>>;
}>;

type EditorContext = Readonly<{ projectId: string; contentId: string }>;

export function WordPressDraftOverlay() {
  const [locationKey, setLocationKey] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<UserData>();
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotRefresh, setSnapshotRefresh] = useState(0);
  const [shellNotice, setShellNotice] = useState("");
  const [executionState, setExecutionState] = useState(() => resetWordPressDraftOverlayState(undefined));

  useEffect(() => {
    let previous = "";
    const sync = () => {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== previous) {
        previous = current;
        setSnapshotLoading(true);
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
  const content = context ? data?.contents.find((item) => item.id === context.contentId && item.projectId === context.projectId) : undefined;
  const wordpressConnections = useMemo(() => connections.filter((item) => item.platform === "wordpress"), [connections]);
  const connection = wordpressConnections.find((item) => item.id === connectionId);
  const identity: WordPressDraftExecutionIdentity | undefined = useMemo(() => (
    data?.workspace && context && content?.document && connection
      ? Object.freeze({
        workspaceId: data.workspace.id,
        projectId: context.projectId,
        contentId: context.contentId,
        contentRevisionId: contentRevisionId(content.document),
        connectionId: connection.id,
      })
      : undefined
  ), [connection, content?.document, context, data?.workspace]);
  const identityKey = wordpressDraftExecutionIdentityKey(identity);
  const currentExecutionState = executionState.identityKey === identityKey
    ? executionState
    : resetWordPressDraftOverlayState(identity, executionState.requestId);
  if (executionState.identityKey !== identityKey) setExecutionState(currentExecutionState);
  const readiness = currentExecutionState.readiness;
  const record = currentExecutionState.record;
  const finalConfirmation = currentExecutionState.finalConfirmation;
  const loading = snapshotLoading || currentExecutionState.loading;
  const notice = currentExecutionState.notice || shellNotice;
  const preparation = content?.publishingPreparation?.wordpress;
  const outcome = record ? wordpressDraftOutcomePresentation(record) : undefined;
  const localImageCount = content?.document?.blocks.filter((block) => block.type === "image" && /^\/api\/media\//i.test(block.source)).length ?? 0;
  const mediaAllowed = localImageCount === 0 || hasPermission(connection, "media.upload");
  const executable = canExecuteWordPressDraft(currentExecutionState) && !snapshotLoading;

  useEffect(() => {
    if (!context) return;
    let active = true;
    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => {
        const studio = await response.json() as { data?: UserData; error?: string };
        if (!response.ok || !studio.data?.workspace) throw new Error(studio.error ?? "Bright Studio 상태를 불러오지 못했습니다.");
        const connectionsResponse = await fetch(`/api/connections?workspaceId=${encodeURIComponent(studio.data.workspace.id)}`, { cache: "no-store" });
        const connectionResult = await connectionsResponse.json() as { connections?: SafeConnection[]; error?: string };
        if (!connectionsResponse.ok) throw new Error(connectionResult.error ?? "WordPress 연결을 불러오지 못했습니다.");
        if (!active) return;
        const currentContent = studio.data.contents.find((item) => item.id === context.contentId && item.projectId === context.projectId);
        const currentProject = studio.data.projects.find((item) => item.id === context.projectId && item.workspaceId === studio.data!.workspace!.id);
        const values = connectionResult.connections ?? [];
        const wordpress = values.filter((item) => item.platform === "wordpress");
        const preferred = currentContent?.publishingPreparation?.wordpress?.publishingAccountId
          ?? wordpress.find((item) => currentContent?.publishingAccountId === item.id)?.id
          ?? wordpress.find((item) => currentContent?.selectedPublishingAccountIds?.includes(item.id))?.id
          ?? wordpress.find((item) => currentProject?.selectedPublishingAccountIds?.includes(item.id))?.id
          ?? "";
        setData(studio.data);
        setConnections(values);
        setConnectionId(preferred);
        setShellNotice("");
      })
      .catch((error) => { if (active) setShellNotice(message(error)); })
      .finally(() => { if (active) setSnapshotLoading(false); });
    return () => { active = false; };
  }, [context, snapshotRefresh]);

  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController();
    let active = true;
    const requestId = currentExecutionState.requestId;
    void loadWordPressDraftState(identity, controller.signal)
      .then((result) => {
        if (!active) return;
        setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
          type: "readiness_resolved",
          identityKey,
          requestId,
          readiness: result.readiness,
          record: result.record,
          readinessError: result.readinessError,
        }));
      })
      .catch((error) => {
        if (!active || error instanceof DOMException && error.name === "AbortError") return;
        setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
          type: "readiness_failed",
          identityKey,
          requestId,
          error: message(error),
        }));
      })
    return () => {
      active = false;
      controller.abort();
    };
  }, [currentExecutionState.requestId, identity, identityKey]);

  if (!context || !connection || !identity) return null;

  const submit = async () => {
    if (!executable) return;
    setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
      type: "execution_started",
      identityKey,
      notice: "WordPress에 비공개 Draft를 저장하고 외부 상태를 검증하고 있습니다.",
    }));
    try {
      const response = await fetch("/api/publishing/wordpress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_draft",
          workspaceId: identity.workspaceId,
          projectId: identity.projectId,
          contentId: identity.contentId,
          connectionId: identity.connectionId,
          finalConfirmation: true,
        }),
      });
      const result = await response.json() as {
        result?: Readonly<{ record?: PublishingExecutionRecord; readiness?: WordPressDraftReadiness; error?: string }>;
        error?: string;
      };
      if (!response.ok && !result.result?.record) throw new Error(result.error ?? result.result?.error ?? "WordPress 임시글 저장에 실패했습니다.");
      setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
        type: "execution_completed",
        identityKey,
        readiness: result.result?.readiness,
        record: result.result?.record,
        notice: result.result?.record?.safeMessage ?? "WordPress 실행 결과를 저장했습니다.",
      }));
    } catch (error) {
      setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
        type: "execution_failed",
        identityKey,
        error: message(error),
      }));
    }
  };

  return <>
    <button className="fixed bottom-6 left-6 z-[70] rounded-2xl bg-[#202024] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_38px_rgba(0,0,0,0.22)]" onClick={() => { setOpen(true); setSnapshotLoading(true); setSnapshotRefresh((value) => value + 1); }} type="button">
      WordPress 임시글
    </button>

    {open ? <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 p-4 sm:items-center" role="presentation">
      <section aria-labelledby="wordpress-draft-title" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white p-6 shadow-2xl sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">WordPress REST Draft</p><h2 className="mt-2 text-2xl font-semibold" id="wordpress-draft-title">{outcome ? "WordPress 실행 결과" : "WordPress 임시글 저장"}</h2></div>
          <button aria-label="닫기" className="rounded-xl border px-3 py-2 text-sm" disabled={loading} onClick={() => setOpen(false)} type="button">닫기</button>
        </div>

        {outcome ? <WordPressCompletionCard connection={connection} outcome={outcome} record={record!} /> : <>
          <dl className="mt-5 grid gap-3 rounded-2xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2">
            <Info label="연결 계정" value={`${connection.displayName} · ${connection.status}`} />
            <Info label="Category" value={readiness?.categorySelection.valid ? readiness.categorySelection.categoryNames.join(", ") : "유효한 Category 선택 필요"} />
            <Info label="Quality 승인" value={readiness?.checks.find((item) => item.key === "quality_revision")?.passed ? "현재 Revision 승인 완료" : "현재 Revision 승인 필요"} />
            <Info label="로컬 이미지" value={`${localImageCount}개`} />
            <Info label="media.upload" value={mediaAllowed ? localImageCount ? "명시적 허용" : "이미지 없음 · 불필요" : "권한 필요"} />
            <Info label="Featured Image" value={preparation?.featuredImageAssetId ? "선택됨" : "선택 안 함"} />
          </dl>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Draft Only입니다. 공개 발행, 예약 발행, 자동 재시도는 실행하지 않습니다.</p>

          <div className="mt-5"><h3 className="font-semibold">실행 준비 상태</h3>{readiness?.checks.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <article className={`rounded-xl border p-3 text-sm ${check.passed ? "bg-emerald-50/60" : check.key === "final_confirmation" ? "bg-sky-50" : "bg-amber-50"}`} key={check.key}><strong>{check.passed ? "통과" : check.key === "final_confirmation" ? "사용자 확인 단계" : "차단"}</strong><p className="mt-1 leading-5 text-[#66666f]">{check.message}</p></article>)}</div> : <p className="mt-3 rounded-xl bg-[#f8f8fa] p-3 text-sm">{loading ? "준비 상태를 확인하고 있습니다." : "준비 상태를 불러오지 못했습니다."}</p>}</div>

          <label className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6"><input checked={finalConfirmation} className="mt-1" disabled={!readiness?.ready || loading} onChange={(event) => setExecutionState((current) => reduceWordPressDraftOverlayState(current, { type: "confirm", identityKey, value: event.target.checked }))} type="checkbox" /><span>현재 Revision, 계정, Category, 이미지와 Featured Image를 확인했습니다. WordPress에 공개되지 않은 Draft를 저장하는 작업을 최종 확인합니다.</span></label>
          <button className="mt-5 w-full rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!executable} onClick={() => void submit()} type="button">{loading ? "WordPress 검증 중…" : "WordPress에 임시글 저장"}</button>
        </>}

        {notice ? <p aria-live="polite" className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">{notice}</p> : null}
      </section>
    </div> : null}
  </>;
}

function WordPressCompletionCard({ connection, outcome, record }: Readonly<{
  connection: SafeConnection;
  outcome: ReturnType<typeof wordpressDraftOutcomePresentation>;
  record: PublishingExecutionRecord;
}>) {
  const mediaIds = record.uploadedMedia.map((item) => item.externalMediaId);
  const toneClass = outcome.tone === "success" ? "border-emerald-200 bg-emerald-50" : outcome.tone === "info" ? "border-sky-200 bg-sky-50" : outcome.tone === "warning" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";
  return <div className="mt-6">
    <div aria-live="polite" className={`rounded-2xl border p-5 ${toneClass}`}><h3 className="text-xl font-semibold">{outcome.title}</h3><p className="mt-2 text-sm leading-6 text-[#55555f]">{outcome.description}</p></div>
    <dl className="mt-5 grid gap-3 rounded-2xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2">
      <Info label="외부 Post ID" value={record.externalPostId ?? "확인되지 않음"} />
      <Info label="검증" value={record.verified ? "외부 재조회 검증 완료" : record.status} />
      <Info label="Category" value={record.categoryNames.join(", ") || record.categoryIds.join(", ")} />
      <Info label="업로드 이미지" value={`${record.uploadedMedia.length}개`} />
      <Info label="Featured Image" value={record.featuredImageAssigned ? "지정 및 검증 대상" : "지정 안 함"} />
      <Info label="실행 단계" value={record.stage} />
    </dl>
    {record.cleanupRequired ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>cleanup_required</strong><p>Media ID: {mediaIds.join(", ") || "확인되지 않음"}</p><p>Media는 자동 삭제하지 않았습니다. WordPress Media Library에서 직접 확인하세요.</p></div> : null}
    {record.status === "unknown_result" ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">자동 재실행이 차단되었습니다. WordPress 관리자에서 기존 Draft 존재 여부를 먼저 확인하세요.</p> : null}
    <div className="mt-5 rounded-xl border p-4 text-sm leading-6"><strong>실제 검증 체크리스트</strong><ol className="mt-2 list-decimal space-y-1 pl-5"><li>WordPress 관리자에서 Post가 Draft인지 확인</li><li>Post ID, 제목, 본문과 Category 확인</li><li>공개 글이 생성되지 않았는지 확인</li><li>이미지가 있으면 ALT와 Featured Image 확인</li></ol><a className="mt-3 inline-block font-semibold text-[#ff6b6b] underline" href={wordpressAdminDraftsUrl(connection)} rel="noreferrer" target="_blank">WordPress 관리자에서 확인</a></div>
  </div>;
}

async function loadWordPressDraftState(
  input: WordPressDraftExecutionIdentity,
  signal: AbortSignal,
): Promise<Readonly<{ readiness?: WordPressDraftReadiness; record?: PublishingExecutionRecord; readinessError?: string }>> {
  const query = new URLSearchParams({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    contentId: input.contentId,
    connectionId: input.connectionId,
    finalConfirmation: "false",
  });
  const response = await fetch(`/api/publishing/wordpress?${query}`, { cache: "no-store", signal });
  const result = await response.json() as { readiness?: WordPressDraftReadiness | null; record?: PublishingExecutionRecord | null; readinessError?: string; error?: string };
  if (!response.ok || !result.readiness && !result.record) throw new Error(result.error ?? result.readinessError ?? "WordPress Draft 준비 상태를 확인하지 못했습니다.");
  return Object.freeze({
    ...(result.readiness ? { readiness: result.readiness } : {}),
    ...(result.record ? { record: result.record } : {}),
    ...(result.readinessError ? { readinessError: result.readinessError } : {}),
  });
}

function editorContext(locationKey: string): EditorContext | undefined {
  if (!locationKey || typeof window === "undefined") return undefined;
  const query = new URLSearchParams(window.location.search);
  if (query.get("view") !== "editor") return undefined;
  const projectId = query.get("projectId")?.trim();
  const contentId = query.get("contentId")?.trim();
  return projectId && contentId ? Object.freeze({ projectId, contentId }) : undefined;
}

function hasPermission(connection: SafeConnection | undefined, permission: string): boolean {
  return Boolean(connection && [...(connection.automationPermissions ?? []), ...(connection.permissions ?? [])].includes(permission));
}

function wordpressAdminDraftsUrl(connection: SafeConnection): string {
  const siteUrl = typeof connection.publicMetadata?.siteUrl === "string" ? connection.publicMetadata.siteUrl : "";
  try { return new URL("/wp-admin/edit.php?post_status=draft&post_type=post", siteUrl).toString(); }
  catch { return "#"; }
}

function Info({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div><dt className="font-semibold text-[#77777f]">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "WordPress Draft 요청을 처리하지 못했습니다.";
}
