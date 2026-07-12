import Link from "next/link";

import { GlobalHeader } from "../shared/ui/GlobalHeader";
import { PageContainer } from "../shared/ui/PageContainer";
import { workspaceFixtures } from "../workspaces/workspace-fixtures";
import { PublishAction } from "./PublishAction";
import type { PublishPreparationState } from "./publish-preparation-fixtures";

export function PublishPreparation({ state }: { state: PublishPreparationState }) {
  const editorHref = `/workspaces/${state.workspace.id}/projects/${state.project.id}/contents/${state.content.id}/edit`;
  const dashboardHref = `/workspaces/${state.workspace.id}/projects/${state.project.id}`;

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Publish" selectedWorkspaceId={state.workspace.id} workspaces={workspaceFixtures} />
      <PageContainer className="py-8 sm:py-10 lg:py-12">
        <nav aria-label="발행 준비 탐색" className="flex flex-wrap gap-4 text-sm font-semibold text-[#77777f]">
          <Link className="transition hover:text-[#19191b]" href={editorHref}>← 편집기로 돌아가기</Link>
          <Link className="transition hover:text-[#19191b]" href={dashboardHref}>프로젝트 대시보드</Link>
        </nav>

        <header className="mt-6 flex flex-col gap-5 border-b border-black/6 pb-7 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{state.workspace.name} / {state.project.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">발행 준비</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#77777f] sm:text-base"><span className="font-semibold text-[#44444b]">{state.content.title}</span> 콘텐츠의 발행 준비 상태를 확인하세요.</p>
          </div>
          <span className="w-fit rounded-full bg-[#fff7e6] px-3 py-1.5 text-xs font-semibold text-[#9a6700]">발행 연결 준비 중</span>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <section aria-labelledby="readiness-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
            <h2 className="text-lg font-semibold tracking-[-0.025em]" id="readiness-title">발행 준비 상태</h2>
            <p className="mt-1 text-sm text-[#8b8b93]">이 화면에서는 발행 준비 상태만 확인할 수 있습니다.</p>
            <ul className="mt-6 space-y-3">
              {state.checklist.map((item) => (
                <li className="flex flex-col gap-2 rounded-2xl bg-[#f8f8fa] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4" key={item.id}>
                  <div>
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[#92929a]">{item.detail}</p>
                  </div>
                  <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === "ready" ? "bg-[#eef8f0] text-[#397847]" : "bg-[#fff7e6] text-[#9a6700]"}`}>{formatStatus(item.status)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="platform-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
            <h2 className="text-lg font-semibold tracking-[-0.025em]" id="platform-title">플랫폼</h2>
            <div className="mt-5 rounded-2xl bg-[#f8f8fa] p-4">
              <p className="text-sm font-semibold">{state.platform.name}</p>
              <p className="mt-1 text-xs leading-5 text-[#92929a]">발행 플랫폼 연결 기능은 아직 준비 중입니다.</p>
            </div>
          </section>
        </div>

        <section aria-labelledby="publish-action-title" className="mt-6">
          <h2 className="sr-only" id="publish-action-title">발행 동작</h2>
          <PublishAction />
        </section>
      </PageContainer>
    </main>
  );
}

function formatStatus(status: string): string {
  return status === "ready" ? "준비됨" : "대기 중";
}
