"use client";

import { useState } from "react";

import type { ContentDocument } from "../../core/content";
import type { QualityReport } from "../../core/quality";
import type { UserData } from "./user-data";

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

  const execute = async () => {
    setState("running");
    setMessage("공식 출처와 공개 사이트를 검사하고 있습니다.");
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
          verifiedSourceCount: number;
          rejectedSourceCount: number;
          reasons: readonly string[];
        }>;
        siteReadiness?: Readonly<{ status: "passed" | "needs_review" | "blocked" }>;
        error?: string;
      };
      if (!response.ok || !result.data || !result.document || !result.quality) {
        throw new Error(result.error ?? "승인 준비 검사를 완료하지 못했습니다.");
      }

      await props.onCompleted({
        data: result.data,
        document: result.document,
        quality: result.quality,
      });
      const evidenceLabel = result.evidence?.status === "verified"
        ? `공식 출처 ${result.evidence.verifiedSourceCount}개 검증 완료`
        : result.evidence?.status === "missing"
          ? "공식 출처 후보 없음"
          : `공식 출처 검토 필요 ${result.evidence?.rejectedSourceCount ?? 0}개`;
      const siteLabel = result.siteReadiness?.status === "passed"
        ? "사이트 검사 통과"
        : result.siteReadiness?.status === "blocked"
          ? "사이트 차단 항목 있음"
          : "사이트 검토 필요";
      setState("success");
      setMessage(`${evidenceLabel} · ${siteLabel}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "승인 준비 검사를 완료하지 못했습니다.");
    }
  };

  return <div className="flex flex-col items-end gap-2">
    <button
      className="rounded-xl border border-[#ff6b6b] bg-white px-4 py-2.5 text-sm font-semibold text-[#d94f4f] disabled:opacity-50"
      disabled={props.disabled || state === "running"}
      onClick={() => void execute()}
      type="button"
    >
      {state === "running" ? "승인 준비 검사 중…" : "승인 준비 검사 실행"}
    </button>
    {message ? <p aria-live="polite" className={`max-w-[440px] text-right text-xs ${state === "error" ? "text-red-700" : state === "success" ? "text-emerald-700" : "text-[#77777f]"}`}>{message}</p> : null}
  </div>;
}
