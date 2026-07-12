"use client";

import { useState } from "react";

import { showPublishUnavailableNotice } from "./publish-action-state";

export function PublishAction() {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)] sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-sm font-semibold">발행 연결 준비 중</p>
        <p aria-live="polite" className="mt-1 text-sm leading-6 text-[#77777f]">{notice ?? "이 화면에서는 발행 준비 상태만 확인할 수 있습니다."}</p>
      </div>
      <button className="mt-4 w-fit shrink-0 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)] transition hover:bg-[#f45d5d] focus:ring-4 focus:ring-[#ff6b6b]/20 focus:outline-none sm:mt-0" onClick={() => setNotice(showPublishUnavailableNotice().notice)} type="button">발행 연결 확인</button>
    </div>
  );
}
