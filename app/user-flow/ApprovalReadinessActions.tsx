"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ApprovalEvidenceSource } from "../../core/approval";
import type { ContentDocument } from "../../core/content";
import { contentRevisionId, isStandardQualityApproved, type QualityReport } from "../../core/quality";
import type { UserContent, UserData } from "./user-data";

export type ApprovalReadinessAutoRunDecision = Readonly<{
  currentRevisionId: string;
  hasStoredResult: boolean;
  shouldRun: boolean;
  sources: readonly ApprovalEvidenceSource[];
}>;

export function approvalReadinessAutoRunDecision(
  content: UserContent | undefined,
): ApprovalReadinessAutoRunDecision {
  if (!content?.document) {
    return Object.freeze({ currentRevisionId: "", hasStoredResult: false, shouldRun: false, sources: Object.freeze([]) });
  }

  const approvalContent = content as UserContent & Readonly<{ contentPurpose?: string }>;
  const currentRevisionId = contentRevisionId(content.document);
  const evidence = content.document.metadata?.approvalEvidence;
  const siteReadiness = content.document.metadata?.siteApprovalReadiness;
  const hasStoredResult = evidence?.reviewedRevisionId === currentRevisionId && Boolean(siteReadiness?.checkedAt);
  const qualityIsCurrent = content.quality !== undefined
    && isStandardQualityApproved(content.quality)
    && content.quality.reviewedRevisionId === currentRevisionId;

  return Object.freeze({
    currentRevisionId,
    hasStoredResult,
    shouldRun: approvalContent.contentPurpose === "adsense_approval" && qualityIsCurrent && !hasStoredResult,
    sources: Object.freeze([...(evidence?.sources ?? [])]),
  });
}

export function ApprovalReadinessActions(props: Readonly<{
  workspaceId: string;
  contentId: string;
  disabled?: boolean;
  onCompleted: (result: Readonly<{
    data: UserData;
    document: ContentDocument;
    quality: QualityReport;
  }>) => Promise<void> | void;
}>) {
  const [state, setState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [sources, setSources] = useState<readonly ApprovalEvidenceSource[]>([]);
  const [hasStoredResult, setHasStoredResult] = useState(false);
  const runningRef = useRef(false);
  const inspectedKeyRef = useRef("");
  const onCompletedRef = useRef(props.onCompleted);

  useEffect(() => {
    onCompletedRef.current = props.onCompleted;
  }, [props.onCompleted]);

  const execute = useCallback(async (trigger: "automatic" | "manual") => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState("running");
    setMessage(trigger === "automatic"
      ? "현재 문서 버전의 공식 출처와 공개 사이트를 자동 검사하고 있습니다."
      : "공식 출처와 공개 사이트를 다시 검사하고 있습니다.");
    try {
      const response = await fetch("/api/approval/readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: props.workspaceId,
          contentId: props.contentId,
        }),
      });
      const result = await response.json() as {
        data?: UserData;
        document?: ContentDocument;
        quality?: QualityReport;
        evidence?: Readonly<{
          status: "verified" | "needs_review" | "missing";
          reviewedAt?: string;
          verifiedSourceCount: number;
          rejectedSourceCount: number;
          reasons: readonly string[];
          sources: readonly ApprovalEvidenceSource[];
        }>;
        siteReadiness?: Readonly<{ status: "passed" | "needs_review" | "blocked" }>;
        error?: string;
      };
      if (!response.ok || !result.data || !result.document || !result.quality) {
        throw new Error(result.error ?? "승인 준비 검사를 완료하지 못했습니다.");
      }

      await onCompletedRef.current({
        data: result.data,
        document: result.document,
        quality: result.quality,
      });
      setSources(result.evidence?.sources ?? []);
      setHasStoredResult(true);
      const evidenceLabel = result.evidence?.status === "verified"
        ? `공식 출처 ${result.evidence.verifiedSourceCount}개 검증 완료`
        : result.evidence?.status === "missing"
          ? "공식 출처 후보 없음"
          : `공식 출처 확인 필요 ${result.evidence?.rejectedSourceCount ?? 0}개`;
      const siteLabel = result.siteReadiness?.status === "passed"
        ? "사이트 자동 검사 통과"
        : result.siteReadiness?.status === "blocked"
          ? "사이트 자동 검사 차단 항목 있음"
          : "사이트 자동 검사 항목 확인 필요";
      setState("success");
      setMessage(`${trigger === "automatic" ? "자동 검사 완료 · " : "재검사 완료 · "}${evidenceLabel} · ${siteLabel}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "승인 준비 검사를 완료하지 못했습니다.");
    } finally {
      runningRef.current = false;
    }
  }, [props.contentId, props.workspaceId]);

  useEffect(() => {
    if (props.disabled || runningRef.current) return;
    let active = true;

    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`응답 상태 ${response.status}`);
        return response.json() as Promise<{ data?: UserData }>;
      })
      .then((result) => {
        if (!active) return;
        const content = result.data?.contents.find((item) => item.id === props.contentId);
        const decision = approvalReadinessAutoRunDecision(content);
        setSources(decision.sources);
        setHasStoredResult(decision.hasStoredResult);
        if (decision.hasStoredResult) {
          setMessage((current) => current || "저장된 현재 문서 버전의 승인 준비 검사 결과를 표시하고 있습니다.");
        }

        const inspectedKey = [
          props.contentId,
          decision.currentRevisionId,
          content?.document?.metadata?.approvalEvidence?.reviewedRevisionId ?? "",
          content?.document?.metadata?.siteApprovalReadiness?.checkedAt ?? "",
          decision.shouldRun ? "run" : "hold",
        ].join(":");
        if (inspectedKeyRef.current === inspectedKey) return;
        inspectedKeyRef.current = inspectedKey;
        if (decision.shouldRun) void execute("automatic");
      })
      .catch((error) => {
        if (!active) return;
        setState("error");
        setMessage(`자동 승인 준비 상태를 확인하지 못했습니다: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
      });

    return () => {
      active = false;
    };
  }, [execute, props.contentId, props.disabled]);

  return <div className="flex w-full flex-col items-end gap-2">
    <button
      className="rounded-xl border border-[#ff6b6b] bg-white px-4 py-2.5 text-sm font-semibold text-[#d94f4f] disabled:opacity-50"
      disabled={props.disabled || state === "running"}
      onClick={() => void execute("manual")}
      type="button"
    >
      {state === "running" ? "승인 준비 검사 중…" : hasStoredResult ? "승인 준비 다시 검사" : "승인 준비 검사 실행"}
    </button>
    <p className="max-w-[640px] text-right text-xs leading-5 text-[#77777f]">
      자동 검사는 공개 사이트의 승인 준비 상태를 진단하며 구글 애드센스 승인을 보장하지 않습니다.
    </p>
    {message ? <p aria-live="polite" className={`max-w-[640px] text-right text-xs ${state === "error" ? "text-red-700" : state === "success" ? "text-emerald-700" : "text-[#77777f]"}`}>{message}</p> : null}
    {sources.length ? <details className="mt-2 w-full rounded-xl border border-black/6 bg-[#fafafa] p-4 text-left">
      <summary className="cursor-pointer text-sm font-semibold">공식 출처 후보 상세 진단 {sources.length}개</summary>
      <div className="mt-4 grid gap-3">
        {sources.map((source, index) => <article className="rounded-xl border border-black/6 bg-white p-4" key={`${source.sourceId}-${index}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="break-words text-sm font-semibold">{source.title || source.publisher || `출처 후보 ${index + 1}`}</h4>
              <p className="mt-1 text-xs text-[#77777f]">{source.publisher || "발행 기관 미확인"}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${source.verified ? "bg-emerald-50 text-emerald-800" : source.verificationStatus === "duplicate_source" ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-900"}`}>{evidenceStatusLabel(source)}</span>
          </div>
          <a className="mt-3 block break-all text-xs text-blue-700 underline" href={source.url} rel="noreferrer" target="_blank">{source.url}</a>
          <dl className="mt-3 grid gap-1 text-xs text-[#66666f] sm:grid-cols-2">
            <div><dt className="inline font-semibold">공식 기관: </dt><dd className="inline">{source.official === true ? "확인" : source.official === false ? "미확인" : "판정 전"}</dd></div>
            <div><dt className="inline font-semibold">응답 상태: </dt><dd className="inline">{source.httpStatus ?? "미확인"}</dd></div>
            <div><dt className="inline font-semibold">자료 형식: </dt><dd className="inline break-all">{source.contentType || "미확인"}</dd></div>
            <div><dt className="inline font-semibold">본문 채택: </dt><dd className="inline">{source.selected ? "예" : "아니요"}</dd></div>
          </dl>
          {source.matchedFacts?.length ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900"><strong>일치 사실</strong><ul className="mt-1 space-y-1">{source.matchedFacts.map((fact, factIndex) => <li key={`${source.sourceId}-fact-${factIndex}`}>• {fact.field}: {fact.value}</li>)}</ul></div> : null}
          {source.failureReason ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{source.failureReason}</p> : null}
        </article>)}
      </div>
    </details> : null}
  </div>;
}

function evidenceStatusLabel(source: ApprovalEvidenceSource): string {
  switch (source.verificationStatus) {
    case "verified": return "검증 완료";
    case "duplicate_source": return "중복 출처";
    case "unreachable": return "접근 실패";
    case "unsupported_content_type": return "지원하지 않는 형식";
    case "unofficial_source": return "공식 출처 미확인";
    case "fact_mismatch": return "사실 불일치";
    case "excluded": return "사용 제외";
    default: return source.verified ? "검증 완료" : "검토 필요";
  }
}
