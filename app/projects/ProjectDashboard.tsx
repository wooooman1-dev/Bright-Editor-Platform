import Link from "next/link";

import { GlobalHeader } from "../shared/ui/GlobalHeader";
import type { ContentSummary } from "../shared/view-models/content";
import type { ProjectSummary } from "../shared/view-models/workspace";
import { workspaceFixtures } from "../workspaces/workspace-fixtures";
import type { ProjectDashboardState } from "./project-dashboard-fixtures";

export function ProjectDashboard({ state }: { state: ProjectDashboardState }) {
  const contentCount = state.contents.length;
  const publishPercent = state.details.publishProgress.total === 0
    ? 0
    : Math.round((state.details.publishProgress.published / state.details.publishProgress.total) * 100);

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Projects" selectedWorkspaceId={state.workspace.id} workspaces={workspaceFixtures} />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <Link className="inline-flex text-sm font-semibold text-[#77777f] transition hover:text-[#19191b]" href={`/workspaces/${state.workspace.id}`}>
          ← Back to {state.workspace.name}
        </Link>

        <header className="mt-6 flex flex-col gap-5 border-b border-black/6 pb-8 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Project Dashboard</p>
              <StatusBadge status={state.project.status} />
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{state.project.name}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#77777f] sm:text-base">{state.project.description}</p>
          </div>
          <div aria-label="Project actions" className="flex flex-wrap gap-2">
            {state.details.actions.map((action) => (
              <button aria-disabled="true" className="cursor-not-allowed rounded-xl border border-black/8 bg-white px-4 py-2.5 text-sm font-semibold text-[#8b8b93]" disabled key={action} type="button">
                {action} · Coming soon
              </button>
            ))}
          </div>
        </header>

        <section aria-labelledby="project-overview-title" className="mt-8">
          <h2 className="sr-only" id="project-overview-title">Project overview</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Created" value={state.details.createdAt} />
            <Metric label="Last updated" value={state.project.updatedAt} />
            <Metric label="Content" value={`${contentCount}`} />
            <Metric label="Published" value={`${state.details.publishProgress.published} of ${state.details.publishProgress.total}`} />
          </dl>
        </section>

        <section aria-labelledby="publish-progress-title" className="mt-6 rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em]" id="publish-progress-title">Publish progress</h2>
              <p className="mt-1 text-sm text-[#8b8b93]">A read-only summary of this project&apos;s content progress.</p>
            </div>
            <span className="text-sm font-semibold text-[#d94848]">{publishPercent}%</span>
          </div>
          <div aria-label={`${publishPercent}% published`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={publishPercent} className="mt-5 h-2 overflow-hidden rounded-full bg-[#f0f0f2]" role="progressbar">
            <div className="h-full rounded-full bg-[#ff6b6b]" style={{ width: `${publishPercent}%` }} />
          </div>
        </section>

        <section aria-labelledby="project-contents-title" className="mt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.025em]" id="project-contents-title">Content</h2>
              <p className="mt-1 text-sm text-[#8b8b93]">Deliverables owned by this project.</p>
            </div>
            <button aria-disabled="true" className="w-fit cursor-not-allowed rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white opacity-70" disabled type="button">
              New content · Coming soon
            </button>
          </div>

          {contentCount > 0 ? <ContentList contents={state.contents} projectId={state.project.id} workspaceId={state.workspace.id} /> : <EmptyContentState />}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]">
      <dt className="text-xs font-semibold tracking-[0.08em] text-[#92929a] uppercase">{label}</dt>
      <dd className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[#44444b]">{value}</dd>
    </div>
  );
}

function ContentList({ contents, projectId, workspaceId }: { contents: readonly ContentSummary[]; projectId: string; workspaceId: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-[24px] border border-black/6 bg-white shadow-[0_10px_40px_rgba(24,24,27,0.045)]">
      <ul className="divide-y divide-black/6">
        {contents.map((content) => (
          <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" key={content.id}>
            <div className="min-w-0">
              <h3 className="font-semibold tracking-[-0.015em]">
                <Link className="transition hover:text-[#d94848]" href={`/workspaces/${workspaceId}/projects/${projectId}/contents/${content.id}/edit`}>{content.title}</Link>
              </h3>
              <p className="mt-1 text-xs text-[#92929a]">Updated {content.updatedAt}</p>
            </div>
            <ContentStatusBadge status={content.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyContentState() {
  return (
    <div className="mt-4 rounded-[24px] border border-dashed border-black/10 bg-white p-7 text-center sm:p-10">
      <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">No content yet</p>
      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">This project is ready for its first content</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#77777f]">Content creation will be available in the Editor feature. This project remains available to manage now.</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ProjectSummary["status"] }) {
  return <span className="rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#d94848]">{formatStatus(status)}</span>;
}

function ContentStatusBadge({ status }: { status: ContentSummary["status"] }) {
  return <span className="w-fit shrink-0 rounded-full bg-[#f2f2f4] px-2.5 py-1 text-[11px] font-semibold text-[#65656d]">{formatStatus(status)}</span>;
}

function formatStatus(status: string): string {
  return status.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
