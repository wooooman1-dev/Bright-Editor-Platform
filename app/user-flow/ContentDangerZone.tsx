"use client";

import { useState } from "react";

import type { UserData } from "./user-data";

type ContentDeletionImpact = Readonly<{
  contentId: string;
  projectId: string;
  title: string;
  historyCount: number;
  qualityReportCount: number;
  publishingRecordCount: number;
  scheduledPublishingCount: number;
  mediaMetadataCount: number;
  externalPostsDeleted: false;
}>;

export function ContentDangerZone({
  contentId,
  disabled,
  onDeleted,
  onDeletingChange,
  workspaceId,
}: {
  contentId: string;
  disabled: boolean;
  onDeleted: (data: UserData) => Promise<void>;
  onDeletingChange: (active: boolean) => void;
  workspaceId: string;
}) {
  const [impact, setImpact] = useState<ContentDeletionImpact>();
  const [confirmationTitle, setConfirmationTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);

  const loadImpact = async () => {
    setWorking(true);
    setNotice("");
    try {
      const result = await request({ action: "content-deletion-impact", input: { workspaceId, contentId } }) as { impact?: ContentDeletionImpact; error?: string };
      if (!result.impact) throw new Error(result.error ?? "삭제 영향도를 확인하지 못했습니다.");
      setImpact(result.impact);
      setConfirmationTitle("");
    } catch (error) {
      setNotice(message(error));
    } finally {
      setWorking(false);
    }
  };

  const deleteContent = async () => {
    if (!impact || confirmationTitle.trim() !== impact.title) return;
    setWorking(true);
    onDeletingChange(true);
    setNotice("콘텐츠를 백업한 뒤 삭제하고 있습니다.");
    try {
      const result = await request({
        action: "delete-content",
        input: { workspaceId, contentId, confirmationTitle },
      }) as { data?: UserData; backupFileName?: string; error?: string };
      if (!result.data) throw new Error(result.error ?? "콘텐츠를 삭제하지 못했습니다.");
      await onDeleted(result.data);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setWorking(false);
      onDeletingChange(false);
    }
  };

  return (
    <section className="mt-8 rounded-[24px] border border-red-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-red-800">콘텐츠 삭제</h2>
      <p className="mt-2 text-sm text-[#66666f]">
        Bright Studio의 현재 콘텐츠와 연결된 Revision·품질·예약·발행 기록을 삭제합니다. 외부 Tistory 글은 삭제하지 않습니다.
      </p>

      {!impact ? (
        <button
          className="mt-4 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
          disabled={disabled || working}
          onClick={() => void loadImpact()}
          type="button"
        >
          {working ? "영향도 확인 중…" : "콘텐츠 삭제"}
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">삭제 영향도</p>
          <ul className="mt-2 space-y-1">
            <li>현재 콘텐츠 1개</li>
            <li>Revision {impact.historyCount}개</li>
            <li>품질 보고서 {impact.qualityReportCount}개</li>
            <li>발행 기록 {impact.publishingRecordCount}개</li>
            <li>예약 발행 {impact.scheduledPublishingCount}개</li>
            <li>연결 미디어 {impact.mediaMetadataCount}개</li>
            <li>외부 Tistory 글 삭제: 없음</li>
          </ul>
          <p className="mt-3">삭제 전 로컬 백업이 자동 생성됩니다.</p>
          <label className="mt-4 block font-semibold">
            삭제 확인을 위해 제목을 정확히 입력해 주세요.
            <input
              className="mt-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 font-normal"
              disabled={working}
              onChange={(event) => setConfirmationTitle(event.target.value)}
              placeholder={impact.title}
              value={confirmationTitle}
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
              disabled={working || confirmationTitle.trim() !== impact.title}
              onClick={() => void deleteContent()}
              type="button"
            >
              {working ? "백업 후 삭제 중…" : "백업 후 콘텐츠 삭제"}
            </button>
            <button
              className="rounded-lg border bg-white px-4 py-2.5 font-semibold disabled:opacity-50"
              disabled={working}
              onClick={() => { setImpact(undefined); setConfirmationTitle(""); setNotice(""); }}
              type="button"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {notice ? <p aria-live="polite" className="mt-3 text-sm text-red-800">{notice}</p> : null}
    </section>
  );
}

async function request(body: unknown): Promise<unknown> {
  const response = await fetch("/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "요청을 처리하지 못했습니다.");
  return result;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
