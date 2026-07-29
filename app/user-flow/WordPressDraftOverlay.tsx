"use client";

import { useEffect, useMemo, useState } from "react";

import type { PublishingExecutionRecord } from "../../core/publishing";
import { contentRevisionId } from "../../core/quality";
import type { WordPressDraftReadiness } from "../application/publishing/WordPressDraftReadiness";
import type { UserContent, UserData, UserProject } from "./user-data";
import {
  wordpressDraftOutcomePresentation,
} from "./wordpress-draft-ui";
import {
  canSubmitWordPressDraft,
  isWordPressCategorySelectionApplied,
  reduceWordPressDraftOverlayState,
  reduceWordPressDraftModalView,
  resetWordPressDraftOverlayState,
  wordpressDraftExecutionIdentityKey,
  type WordPressDraftModalView,
  type WordPressDraftExecutionIdentity,
} from "./wordpress-draft-overlay-state";
import { requestWordPressDraftCreation } from "./wordpress-draft-request";

export type WordPressDraftConnection = Readonly<{
  id: string;
  platform: string;
  displayName: string;
  status: string;
  automationPermissions?: readonly string[];
  permissions?: readonly string[];
  publicMetadata?: Readonly<Record<string, unknown>>;
}>;

type WordPressCategory = Readonly<{
  externalCategoryId: string;
  name: string;
  slug: string;
  parentExternalCategoryId?: string;
}>;

type WordPressCategoryResponse = Readonly<{
  categories?: readonly WordPressCategory[];
  selection?: Readonly<{
    valid: boolean;
    categoryIds: readonly string[];
    categoryNames: readonly string[];
  }>;
  data?: UserData;
  error?: string;
}>;

export function WordPressDraftOverlay({ connections, content, data, onPersist, project }: Readonly<{
  connections: readonly WordPressDraftConnection[];
  content: UserContent;
  data: UserData;
  onPersist: (data: UserData) => Promise<void>;
  project: UserProject;
}>) {
  const [open, setOpen] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [categories, setCategories] = useState<readonly WordPressCategory[]>([]);
  const [categoryIds, setCategoryIds] = useState<readonly string[]>([]);
  const [appliedCategoryIds, setAppliedCategoryIds] = useState<readonly string[]>([]);
  const [categoryLoaded, setCategoryLoaded] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryNotice, setCategoryNotice] = useState("");
  const [executionState, setExecutionState] = useState(() => resetWordPressDraftOverlayState(undefined));
  const [modalView, setModalView] = useState<WordPressDraftModalView>("preparation");

  const workspaceId = data?.workspace?.id ?? "";
  const wordpressConnections = useMemo(() => connections.filter((item) => item.platform === "wordpress"), [connections]);
  const preferredConnectionId = useMemo(() => content.publishingPreparation?.wordpress?.publishingAccountId
    ?? wordpressConnections.find((item) => content.publishingAccountId === item.id)?.id
    ?? wordpressConnections.find((item) => content.selectedPublishingAccountIds?.includes(item.id))?.id
    ?? wordpressConnections.find((item) => project.selectedPublishingAccountIds?.includes(item.id))?.id
    ?? (wordpressConnections.length === 1 ? wordpressConnections[0]?.id : "")
    ?? "", [content.publishingAccountId, content.publishingPreparation?.wordpress?.publishingAccountId, content.selectedPublishingAccountIds, project.selectedPublishingAccountIds, wordpressConnections]);
  const connectionId = selectedConnectionId ?? preferredConnectionId;
  const connection = wordpressConnections.find((item) => item.id === connectionId);
  const revisionId = content.document ? contentRevisionId(content.document) : "";
  const identity: WordPressDraftExecutionIdentity | undefined = useMemo(() => (
    workspaceId && revisionId && connection
      ? Object.freeze({
        workspaceId,
        projectId: project.id,
        contentId: content.id,
        contentRevisionId: revisionId,
        connectionId: connection.id,
      })
      : undefined
  ), [connection, content.id, project.id, revisionId, workspaceId]);
  const identityKey = wordpressDraftExecutionIdentityKey(identity);
  const currentExecutionState = executionState.identityKey === identityKey
    ? executionState
    : resetWordPressDraftOverlayState(identity, executionState.requestId);
  const readiness = currentExecutionState.readiness;
  const record = currentExecutionState.record;
  const finalConfirmation = currentExecutionState.finalConfirmation;
  const categorySelectionApplied = isWordPressCategorySelectionApplied(categoryIds, appliedCategoryIds);
  const readinessMatchesAppliedCategory = Boolean(readiness?.categorySelection.valid
    && isWordPressCategorySelectionApplied(readiness.categorySelection.categoryIds, appliedCategoryIds));
  const executionLoading = identity && categorySelectionApplied ? currentExecutionState.loading : false;
  const loading = executionLoading || categoryLoading || categorySaving;
  const notice = currentExecutionState.notice || categoryNotice
    || (!wordpressConnections.length ? "Settings에서 WordPress Connection을 먼저 연결해 주세요." : "");
  const preparation = content?.publishingPreparation?.wordpress;
  const outcome = record ? wordpressDraftOutcomePresentation(record) : undefined;
  const localImageCount = content?.document?.blocks.filter((block) => block.type === "image" && /^\/api\/media\//i.test(block.source)).length ?? 0;
  const mediaAllowed = localImageCount === 0 || hasPermission(connection, "media.upload");
  const submissionGuard = {
    identity,
    executionState: currentExecutionState,
    categorySelectionApplied,
    readinessMatchesAppliedCategory,
    categoryLoading,
    categorySaving,
  } as const;
  const executable = canSubmitWordPressDraft(submissionGuard);
  const selectedCategoryId = categoryIds[0] ?? "";
  const showOutcome = modalView !== "preparation" && Boolean(outcome && connection);

  useEffect(() => {
    if (!open || !workspaceId || !connectionId) return;
    const controller = new AbortController();
    let active = true;
    setCategoryLoading(true);
    setCategoryLoaded(false);
    setCategoryNotice("");
    void loadWordPressCategories({
      workspaceId,
      projectId: project.id,
      contentId: content.id,
      connectionId,
    }, controller.signal)
      .then((result) => {
        if (!active) return;
        setCategories(result.categories ?? []);
        const restoredCategoryIds = result.selection?.categoryIds ?? [];
        setCategoryIds(restoredCategoryIds);
        setAppliedCategoryIds(restoredCategoryIds);
        setCategoryLoaded(true);
      })
      .catch((error) => {
        if (!active || error instanceof DOMException && error.name === "AbortError") return;
        setCategories([]);
        setCategoryIds([]);
        setAppliedCategoryIds([]);
        setCategoryLoaded(false);
        setCategoryNotice(message(error));
      })
      .finally(() => { if (active) setCategoryLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [connectionId, content.id, open, project.id, workspaceId]);

  useEffect(() => {
    if (!open || !identity || !categoryLoaded || !categorySelectionApplied || categorySaving) return;
    const controller = new AbortController();
    let active = true;
    const requestId = currentExecutionState.requestId;
    void loadWordPressDraftState(identity, controller.signal)
      .then((result) => {
        if (!active) return;
        setExecutionState((current) => {
          const aligned = current.identityKey === identityKey
            ? current
            : resetWordPressDraftOverlayState(identity, current.requestId);
          return reduceWordPressDraftOverlayState(aligned, {
            type: "readiness_resolved",
            identityKey,
            requestId,
            readiness: result.readiness,
            record: result.record,
            readinessError: result.readinessError,
          });
        });
      })
      .catch((error) => {
        if (!active || error instanceof DOMException && error.name === "AbortError") return;
        setExecutionState((current) => {
          const aligned = current.identityKey === identityKey
            ? current
            : resetWordPressDraftOverlayState(identity, current.requestId);
          return reduceWordPressDraftOverlayState(aligned, {
            type: "readiness_failed",
            identityKey,
            requestId,
            error: message(error),
          });
        });
      })
    return () => {
      active = false;
      controller.abort();
    };
  }, [categoryLoaded, categorySaving, categorySelectionApplied, currentExecutionState.requestId, identity, identityKey, open]);

  const saveCategory = async () => {
    if (!identity || !selectedCategoryId) return;
    setCategorySaving(true);
    setCategoryNotice("WordPress 카테고리를 적용하고 있습니다.");
    try {
      const response = await fetch("/api/publishing/wordpress/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: identity.workspaceId,
          projectId: identity.projectId,
          contentId: identity.contentId,
          connectionId: identity.connectionId,
          categoryIds: [selectedCategoryId],
        }),
      });
      const result = await response.json() as WordPressCategoryResponse;
      if (!response.ok || !result.selection?.valid) throw new Error(result.error ?? "WordPress 카테고리를 적용하지 못했습니다.");
      setCategories(result.categories ?? categories);
      setCategoryIds(result.selection.categoryIds);
      setAppliedCategoryIds(result.selection.categoryIds);
      setCategoryLoaded(true);
      if (result.data) await onPersist(result.data);
      setCategoryNotice(`WordPress 카테고리 적용 완료: ${result.selection.categoryNames.join(", ")}`);
      setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_preparation" }));
      setExecutionState((current) => resetWordPressDraftOverlayState(identity, current.requestId));
    } catch (error) {
      setCategoryNotice(message(error));
    } finally {
      setCategorySaving(false);
    }
  };

  const submit = async () => {
    if (!executable) return;
    if (!identity) return;
    setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
      type: "execution_started",
      identityKey,
      notice: "WordPress에 비공개 Draft를 저장하고 외부 상태를 검증하고 있습니다.",
    }));
    try {
      const result = await requestWordPressDraftCreation(submissionGuard);
      if (!result) return;
      setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
        type: "execution_completed",
        identityKey,
        readiness: result.readiness,
        record: result.record,
        notice: result.record?.safeMessage ?? "WordPress 실행 결과를 저장했습니다.",
      }));
      setModalView((current) => reduceWordPressDraftModalView(current, {
        type: "execution_completed",
        hasRecord: Boolean(result.record ?? currentExecutionState.record),
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
    <button className="fixed bottom-6 left-6 z-[70] rounded-2xl bg-[#202024] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_38px_rgba(0,0,0,0.22)]" onClick={() => {
      setOpen(true);
      setModalView((current) => reduceWordPressDraftModalView(current, { type: "open" }));
      setCategories([]);
      setCategoryIds([]);
      setAppliedCategoryIds([]);
      setCategoryLoaded(false);
      setCategoryLoading(Boolean(connectionId));
      setCategoryNotice("");
      setExecutionState((current) => resetWordPressDraftOverlayState(identity, current.requestId));
    }} type="button">
      WordPress 임시글
    </button>

    {open ? <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 p-4 sm:items-center" role="presentation">
      <section aria-labelledby="wordpress-draft-title" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white p-6 shadow-2xl sm:p-7" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">WordPress REST Draft</p><h2 className="mt-2 text-2xl font-semibold" id="wordpress-draft-title">{showOutcome ? "WordPress 실행 결과" : "WordPress 발행 준비"}</h2></div>
          <button aria-label="닫기" className="rounded-xl border px-3 py-2 text-sm" disabled={loading} onClick={() => setOpen(false)} type="button">닫기</button>
        </div>

        {showOutcome && outcome && connection ? <>
          <WordPressCompletionCard connection={connection} outcome={outcome} record={record!} />
          <button className="mt-5 rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_preparation" }))} type="button">준비 화면으로 돌아가기</button>
        </> : <>
          {record && outcome && connection ? <button className="mt-5 rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_previous_result", hasRecord: true }))} type="button">이전 저장 결과 보기</button> : null}
          <label className="mt-5 block text-sm font-semibold">WordPress 계정
            <select className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={categorySaving} onChange={(event) => {
              const nextConnectionId = event.target.value;
              setSelectedConnectionId(nextConnectionId);
              setCategories([]);
              setCategoryIds([]);
              setAppliedCategoryIds([]);
              setCategoryLoaded(false);
              setCategoryLoading(Boolean(nextConnectionId));
              setCategoryNotice("");
              setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_preparation" }));
              setExecutionState((current) => resetWordPressDraftOverlayState(undefined, current.requestId));
            }} value={connectionId}>
              <option value="">계정을 선택해 주세요</option>
              {wordpressConnections.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.status}</option>)}
            </select>
          </label>

          <div className="mt-4 rounded-2xl border p-4">
            <label className="block text-sm font-semibold">WordPress 카테고리
              <select className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={!connection || categoryLoading || categorySaving} onChange={(event) => {
                setCategoryIds(event.target.value ? [event.target.value] : []);
                setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_preparation" }));
                if (identity) setExecutionState((current) => {
                  const aligned = current.identityKey === identityKey
                    ? current
                    : resetWordPressDraftOverlayState(identity, current.requestId);
                  return reduceWordPressDraftOverlayState(aligned, { type: "preparation_changed", identityKey });
                });
              }} value={selectedCategoryId}>
                <option value="">{categoryLoading ? "카테고리를 불러오는 중입니다" : "카테고리를 선택해 주세요"}</option>
                {categories.map((category) => <option key={category.externalCategoryId} value={category.externalCategoryId}>{category.name}{category.slug ? ` · ${category.slug}` : ""}</option>)}
              </select>
            </label>
            <button className="mt-3 rounded-xl border border-[#202024] px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!identity || !selectedCategoryId || categorySelectionApplied || categoryLoading || categorySaving} onClick={() => void saveCategory()} type="button">{categorySaving ? "카테고리 적용 중…" : categorySelectionApplied ? "카테고리 적용 완료" : "카테고리 적용"}</button>
          </div>

          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Draft Only</strong> · 공개 발행, 예약 발행, 자동 재시도는 실행하지 않습니다.</p>

          <dl className="mt-5 grid gap-3 rounded-2xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2">
            <Info label="연결 계정" value={connection ? `${connection.displayName} · ${connection.status}` : "계정 선택 필요"} />
            <Info label="Category" value={readiness?.categorySelection.valid && readinessMatchesAppliedCategory ? readiness.categorySelection.categoryNames.join(", ") : categorySelectionApplied ? "적용된 Category 재확인 필요" : "Category 적용 필요"} />
            <Info label="Quality 승인" value={readiness?.checks.find((item) => item.key === "quality_revision")?.passed ? "현재 Revision 승인 완료" : "현재 Revision 승인 필요"} />
            <Info label="로컬 이미지" value={`${localImageCount}개`} />
            <Info label="media.upload" value={mediaAllowed ? localImageCount ? "명시적 허용" : "이미지 없음 · 불필요" : "권한 필요"} />
            <Info label="Featured Image" value={preparation?.featuredImageAssetId ? "선택됨" : "선택 안 함"} />
          </dl>

          <div className="mt-5"><h3 className="font-semibold">실행 준비 상태</h3>{readiness?.checks.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <article className={`rounded-xl border p-3 text-sm ${check.passed ? "bg-emerald-50/60" : check.key === "final_confirmation" ? "bg-sky-50" : "bg-amber-50"}`} key={check.key}><strong>{check.passed ? "통과" : check.key === "final_confirmation" ? "사용자 확인 단계" : "차단"}</strong><p className="mt-1 leading-5 text-[#66666f]">{check.message}</p></article>)}</div> : <p className="mt-3 rounded-xl bg-[#f8f8fa] p-3 text-sm">{loading ? "준비 상태를 확인하고 있습니다." : "계정과 카테고리를 적용해 주세요."}</p>}</div>

          <label className="mt-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6"><input checked={finalConfirmation} className="mt-1" disabled={!readiness?.ready || !readinessMatchesAppliedCategory || loading} onChange={(event) => setExecutionState((current) => reduceWordPressDraftOverlayState(current, { type: "confirm", identityKey, value: event.target.checked }))} type="checkbox" /><span>현재 Revision, 계정, Category, 이미지와 Featured Image를 확인했습니다. WordPress에 공개되지 않은 Draft를 저장하는 작업을 최종 확인합니다.</span></label>
          <button className="mt-5 w-full rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!executable} onClick={() => void submit()} type="button">{executionLoading ? "WordPress 검증 중…" : "WordPress에 임시글 저장"}</button>
        </>}

        {notice ? <p aria-live="polite" className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">{notice}</p> : null}
      </section>
    </div> : null}
  </>;
}

function WordPressCompletionCard({ connection, outcome, record }: Readonly<{
  connection: WordPressDraftConnection;
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

async function loadWordPressCategories(
  input: Readonly<{ workspaceId: string; projectId: string; contentId: string; connectionId: string }>,
  signal: AbortSignal,
): Promise<WordPressCategoryResponse> {
  const query = new URLSearchParams(input);
  const response = await fetch(`/api/publishing/wordpress/categories?${query}`, { cache: "no-store", signal });
  const result = await response.json() as WordPressCategoryResponse;
  if (!response.ok) throw new Error(result.error ?? "WordPress 카테고리를 불러오지 못했습니다.");
  return result;
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

function hasPermission(connection: WordPressDraftConnection | undefined, permission: string): boolean {
  return Boolean(connection && [...(connection.automationPermissions ?? []), ...(connection.permissions ?? [])].includes(permission));
}

function wordpressAdminDraftsUrl(connection: WordPressDraftConnection): string {
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
