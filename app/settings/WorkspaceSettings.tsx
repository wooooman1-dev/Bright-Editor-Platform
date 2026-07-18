"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { DangerZone } from "../user-flow/DangerZone";
import { GlobalHeader } from "../shared/ui/GlobalHeader";
import { supportedWorkspacePlatforms, type ThemePreference, type WorkspacePlatform } from "../user-flow/user-data";
import { SettingsConnections } from "./SettingsConnections";
import { SettingsMediaPermissions } from "./SettingsMediaPermissions";
import type { SettingsSection, SettingsSnapshot, StatusSummary } from "./settings-types";
import { themes } from "./settings-types";
import { applyTheme } from "./theme";

const platformLabels: Readonly<Record<WorkspacePlatform, string>> = { tistory: "Tistory", wordpress: "WordPress", youtube: "YouTube", naver_cafe: "Naver Cafe" };
const sections: readonly Readonly<{ id: SettingsSection; label: string }>[] = [
  { id: "overview", label: "개요" }, { id: "ai", label: "AI" }, { id: "enabled-platforms", label: "Enabled Platforms" },
  { id: "connections", label: "플랫폼 연결" }, { id: "publishing", label: "발행 설정" }, { id: "media", label: "이미지 권한" }, { id: "automation", label: "자동화 상태" },
  { id: "workspace", label: "워크스페이스" }, { id: "appearance", label: "화면 설정" }, { id: "danger", label: "위험 구역" },
];

export function WorkspaceSettings({ initialSection = "overview", workspaceId }: { initialSection?: SettingsSection; workspaceId: string }) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [snapshot, setSnapshot] = useState<SettingsSnapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/settings?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    const result = await response.json() as SettingsSnapshot & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "설정을 불러오지 못했습니다.");
    setSnapshot(result); applyTheme(result.settings.appearance.theme); setError("");
  }, [workspaceId]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh().catch((reason) => setError(message(reason))), 0); return () => window.clearTimeout(timer); }, [refresh]);
  const action = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, workspaceId }) });
      const result = await response.json() as SettingsSnapshot & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "설정을 저장하지 못했습니다.");
      if (result.workspace) { setSnapshot(result); applyTheme(result.settings.appearance.theme); }
      setError(""); return result;
    } catch (reason) { setError(message(reason)); throw reason; }
    finally { setBusy(false); }
  };
  if (error && !snapshot) return <main className="min-h-screen bg-[#f8f8fa] p-6"><Card><h1 className="text-xl font-semibold">설정을 불러오지 못했습니다.</h1><p className="mt-2 text-sm text-red-700">{error}</p><Link className="mt-5 inline-block font-semibold text-[#d94848]" href="/">워크스페이스로 돌아가기</Link></Card></main>;
  if (!snapshot) return <main aria-busy="true" className="min-h-screen bg-[#f8f8fa]" />;
  return <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
    <GlobalHeader activeItem="Settings" selectedWorkspaceId={workspaceId} workspaces={[{ id: workspaceId, name: snapshot.workspace.name }]} />
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[220px_1fr]">
      <aside><h1 className="text-2xl font-semibold">설정</h1><nav aria-label="설정 메뉴" className="mt-5 flex gap-2 overflow-x-auto lg:flex-col">{sections.map((item) => <button aria-current={section === item.id ? "page" : undefined} className={`shrink-0 rounded-xl px-4 py-3 text-left text-sm font-semibold ${section === item.id ? "bg-[#fff0f0] text-[#d94848]" : "bg-white text-[#65656d]"}`} key={item.id} onClick={() => { setSection(item.id); window.history.replaceState(null, "", `?section=${item.id}`); }} type="button">{item.label}</button>)}</nav></aside>
      <div><header className="mb-6"><p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Workspace Settings</p><h1 className="mt-2 text-3xl font-semibold">{sections.find((item) => item.id === section)?.label}</h1></header>{error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {section === "overview" ? <Overview snapshot={snapshot} setSection={setSection} /> : null}
        {section === "ai" ? <AISettings busy={busy} onCheck={() => action({ action: "check-ai" })} snapshot={snapshot} /> : null}
        {section === "enabled-platforms" ? <EnabledPlatforms busy={busy} onSave={(enabledPlatforms) => action({ action: "save-enabled-platforms", enabledPlatforms })} snapshot={snapshot} /> : null}
        {section === "connections" ? <SettingsConnections connections={snapshot.connections} enabledPlatforms={snapshot.settings.enabledPlatforms} onRefresh={refresh} workspaceId={workspaceId} /> : null}
        {section === "publishing" ? <PublishingSettings busy={busy} onSave={(value) => action({ action: "save-publishing", sequentialDraftSave: value })} snapshot={snapshot} /> : null}
        {section === "media" ? <SettingsMediaPermissions connections={snapshot.connections} onRefresh={refresh} workspaceId={workspaceId} /> : null}
        {section === "automation" ? <AutomationSettings busy={busy} onCheck={() => action({ action: "check-automation" }).then(() => refresh())} snapshot={snapshot} setSection={setSection} /> : null}
        {section === "workspace" ? <WorkspaceSection busy={busy} onAction={action} snapshot={snapshot} /> : null}
        {section === "appearance" ? <AppearanceSection busy={busy} onSave={(theme) => action({ action: "save-appearance", theme })} snapshot={snapshot} /> : null}
        {section === "danger" ? <DangerZone onDeleted={() => window.location.assign("/")} scope="workspace" workspaceId={workspaceId} /> : null}
      </div>
    </div>
  </main>;
}

export function Overview({ setSection, snapshot }: { setSection: (section: SettingsSection) => void; snapshot: SettingsSnapshot }) {
  const mediaEnabled = snapshot.connections.filter((connection) => connection.platform === "tistory" && connection.permissions.includes("media.upload")).length;
  const cards: readonly { title: string; summary: StatusSummary; detail: string; target: SettingsSection }[] = [
    { title: "AI", summary: snapshot.ai, detail: snapshot.ai.message, target: "ai" },
    ...snapshot.settings.enabledPlatforms.map((platform) => ({ title: platformLabels[platform], summary: snapshot.platforms[platform]!, detail: accountDetail(snapshot.platforms[platform]!), target: "connections" as const })),
    { title: "Publishing", summary: snapshot.publishing, detail: "검토 후 임시저장만 허용합니다.", target: "publishing" },
    { title: "Media Upload", summary: { status: mediaEnabled ? "ready" : "configuration_required" }, detail: mediaEnabled ? `${mediaEnabled}개 Tistory 계정에서 이미지 업로드 허용` : "계정별 이미지 업로드는 기본 차단 상태입니다.", target: "media" },
    { title: "Browser Automation", summary: snapshot.automation, detail: snapshot.automation.message, target: "automation" },
    { title: "Workspace Backup", summary: { status: snapshot.backup.modifiedAt ? "ready" : "configuration_required" }, detail: snapshot.backup.modifiedAt ? `마지막 백업 ${snapshot.backup.modifiedAt}` : (snapshot.backup.message ?? "백업이 없습니다."), target: "workspace" },
    { title: "Workspace", summary: snapshot.persistence, detail: snapshot.persistence.message ?? "로컬 저장소 상태", target: "workspace" },
  ];
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <button className="rounded-[20px] border border-black/6 bg-white p-5 text-left" key={card.title} onClick={() => setSection(card.target)} type="button"><div className="flex justify-between gap-3"><h2 className="font-semibold">{card.title}</h2><Status status={card.summary.status} /></div><p className="mt-3 text-sm leading-6 text-[#77777f]">{card.detail}</p></button>)}</div>;
}

function EnabledPlatforms({ busy, onSave, snapshot }: { busy: boolean; onSave: (platforms: readonly WorkspacePlatform[]) => Promise<unknown>; snapshot: SettingsSnapshot }) {
  const [enabled, setEnabled] = useState<readonly WorkspacePlatform[]>(snapshot.settings.enabledPlatforms);
  const toggle = (platform: WorkspacePlatform) => setEnabled(enabled.includes(platform) ? enabled.filter((value) => value !== platform) : [...enabled, platform]);
  return <Card><h2 className="text-lg font-semibold">Enabled Platforms</h2><p className="mt-2 text-sm text-[#77777f]">사용할 발행 플랫폼을 선택하세요. 플랫폼을 꺼도 기존 계정, 로그인 정보, 프로젝트는 삭제되지 않습니다.</p><div className="mt-5 space-y-3">{supportedWorkspacePlatforms.map((platform) => <label className="flex items-center gap-3 rounded-xl border p-4" key={platform}><input checked={enabled.includes(platform)} onChange={() => toggle(platform)} type="checkbox" /><span className="font-semibold">{platformLabels[platform]}</span></label>)}</div><button className="mt-5 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void onSave(enabled)} type="button">플랫폼 설정 저장</button></Card>;
}

function AISettings({ busy, onCheck, snapshot }: { busy: boolean; onCheck: () => Promise<unknown>; snapshot: SettingsSnapshot }) { return <Card><div className="flex justify-between gap-4"><div><h2 className="text-lg font-semibold">OpenAI</h2><p className="mt-1 text-sm text-[#77777f]">기본 모델: {snapshot.ai.model}</p></div><Status status={snapshot.ai.status} /></div><p className="mt-5 rounded-xl bg-[#f8f8fa] p-4 text-sm">{snapshot.ai.message}</p><button className="mt-5 rounded-xl border px-4 py-2.5 text-sm font-semibold" disabled={busy} onClick={() => void onCheck()} type="button">설정 상태 확인</button></Card>; }

function PublishingSettings({ busy, onSave, snapshot }: { busy: boolean; onSave: (value: boolean) => Promise<unknown>; snapshot: SettingsSnapshot }) {
  const [sequential, setSequential] = useState(snapshot.settings.publishing.sequentialDraftSave);
  return <Card><h2 className="text-lg font-semibold">기본 발행 정책</h2><div className="mt-5 space-y-3"><Policy label="검토 후 진행" checked disabled /><Policy label="임시저장만 허용" checked disabled /><Policy label="공개 발행" checked={false} disabled /><Policy label="계정별 순차 임시저장" checked={sequential} onChange={setSequential} /></div><h3 className="mt-6 font-semibold">플랫폼 준비 상태</h3><dl className="mt-3 grid gap-3 sm:grid-cols-2">{snapshot.settings.enabledPlatforms.map((platform) => <Metric key={platform} label={platformLabels[platform]} value={statusLabel(snapshot.platforms[platform]!.status)} />)}</dl><button className="mt-5 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" disabled={busy} onClick={() => void onSave(sequential)} type="button">발행 설정 저장</button></Card>;
}

function AutomationSettings({ busy, onCheck, setSection, snapshot }: { busy: boolean; onCheck: () => Promise<unknown>; setSection: (value: SettingsSection) => void; snapshot: SettingsSnapshot }) { const value = snapshot.automation; return <Card><div className="flex justify-between gap-4"><h2 className="text-lg font-semibold">브라우저 자동화 준비 상태</h2><Status status={value.status} /></div><dl className="mt-5 grid gap-3 sm:grid-cols-2"><Metric label="Chromium" value={value.chromiumAvailable ? "설치됨" : "설정 필요"} /><Metric label="Tistory worker" value={value.workerRegistered ? "등록됨" : "사용할 수 없음"} /></dl><p className="mt-4 text-sm text-[#77777f]">{value.message}</p><div className="mt-5 flex gap-2"><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" disabled={busy} onClick={() => void onCheck()} type="button">준비 상태 재검사</button>{snapshot.settings.enabledPlatforms.includes("tistory") ? <button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => setSection("connections")} type="button">Tistory 연결 확인</button> : null}</div></Card>; }

function WorkspaceSection({ busy, onAction, snapshot }: { busy: boolean; onAction: (body: Record<string, unknown>) => Promise<unknown>; snapshot: SettingsSnapshot }) { const [name, setName] = useState(snapshot.workspace.name); const [notice, setNotice] = useState(""); return <div className="space-y-5"><Card><h2 className="text-lg font-semibold">워크스페이스 기본 정보</h2><label className="mt-5 block text-sm font-semibold">이름<input className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setName(event.target.value)} value={name} /></label><button className="mt-4 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" disabled={busy} onClick={() => void onAction({ action: "rename-workspace", name }).then(() => setNotice("이름을 저장했습니다."))} type="button">이름 저장</button><dl className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Projects" value={String(snapshot.workspace.projectCount)} /><Metric label="Contents" value={String(snapshot.workspace.contentCount)} /><Metric label="Publishing Accounts" value={String(snapshot.workspace.publishingAccountCount)} /></dl></Card><Card><h2 className="text-lg font-semibold">백업</h2><button className="mt-4 rounded-xl border px-4 py-2.5 text-sm font-semibold" disabled={busy} onClick={() => void onAction({ action: "create-backup" }).then(() => setNotice("백업을 생성했습니다."))} type="button">수동 백업 생성</button></Card><p className="text-sm">{notice}</p></div>; }
function AppearanceSection({ busy, onSave, snapshot }: { busy: boolean; onSave: (theme: ThemePreference) => Promise<unknown>; snapshot: SettingsSnapshot }) { const [theme, setTheme] = useState(snapshot.settings.appearance.theme); return <Card><h2 className="text-lg font-semibold">테마</h2><div className="mt-5 grid gap-3 sm:grid-cols-3">{themes.map((value) => <label className="rounded-xl border p-4 text-sm font-semibold" key={value}><input checked={theme === value} className="mr-2" name="theme" onChange={() => { setTheme(value); applyTheme(value); }} type="radio" />{value}</label>)}</div><button className="mt-5 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" disabled={busy} onClick={() => void onSave(theme)} type="button">화면 설정 저장</button></Card>; }

function Card({ children }: { children: React.ReactNode }) { return <section className="rounded-[20px] border border-black/6 bg-white p-5 sm:p-6">{children}</section>; }
function Status({ status }: { status: string }) { return <span className="rounded-full bg-[#f3f3f5] px-3 py-1 text-xs font-semibold">{statusLabel(status)}</span>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[#f8f8fa] p-4"><dt className="text-xs text-[#92929a]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Policy({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange?: (value: boolean) => void }) { return <label className="flex gap-3 rounded-xl border p-4"><input checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} type="checkbox" /><span className="font-semibold">{label}</span></label>; }
function statusLabel(status: string) { return ({ ready: "사용 가능", connected: "연결됨", verification_required: "재확인 필요", configuration_required: "설정 필요", unavailable: "사용할 수 없음", error: "오류 발생", cleanup_required: "정리 필요", not_supported: "아직 지원하지 않음" } as Record<string, string>)[status] ?? "확인 필요"; }
function accountDetail(value: StatusSummary) { return value.status === "not_supported" ? "아직 연결 workflow를 지원하지 않습니다." : `${value.connectedCount ?? 0}/${value.accountCount ?? 0}개 계정 사용 가능`; }
function message(error: unknown) { return error instanceof Error ? error.message : "요청을 처리하지 못했습니다."; }
