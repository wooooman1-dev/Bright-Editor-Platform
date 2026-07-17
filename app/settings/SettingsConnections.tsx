"use client";

import { useEffect, useState } from "react";
import type { WorkspacePlatform } from "../user-flow/user-data";
import type { PublicConnection } from "./settings-types";

type DeletionState = Readonly<{
  id: string;
  name: string;
  projectCount: number;
  contentCount: number;
  confirmation: string;
  replacementConnectionId: string;
}>;

export function SettingsConnections({ connections, enabledPlatforms, onRefresh, workspaceId }: { connections: readonly PublicConnection[]; enabledPlatforms: readonly WorkspacePlatform[]; onRefresh: () => Promise<void>; workspaceId: string }) {
  const [blogAddress, setBlogAddress] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [applicationPassword, setApplicationPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [jobId, setJobId] = useState<string>();

  useEffect(() => {
    if (!jobId) return;
    const timer = window.setInterval(() => void fetch(`/api/connections?jobId=${encodeURIComponent(jobId)}&workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }).then((response) => response.json()).then((result: { job?: { state: string; message: string; failureCode?: string; safeMessage?: string; remediation?: string } }) => {
      if (!result.job) return;
      setNotice(jobNotice(result.job));
      if (["completed", "failed", "cancelled", "timed_out"].includes(result.job.state)) {
        window.clearInterval(timer);
        setJobId(undefined);
        void onRefresh();
      }
    }), 1000);
    return () => window.clearInterval(timer);
  }, [jobId, onRefresh, workspaceId]);

  const action = async (body: Record<string, unknown>) => {
    setNotice("처리 중입니다.");
    const response = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, workspaceId }),
    });
    const result = await response.json() as {
      error?: string;
      job?: { id: string; message: string };
      verification?: { siteTitle: string };
      migrated?: boolean;
      projectCount?: number;
      contentCount?: number;
    };
    if (!response.ok) {
      setNotice(result.error ?? "연결 작업을 완료하지 못했습니다.");
      throw new Error(result.error);
    }
    if (result.job) setJobId(result.job.id);
    setNotice(result.migrated
      ? `참조 Project ${result.projectCount ?? 0}개와 Content ${result.contentCount ?? 0}개를 정상 연결로 이전하고 이전 연결을 삭제했습니다.`
      : result.job?.message ?? "완료했습니다.");
    setApplicationPassword("");
    await onRefresh();
    return result;
  };

  const tistory = connections.filter((connection) => connection.platform === "tistory");
  const wordpress = connections.filter((connection) => connection.platform === "wordpress");

  return <div className="space-y-6">
    {enabledPlatforms.includes("tistory") ? <Platform title="Tistory" description="브라우저 로그인 후 안전한 임시저장 workflow를 사용합니다."><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="블로그 주소" onChange={setBlogAddress} placeholder="https://example.tistory.com" value={blogAddress} /><button className="self-end rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" disabled={!blogAddress.trim() || Boolean(jobId)} onClick={() => void action({ action: "tistory-connect", blogAddress })} type="button">계정 연결</button></div>{jobId ? <button className="mt-3 rounded-xl border px-4 py-2" onClick={() => void action({ action: "cancel", connectionId: jobId })} type="button">연결 취소</button> : null}<AccountList connections={tistory} onAction={action} /></Platform> : null}
    {enabledPlatforms.includes("wordpress") ? <Platform title="WordPress" description="Application Password는 브라우저로 다시 반환하지 않습니다."><div className="grid gap-3 sm:grid-cols-2"><Field label="사이트 주소" onChange={setSiteUrl} placeholder="https://example.com" value={siteUrl} /><Field label="사용자 이름" onChange={setUsername} value={username} /></div><label className="mt-3 block text-sm font-semibold">Application Password<input autoComplete="new-password" className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setApplicationPassword(event.target.value)} type="password" value={applicationPassword} /></label><div className="mt-3 flex gap-2"><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => void action({ action: "wordpress-test", siteUrl, username, applicationPassword })} type="button">연결 테스트</button><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => void action({ action: "wordpress-save", siteUrl, username, applicationPassword })} type="button">안전하게 저장</button></div><AccountList connections={wordpress} onAction={action} /></Platform> : null}
    {enabledPlatforms.includes("youtube") ? <Unsupported title="YouTube" /> : null}
    {enabledPlatforms.includes("naver_cafe") ? <Unsupported title="Naver Cafe" /> : null}
    <button className="rounded-xl border px-5 py-3 text-sm font-semibold" onClick={() => window.location.assign("/")} type="button">Skip for now</button>
    <p aria-live="polite" className="text-sm text-[#77777f]">{notice}</p>
  </div>;
}

function AccountList({ connections, onAction }: { connections: readonly PublicConnection[]; onAction: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [deletion, setDeletion] = useState<DeletionState>();
  if (!connections.length) return <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-[#77777f]">연결된 계정이 없습니다.</p>;

  return <div className="mt-4 space-y-3">{connections.map((connection) => {
    const replacements = compatibleReplacementConnections(connections, connection);
    const needsMigration = deletion?.id === connection.id && (deletion.projectCount > 0 || deletion.contentCount > 0);
    const canConfirm = deletion?.id === connection.id && deletion.confirmation === deletion.name;
    const canDelete = Boolean(canConfirm && (!needsMigration || deletion?.replacementConnectionId));

    return <article className="rounded-xl border p-4" key={connection.id}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">{connection.displayName}</h3>
          <p className="mt-1 text-sm text-[#77777f]">{connection.status} · 임시저장 {connection.status === "connected" && connection.permissions.includes("draft.create") ? "가능" : "준비 필요"}</p>
          <p className="mt-1 text-xs text-[#92929a]">마지막 확인: {connection.lastVerifiedAt ? new Date(connection.lastVerifiedAt).toLocaleString("ko-KR") : "기록 없음"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={() => void onAction({ action: "verify", connectionId: connection.id })} type="button">재검증</button>
          {connection.status !== "disconnected" ? <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => void onAction({ action: "disconnect", connectionId: connection.id })} type="button">연결 해제</button> : <span className="rounded-lg bg-[#f8f8fa] px-3 py-2 text-sm font-semibold text-[#77777f]">연결 해제됨</span>}
          {connection.status === "disconnected" ? <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => void onAction({ action: "connection-impact", connectionId: connection.id }).then((result) => { const impact = (result as { impact: { name: string; projectCount: number; contentCount: number } }).impact; setDeletion({ id: connection.id, ...impact, confirmation: "", replacementConnectionId: "" }); })} type="button">계정 메타데이터 삭제</button> : null}
        </div>
      </div>

      {deletion?.id === connection.id ? <div className="mt-4 rounded-xl border border-red-200 p-4">
        <p className="text-sm text-red-800">참조 Project {deletion.projectCount}개 · Content {deletion.contentCount}개</p>
        {needsMigration ? <div className="mt-3">
          <label className="block text-sm font-semibold">참조를 이전할 정상 연결
            <select className="mt-2 w-full rounded-lg border px-3 py-2 font-normal" onChange={(event) => setDeletion({ ...deletion, replacementConnectionId: event.target.value })} value={deletion.replacementConnectionId}>
              <option value="">정상 연결 선택</option>
              {replacements.map((replacement) => <option key={replacement.id} value={replacement.id}>{replacement.displayName} · 연결됨{replacement.lastVerifiedAt ? ` · ${new Date(replacement.lastVerifiedAt).toLocaleString("ko-KR")}` : ""}</option>)}
            </select>
          </label>
          {replacements.length ? <p className="mt-2 text-xs text-[#77777f]">Project·Content·카테고리 준비 정보를 선택한 연결로 이전한 뒤 현재 연결 메타데이터를 삭제합니다.</p> : <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">같은 사이트의 정상 연결이 없습니다. 먼저 같은 계정을 다시 연결해 주세요.</p>}
        </div> : <p className="mt-3 text-sm text-[#77777f]">현재 연결을 참조하는 Project와 Content가 없어 바로 삭제할 수 있습니다.</p>}
        <input className="mt-3 w-full rounded-lg border px-3 py-2" onChange={(event) => setDeletion({ ...deletion, confirmation: event.target.value })} placeholder={deletion.name} value={deletion.confirmation} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!canDelete} onClick={() => void onAction(needsMigration ? { action: "migrate-delete-connection", connectionId: connection.id, replacementConnectionId: deletion.replacementConnectionId, confirmation: deletion.confirmation } : { action: "delete-connection", connectionId: connection.id, confirmation: deletion.confirmation }).then(() => setDeletion(undefined))} type="button">{needsMigration ? "참조 이전 후 삭제" : "메타데이터 삭제"}</button>
          <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setDeletion(undefined)} type="button">취소</button>
        </div>
      </div> : null}
      <Rename connection={connection} onAction={onAction} />
    </article>;
  })}</div>;
}

export function compatibleReplacementConnections(
  connections: readonly PublicConnection[],
  source: PublicConnection,
): readonly PublicConnection[] {
  const sourceIdentity = publicConnectionIdentity(source);
  if (!sourceIdentity) return [];
  return connections.filter((candidate) => candidate.id !== source.id
    && candidate.platform === source.platform
    && candidate.status === "connected"
    && publicConnectionIdentity(candidate) === sourceIdentity);
}

function publicConnectionIdentity(connection: PublicConnection): string {
  if (connection.platform === "tistory") {
    return String(connection.publicMetadata.blogId ?? "").trim().toLocaleLowerCase("en-US");
  }
  return String(connection.publicMetadata.siteUrl ?? "").trim().replace(/\/$/u, "").toLocaleLowerCase("en-US");
}

function Rename({ connection, onAction }: { connection: PublicConnection; onAction: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState(connection.displayName);
  return <div className="mt-4 flex gap-2 border-t pt-4"><input aria-label={`${connection.displayName} 계정 이름`} className="flex-1 rounded-lg border px-3 py-2 text-sm" maxLength={80} onChange={(event) => setName(event.target.value)} value={name} /><button className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={!name.trim() || name.trim() === connection.displayName} onClick={() => void onAction({ action: "rename", connectionId: connection.id, displayName: name })} type="button">이름 저장</button></div>;
}
function Platform({ children, description, title }: { children: React.ReactNode; description: string; title: string }) { return <section className="rounded-[20px] border bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 mb-5 text-sm text-[#77777f]">{description}</p>{children}</section>; }
function Unsupported({ title }: { title: string }) { return <Platform title={title} description="현재 연결 workflow가 구현되지 않았습니다."><p className="rounded-xl bg-[#f8f8fa] p-4 text-sm text-[#77777f]">아직 지원하지 않음</p></Platform>; }
function Field({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) { return <label className="text-sm font-semibold">{label}<input className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} /></label>; }
export function jobNotice(job: { message: string; failureCode?: string; safeMessage?: string; remediation?: string }) { return job.failureCode ? `${job.safeMessage ?? job.message} ${job.remediation ?? ""}`.trim() : job.message; }
