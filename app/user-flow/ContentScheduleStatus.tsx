"use client";

import { useState } from "react";

import {
  contentSchedulePresentation,
  contentSchedules,
  partitionContentSchedules,
  type ContentSchedulePresentation,
} from "./content-schedule-ui";
import type { UserData } from "./user-data";

const toneClassName: Readonly<Record<ContentSchedulePresentation["statusTone"], string>> = {
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
  neutral: "bg-[#f3f3f5] text-[#55555f] border-black/6",
};

/**
 * Read-only view of the schedules registered for the current Content. Editing
 * and cancelling a registered schedule are external writes and are not offered
 * here. Clearing finished history only removes local records.
 */
export function ContentScheduleStatus({ contentId, data, onCleared, projectId }: Readonly<{
  contentId: string;
  data: UserData;
  onCleared?: (data: UserData) => Promise<void>;
  projectId: string;
}>) {
  const [showFinished, setShowFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const { active, finished } = partitionContentSchedules(contentSchedules(data.scheduledPublishing, contentId));
  if (!active.length && !finished.length) return null;

  const clearFinished = async () => {
    if (!window.confirm(
      `지난 예약 기록 ${finished.length}건을 삭제할까요? 플랫폼에 등록된 글은 삭제되지 않으며, 진행 중인 예약은 그대로 유지됩니다.`,
    )) return;
    setBusy(true);
    setNotice("지난 예약 기록을 정리하고 있습니다.");
    try {
      const response = await fetch("/api/publishing/schedules/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.workspace?.id, projectId, contentId }),
      });
      const result = await response.json() as { removed?: number; data?: UserData; error?: string };
      if (!response.ok) throw new Error(result.error ?? "예약 기록을 정리하지 못했습니다.");
      if (result.data) await onCleared?.(result.data);
      setNotice(`지난 예약 기록 ${result.removed ?? 0}건을 삭제했습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "예약 기록을 정리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">예약 발행 상태</h2>
      <p className="text-xs text-[#92929a]">예약 취소와 시간 변경은 각 플랫폼에서 직접 처리해 주세요.</p>
    </div>

    {active.length ? <ul className="mt-4 space-y-3">
      {active.map((schedule) => <ScheduleRow key={schedule.id} view={contentSchedulePresentation(schedule)} />)}
    </ul> : <p className="mt-4 rounded-xl bg-[#f8f8fa] p-4 text-sm text-[#77777f]">진행 중인 예약이 없습니다.</p>}

    {finished.length ? <div className="mt-5 border-t border-black/6 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="text-sm font-semibold underline" onClick={() => setShowFinished(!showFinished)} type="button">
          지난 예약 기록 {finished.length}건 {showFinished ? "접기" : "보기"}
        </button>
        <button className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={() => void clearFinished()} type="button">
          지난 기록 삭제
        </button>
      </div>
      {showFinished ? <ul className="mt-3 space-y-3">
        {finished.map((schedule) => <ScheduleRow key={schedule.id} view={contentSchedulePresentation(schedule)} />)}
      </ul> : null}
    </div> : null}

    {notice ? <p aria-live="polite" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p> : null}
  </section>;
}

function ScheduleRow({ view }: Readonly<{ view: ContentSchedulePresentation }>) {
  return <li className={`rounded-xl border p-4 ${view.active ? "" : "opacity-70"}`}>
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold">{view.platformLabel}</span>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClassName[view.statusTone]}`}>{view.statusLabel}</span>
      <span className="rounded-full bg-[#f8f8fa] px-3 py-1 text-xs font-semibold text-[#66666f]">{view.postStatusLabel}</span>
    </div>
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-[#92929a]">예약 시각</dt><dd className="mt-1 break-words">{view.scheduledLabel}</dd></div>
      {view.externalUrl ? <div><dt className="text-xs text-[#92929a]">외부 링크</dt><dd className="mt-1 break-all"><a className="underline" href={view.externalUrl} rel="noreferrer noopener" target="_blank">{view.externalUrl}</a></dd></div> : null}
    </dl>
    {view.failureReason ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">{view.failureReason}</p> : null}
  </li>;
}
