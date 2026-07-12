import Link from "next/link";

import { GlobalHeader } from "../shared/ui/GlobalHeader";
import { PageContainer } from "../shared/ui/PageContainer";
import type { ProjectSummary } from "../shared/view-models/workspace";
import { workspaceFixtures, type WorkspaceViewState } from "./workspace-fixtures";

export function WorkspaceLayout({ state }: { state: WorkspaceViewState }) {
  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Projects" selectedWorkspaceId={state.workspace.id} workspaces={workspaceFixtures} />
      <PageContainer className="py-8 sm:py-10 lg:py-12">
        <header className="flex flex-col gap-5 border-b border-black/6 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">워크스페이스 · 브랜드</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{state.workspace.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#77777f] sm:text-base">{state.workspace.description}</p>
          </div>
          <button aria-disabled="true" className="w-fit cursor-not-allowed rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white opacity-70 shadow-[0_8px_20px_rgba(255,107,107,0.22)]" disabled type="button">새 프로젝트 · 준비 중</button>
        </header>

        <section aria-labelledby="workspace-info-title" className="mt-8 rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
          <h2 id="workspace-info-title" className="text-lg font-semibold tracking-[-0.025em]">워크스페이스 정보</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="브랜드" value={state.workspace.name} />
            <Info label="대상 독자" value={state.workspace.audience ?? "정의되지 않음"} />
            <Info label="최근 활동" value={state.workspace.updatedAt ?? "최근 활동 없음"} />
          </dl>
        </section>

        {state.projects.length > 0 ? <ProjectList projects={state.projects} /> : <EmptyWorkspace workspaceName={state.workspace.name} />}
      </PageContainer>
    </main>
  );
}

function ProjectList({ projects }: { projects: readonly ProjectSummary[] }) {
  return (
    <section aria-labelledby="workspace-projects-title" className="mt-8">
      <div><h2 id="workspace-projects-title" className="text-lg font-semibold tracking-[-0.025em]">프로젝트</h2><p className="mt-1 text-sm text-[#8b8b93]">이 워크스페이스 안에서 관리하는 목적입니다.</p></div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <article className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]" key={project.id}>
            <div className="flex items-start justify-between gap-3"><StatusBadge status={project.status} /><span className="text-xs text-[#92929a]">{project.updatedAt}</span></div>
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{project.name}</h3>
            <p className="mt-2 text-sm leading-6 text-[#77777f]">{project.description}</p>
            <Link className="mt-5 inline-flex text-sm font-semibold text-[#d94848]" href={`/workspaces/${project.workspaceId}/projects/${project.id}`}>프로젝트 열기</Link>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyWorkspace({ workspaceName }: { workspaceName: string }) {
  return (
    <section aria-labelledby="empty-workspace-title" className="mt-8 rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-8">
      <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">비어 있는 워크스페이스</p>
      <h2 id="empty-workspace-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{workspaceName}의 첫 프로젝트를 만드세요</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#77777f]">프로젝트는 이 브랜드에 명확한 목적을 부여합니다. 프로젝트 생성 기능은 준비 중입니다.</p>
      <button aria-disabled="true" className="mt-5 cursor-not-allowed rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white opacity-70" disabled type="button">프로젝트 만들기 · 준비 중</button>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold tracking-[0.08em] text-[#92929a] uppercase">{label}</dt><dd className="mt-2 text-sm font-medium text-[#44444b]">{value}</dd></div>;
}

function StatusBadge({ status }: { status: ProjectSummary["status"] }) {
  const label = { planning: "기획 중", "in-progress": "진행 중", review: "검토 중", complete: "완료" }[status];
  return <span className="rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#d94848]">{label}</span>;
}
