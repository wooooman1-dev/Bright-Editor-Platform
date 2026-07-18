"use client";

import { useState } from "react";

import type { PublicConnection } from "./settings-types";

export function SettingsMediaPermissions({ connections, onRefresh, workspaceId }: { connections: readonly PublicConnection[]; onRefresh: () => Promise<void>; workspaceId: string }) {
  const [busyId, setBusyId] = useState<string>();
  const [notice, setNotice] = useState("");
  const tistory = connections.filter((connection) => connection.platform === "tistory");

  const update = async (connection: PublicConnection, enabled: boolean) => {
    if (enabled && !window.confirm("이 계정의 Tistory 임시저장 과정에서 로컬 이미지를 업로드하도록 허용할까요? 공개 발행 권한은 켜지지 않습니다.")) return;
    setBusyId(connection.id);
    setNotice("이미지 업로드 권한을 저장하고 있습니다.");
    try {
      const response = await fetch("/api/connections/media-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, connectionId: connection.id, enabled }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "이미지 업로드 권한을 저장하지 못했습니다.");
      await onRefresh();
      setNotice(enabled ? "Tistory 이미지 업로드를 허용했습니다. Draft Only와 최종 확인 정책은 그대로 유지됩니다." : "Tistory 이미지 업로드 권한을 껐습니다. 이미지가 포함된 원고는 외부 임시저장 전에 중단됩니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "이미지 업로드 권한을 저장하지 못했습니다.");
    } finally {
      setBusyId(undefined);
    }
  };

  return <div className="space-y-5">
    <section className="rounded-[20px] border border-black/6 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Tistory 이미지 업로드 권한</h2>
      <p className="mt-2 text-sm leading-6 text-[#77777f]">기본값은 꺼짐입니다. 켜면 사용자가 최종 확인한 임시저장 작업 안에서만 로컬 이미지를 Tistory에 업로드합니다. 공개 발행, 기존 글 수정, 삭제 권한은 추가되지 않습니다.</p>
      <div className="mt-5 space-y-3">
        {tistory.length ? tistory.map((connection) => {
          const enabled = connection.permissions.includes("media.upload");
          const available = connection.status === "connected";
          return <label className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between" key={connection.id}>
            <span><strong className="block">{connection.displayName}</strong><span className="mt-1 block text-sm text-[#77777f]">{available ? "연결됨" : "재연결 필요"} · 이미지 업로드 {enabled ? "허용" : "차단"}</span></span>
            <span className="flex items-center gap-3 text-sm font-semibold"><input checked={enabled} disabled={!available || busyId === connection.id} onChange={(event) => void update(connection, event.target.checked)} type="checkbox" />임시저장 시 이미지 업로드 허용</span>
          </label>;
        }) : <p className="rounded-xl border border-dashed p-4 text-sm text-[#77777f]">Tistory 계정을 먼저 연결해 주세요.</p>}
      </div>
    </section>
    {notice ? <p aria-live="polite" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{notice}</p> : null}
  </div>;
}
