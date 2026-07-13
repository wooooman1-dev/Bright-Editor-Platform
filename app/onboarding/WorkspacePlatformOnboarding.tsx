"use client";

import { useState } from "react";

import { PageContainer } from "../shared/ui/PageContainer";
import { supportedWorkspacePlatforms, type WorkspacePlatform } from "../user-flow/user-data";

const labels: Readonly<Record<WorkspacePlatform, string>> = { tistory: "Tistory", wordpress: "WordPress", youtube: "YouTube", naver_cafe: "Naver Cafe" };
export function platformConnectionsSettingsPath(workspaceId: string) { return `/workspaces/${encodeURIComponent(workspaceId)}/settings?section=connections&from=onboarding`; }

export function WorkspacePlatformOnboarding({ workspaceId }: { workspaceId: string }) {
  const [selected, setSelected] = useState<readonly WorkspacePlatform[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toggle = (platform: WorkspacePlatform) => setSelected(selected.includes(platform) ? selected.filter((value) => value !== platform) : [...selected, platform]);
  const complete = async () => {
    if (!selected.length) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "complete-platform-onboarding", workspaceId, enabledPlatforms: selected }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "플랫폼 설정을 저장하지 못했습니다.");
      window.location.assign(platformConnectionsSettingsPath(workspaceId));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "플랫폼 설정을 저장하지 못했습니다."); setSaving(false); }
  };
  return <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]"><PageContainer className="flex min-h-screen items-center py-12"><section className="mx-auto w-full max-w-xl rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_16px_50px_rgba(24,24,27,0.06)] sm:p-9"><p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Welcome to Bright Studio</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">사용할 플랫폼을 선택하세요</h1><p className="mt-3 text-sm leading-6 text-[#77777f]">어떤 곳에 콘텐츠를 저장할지 선택해 주세요. 나중에 Settings에서 언제든 변경할 수 있습니다.</p><div className="mt-7 space-y-3">{supportedWorkspacePlatforms.map((platform) => <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 ${selected.includes(platform) ? "border-[#ff6b6b] bg-[#fff7f7]" : "border-black/8"}`} key={platform}><input checked={selected.includes(platform)} onChange={() => toggle(platform)} type="checkbox" /><span className="font-semibold">{labels[platform]}</span></label>)}</div>{error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}<button className="mt-7 w-full rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!selected.length || saving} onClick={() => void complete()} type="button">{saving ? "저장 중..." : "Continue"}</button></section></PageContainer></main>;
}
