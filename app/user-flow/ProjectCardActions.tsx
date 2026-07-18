"use client";

import { useState } from "react";

import type { UserProject } from "./user-data";

type Impact = Readonly<{
  name: string; contentCount: number; draftCount: number; historyCount: number; autosaveCount: number;
  mediaCount: number; qualityReportCount: number; publishingRecordCount: number; scheduleRecordCount: number;
  publishingPreparationCount: number;
}>;

export function ProjectCardActions({ brandName, project, workspaceId, onCreateToday, onDeleted, onRename }: {
  brandName?: string; project: UserProject; workspaceId: string;
  onCreateToday: () => void; onDeleted: () => Promise<void>; onRename: (name: string) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "rename" | "delete">("idle");
  const [name, setName] = useState(project.name);
  const [impact, setImpact] = useState<Impact>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const openRename = () => { setMenuOpen(false); setName(project.name); setNotice(""); setMode("rename"); };
  const openDelete = async () => {
    setMenuOpen(false); setMode("delete"); setImpact(undefined); setNotice(""); setBusy(true);
    try { const result = await deletionCall({ action: "project-impact", workspaceId, projectId: project.id }); setImpact(result.impact as Impact); }
    catch { setNotice("삭제 영향을 확인하지 못했습니다. 프로젝트는 변경되지 않았습니다."); }
    finally { setBusy(false); }
  };
  const saveRename = async () => {
    if (!name.trim()) return; setBusy(true); setNotice("");
    try { await onRename(name); setMode("idle"); }
    catch { setNotice("프로젝트 이름을 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!impact) return; setBusy(true); setNotice("");
    try {
      const result = await deletionCall({ action: "delete-project", workspaceId, projectId: project.id });
      if (result.status === "cleanup_required") { setNotice(`백업 ${String(result.backupName ?? "생성됨")} · ${String(result.error ?? "삭제 정리 상태를 확인해 주세요.")}`); return; }
      await onDeleted(); setMode("idle");
    } catch { setNotice("프로젝트를 삭제하지 못했습니다. 기존 프로젝트는 유지됩니다."); }
    finally { setBusy(false); }
  };

  return <div className="relative">
    <button aria-expanded={menuOpen} aria-haspopup="menu" aria-label={`${project.name} 프로젝트 더보기`} className="rounded-lg px-2.5 py-1.5 text-xl leading-none text-[#65656d] hover:bg-[#f3f3f5]" onClick={() => setMenuOpen((value) => !value)} type="button">⋮</button>
    <div aria-label={`${project.name} 프로젝트 작업`} className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-black/8 bg-white p-1.5 shadow-xl" hidden={!menuOpen} role="menu">
      <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8f8fa]" onClick={onCreateToday} role="menuitem" type="button">오늘 글 작성</button>
      <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8f8fa]" onClick={openRename} role="menuitem" type="button">프로젝트 수정</button>
      <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" onClick={() => void openDelete()} role="menuitem" type="button">프로젝트 삭제</button>
    </div>
    {mode === "rename" ? <Dialog title="프로젝트 수정" onClose={() => setMode("idle")}><label className="block text-sm font-semibold">프로젝트 이름<input aria-label="수정할 프로젝트 이름" autoFocus className="mt-2 w-full rounded-xl border px-4 py-3 font-normal" onChange={(event) => setName(event.target.value)} value={name} /></label><div className="mt-5 flex gap-2"><button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={busy || !name.trim()} onClick={() => void saveRename()} type="button">저장</button><button className="rounded-xl border px-4 py-2.5 text-sm" disabled={busy} onClick={() => setMode("idle")} type="button">취소</button></div>{notice ? <p className="mt-3 text-sm text-red-700">{notice}</p> : null}</Dialog> : null}
    {mode === "delete" ? <Dialog title="프로젝트 삭제" onClose={() => !busy && setMode("idle")}><p className="text-sm"><strong>{project.name}</strong>{brandName ? ` · 브랜드 ${brandName}` : " · 연결된 브랜드 없음"}</p>{busy && !impact ? <p className="mt-4 text-sm">삭제 영향을 확인하고 있습니다.</p> : null}{impact ? <><ul className="mt-4 grid gap-2 rounded-xl bg-[#f8f8fa] p-4 text-sm sm:grid-cols-2"><li>Content {impact.contentCount}개</li><li>로컬 Draft {impact.draftCount}개</li><li>History {impact.historyCount}개</li><li>Autosave {impact.autosaveCount}개</li><li>Quality {impact.qualityReportCount}개</li><li>Publishing Preparation {impact.publishingPreparationCount}개</li><li>발행 기록 {impact.publishingRecordCount}개</li><li>예약 기록 {impact.scheduleRecordCount}개</li></ul><p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">삭제 전에 버전 백업을 생성합니다. Content, History, Autosave와 Publishing Preparation이 함께 제거되며 삭제 후 UI에서 복구할 수 없습니다. 아래 버튼을 누르면 즉시 백업 후 삭제합니다.</p><button className="mt-4 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40" disabled={busy} onClick={() => void remove()} type="button">백업 후 프로젝트 삭제</button></> : null}{notice ? <p aria-live="polite" className="mt-3 text-sm text-red-700">{notice}</p> : null}</Dialog> : null}
  </div>;
}

function Dialog({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"><section aria-labelledby="project-dialog-title" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-[20px] bg-white p-6 shadow-2xl" role="dialog"><div className="flex items-center justify-between gap-4"><h2 className="text-xl font-semibold" id="project-dialog-title">{title}</h2><button aria-label={`${title} 닫기`} className="rounded-lg border px-3 py-1.5" onClick={onClose} type="button">닫기</button></div><div className="mt-5">{children}</div></section></div>; }
async function deletionCall(body: unknown) { const response = await fetch("/api/deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json() as Record<string, unknown>; if (!response.ok && result.status !== "cleanup_required") throw new Error("Deletion failed"); return result; }
