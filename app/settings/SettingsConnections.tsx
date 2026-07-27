"use client";

import { useEffect, useState } from "react";
import type { WorkspacePlatform } from "../user-flow/user-data";
import type { PublicConnection } from "./settings-types";

type DeletionState = Readonly<{
  id: string;
  projectCount: number;
  contentCount: number;
  replacementConnectionId: string;
}>;

type NoticeState = Readonly<{
  tone: "info" | "success" | "error";
  message: string;
}>;

export function SettingsConnections({ connections, enabledPlatforms, onRefresh, workspaceId }: { connections: readonly PublicConnection[]; enabledPlatforms: readonly WorkspacePlatform[]; onRefresh: () => Promise<void>; workspaceId: string }) {
  const [blogAddress, setBlogAddress] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [applicationPassword, setApplicationPassword] = useState("");
  const [notice, setNotice] = useState<NoticeState>();
  const [jobId, setJobId] = useState<string>();
  const observedJobId = jobId ?? connections.find((connection) => connection.activeJobId)?.activeJobId;

  useEffect(() => {
    if (!observedJobId) return;
    const timer = window.setInterval(() => void fetch(`/api/connections?jobId=${encodeURIComponent(observedJobId)}&workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" }).then((response) => response.json()).then((result: { job?: { state: string; message: string; failureCode?: string; safeMessage?: string; remediation?: string } }) => {
      if (!result.job) return;
      const terminalFailure = ["failed", "cancelled", "timed_out"].includes(result.job.state);
      setNotice({
        tone: terminalFailure ? "error" : result.job.state === "completed" ? "success" : "info",
        message: jobNotice(result.job),
      });
      if (["completed", "failed", "cancelled", "timed_out"].includes(result.job.state)) {
        window.clearInterval(timer);
        setJobId(undefined);
        void onRefresh();
      }
    }), 1000);
    return () => window.clearInterval(timer);
  }, [observedJobId, onRefresh, workspaceId]);

  const action = async (body: Record<string, unknown>) => {
    setNotice({ tone: "info", message: "처리 중입니다." });
    const response = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, workspaceId }),
    });
    const result = await response.json() as {
      error?: string;
      message?: string;
      job?: { id: string; message: string };
      verification?: { siteTitle: string };
      migrated?: boolean;
      projectCount?: number;
      contentCount?: number;
    };
    if (!response.ok) {
      const errorMessage = result.error ?? "연결 작업을 완료하지 못했습니다.";
      setNotice({ tone: "error", message: errorMessage });
      throw new Error(result.error);
    }
    if (result.job) setJobId(result.job.id);
    const resultMessage = result.message ?? (result.migrated
      ? `참조 Project ${result.projectCount ?? 0}개와 Content ${result.contentCount ?? 0}개를 정상 연결로 이전하고 이전 연결을 삭제했습니다.`
      : result.job?.message ?? "완료했습니다.");
    setNotice({ tone: result.job ? "info" : "success", message: resultMessage });
    setApplicationPassword("");
    await onRefresh();
    return result;
  };

  const tistory = connections.filter((connection) => connection.platform === "tistory");
  const wordpress = connections.filter((connection) => connection.platform === "wordpress");

  return <div className="space-y-6">
    {notice ? <p aria-live="polite" className={`sticky top-4 z-30 rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${notice.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>{notice.tone === "success" ? "✓ " : notice.tone === "error" ? "주의: " : "↻ "}{notice.message}</p> : null}
    {enabledPlatforms.includes("tistory") ? <Platform title="Tistory" description="계정 등록 상태와 실제 로그인 세션 상태를 구분합니다. 저장된 세션 파일만으로 현재 로그인 상태나 임시저장 가능 여부를 확정하지 않습니다."><div className="grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="새 Tistory 계정 연결" onChange={setBlogAddress} placeholder="https://example.tistory.com" value={blogAddress} /><button className="self-end rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white" disabled={!blogAddress.trim() || Boolean(observedJobId)} onClick={() => void action({ action: "tistory-connect", blogAddress })} type="button">새 계정 연결</button></div>{observedJobId ? <button className="mt-3 rounded-xl border px-4 py-2" onClick={() => void action({ action: "cancel", connectionId: observedJobId })} type="button">연결 취소</button> : null}<AccountList connections={tistory} onAction={action} /></Platform> : null}
    {enabledPlatforms.includes("wordpress") ? <Platform title="WordPress" description="Application Password는 브라우저로 다시 반환하지 않습니다."><div className="grid gap-3 sm:grid-cols-2"><Field label="사이트 주소" onChange={setSiteUrl} placeholder="https://example.com" value={siteUrl} /><Field label="사용자 이름" onChange={setUsername} value={username} /></div><label className="mt-3 block text-sm font-semibold">Application Password<input autoComplete="new-password" className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setApplicationPassword(event.target.value)} type="password" value={applicationPassword} /></label><div className="mt-3 flex gap-2"><button className="rounded-xl border px-4 py-2.5 text-sm font-semibold" onClick={() => void action({ action: "wordpress-test", siteUrl, username, applicationPassword })} type="button">연결 테스트</button><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => void action({ action: "wordpress-save", siteUrl, username, applicationPassword })} type="button">안전하게 저장</button></div><AccountList connections={wordpress} onAction={action} /></Platform> : null}
    {enabledPlatforms.includes("youtube") ? <Unsupported title="YouTube" /> : null}
    {enabledPlatforms.includes("naver_cafe") ? <Unsupported title="Naver Cafe" /> : null}
    <button className="rounded-xl border px-5 py-3 text-sm font-semibold" onClick={() => window.location.assign("/")} type="button">Skip for now</button>
  </div>;
}

function AccountList({ connections, onAction }: { connections: readonly PublicConnection[]; onAction: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [deletion, setDeletion] = useState<DeletionState>();
  const activeDeletion = deletion && connections.some((connection) => connection.id === deletion.id && connection.status === "disconnected")
    ? deletion
    : undefined;

  if (!connections.length) return <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-[#77777f]">연결된 계정이 없습니다.</p>;

  return <div className="mt-4 space-y-3">{connections.map((connection) => {
    const replacements = compatibleReplacementConnections(connections, connection);
    const needsMigration = activeDeletion?.id === connection.id && (activeDeletion.projectCount > 0 || activeDeletion.contentCount > 0);
    const canDelete = Boolean(activeDeletion?.id === connection.id && (!needsMigration || activeDeletion.replacementConnectionId));
    const projectReferences = connection.projectReferenceCount ?? 0;
    const contentReferences = connection.contentReferenceCount ?? 0;
    const hasReferences = projectReferences > 0 || contentReferences > 0;
    const reconnectable = connection.platform === "tistory" && ["disconnected", "failed", "expired", "verification_required"].includes(connection.status);
    const connecting = connection.status === "connecting";
    const disconnectable = ["connected", "failed", "expired", "verification_required"].includes(connection.status);

    return <article className="rounded-xl border p-4" key={connection.id}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">{connection.displayName}</h3>
          <p className="mt-1 text-sm font-medium text-[#55555d]">계정 상태 · {connectionStatusLabel(connection.status)}</p>
          {connection.platform === "tistory" ? <p className={`mt-1 text-sm ${tistorySessionTone(connection)}`}>세션 상태 · {tistorySessionLabel(connection)}</p> : null}
          <p className="mt-1 text-sm text-[#77777f]">권한 상태 · {connection.permissions.includes("draft.create") ? "임시저장 권한 있음" : "임시저장 권한 없음"}</p>
          <p className="mt-1 text-xs text-[#92929a]">마지막 로그인 확인: {connection.lastVerifiedAt ? new Date(connection.lastVerifiedAt).toLocaleString("ko-KR") : "기록 없음"}</p>
          {hasReferences ? <p className={`mt-2 text-sm font-medium ${connection.status === "connected" ? "text-emerald-700" : connecting ? "text-blue-700" : "text-amber-800"}`}>{connecting
            ? `기존 Project ${projectReferences}개 · Content ${contentReferences}개 참조 유지 중`
            : connection.status === "connected"
              ? `Project ${projectReferences}개 · Content ${contentReferences}개 참조 유지됨`
              : `참조 Project ${projectReferences}개 · Content ${contentReferences}개`}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={connecting} onClick={() => { if (reconnectable) setDeletion(undefined); void onAction({ action: "verify", connectionId: connection.id }); }} type="button">{connecting ? "연결 중…" : reconnectable ? "다시 연결" : connection.platform === "tistory" ? "세션 확인/갱신" : "연결 확인"}</button>
          {disconnectable ? <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => void onAction({ action: "disconnect", connectionId: connection.id })} type="button">연결 해제</button> : connection.status === "disconnected" ? <span className="rounded-lg bg-[#f8f8fa] px-3 py-2 text-sm font-semibold text-[#77777f]">연결 해제됨</span> : <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">기존 참조 유지</span>}
          {connection.status === "disconnected" ? <button className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => void onAction({ action: "connection-impact", connectionId: connection.id }).then((result) => { const impact = (result as { impact: { projectCount: number; contentCount: number } }).impact; setDeletion({ id: connection.id, ...impact, replacementConnectionId: "" }); })} type="button">계정 메타데이터 삭제</button> : null}
        </div>
      </div>

      {activeDeletion?.id === connection.id ? <div className="mt-4 rounded-xl border border-red-200 p-4">
        <p className="text-sm text-red-800">참조 Project {activeDeletion.projectCount}개 · Content {activeDeletion.contentCount}개</p>
        {needsMigration ? <div className="mt-3">
          <label className="block text-sm font-semibold">참조를 이전할 정상 연결
            <select className="mt-2 w-full rounded-lg border px-3 py-2 font-normal" onChange={(event) => setDeletion({ ...activeDeletion, replacementConnectionId: event.target.value })} value={activeDeletion.replacementConnectionId}>
              <option value="">정상 연결 선택</option>
              {replacements.map((replacement) => <option key={replacement.id} value={replacement.id}>{replacement.displayName} · 연결됨{replacement.lastVerifiedAt ? ` · ${new Date(replacement.lastVerifiedAt).toLocaleString("ko-KR")}` : ""}</option>)}
            </select>
          </label>
          {replacements.length ? <p className="mt-2 text-xs text-[#77777f]">Project·Content·카테고리 준비 정보를 선택한 연결로 이전한 뒤 현재 연결 메타데이터를 삭제합니다.</p> : <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">같은 사이트의 별도 정상 연결이 없습니다. 이 카드의 ‘다시 연결’을 사용하면 같은 연결 ID와 기존 참조가 그대로 유지됩니다.</p>}
        </div> : <p className="mt-3 text-sm text-[#77777f]">현재 연결을 참조하는 Project와 Content가 없어 바로 삭제할 수 있습니다.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!canDelete} onClick={() => void onAction(needsMigration ? { action: "migrate-delete-connection", connectionId: connection.id, replacementConnectionId: activeDeletion.replacementConnectionId } : { action: "delete-connection", connectionId: connection.id }).then(() => setDeletion(undefined))} type="button">{needsMigration ? "참조 이전 후 삭제" : "메타데이터 삭제"}</button>
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
    && (candidate.platform !== "tistory" || candidate.publicMetadata.sessionStateAvailable === true)
    && publicConnectionIdentity(candidate) === sourceIdentity);
}

function publicConnectionIdentity(connection: PublicConnection): string {
  if (connection.platform === "tistory") {
    return String(connection.publicMetadata.blogId ?? "").trim().toLocaleLowerCase("en-US");
  }
  return String(connection.publicMetadata.siteUrl ?? "").trim().replace(/\/$/u, "").toLocaleLowerCase("en-US");
}

function connectionStatusLabel(status: PublicConnection["status"]): string {
  if (status === "connected") return "계정 등록됨";
  if (status === "connecting") return "연결 확인 중";
  if (status === "verification_required") return "세션 확인 필요";
  if (status === "expired") return "세션 만료";
  if (status === "disconnected") return "연결 해제됨";
  if (status === "failed") return "연결 확인 실패";
  return status;
}

function tistorySessionLabel(connection: PublicConnection): string {
  if (connection.status === "connecting") return "로그인 확인 중";
  if (connection.status === "expired") return "만료됨 · 다시 연결 필요";
  if (connection.status === "verification_required") return "확인 필요 · 세션 확인/갱신을 실행해 주세요";
  if (connection.status === "disconnected" || connection.status === "failed") return "사용 불가 · 다시 연결 필요";
  return connection.publicMetadata.sessionStateAvailable === true
    ? "저장된 로그인 정보 있음 · 현재 로그인 상태는 세션 확인/갱신으로 확인"
    : "저장된 로그인 정보 없음 · 다시 연결 필요";
}

function tistorySessionTone(connection: PublicConnection): string {
  if (connection.status === "expired" || connection.status === "disconnected" || connection.status === "failed") return "text-amber-800";
  if (connection.status === "connecting" || connection.status === "verification_required") return "text-blue-700";
  return "text-[#77777f]";
}

function Rename({ connection, onAction }: { connection: PublicConnection; onAction: (body: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState(connection.displayName);
  return <div className="mt-4 flex gap-2 border-t pt-4"><input aria-label={`${connection.displayName} 계정 이름`} className="flex-1 rounded-lg border px-3 py-2 text-sm" maxLength={80} onChange={(event) => setName(event.target.value)} value={name} /><button className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={!name.trim() || name.trim() === connection.displayName} onClick={() => void onAction({ action: "rename", connectionId: connection.id, displayName: name })} type="button">이름 저장</button></div>;
}
function Platform({ children, description, title }: { children: React.ReactNode; description: string; title: string }) { return <section className="rounded-[20px] border bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 mb-5 text-sm text-[#77777f]">{description}</p>{children}</section>; }
function Unsupported({ title }: { title: string }) { return <Platform title={title} description="현재 연결 workflow가 구현되지 않았습니다."><p className="rounded-xl bg-[#f8f8fa] p-4 text-sm text-[#77777f]">아직 지원하지 않음</p></Platform>; }
function Field({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) { return <label className="text-sm font-semibold">{label}<input className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} /></label>; }
export function jobNotice(job: { message: string; failureCode?: string; safeMessage?: string; remediation?: string }) { return job.failureCode ? `${job.safeMessage ?? job.message} ${job.remediation ?? ""}`.trim() : job.message; }
