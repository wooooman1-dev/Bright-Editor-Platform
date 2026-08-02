"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ApprovalEvidenceSource, SiteApprovalReadinessSnapshot } from "../../core/approval";
import type { ContentDocument } from "../../core/content";
import { editorialRevisionId, isStandardQualityApproved, type QualityReport } from "../../core/quality";
import { approvalReadinessInspectionVersion } from "../application/approval/ApprovalReadinessExecutionIdentity";
import { contentOwnedIdentityContamination } from "../application/publishing/ContentOwnedIdentityPolicy";
import {
  internalLinkCatalogContextIsCurrent,
  internalLinkCatalogContextKey,
  publishingCategoryIdentities,
} from "../application/publishing/InternalLinkCatalogPolicy";
import type { UserContent, UserData } from "./user-data";

export type ApprovalReadinessAutoRunDecision = Readonly<{
  currentRevisionId: string;
  publishingContextKey: string;
  hasStoredResult: boolean;
  shouldRun: boolean;
  sources: readonly ApprovalEvidenceSource[];
  evidenceSummary?: ApprovalEvidenceSummary;
}>;

type ApprovalEvidenceSummary = Readonly<{
  status: "verified" | "needs_review" | "missing";
  coverageStatus?: "verified" | "needs_review" | "missing";
  reviewedAt?: string;
  informationAsOf?: string;
  presentationStatus?: "ready" | "conflict" | "not_projected";
}>;

const legacyWordPressSiteReadinessKeys = new Set([
  "theme_plugin_review",
  "mobile_visual_review",
  "performance_review",
  "copyright_review",
  "site_quality_consistency",
  "search_console_review",
  "adsense_external_approval",
]);

export function isCurrentSiteReadinessSnapshot(snapshot: SiteApprovalReadinessSnapshot | undefined): boolean {
  if (!snapshot?.checkedAt) return false;
  return snapshot.checks.every((check) => check.requirement !== "manual" && !legacyWordPressSiteReadinessKeys.has(check.key));
}

export function approvalReadinessIdentityContamination(data: UserData | undefined, contentId: string): readonly string[] {
  if (!data?.workspace) return Object.freeze([]);
  const content = data.contents.find((item) => item.id === contentId && item.workspaceId === data.workspace?.id);
  if (!content) return Object.freeze([]);
  const project = data.projects.find((item) => item.id === content.projectId && item.workspaceId === data.workspace?.id);
  return project ? contentOwnedIdentityContamination(data, project, content) : Object.freeze([]);
}

export function approvalReadinessAutoRunDecision(content: UserContent | undefined): ApprovalReadinessAutoRunDecision {
  if (!content?.document) return Object.freeze({ currentRevisionId: "", publishingContextKey: "", hasStoredResult: false, shouldRun: false, sources: Object.freeze([]) });
  const approvalContent = content as UserContent & Readonly<{ contentPurpose?: string }>;
  const currentRevisionId = editorialRevisionId(content.document);
  const publishingContextKey = internalLinkCatalogContextKey(content);
  const evidence = content.document.metadata?.approvalEvidence;
  const siteReadiness = content.document.metadata?.siteApprovalReadiness;
  const execution = content.document.metadata?.approvalReadinessExecution;
  const hasStoredResult = execution?.version === approvalReadinessInspectionVersion
    && evidence?.reviewedRevisionId === currentRevisionId
    && isCurrentSiteReadinessSnapshot(siteReadiness)
    && internalLinkCatalogContextIsCurrent(content, content.document)
    && execution.status === "completed"
    && execution.editorialRevisionId === currentRevisionId
    && execution.publishingContextKey === publishingContextKey;
  const qualityIsCurrent = content.quality !== undefined
    && isStandardQualityApproved(content.quality)
    && content.quality.reviewedRevisionId === currentRevisionId;
  return Object.freeze({
    currentRevisionId,
    publishingContextKey,
    hasStoredResult,
    shouldRun: approvalContent.contentPurpose === "adsense_approval" && !hasStoredResult && qualityIsCurrent && publishingContextIsFinalized(content),
    sources: Object.freeze([...(evidence?.sources ?? [])]),
    ...(evidence ? { evidenceSummary: Object.freeze({ status: evidence.status, coverageStatus: evidence.coverageStatus, reviewedAt: evidence.reviewedAt, informationAsOf: evidence.informationAsOf, presentationStatus: evidence.presentationStatus }) } : {}),
  });
}

export function ApprovalReadinessActions(props: Readonly<{
  workspaceId: string;
  contentId: string;
  disabled?: boolean;
  inspectionKey?: string;
  onCompleted: (result: Readonly<{ data: UserData; document: ContentDocument; quality: QualityReport }>) => Promise<void> | void;
}>) {
  const [state, setState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [sources, setSources] = useState<readonly ApprovalEvidenceSource[]>([]);
  const [summary, setSummary] = useState<ApprovalEvidenceSummary>();
  const [stored, setStored] = useState(false);
  const [identityContamination, setIdentityContamination] = useState<readonly string[]>([]);
  const running = useRef(false);
  const inspected = useRef("");
  const onCompleted = useRef(props.onCompleted);
  useEffect(() => { onCompleted.current = props.onCompleted; }, [props.onCompleted]);

  const execute = useCallback(async (trigger: "automatic" | "manual") => {
    if (running.current) return;
    running.current = true;
    setState("running");
    setMessage(trigger === "automatic" ? "현재 문서 버전의 공식 출처와 공개 사이트를 자동 검사하고 있습니다." : "공식 출처와 공개 사이트를 다시 검사하고 있습니다.");
    try {
      const response = await fetch("/api/approval/readiness", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: props.workspaceId, contentId: props.contentId }) });
      const result = await response.json() as { data?: UserData; document?: ContentDocument; quality?: QualityReport; evidence?: { status: ApprovalEvidenceSummary["status"]; coverageStatus?: ApprovalEvidenceSummary["coverageStatus"]; reviewedAt?: string; informationAsOf?: string; presentationStatus?: ApprovalEvidenceSummary["presentationStatus"]; verifiedSourceCount: number; rejectedSourceCount: number; sources: readonly ApprovalEvidenceSource[] }; siteReadiness?: { status: "passed" | "needs_review" | "blocked" }; error?: string };
      if (!response.ok || !result.data || !result.document || !result.quality) throw new Error(result.error ?? "승인 준비 검사를 완료하지 못했습니다.");
      await onCompleted.current({ data: result.data, document: result.document, quality: result.quality });
      setSources(result.evidence?.sources ?? []);
      setSummary(result.evidence ? { status: result.evidence.status, coverageStatus: result.evidence.coverageStatus, reviewedAt: result.evidence.reviewedAt, informationAsOf: result.evidence.informationAsOf, presentationStatus: result.evidence.presentationStatus } : undefined);
      setStored(true);
      setState("success");
      const evidenceLabel = result.evidence?.status === "verified" ? `공식 출처 ${result.evidence.verifiedSourceCount}개 검증 완료` : result.evidence?.status === "missing" ? "공식 출처 없음" : `공식 출처 확인 필요 ${result.evidence?.rejectedSourceCount ?? 0}개`;
      setMessage(`${trigger === "automatic" ? "자동 검사 완료" : "저장 결과 확인 완료"} · ${evidenceLabel}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "승인 준비 검사를 완료하지 못했습니다.");
    } finally { running.current = false; }
  }, [props.contentId, props.workspaceId]);

  useEffect(() => {
    if (props.disabled || running.current) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void fetch("/api/studio", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) throw new Error(`응답 상태 ${response.status}`);
        return response.json() as Promise<{ data?: UserData }>;
      }).then((result) => {
        if (!active) return;
        const content = result.data?.contents.find((item) => item.id === props.contentId);
        const contamination = approvalReadinessIdentityContamination(result.data, props.contentId);
        const decision = approvalReadinessAutoRunDecision(content);
        const key = [approvalReadinessInspectionVersion, props.contentId, props.inspectionKey ?? "", decision.currentRevisionId, decision.publishingContextKey, content?.document?.metadata?.approvalReadinessExecution?.version ?? "legacy", decision.shouldRun ? "run" : "hold"].join(":");
        if (inspected.current === key) return;
        inspected.current = key;
        setIdentityContamination(contamination);
        setSources(decision.sources);
        setSummary(decision.evidenceSummary);
        setStored(decision.hasStoredResult);
        if (decision.hasStoredResult) setMessage((current) => current || "저장된 현재 문서 버전의 승인 준비 검사 결과를 표시하고 있습니다.");
        if (decision.shouldRun && contamination.length === 0) void execute("automatic");
      }).catch((error) => { if (active) { setState("error"); setMessage(`자동 승인 준비 상태를 확인하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`); } });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); };
  }, [execute, props.contentId, props.disabled, props.inspectionKey]);

  const identityBlocked = identityContamination.length > 0;
  return <div className="flex w-full flex-col items-end gap-2">
    {identityBlocked ? <p className="w-full rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">기존 기획 또는 원고에 프로젝트명·브랜드명이 포함되어 자동 검사를 중단했습니다: {identityContamination.join(", ")}</p> : null}
    <button className="rounded-xl border border-[#ff6b6b] bg-white px-4 py-2.5 text-sm font-semibold text-[#d94f4f] disabled:opacity-50" disabled={props.disabled || state === "running" || identityBlocked} onClick={() => void execute("manual")} type="button">{state === "running" ? "승인 준비 검사 중…" : stored ? "승인 준비 다시 검사" : "승인 준비 검사 실행"}</button>
    <p className="max-w-[640px] text-right text-xs text-[#77777f]">자동 검사는 공개 사이트 상태를 진단하며 애드센스 승인을 보장하지 않습니다.</p>
    {message ? <p aria-live="polite" className={`max-w-[640px] text-right text-xs ${state === "error" ? "text-red-700" : state === "success" ? "text-emerald-700" : "text-[#77777f]"}`}>{message}</p> : null}
    {sources.length ? <details className="mt-2 w-full rounded-xl border border-black/6 bg-[#fafafa] p-4 text-left">
      <summary className="cursor-pointer text-sm font-semibold">공식 출처 검증 결과 {sources.length}개</summary>
      {summary ? <p className="mt-2 text-xs text-[#66666f]">필수 Claim coverage: {summary.coverageStatus ?? summary.status} · Claim 최종 검토일: {summary.reviewedAt?.slice(0, 10) ?? "미완료"} · 원고 정보 기준일: {summary.informationAsOf ?? "미기록"}</p> : null}
      <div className="mt-3 space-y-2">{sources.map((source, index) => <article className="rounded-xl bg-white p-3 text-xs" key={`${source.sourceId}-${index}`}><div className="flex justify-between gap-3"><strong>{source.title || source.publisher || `공식 출처 ${index + 1}`}</strong><span>{source.verified ? "검증 완료" : source.verificationStatus === "fact_mismatch" ? "Claim 불일치" : "검토 필요"}</span></div><a className="mt-2 block break-all text-blue-700 underline" href={source.url} rel="noreferrer" target="_blank">{source.url}</a>{source.failureReason ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-amber-900">{source.failureReason}</p> : null}</article>)}</div>
    </details> : null}
  </div>;
}

function publishingContextIsFinalized(content: UserContent): boolean {
  const accountId = content.publishingAccountId?.trim();
  if (!accountId) return false;
  if (content.platform === "wordpress") {
    const preparation = content.publishingPreparation?.wordpress;
    return Boolean(preparation && preparation.publishingAccountId === accountId && publishingCategoryIdentities(content).length > 0);
  }
  if (content.platform === "tistory") return content.publishingPreparation?.tistory?.publishingAccountId === accountId;
  return false;
}
