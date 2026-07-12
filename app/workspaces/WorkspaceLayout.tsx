import { GlobalHeader } from "../shared/ui/GlobalHeader";
import type { ProjectSummary } from "../shared/view-models/workspace";
import { workspaceFixtures, type WorkspaceViewState } from "./workspace-fixtures";

export function WorkspaceLayout({ state }: { state: WorkspaceViewState }) {
  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Projects" selectedWorkspaceId={state.workspace.id} workspaces={workspaceFixtures} />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <header className="flex flex-col gap-5 border-b border-black/6 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Workspace · Brand</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{state.workspace.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#77777f] sm:text-base">{state.workspace.description}</p>
          </div>
          <button aria-disabled="true" className="w-fit cursor-not-allowed rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white opacity-70 shadow-[0_8px_20px_rgba(255,107,107,0.22)]" disabled type="button">New project · Coming soon</button>
        </header>

        <section aria-labelledby="workspace-info-title" className="mt-8 rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-7">
          <h2 id="workspace-info-title" className="text-lg font-semibold tracking-[-0.025em]">Workspace Information</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="Brand" value={state.workspace.name} />
            <Info label="Audience" value={state.workspace.audience ?? "Not defined"} />
            <Info label="Activity" value={state.workspace.updatedAt ?? "No recent activity"} />
          </dl>
        </section>

        {state.projects.length > 0 ? <ProjectList projects={state.projects} /> : <EmptyWorkspace workspaceName={state.workspace.name} />}
      </div>
    </main>
  );
}

function ProjectList({ projects }: { projects: readonly ProjectSummary[] }) {
  return (
    <section aria-labelledby="workspace-projects-title" className="mt-8">
      <div><h2 id="workspace-projects-title" className="text-lg font-semibold tracking-[-0.025em]">Projects</h2><p className="mt-1 text-sm text-[#8b8b93]">Goals currently organized inside this workspace.</p></div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <article className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]" key={project.id}>
            <div className="flex items-start justify-between gap-3"><StatusBadge status={project.status} /><span className="text-xs text-[#92929a]">{project.updatedAt}</span></div>
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{project.name}</h3>
            <p className="mt-2 text-sm leading-6 text-[#77777f]">{project.description}</p>
            <button aria-disabled="true" className="mt-5 cursor-not-allowed text-sm font-semibold text-[#a0a0a8]" disabled type="button">Project details · Coming soon</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyWorkspace({ workspaceName }: { workspaceName: string }) {
  return (
    <section aria-labelledby="empty-workspace-title" className="mt-8 rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-8">
      <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Empty Workspace</p>
      <h2 id="empty-workspace-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">Create the first project for {workspaceName}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#77777f]">Projects give this brand a clear purpose. Project creation will be available in the next workflow step.</p>
      <button aria-disabled="true" className="mt-5 cursor-not-allowed rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white opacity-70" disabled type="button">Create project · Coming soon</button>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold tracking-[0.08em] text-[#92929a] uppercase">{label}</dt><dd className="mt-2 text-sm font-medium text-[#44444b]">{value}</dd></div>;
}

function StatusBadge({ status }: { status: ProjectSummary["status"] }) {
  const label = status.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
  return <span className="rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#d94848]">{label}</span>;
}
