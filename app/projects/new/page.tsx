"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GlobalHeader } from "../../shared/ui/GlobalHeader";
import { PageContainer } from "../../shared/ui/PageContainer";
import { createProject, parseStoredUserData, type UserData } from "../../user-flow/user-data";

export default function NewProjectPage() {
  const [data, setData] = useState<UserData>();
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/studio", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { data?: UserData | null; error?: string };
        if (!response.ok || !result.data?.workspace) throw new Error(result.error ?? "Workspace를 불러오지 못했습니다.");
        const next = parseStoredUserData(JSON.stringify(result.data));
        const requestedWorkspaceId = new URLSearchParams(window.location.search).get("workspaceId");
        if (requestedWorkspaceId && requestedWorkspaceId !== next.workspace?.id) throw new Error("요청한 Workspace와 현재 Workspace가 일치하지 않습니다.");
        if (active) setData(next);
      })
      .catch((reason) => { if (active) setError(message(reason)); });
    return () => { active = false; };
  }, []);

  if (!data?.workspace) {
    return <main className="min-h-screen bg-[#f8f8fa] p-6 text-[#19191b]">{error ? <section className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6"><h1 className="text-xl font-semibold">Project 생성 화면을 열 수 없습니다.</h1><p className="mt-2 text-sm text-red-700">{error}</p><Link className="mt-5 inline-block font-semibold text-[#d94848]" href="/">Workspace로 돌아가기</Link></section> : null}</main>;
  }

  const settingsHref = `/workspaces/${encodeURIComponent(data.workspace.id)}/settings?section=data-sources`;

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const projectId = createId("project");
      const next = createProject(data, {
        id: projectId,
        name,
        brandName,
        description,
        brandIdFactory: () => createId("brand"),
        now: new Date().toISOString(),
      });
      const response = await fetch("/api/studio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const result = await response.json() as { data?: UserData; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Project를 저장하지 못했습니다.");
      window.location.assign(`${settingsHref}&projectId=${encodeURIComponent(projectId)}`);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
    <GlobalHeader activeItem="Projects" selectedWorkspaceId={data.workspace.id} workspaces={[{ id: data.workspace.id, name: data.workspace.name }]} />
    <PageContainer className="py-10 sm:py-14">
      <section className="mx-auto max-w-3xl rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_16px_50px_rgba(24,24,27,0.06)] sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">Project first</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">새 Project 만들기</h1>
        <p className="mt-3 text-sm leading-6 text-[#77777f]">Project는 브랜드·주제·독자·콘텐츠 전략 단위입니다. Tistory, WordPress, YouTube 같은 플랫폼은 Project 안에서 발행 대상으로 연결합니다.</p>
        <form className="mt-8" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Project 이름 *" onChange={setName} placeholder="예: 밝은재테크" value={name} />
            <Field label="브랜드 이름 (선택)" onChange={setBrandName} placeholder="예: 밝은재테크" value={brandName} />
          </div>
          <label className="mt-5 block text-sm font-semibold">Project 설명 (선택)<textarea className="mt-2 min-h-32 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-3 font-normal outline-none focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10" onChange={(event) => setDescription(event.target.value)} placeholder="대표 주제, 대상 독자, 운영 목적을 입력해 주세요." value={description} /></label>
          {error ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3"><button className="rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} type="submit">{busy ? "저장 중…" : "Project 만들고 데이터 소스 설정으로 돌아가기"}</button><Link className="rounded-xl border px-5 py-3 text-sm font-semibold" href={settingsHref}>취소</Link></div>
        </form>
      </section>
    </PageContainer>
  </main>;
}

function Field({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return <label className="block text-sm font-semibold">{label}<input className="mt-2 w-full rounded-xl border border-black/8 bg-[#fafafa] px-4 py-3 font-normal outline-none focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} /></label>;
}

function createId(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`; }
function message(error: unknown) { return error instanceof Error ? error.message : "Project 요청을 처리하지 못했습니다."; }
