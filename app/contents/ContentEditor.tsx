import Link from "next/link";

import { GlobalHeader } from "../shared/ui/GlobalHeader";
import { PageContainer } from "../shared/ui/PageContainer";
import { workspaceFixtures } from "../workspaces/workspace-fixtures";
import type { ContentEditorState } from "./content-editor-fixtures";
import { ContentEditorForm } from "./ContentEditorForm";

export function ContentEditor({ state }: { state: ContentEditorState }) {
  const dashboardHref = `/workspaces/${state.workspace.id}/projects/${state.project.id}`;
  const publishHref = `/workspaces/${state.workspace.id}/projects/${state.project.id}/contents/${state.content.id}/publish`;

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Projects" selectedWorkspaceId={state.workspace.id} workspaces={workspaceFixtures} />
      <PageContainer className="py-8 sm:py-10 lg:py-12">
        <Link className="inline-flex text-sm font-semibold text-[#77777f] transition hover:text-[#19191b]" href={dashboardHref}>← 프로젝트 대시보드로 돌아가기</Link>

        <header className="mt-6 flex flex-col gap-5 border-b border-black/6 pb-7 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{state.workspace.name} / {state.project.name}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">콘텐츠 편집기</h1>
            <p className="mt-2 text-sm leading-6 text-[#77777f]">프로젝트의 실제 결과물을 집중해서 편집하세요.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#d94848]">{formatStatus(state.content.status)}</span>
            <span className="text-xs font-medium text-[#92929a]">최근 수정 {state.content.updatedAt}</span>
          </div>
        </header>

        <ContentEditorForm content={state.content} />

        <section aria-label="Editor actions" className="mt-4 flex flex-wrap gap-2">
          <Link className="rounded-xl border border-[#ff6b6b]/20 bg-[#fff0f0] px-4 py-2.5 text-sm font-semibold text-[#d94848] transition hover:bg-[#ffe7e7]" href={publishHref}>발행 준비 확인</Link>
          <button aria-disabled="true" className="cursor-not-allowed rounded-xl border border-black/8 bg-white px-4 py-2.5 text-sm font-semibold text-[#8b8b93]" disabled type="button">추가 편집 기능 · 준비 중</button>
        </section>
      </PageContainer>
    </main>
  );
}

function formatStatus(status: string): string {
  return { draft: "초안", "in-review": "검토 중", ready: "준비됨", published: "발행됨" }[status] ?? status;
}
