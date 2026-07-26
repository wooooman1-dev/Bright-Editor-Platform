"use client";

import { useEffect, useState } from "react";

import {
  draftOutcomePresentation,
  projectOutcomeDestination,
  readDraftRequestContext,
  reverifyRequestBody,
  type TistoryDraftOutcomeStatus,
  type TistoryDraftRequestContext,
} from "./tistory-draft-outcome-ui";

type DraftOutcome = Readonly<{
  status: TistoryDraftOutcomeStatus;
  diagnosticCode?: string;
  editorUrl?: string;
  canReverify: boolean;
  canRetrySave: boolean;
}>;

type DraftOutcomePayload = Readonly<{
  outcome?: DraftOutcome;
  result?: Readonly<Record<string, unknown>>;
  error?: string;
}>;

type OutcomeCardState = Readonly<{
  outcome: DraftOutcome;
  result?: Readonly<Record<string, unknown>>;
  context: TistoryDraftRequestContext;
}>;

export function TistoryDraftOutcomeOverlay() {
  const [card, setCard] = useState<OutcomeCardState>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const context = readDraftRequestContext(input, init);
      const response = await originalFetch(input, init);
      if (context) {
        void response.clone().json().then((payload: DraftOutcomePayload) => {
          if (isDraftOutcome(payload.outcome)) {
            setActionError("");
            setCard({ outcome: payload.outcome, result: payload.result, context });
          }
        }).catch(() => undefined);
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  useEffect(() => {
    if (!card) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = priorOverflow; };
  }, [card]);

  if (!card) return null;

  const presentation = draftOutcomePresentation(card.outcome.status);
  const detail = card.outcome.status === "verified" ? "" : outcomeDetail(card.result, card.outcome.diagnosticCode);
  const tone = toneClasses(presentation.tone);

  const executePrimary = async () => {
    if (presentation.primaryAction === "continue") {
      if (card.outcome.status === "verified") {
        window.location.assign(projectOutcomeDestination(card.context, window.location.href));
      } else {
        window.location.reload();
      }
      return;
    }

    setBusy(true);
    setActionError("");
    try {
      const body = presentation.primaryAction === "reverify"
        ? reverifyRequestBody(card.context)
        : card.context;
      const response = await fetch("/api/tistory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as DraftOutcomePayload;
      if (!isDraftOutcome(payload.outcome)) throw new Error(payload.error ?? "Tistory 결과를 확인하지 못했습니다.");
      setCard({ outcome: payload.outcome, result: payload.result, context: card.context });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Tistory 작업을 다시 실행하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return <div aria-labelledby="tistory-draft-outcome-title" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog">
    <section className="w-full max-w-xl rounded-[24px] bg-white p-6 shadow-2xl sm:p-7">
      <div className={`rounded-2xl border p-5 ${tone.container}`}>
        <p className={`text-xs font-bold uppercase tracking-[0.12em] ${tone.eyebrow}`}>Tistory Draft</p>
        <h2 className="mt-2 text-xl font-semibold" id="tistory-draft-outcome-title">{presentation.title}</h2>
        <p className="mt-3 text-sm leading-6">{presentation.message}</p>
        {detail ? <p className={`mt-3 rounded-xl px-3 py-2 text-xs leading-5 ${tone.detail}`}>{detail}</p> : null}
      </div>

      {actionError ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{actionError}</p> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        <button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void executePrimary()} type="button">
          {busy ? "확인 중…" : presentation.primaryLabel}
        </button>
        {card.outcome.editorUrl ? <a className="rounded-xl border px-4 py-2.5 text-sm font-semibold" href={card.outcome.editorUrl} rel="noreferrer" target="_blank">Tistory 화면 열기</a> : null}
        {presentation.primaryAction !== "continue" ? <button className="rounded-xl border px-4 py-2.5 text-sm" disabled={busy} onClick={() => window.location.reload()} type="button">닫고 계속 편집</button> : null}
      </div>

      {card.outcome.status === "saved_unverified" || card.outcome.status === "duplicate_existing"
        ? <p className="mt-4 text-xs leading-5 text-[#77777f]">중복 임시글을 막기 위해 재확인 전에는 같은 원고를 다시 저장하지 않습니다.</p>
        : null}
    </section>
  </div>;
}

function isDraftOutcome(value: unknown): value is DraftOutcome {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DraftOutcome>;
  return isOutcomeStatus(candidate.status)
    && typeof candidate.canReverify === "boolean"
    && typeof candidate.canRetrySave === "boolean";
}

function isOutcomeStatus(value: unknown): value is TistoryDraftOutcomeStatus {
  return value === "verified"
    || value === "saved_unverified"
    || value === "duplicate_existing"
    || value === "diagnosed"
    || value === "failed";
}

function outcomeDetail(result: Readonly<Record<string, unknown>> | undefined, diagnosticCode: string | undefined): string {
  const error = typeof result?.error === "string" ? result.error.trim() : "";
  const failedStep = typeof result?.failedStep === "string" ? result.failedStep.trim() : "";
  return [error, failedStep ? `단계: ${failedStep}` : "", diagnosticCode ? `진단: ${diagnosticCode}` : ""].filter(Boolean).join(" · ");
}

function toneClasses(tone: "success" | "warning" | "error" | "info") {
  if (tone === "success") return { container: "border-emerald-200 bg-emerald-50 text-emerald-950", eyebrow: "text-emerald-700", detail: "bg-white/75 text-emerald-900" };
  if (tone === "warning") return { container: "border-amber-200 bg-amber-50 text-amber-950", eyebrow: "text-amber-700", detail: "bg-white/75 text-amber-900" };
  if (tone === "error") return { container: "border-red-200 bg-red-50 text-red-950", eyebrow: "text-red-700", detail: "bg-white/75 text-red-900" };
  return { container: "border-blue-200 bg-blue-50 text-blue-950", eyebrow: "text-blue-700", detail: "bg-white/75 text-blue-900" };
}
