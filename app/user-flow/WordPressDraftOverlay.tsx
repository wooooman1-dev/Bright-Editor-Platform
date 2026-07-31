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
  const [showConfirmation, setShowConfirmation] = useState(false);

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
  const noticeLoading = categoryLoading || categorySaving || Boolean(executionLoading);
  const executionNotice = currentExecutionState.notice
    || (executionLoading ? "워드프레스 임시글 저장 준비 상태를 확인하고 있습니다." : "");
  const notice = executionNotice || categoryNotice
    || (categoryLoading ? "워드프레스 카테고리를 불러오고 있습니다." : "")
    || (!wordpressConnections.length ? "설정에서 워드프레스 연결 계정을 먼저 추가해 주세요." : "");
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
  const canOpenConfirmation = Boolean(identity
    && readiness?.ready
    && categorySelectionApplied
    && readinessMatchesAppliedCategory
    && !loading
    && (!record || record.status === "verified"));

  useEffect(() => {
    if (!workspaceId || !connectionId) return;
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
  }, [connectionId, content.id, project.id, workspaceId]);

  useEffect(() => {
    if (!identity || !categoryLoaded || !categorySelectionApplied || categorySaving) return;
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
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [categoryLoaded, categorySaving, categorySelectionApplied, currentExecutionState.requestId, identity, identityKey]);

  useEffect(() => {
    setShowConfirmation(false);
  }, [identityKey]);

  const saveCategory = async () => {
    if (!identity || !selectedCategoryId) return;
    setShowConfirmation(false);
    setCategorySaving(true);
    setCategoryNotice("워드프레스 카테고리를 적용하고 있습니다.");
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
      if (!response.ok || !result.selection?.valid) throw new Error(result.error ?? "워드프레스 카테고리를 적용하지 못했습니다.");
      setCategories(result.categories ?? categories);
      setCategoryIds(result.selection.categoryIds);
      setAppliedCategoryIds(result.selection.categoryIds);
      setCategoryLoaded(true);
      if (result.data) await onPersist(result.data);
      setCategoryNotice(`워드프레스 카테고리 적용 완료: ${result.selection.categoryNames.join(", ")}`);
      setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_preparation" }));
      setExecutionState((current) => resetWordPressDraftOverlayState(identity, current.requestId));
    } catch (error) {
      setCategoryNotice(message(error));
    } finally {
      setCategorySaving(false);
    }
  };

  const submit = async () => {
    if (!executable || !identity) return;
    setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
      type: "execution_started",
      identityKey,
      notice: "워드프레스에 공개되지 않은 임시글을 저장하고 외부 상태를 검증하고 있습니다.",
    }));
    try {
      const result = await requestWordPressDraftCreation(submissionGuard);
      if (!result) return;
      setExecutionState((current) => reduceWordPressDraftOverlayState(current, {
        type: "execution_completed",
        identityKey,
        readiness: result.readiness,
        record: result.record,
        notice: result.record?.safeMessage ?? "워드프레스 실행 결과를 저장했습니다.",
      }));
      setShowConfirmation(false);
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
    <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#ff6b6b]">워드프레스 임시글</p>
          <h2 className="mt-1 text-lg font-semibold">{showOutcome ? "워드프레스 실행 결과" : "워드프레스 임시글 준비"}</h2>
        </div>
        {!showOutcome && record && outcome && connection ? <button className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={() => {
          setShowConfirmation(false);
          setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_previous_result", hasRecord: true }));
        }} type="button">이전 저장 결과 보기</button> : null}
      </div>

      {showOutcome && outcome && connection ? <>
        <WordPressCompletionCard connection={connection} outcome={outcome} record={record!} />
        <button className="mt-5 rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_preparation" }))} type="button">준비 화면으로 돌아가기</button>
      </> : <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">워드프레스 계정
            <select className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={categorySaving} onChange={(event) => {
              const nextConnectionId = event.target.value;
              setSelectedConnectionId(nextConnectionId);
              setCategories([]);
              setCategoryIds([]);
              setAppliedCategoryIds([]);
              setCategoryLoaded(false);
              setCategoryLoading(Boolean(nextConnectionId));
              setCategoryNotice("");
              setShowConfirmation(false);
              setModalView((current) => reduceWordPressDraftModalView(current, { type: "show_preparation" }));
              setExecutionState((current) => resetWordPressDraftOverlayState(undefined, current.requestId));
            }} value={connectionId}>
              <option value="">계정을 선택해 주세요</option>
              {wordpressConnections.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {connectionStatusLabel(item.status)}</option>)}
            </select>
          </label>

          <label className="text-sm font-semibold">워드프레스 카테고리
            <select className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" disabled={!connection || categoryLoading || categorySaving} onChange={(event) => {
              setCategoryIds(event.target.value ? [event.target.value] : []);
              setShowConfirmation(false);
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
        </div>

        <button className="mt-3 rounded-xl border border-[#202024] px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={!identity || !selectedCategoryId || categorySelectionApplied || categoryLoading || categorySaving} onClick={() => void saveCategory()} type="button">{categorySaving ? "카테고리 적용 중…" : categorySelectionApplied ? "카테고리 적용 완료" : "카테고리 적용"}</button>

        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>임시글만 저장</strong> · 공개 발행, 예약 발행, 자동 재실행은 하지 않습니다.</p>

        <dl className="mt-5 grid gap-3 rounded-2xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2">
          <Info label="연결 계정" value={connection ? `${connection.displayName} · ${connectionStatusLabel(connection.status)}` : "계정 선택 필요"} />
          <Info label="카테고리" value={readiness?.categorySelection.valid && readinessMatchesAppliedCategory ? readiness.categorySelection.categoryNames.join(", ") : categorySelectionApplied ? "적용된 카테고리 재확인 필요" : "카테고리 적용 필요"} />
          <Info label="품질 승인" value={readiness?.checks.find((item) => item.key === "quality_revision")?.passed ? "현재 문서 버전 승인 완료" : "현재 문서 버전 승인 필요"} />
          <Info label="로컬 이미지" value={`${localImageCount}개`} />
          <Info label="이미지 업로드 권한" value={mediaAllowed ? localImageCount ? "명시적 허용" : "이미지 없음 · 불필요" : "권한 필요"} />
          <Info label="대표 이미지" value={preparation?.featuredImageAssetId ? "선택됨" : "선택 안 함"} />
        </dl>

        <div className="mt-5">
          <h3 className="font-semibold">저장 준비 상태</h3>
          {readiness?.checks.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <article className={`rounded-xl border p-3 text-sm ${check.passed ? "bg-emerald-50/60" : check.key === "final_confirmation" ? "bg-sky-50" : "bg-amber-50"}`} key={check.key}><strong>{check.passed ? "통과" : check.key === "final_confirmation" ? "사용자 확인 단계" : "차단"}</strong><p className="mt-1 leading-5 text-[#66666f]">{check.message}</p></article>)}</div> : <p className="mt-3 rounded-xl bg-[#f8f8fa] p-3 text-sm">{loading ? "준비 상태를 확인하고 있습니다." : "계정과 카테고리를 적용해 주세요."}</p>}
        </div>

        <button className="mt-5 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!canOpenConfirmation} onClick={() => {
          setExecutionState((current) => reduceWordPressDraftOverlayState(current, { type: "confirm", identityKey, value: false }));
          setShowConfirmation(true);
        }} type="button">워드프레스 임시저장</button>
      </>}

      {notice ? <p aria-live="polite" className={`wordpress-draft-notice mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900${noticeLoading ? " wordpress-draft-notice--loading" : ""}`}>{notice}</p> : null}
    </section>

    {showConfirmation && connection && !showOutcome ? <section className="mt-6 rounded-[24px] border border-red-200 bg-white p-6">
      <h2 className="text-lg font-semibold">외부 임시저장 최종 확인 · 사용자 확인 필요</h2>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Info label="작업공간" value={data.workspace?.name ?? ""} />
        <Info label="프로젝트" value={project.name} />
        <Info label="대상 계정" value={connection.displayName} />
        <Info label="제목" value={content.document?.title ?? content.title} />
        <Info label="워드프레스 카테고리" value={readiness?.categorySelection.valid === true ? readiness.categorySelection.categoryNames.join(", ") : "선택 필요"} />
        <Info label="문서 버전" value={revisionId || "확인 필요"} />
      </dl>
      <p className="mt-4 rounded-xl bg-[#fff0f0] p-3 text-sm">공개 발행은 하지 않습니다. 확인한 문서 버전만 워드프레스 임시글로 저장합니다.</p>
      <label className="mt-4 flex items-start gap-3 text-sm leading-6">
        <input checked={finalConfirmation} className="mt-1" disabled={!readiness?.ready || !readinessMatchesAppliedCategory || loading} onChange={(event) => setExecutionState((current) => reduceWordPressDraftOverlayState(current, { type: "confirm", identityKey, value: event.target.checked }))} type="checkbox" />
        <span>현재 문서 버전, 계정, 카테고리, 이미지와 대표 이미지를 확인했습니다. 워드프레스에 공개되지 않은 임시글을 저장하는 작업을 최종 확인합니다.</span>
      </label>
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!executable} onClick={() => void submit()} type="button">{executionLoading ? "워드프레스 검증 중…" : "확인하고 임시저장"}</button>
        <button className="rounded-xl border px-5 py-3 text-sm font-semibold" disabled={loading} onClick={() => {
          setExecutionState((current) => reduceWordPressDraftOverlayState(current, { type: "confirm", identityKey, value: false }));
          setShowConfirmation(false);
        }} type="button">취소</button>
      </div>
    </section> : null}
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
      <Info label="외부 글 ID" value={record.externalPostId ?? "확인되지 않음"} />
      <Info label="검증 상태" value={record.verified ? "외부 재조회 검증 완료" : recordStatusLabel(record.status)} />
      <Info label="카테고리" value={record.categoryNames.join(", ") || record.categoryIds.join(", ")} />
      <Info label="업로드 이미지" value={`${record.uploadedMedia.length}개`} />
      <Info label="대표 이미지" value={record.featuredImageAssigned ? "지정 및 검증 대상" : "지정 안 함"} />
      <Info label="실행 단계" value={recordStageLabel(record.stage)} />
    </dl>
    {record.cleanupRequired ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>정리 필요</strong><p>이미지 ID: {mediaIds.join(", ") || "확인되지 않음"}</p><p>이미지는 자동 삭제하지 않았습니다. 워드프레스 미디어 보관함에서 직접 확인하세요.</p></div> : null}
    {record.status === "unknown_result" ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900">자동 재실행이 차단되었습니다. 워드프레스 관리자에서 기존 임시글 존재 여부를 먼저 확인하세요.</p> : null}
    <div className="mt-5 rounded-xl border p-4 text-sm leading-6"><strong>실제 저장 결과 확인</strong><ol className="mt-2 list-decimal space-y-1 pl-5"><li>워드프레스 관리자에서 글이 임시글인지 확인</li><li>글 ID, 제목, 본문과 카테고리 확인</li><li>공개 글이 생성되지 않았는지 확인</li><li>이미지가 있으면 대체 텍스트와 대표 이미지 확인</li></ol><a className="mt-3 inline-block font-semibold text-[#ff6b6b] underline" href={wordpressAdminDraftsUrl(connection)} rel="noreferrer" target="_blank">워드프레스 관리자에서 확인</a></div>
  </div>;
}

async function loadWordPressCategories(
  input: Readonly<{ workspaceId: string; projectId: string; contentId: string; connectionId: string }>,
  signal: AbortSignal,
): Promise<WordPressCategoryResponse> {
  const query = new URLSearchParams(input);
  const response = await fetch(`/api/publishing/wordpress/categories?${query}`, { cache: "no-store", signal });
  const result = await response.json() as WordPressCategoryResponse;
  if (!response.ok) throw new Error(result.error ?? "워드프레스 카테고리를 불러오지 못했습니다.");
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
  if (!response.ok || !result.readiness && !result.record) throw new Error(result.error ?? result.readinessError ?? "워드프레스 임시글 준비 상태를 확인하지 못했습니다.");
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

function connectionStatusLabel(status: string): string {
  if (status === "connected") return "연결됨";
  if (status === "disconnected") return "연결 안 됨";
  if (status === "expired") return "재연결 필요";
  if (status === "error") return "연결 오류";
  return "상태 확인 필요";
}

function recordStatusLabel(status: PublishingExecutionRecord["status"]): string {
  const labels: Partial<Record<PublishingExecutionRecord["status"], string>> = {
    preparing: "준비 중",
    media_uploaded: "이미지 업로드 완료",
    draft_created: "임시글 생성 완료",
    verified: "검증 완료",
    verification_failed: "외부 검증 실패",
    cleanup_required: "정리 필요",
    unknown_result: "결과 확인 필요",
    failed: "실패",
  };
  return labels[status] ?? "상태 확인 필요";
}

function recordStageLabel(stage: PublishingExecutionRecord["stage"]): string {
  const labels: Partial<Record<PublishingExecutionRecord["stage"], string>> = {
    preparation: "준비",
    media: "이미지 처리",
    draft_create: "임시글 생성",
    draft_verify: "임시글 검증",
    complete: "완료",
  };
  return labels[stage] ?? "상태 확인 필요";
}

function Info({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div><dt className="font-semibold text-[#77777f]">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "워드프레스 임시글 요청을 처리하지 못했습니다.";
}