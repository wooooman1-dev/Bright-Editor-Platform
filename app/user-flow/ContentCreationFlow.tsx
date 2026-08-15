"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { detectContentOpportunitySelectionMode, type ContentOpportunityCandidate } from "../../core/content";
import { applyProjectPublishingTargets, projectPublishingAccountIds } from "../application/publishing/ProjectPublishingTarget";
import { PageContainer } from "../shared/ui/PageContainer";
import { completeConfirmedGeneration } from "./confirmed-generation";
import { generatedDocumentEditable, generatedDocumentReady, GenerationCompletionError, type GenerationCompletionResult } from "./generation-result";
import { PrimaryKeywordConfirmation } from "./PrimaryKeywordConfirmation";
import {
  buildAutomaticContentPlanningRequest,
  createContentFromPlan,
  failContentPlanning,
  resolveProjectStrategy,
  selectContentPlanningOpportunity,
  startContentGeneration,
  startContentPlanning,
  updateContent,
  type ContentPlanningResult,
  type UserContent,
  type UserData,
  type UserProject,
} from "./user-data";

type SafeConnection = Readonly<{
  id: string;
  platform: "tistory" | "wordpress";
  displayName: string;
  status: string;
  lastVerifiedAt?: string;
  publicMetadata?: Readonly<{ sessionStateAvailable?: boolean }>;
}>;

type CreationOperation = "idle" | "planning" | "regenerating" | "generating";

export function ContentCreationFlow({ automatic = false, content, data, project, onBack, onContentStarted, onOpenEditor, onPersist, onRefresh, onRestore }: {
  automatic?: boolean;
  content?: UserContent;
  data: UserData;
  project: UserProject;
  onBack: () => void;
  onContentStarted: (contentId: string) => void;
  onOpenEditor: (contentId: string) => void;
  onPersist: (data: UserData) => Promise<void>;
  onRefresh: () => Promise<UserData>;
  onRestore: (data: UserData) => void;
}) {
  const restoredWorkflow = content?.planningWorkflow;
  const [draftContentId] = useState(() => content?.id ?? createId("content"));
  const contentIdentity = `${project.id}:${content?.id ?? draftContentId}`;
  const [request, setRequest] = useState(restoredWorkflow?.request ?? content?.naturalLanguageRequest ?? "");
  const [plan, setPlan] = useState<ContentPlanningResult | undefined>(content?.planning);
  const [opportunityId, setOpportunityId] = useState(restoredWorkflow?.selectedOpportunityId ?? content?.planning?.opportunityCandidates?.[0]?.opportunityId ?? "");
  const [customKeyword, setCustomKeyword] = useState("");
  const [customKeywordSelected, setCustomKeywordSelected] = useState(false);
  const [preservedOpportunityId, setPreservedOpportunityId] = useState<string | undefined>();
  const [connections, setConnections] = useState<readonly SafeConnection[]>([]);
  const [selected, setSelected] = useState<readonly string[]>(content?.selectedPublishingAccountIds ?? project.selectedPublishingAccountIds ?? []);
  const [notice, setNotice] = useState(restoredNotice(content));
  const [operation, setOperation] = useState<CreationOperation>("idle");
  const [dirtyRequest, setDirtyRequest] = useState(false);
  const contentId = content?.id ?? draftContentId;
  const latestDataRef = useRef(data);
  const activeOperationRef = useRef(restoredWorkflow?.operationId ?? "");
  const hydratedIdentityRef = useRef(contentIdentity);
  const hydratedWorkflowRef = useRef(workflowSignature(restoredWorkflow));
  const automaticStartRef = useRef(Boolean(content));
  const planningSubmissionRef = useRef(false);
  const connected = useMemo(() => connections.filter((connection) => connection.status === "connected"), [connections]);
  const workflowPending = content?.planningWorkflow?.status === "planning" || content?.planningWorkflow?.status === "generating";
  const localWorking = operation !== "idle";
  const working = localWorking || workflowPending;
  const progress = operationCopy(operation !== "idle" ? operation : workflowOperation(content));
  const opportunityCandidates = useMemo(() => plan?.opportunityCandidates ?? [], [plan]);
  const confirmedOpportunity = useMemo(() => customKeywordSelected
    ? undefined
    : opportunityCandidates.find((candidate) => candidate.opportunityId === opportunityId),
  [customKeywordSelected, opportunityCandidates, opportunityId]);
  const generatedOpportunityId = content?.preservedFromContentId
    ? data.contents.find((item) => item.id === content.preservedFromContentId)?.opportunity?.opportunityId ?? content.opportunity?.opportunityId
    : content?.document ? content.opportunity?.opportunityId : preservedOpportunityId;

  useEffect(() => { latestDataRef.current = data; }, [data]);

  useEffect(() => {
    if (hydratedIdentityRef.current === contentIdentity) return;
    hydratedIdentityRef.current = contentIdentity;
    hydratedWorkflowRef.current = workflowSignature(content?.planningWorkflow);
    activeOperationRef.current = content?.planningWorkflow?.operationId ?? "";
    automaticStartRef.current = Boolean(content);
    planningSubmissionRef.current = false;
    setRequest(content?.planningWorkflow?.request ?? content?.naturalLanguageRequest ?? "");
    setPlan(content?.planning);
    setOpportunityId(content?.planningWorkflow?.selectedOpportunityId ?? content?.planning?.opportunityCandidates?.[0]?.opportunityId ?? "");
    setCustomKeyword("");
    setCustomKeywordSelected(false);
    setSelected(content?.selectedPublishingAccountIds ?? project.selectedPublishingAccountIds ?? []);
    setNotice(restoredNotice(content));
    setOperation("idle");
    setDirtyRequest(false);
  }, [contentIdentity, content, project.selectedPublishingAccountIds]);

  useEffect(() => {
    const workflow = content?.planningWorkflow;
    const signature = workflowSignature(workflow);
    if (!workflow || signature === hydratedWorkflowRef.current) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      hydratedWorkflowRef.current = signature;
      activeOperationRef.current = workflow.operationId;
      setRequest(workflow.request);
      setPlan(content.planning);
      setOpportunityId(workflow.selectedOpportunityId ?? content.planning?.opportunityCandidates?.[0]?.opportunityId ?? "");
      setSelected(content.selectedPublishingAccountIds ?? project.selectedPublishingAccountIds ?? []);
      setCustomKeyword("");
      setCustomKeywordSelected(false);
      setDirtyRequest(false);
      setNotice(restoredNotice(content));
      if (workflow.status !== "planning" && workflow.status !== "generating") setOperation("idle");
    });
    return () => { active = false; };
  }, [content, project.selectedPublishingAccountIds]);

  useEffect(() => {
    const status = content?.planningWorkflow?.status;
    if (status !== "planning" && status !== "generating") return;
    const timer = window.setTimeout(() => {
      void onRefresh().catch((error) => setNotice(`저장된 작업 상태를 다시 불러오지 못했습니다. ${message(error)}`));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [content?.planningWorkflow?.revision, content?.planningWorkflow?.status, onRefresh]);

  /**
   * True when this screen was opened at an article that was already finished.
   *
   * The hand-off below exists to carry the user into the editor the moment a
   * generation this screen is watching completes, including one that was still
   * running when the page reloaded. It must not fire for someone who came back
   * here deliberately to look at the stored candidates of a finished article —
   * doing so bounced them straight into the editor, which reads as the button
   * doing nothing at all.
   */
  const openedAtFinishedArticleRef = useRef<boolean | undefined>(undefined);

  // Decided from the first Content this screen actually receives, not from the
  // first render: on a cold page load the Content arrives after mount, so
  // reading it at mount would record "not finished" for every article and hand
  // the user straight back to the editor on refresh. This effect is declared
  // before the hand-off so it settles the answer in the same commit.
  useEffect(() => {
    if (openedAtFinishedArticleRef.current === undefined && content) {
      openedAtFinishedArticleRef.current = content.planningWorkflow?.status === "generated" && Boolean(content.document);
    }
  }, [content]);

  useEffect(() => {
    // `undefined` means no Content has arrived yet, so nothing was observed to
    // hand off; only a screen opened at an unfinished article advances.
    if (openedAtFinishedArticleRef.current !== false) return;
    if (content?.planningWorkflow?.status === "generated" && content.document) onOpenEditor(content.id);
  }, [content?.document, content?.id, content?.planningWorkflow?.status, onOpenEditor]);

  useEffect(() => {
    void fetch(`/api/connections?workspaceId=${encodeURIComponent(project.workspaceId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { connections?: SafeConnection[] }) => {
        const values = result.connections ?? [];
        setConnections(values);
        const usableTistory = values.filter((connection) => connection.platform === "tistory"
          && connection.status === "connected"
          && connection.lastVerifiedAt
          && connection.publicMetadata?.sessionStateAvailable === true);
        if (usableTistory.length === 1) setSelected((current) => current.length ? current : [usableTistory[0].id]);
      });
  }, [project.workspaceId]);

  const analyze = async (manual = false, regenerate = false, requestOverride?: string, selectionModeOverride?: "automatic" | "userSpecified") => {
    if (planningSubmissionRef.current) return;
    planningSubmissionRef.current = true;
    const planningRequest = requestOverride ?? request;
    const selectionMode = selectionModeOverride ?? content?.planningWorkflow?.selectionMode ?? detectContentOpportunitySelectionMode(planningRequest, automatic);
    const operationId = createId("planning-operation");
    activeOperationRef.current = operationId;
    setOperation(regenerate ? "regenerating" : "planning");
    setNotice(regenerate
      ? "기존 추천을 유지한 채 새 추천을 생성하고 있습니다."
      : manual ? "수동 기획을 준비하고 있습니다." : "요청을 분석하고 있습니다.");
    try {
      const started = startContentPlanning(latestDataRef.current, {
        id: contentId,
        projectId: project.id,
        request: planningRequest,
        selectionMode,
        operationId,
        now: now(),
      });
      latestDataRef.current = started;
      onContentStarted(contentId);
      onRestore(started);
      const startResponse = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start-planning",
          input: {
            naturalLanguageRequest: planningRequest,
            workspaceId: project.workspaceId,
            projectId: project.id,
            contentId,
            operationId,
            selectionMode,
          },
        }),
      });
      const startResult = await startResponse.json() as { data?: UserData; error?: string };
      if (!startResponse.ok || !startResult.data) throw new Error(startResult.error ?? "Planning 요청을 저장하지 못했습니다.");
      latestDataRef.current = startResult.data;
      onRestore(startResult.data);
      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: manual ? "manual-plan" : "plan",
          input: {
            naturalLanguageRequest: planningRequest,
            workspaceId: project.workspaceId,
            projectId: project.id,
            contentId,
            operationId,
            selectionMode,
          },
        }),
      });
      const result = await response.json() as { plan?: ContentPlanningResult; data?: UserData; error?: string };
      if (!response.ok || !result.plan) throw new Error(result.error ?? "Planning failed.");
      if (result.data) {
        latestDataRef.current = result.data;
        onRestore(result.data);
      }
      if (activeOperationRef.current !== operationId) return;
      setPlan(result.plan);
      setOpportunityId(result.plan.opportunityCandidates?.[0]?.opportunityId ?? "");
      setCustomKeyword("");
      setCustomKeywordSelected(false);
      setDirtyRequest(false);
      setNotice(regenerate
        ? "새 추천이 준비되었습니다. 변경된 키워드와 콘텐츠 방향을 확인해 주세요."
        : manual ? "수동 기획이 준비되었습니다. 모든 항목을 수정할 수 있습니다." : "추천 내용을 확인한 뒤 원고 생성을 승인해 주세요.");
    } catch (error) {
      if (activeOperationRef.current !== operationId) return;
      try {
        const failed = failContentPlanning(latestDataRef.current, {
          workspaceId: project.workspaceId,
          projectId: project.id,
          contentId,
          operationId,
          error: message(error),
          retryFrom: "planning",
          now: now(),
        });
        if (failed !== latestDataRef.current) {
          latestDataRef.current = failed;
          await onPersist(failed);
        }
      } catch { /* The server may already have completed or superseded this operation. */ }
      setNotice(regenerate
        ? `${message(error)} 기존 추천은 그대로 유지되었습니다. 다시 시도할 수 있습니다.`
        : `${message(error)} 입력한 요청은 보존되었습니다. 수동으로 계속하거나 AI 제공자 설정을 확인해 주세요.`);
    } finally {
      planningSubmissionRef.current = false;
      if (activeOperationRef.current === operationId) {
        setOperation("idle");
      }
    }
  };

  const confirm = async (generate: boolean, confirmedPlan = plan, confirmedRequest = request, selectedOpportunity = confirmedOpportunity, target: "existing" | "new" = "existing") => {
    if (!confirmedPlan || !selectedOpportunity || dirtyRequest) return;
    // Reaching this screen from the editor is now possible, so the Content may
    // already hold a manuscript that confirming would replace.
    if (target === "existing" && content?.document && !window.confirm("이미 만들어진 원고가 있습니다. 이 기획으로 다시 만들면 기존 원고를 대체합니다. 계속할까요?")) return;
    const targetContentId = target === "new" ? createId("content") : contentId;
    const readyAccountIds = selected.filter((id) => connected.some((connection) => connection.id === id));
    const generationOperationId = createId("generation-operation");
    let generationStarted = false;
    if (generate) setOperation("generating");
    setNotice("원고 생성 전에 콘텐츠 기록을 저장하고 있습니다.");
    let next = applyProjectPublishingTargets(latestDataRef.current, project.id, readyAccountIds, connected, now());
    next = createContentFromPlan(next, {
      id: targetContentId,
      projectId: project.id,
      naturalLanguageRequest: confirmedRequest,
      plan: confirmedPlan,
      opportunity: selectedOpportunity,
      selectedPublishingAccountIds: readyAccountIds,
      ...(target === "new" ? { sourceContentId: contentId } : {}),
      now: now(),
    });
    latestDataRef.current = next;
    try {
      await onPersist(next);
      const tistoryAccountIds = projectPublishingAccountIds(next, project.id, readyAccountIds, connected, "tistory");
      if (tistoryAccountIds.length) {
        const preparationResponse = await fetch("/api/tistory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "prepare",
            workspaceId: project.workspaceId,
            projectId: project.id,
            contentId: targetContentId,
            ...(tistoryAccountIds.length === 1 ? { connectionId: tistoryAccountIds[0] } : {}),
          }),
        });
        const preparationResult = await preparationResponse.json() as { data?: UserData; error?: string };
        if (!preparationResponse.ok) throw new Error(preparationResult.error ?? "티스토리 발행 계정 자동 적용에 실패했습니다.");
        if (preparationResult.data) {
          next = preparationResult.data;
          latestDataRef.current = next;
          onRestore(next);
        }
      }
      const persistedAccountIds = next.contents.find((item) => item.id === targetContentId)?.selectedPublishingAccountIds ?? readyAccountIds;
      for (const connectionId of persistedAccountIds) {
        const targetResponse = await fetch("/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "select-target", workspaceId: project.workspaceId, projectId: project.id, connectionId }),
        });
        if (!targetResponse.ok) {
          const result = await targetResponse.json() as { error?: string };
          throw new Error(result.error ?? "Publishing-account selection failed.");
        }
      }
      next = applyProjectPublishingTargets(next, project.id, persistedAccountIds, connected, now());
      next = createContentFromPlan(next, {
        id: targetContentId,
        projectId: project.id,
        naturalLanguageRequest: confirmedRequest,
        plan: confirmedPlan,
        opportunity: selectedOpportunity,
        selectedPublishingAccountIds: persistedAccountIds,
        ...(target === "new" ? { sourceContentId: contentId } : {}),
        now: now(),
      });
      latestDataRef.current = next;
      await onPersist(next);
      if (target === "new") {
        setPreservedOpportunityId(content?.opportunity?.opportunityId);
        onRestore(next);
      }
      if (!generate) {
        onOpenEditor(targetContentId);
        return;
      }
      next = startContentGeneration(next, {
        workspaceId: project.workspaceId,
        projectId: project.id,
        contentId: targetContentId,
        operationId: generationOperationId,
        now: now(),
      });
      generationStarted = true;
      activeOperationRef.current = generationOperationId;
      latestDataRef.current = next;
      await onPersist(next);
      setNotice("원고를 생성하고 최종 품질 검토·편집을 진행하고 있습니다. 품질 미달 원고도 진단과 함께 편집기에 보존됩니다.");
      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          input: {
            contentId: targetContentId,
            contentType: selectedOpportunity.contentType,
            opportunityId: selectedOpportunity.opportunityId,
            opportunityVersion: selectedOpportunity.version,
            opportunityFingerprint: selectedOpportunity.fingerprint,
            primaryKeyword: selectedOpportunity.primaryKeyword,
            topic: selectedOpportunity.selectedTopic,
            searchIntent: selectedOpportunity.searchIntent,
            secondaryKeywords: selectedOpportunity.secondaryKeywords,
            keywords: [selectedOpportunity.primaryKeyword, ...selectedOpportunity.secondaryKeywords],
            platform: confirmedPlan.recommendedPlatforms[0] ?? "canonical",
            workspaceId: project.workspaceId,
            projectId: project.id,
            operationId: generationOperationId,
            editorialContext: JSON.stringify({
              request: confirmedRequest,
              opportunityId: selectedOpportunity.opportunityId,
            }),
          },
        }),
      });
      const result = await response.json() as GenerationCompletionResult;
      if (result.data) {
        next = result.data;
        latestDataRef.current = next;
        onRestore(next);
      }
      if (!generatedDocumentReady(result)) {
        if (result.qualityTargetBlocked || result.reachedTarget === false || result.quality?.approved === false) {
          setNotice(`${result.error ?? "원고가 자동 품질 승인 기준에 도달하지 못했습니다."} 편집기에서 수정한 뒤 다시 검토할 수 있습니다.`);
          if (generatedDocumentEditable(result)) onOpenEditor(targetContentId);
          return;
        }
        throw new GenerationCompletionError(
          result.error ?? "Generation failed.",
          result.diagnostic,
          result.approvalSourcePreflightDiagnostic,
          result.aiProviderDiagnostic,
        );
      }
      if (!response.ok || !result.document) throw new Error(result.error ?? "Generation failed.");
      if (result.data) {
        onOpenEditor(targetContentId);
      } else {
        next = await completeConfirmedGeneration(next, {
          contentId: targetContentId,
          generated: { document: result.document, quality: result.quality },
          now: now(),
        }, { persist: onPersist, openEditor: onOpenEditor });
      }
    } catch (error) {
      const configurationRequired = message(error).includes("OPENAI_API_KEY");
      if (generationStarted) {
        next = failContentPlanning(next, {
          workspaceId: project.workspaceId,
          projectId: project.id,
          contentId,
          operationId: generationOperationId,
          error: message(error),
          retryFrom: "generation",
          ...(error instanceof GenerationCompletionError && error.diagnostic ? { diagnostic: error.diagnostic } : {}),
          ...(error instanceof GenerationCompletionError && error.approvalSourcePreflightDiagnostic
            ? { approvalSourcePreflightDiagnostic: error.approvalSourcePreflightDiagnostic }
            : {}),
          ...(error instanceof GenerationCompletionError && error.aiProviderDiagnostic
            ? { aiProviderDiagnostic: error.aiProviderDiagnostic }
            : {}),
          now: now(),
        });
      }
      next = updateContent(next, targetContentId, {
        status: configurationRequired ? "configuration_required" : "draft",
        generationError: message(error),
        updatedAt: now(),
      });
      let recoveryNotice = "콘텐츠 기록은 안전하게 보존되었습니다. 편집기에서 직접 작성하거나 나중에 다시 시도할 수 있습니다.";
      try {
        latestDataRef.current = next;
        await onPersist(next);
      } catch (persistenceError) {
        recoveryNotice = `복구 데이터 저장에도 실패했습니다: ${message(persistenceError)}`;
      }
      setNotice(`${message(error)} ${recoveryNotice}`);
      if (!plan) onOpenEditor(targetContentId);
    } finally {
      setOperation("idle");
    }
  };

  const selectOpportunity = async (candidate: ContentOpportunityCandidate) => {
    setCustomKeywordSelected(false);
    setOpportunityId(candidate.opportunityId);
    const current = latestDataRef.current.contents.find((item) => item.id === contentId);
    const workflow = current?.planningWorkflow;
    if (!workflow || workflow.selectedOpportunityId === candidate.opportunityId) return;
    try {
      const next = selectContentPlanningOpportunity(latestDataRef.current, {
        workspaceId: project.workspaceId,
        projectId: project.id,
        contentId,
        opportunityId: candidate.opportunityId,
        expectedRevision: workflow.revision,
        now: now(),
      });
      latestDataRef.current = next;
      await onPersist(next);
      setNotice("선택한 Content Opportunity 전체를 저장했습니다.");
    } catch (error) {
      setNotice(message(error));
      await onRefresh().catch(() => undefined);
    }
  };

  const cancelPlanning = async () => {
    if (!window.confirm("현재 Planning 작업과 저장된 후보를 취소할까요?")) return;
    setNotice("Planning 작업을 취소하고 있습니다.");
    try {
      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-content", input: { workspaceId: project.workspaceId, contentId } }),
      });
      const result = await response.json() as { data?: UserData; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? "Planning 작업을 취소하지 못했습니다.");
      latestDataRef.current = result.data;
      onRestore(result.data);
      onBack();
    } catch (error) {
      setNotice(message(error));
    }
  };

  useEffect(() => {
    if (!automatic || automaticStartRef.current || content?.planningWorkflow) return;
    automaticStartRef.current = true;
    const strategy = resolveProjectStrategy(project);
    const automaticRequest = buildAutomaticContentPlanningRequest(strategy);
    void Promise.resolve().then(() => {
      setRequest(automaticRequest);
      setNotice("주제를 선정하고 있습니다. 기존 게시글과 중복 여부를 확인하고 있습니다.");
      return analyze(false, false, automaticRequest, "automatic");
    });
  }, [automatic]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageContainer className="py-8 sm:py-10 lg:py-12">
      {progress ? (
        <div aria-busy="true" aria-live="polite" className="bright-operation-notice rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
          <p className="font-semibold">{progress.title}</p>
          <p className="mt-1 text-sm">{progress.detail}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button className="text-sm font-semibold text-[#77777f]" onClick={onBack} type="button">← 프로젝트 대시보드</button>
        {content?.planningWorkflow ? <button className="text-sm font-semibold text-red-700" onClick={() => void cancelPlanning()} type="button">현재 작업 취소</button> : null}
      </div>
      <header className="mt-6 border-b border-black/6 pb-7">
        <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{project.name}</p>
        <h1 className="mt-2 text-3xl font-semibold">어떤 콘텐츠를 만들까요?</h1>
        <p className="mt-2 text-sm text-[#77777f]">원하는 결과를 자연스럽게 설명해 주세요. SEO나 프롬프트 용어를 알 필요가 없습니다.</p>
      </header>

      <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6">
        <textarea
          autoFocus
          className="min-h-32 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-4 leading-7 disabled:opacity-60"
          disabled={localWorking}
          onChange={(event) => {
            const value = event.target.value;
            setRequest(value);
            if (plan) {
              const analyzedRequest = content?.planningWorkflow?.request ?? content?.naturalLanguageRequest ?? "";
              const nextDirty = value !== analyzedRequest;
              setDirtyRequest(nextDirty);
              setNotice(nextDirty
                ? "요청이 변경되었습니다. 기존 추천은 보존되며, 원고를 만들기 전에 다시 분석해 주세요."
                : restoredNotice(content));
            }
          }}
          placeholder="예: 50대를 위한 혈당 관리 글을 만들고 싶어"
          value={request}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={localWorking || !request.trim()} onClick={() => void analyze(false, Boolean(plan))} type="button">{operation === "planning" ? "분석 중…" : workflowPending ? "분석 다시 시도" : dirtyRequest ? "변경 내용 다시 분석" : "분석하고 추천받기"}</button>
          <button className="rounded-xl border border-black/8 px-5 py-3 text-sm font-semibold disabled:opacity-50" disabled={localWorking || !request.trim()} onClick={() => void analyze(true, Boolean(plan))} type="button">직접 설정하기</button>
          {workflowPending ? <button className="rounded-xl border border-blue-200 px-5 py-3 text-sm font-semibold text-blue-800 disabled:opacity-50" disabled={localWorking} onClick={() => void onRefresh()} type="button">저장 상태 새로고침</button> : null}
        </div>
        <p aria-live="polite" className="mt-3 text-sm text-[#77777f]">{notice}</p>
        <p className="mt-3 text-xs text-[#92929a]">외부 데이터나 발행 계정이 없어도 AI 기획, 콘텐츠 생성과 편집은 계속할 수 있습니다. 외부 데이터가 없을 때는 블로그 성장 추천으로 사실대로 표시합니다. <Link className="font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/settings?section=data-sources`}>데이터 소스 관리</Link> · <Link className="font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/settings?section=connections`}>발행 연결 관리</Link></p>
      </section>

      {plan ? (
        <section aria-busy={operation === "regenerating"} className={`mt-6 rounded-[24px] border border-black/6 bg-white p-6 transition-opacity ${operation === "regenerating" ? "opacity-60" : ""}`}>
          <PrimaryKeywordConfirmation customKeyword={customKeyword} customKeywordSelected={customKeywordSelected} disabled={working || dirtyRequest} generatedOpportunityId={generatedOpportunityId} onCustomKeywordChange={setCustomKeyword} onReanalyzeCustom={() => { const constrainedRequest = `${request}\n사용자 지정 주제와 대표 키워드: ${customKeyword.trim()}. 이 주제와 같은 검색 의도 안에서 완전한 콘텐츠 기회를 구성해 줘.`; setRequest(constrainedRequest); void analyze(false, true, constrainedRequest, "userSpecified"); }} onSelectCandidate={(candidate: ContentOpportunityCandidate) => { void selectOpportunity(candidate); }} onSelectCustom={() => setCustomKeywordSelected(true)} opportunityCandidates={opportunityCandidates} plan={plan} request={request} selectedOpportunityId={opportunityId} />

          <details className="mt-3 rounded-xl border border-black/6 p-4">
            <summary className="cursor-pointer text-sm font-semibold">발행 계정 선택 (선택)</summary>
            {connected.length ? (
              <div className="mt-3 space-y-2">
                {connected.map((connection) => (
                  <label className="flex gap-3 rounded-xl border p-3 text-sm" key={connection.id}>
                    <input checked={selected.includes(connection.id)} disabled={working} onChange={() => setSelected(toggle(selected, connection.id))} type="checkbox" />
                    {connection.platform}: {connection.displayName}
                  </label>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-[#77777f]">연결된 계정이 없어도 이 키워드로 콘텐츠를 생성할 수 있습니다.</p>}
            <Link className="mt-3 inline-block text-sm font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/settings?section=connections`}>설정에서 플랫폼 연결 관리</Link>
          </details>
          <div className="mt-6 flex flex-wrap gap-2">
            <button className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={working} onClick={() => void analyze(false, true)} type="button">{operation === "regenerating" ? "추천 생성 중…" : dirtyRequest ? "변경 내용으로 추천 다시 생성" : "추천 다시 생성"}</button>
            <button className="rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={working || dirtyRequest || !confirmedOpportunity} onClick={() => void confirm(false)} type="button">이 기획으로 직접 작성</button>
            {content?.document ? <button className="rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-800 disabled:opacity-50" disabled={working || dirtyRequest || !confirmedOpportunity} onClick={() => void confirm(true, plan, request, confirmedOpportunity, "new")} type="button">기존 원고를 보존하고 새 Content로 생성</button> : null}
            <button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={working || dirtyRequest || !confirmedOpportunity} onClick={() => void confirm(true)} type="button">{operation === "generating" ? "원고 생성 중…" : "이 기획으로 원고 만들기"}</button>
          </div>
        </section>
      ) : null}
    </PageContainer>
  );
}

function operationCopy(operation: CreationOperation): Readonly<{ title: string; detail: string }> | undefined {
  if (operation === "planning") return { title: "요청을 분석하고 추천을 준비하고 있습니다.", detail: "검색 의도와 독자, 키워드, 콘텐츠 방향을 확인하고 있습니다." };
  if (operation === "regenerating") return { title: "AI 추천을 다시 생성하고 있습니다.", detail: "현재 추천은 그대로 유지됩니다. 완료된 뒤에만 새 추천으로 교체합니다." };
  if (operation === "generating") return { title: "원고를 생성하고 있습니다.", detail: "콘텐츠 구조와 SEO, 이미지, 링크, CTA를 구성하고 자동 품질검토를 진행합니다." };
  return undefined;
}

function workflowOperation(content: UserContent | undefined): CreationOperation {
  if (content?.planningWorkflow?.status === "planning") return content.planning ? "regenerating" : "planning";
  if (content?.planningWorkflow?.status === "generating") return "generating";
  return "idle";
}

function restoredNotice(content: UserContent | undefined): string {
  const workflow = content?.planningWorkflow;
  if (!workflow) return "";
  if (workflow.status === "planning") return content.planning
    ? "이전 추천을 유지한 채 재분석이 진행 중입니다. 완료 상태를 자동으로 확인합니다."
    : "저장된 Planning 요청을 불러왔습니다. 완료 상태를 자동으로 확인합니다.";
  if (workflow.status === "candidatesReady") return "저장된 Content Opportunity 후보를 복원했습니다.";
  if (workflow.status === "opportunitySelected") return "선택한 Content Opportunity와 후보 전체를 복원했습니다.";
  if (workflow.status === "opportunityConfirmed") return "확정된 Content Opportunity를 복원했습니다. 원고 생성을 이어갈 수 있습니다.";
  if (workflow.status === "generating") return "저장된 원고 생성 진행 상태를 복원했습니다. 완료 상태를 자동으로 확인합니다.";
  if (workflow.status === "generated") return "원고 생성이 완료된 상태를 복원했습니다.";
  if (workflow.status === "failed") return `${workflow.error ?? content?.generationError ?? "이전 작업에 실패했습니다."} 저장된 단계에서 다시 시도할 수 있습니다.`;
  return "저장된 Planning 작업을 복원했습니다.";
}

function workflowSignature(workflow: UserContent["planningWorkflow"]): string {
  return workflow ? JSON.stringify(workflow) : "";
}

function toggle(values: readonly string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}
