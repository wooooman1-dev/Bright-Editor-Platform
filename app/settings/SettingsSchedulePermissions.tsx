"use client";

import { useState } from "react";

import type { PublicConnection } from "./settings-types";

type SchedulePlatform = "tistory" | "wordpress";

const platformCopy: Readonly<Record<SchedulePlatform, Readonly<{
  title: string;
  description: string;
  warning: string;
  confirm: string;
  enabled: string;
  disabled: string;
  empty: string;
  toggle: string;
}>>> = {
  tistory: {
    title: "Tistory 예약 발행 권한",
    description: "기본값은 꺼짐입니다. 켜면 사용자가 최종 확인한 현재 원고 Revision을 Tistory 자체 예약 기능에 등록할 수 있습니다. 예약 등록 후에는 Tistory가 지정 시각에 공개하며, Bright Studio가 로컬에서 대기하거나 즉시 공개 버튼을 누르지 않습니다.",
    warning: "권한을 끄더라도 이미 Tistory에 등록된 예약은 취소되지 않습니다. 예약 수정과 취소는 실제 Tistory 동작이 별도로 검증된 뒤 제공됩니다.",
    confirm: "이 계정에 Tistory 예약 등록 권한을 허용할까요? 예약이 정상 등록되면 Tistory가 지정 시각에 글을 공개합니다. 즉시 공개 발행 권한과 기존 글 수정·삭제 권한은 켜지지 않습니다.",
    enabled: "Tistory 예약 등록을 허용했습니다. 각 예약마다 현재 Revision과 예약 시각을 다시 확인해야 합니다.",
    disabled: "Tistory 예약 등록 권한을 껐습니다. 이미 외부에 등록된 예약은 자동 취소되지 않습니다.",
    empty: "Tistory 계정을 먼저 연결해 주세요.",
    toggle: "Tistory 예약 등록 허용",
  },
  wordpress: {
    title: "WordPress 예약 발행 권한",
    description: "기본값은 꺼짐입니다. 켜면 사용자가 최종 확인한 현재 원고 Revision을 WordPress 공식 REST API로 예약 등록할 수 있습니다. 기본 동작은 초안 예약이며, 글은 초안 상태로 유지되고 예약 시각만 기록됩니다.",
    warning: "지정 시각에 글이 자동으로 공개되는 공개 예약은 이 권한만으로 실행되지 않습니다. 설정 → 발행에서 ‘WordPress 예약 공개 발행 허용’을 따로 켜야 하며, AdSense 승인 준비 콘텐츠에는 적용되지 않습니다.",
    confirm: "이 계정에 WordPress 예약 등록 권한을 허용할까요? 즉시 공개 발행 권한과 기존 글 수정·삭제 권한은 켜지지 않습니다.",
    enabled: "WordPress 예약 등록을 허용했습니다. 각 예약마다 현재 Revision과 예약 시각을 다시 확인해야 합니다.",
    disabled: "WordPress 예약 등록 권한을 껐습니다. 이미 외부에 등록된 예약은 자동 취소되지 않습니다.",
    empty: "WordPress 계정을 먼저 연결해 주세요.",
    toggle: "WordPress 예약 등록 허용",
  },
};

export function SettingsSchedulePermissions({ connections, onRefresh, workspaceId }: {
  connections: readonly PublicConnection[];
  onRefresh: () => Promise<void>;
  workspaceId: string;
}) {
  const [busyId, setBusyId] = useState<string>();
  const [notice, setNotice] = useState("");

  const update = async (connection: PublicConnection, platform: SchedulePlatform, enabled: boolean) => {
    const copy = platformCopy[platform];
    if (enabled && !window.confirm(copy.confirm)) return;
    setBusyId(connection.id);
    setNotice("예약 발행 권한을 저장하고 있습니다.");
    try {
      const response = await fetch("/api/connections/schedule-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, connectionId: connection.id, enabled }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "예약 발행 권한을 저장하지 못했습니다.");
      await onRefresh();
      setNotice(enabled ? copy.enabled : copy.disabled);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "예약 발행 권한을 저장하지 못했습니다.");
    } finally {
      setBusyId(undefined);
    }
  };

  return <div className="space-y-5">
    {(["tistory", "wordpress"] as const).map((platform) => {
      const copy = platformCopy[platform];
      const matches = connections.filter((connection) => connection.platform === platform);
      return <section className="rounded-[20px] border border-black/6 bg-white p-5 sm:p-6" key={platform}>
        <h2 className="text-lg font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#77777f]">{copy.description}</p>
        <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">{copy.warning}</p>
        <div className="mt-5 space-y-3">
          {matches.length ? matches.map((connection) => {
            const enabled = connection.permissions.includes("schedule.create");
            const available = connection.status === "connected";
            return <label className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between" key={connection.id}>
              <span><strong className="block">{connection.displayName}</strong><span className="mt-1 block text-sm text-[#77777f]">{available ? "연결됨" : "재연결 필요"} · 예약 등록 {enabled ? "허용" : "차단"}</span></span>
              <span className="flex items-center gap-3 text-sm font-semibold"><input checked={enabled} disabled={!available || busyId === connection.id} onChange={(event) => void update(connection, platform, event.target.checked)} type="checkbox" />{copy.toggle}</span>
            </label>;
          }) : <p className="rounded-xl border border-dashed p-4 text-sm text-[#77777f]">{copy.empty}</p>}
        </div>
      </section>;
    })}
    {notice ? <p aria-live="polite" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">{notice}</p> : null}
  </div>;
}
