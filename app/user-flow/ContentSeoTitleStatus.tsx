"use client";

import { buildReadableSeoTitle } from "../../core/content";

export function ContentSeoTitleStatus({
  currentTitle,
  disabled,
  onApply,
  primaryKeyword,
}: {
  currentTitle: string;
  disabled: boolean;
  onApply: (title: string) => Promise<void>;
  primaryKeyword?: string;
}) {
  const keyword = primaryKeyword?.trim() ?? "";
  if (!keyword) return null;

  const included = currentTitle.toLocaleLowerCase("ko-KR").includes(keyword.toLocaleLowerCase("ko-KR"));
  if (included) {
    return (
      <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        ✓ 대표 키워드 <strong>{keyword}</strong>가 제목에 포함되어 있습니다.
      </p>
    );
  }

  const suggestedTitle = buildReadableSeoTitle(currentTitle, keyword);
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">대표 키워드가 제목에 없습니다.</p>
      <p className="mt-1">SEO 승인에 필요한 대표 키워드: <strong>{keyword}</strong></p>
      <p className="mt-2 rounded-lg bg-white/70 px-3 py-2">추천 제목: {suggestedTitle}</p>
      <button
        className="mt-3 rounded-lg border border-amber-300 bg-white px-4 py-2 font-semibold disabled:opacity-50"
        disabled={disabled}
        onClick={() => void onApply(suggestedTitle)}
        type="button"
      >
        대표 키워드로 제목 보정
      </button>
    </div>
  );
}
