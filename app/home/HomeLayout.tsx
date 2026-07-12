import Link from "next/link";

import type { HomeState, ProjectSummary } from "./home-state";

const navigationItems = ["Home", "Projects", "Library", "Templates", "Publish", "Analytics", "Settings"] as const;
const quickActions = [
  { label: "New project", detail: "Start with a clear goal", symbol: "+" },
  { label: "Open library", detail: "Reuse trusted content", symbol: "L" },
  { label: "Browse templates", detail: "Begin from a proven structure", symbol: "T" },
] as const;

export function HomeLayout({ state }: { state: HomeState }) {
  const workspace = state.workspaces.find((item) => item.id === state.selectedWorkspaceId);
  const isGettingStarted = state.name === "first-visit" || state.name === "empty-workspace";

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <HomeHeader state={state} />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
        <section aria-labelledby="home-title" className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{workspace?.name ?? "Bright Studio"}</p>
            <h1 id="home-title" className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{homeCopy[state.name].title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#77777f] sm:text-base">{homeCopy[state.name].description}</p>
          </div>
          {state.name !== "first-visit" ? <PrimaryLink href="#quick-actions">New project</PrimaryLink> : null}
        </section>

        <div className="mt-8 space-y-8">
          {state.activeProject ? <ContinueWorking project={state.activeProject} /> : null}
          {state.name === "first-visit" ? <GettingStarted kind="workspace" /> : null}
          {state.name === "empty-workspace" ? <GettingStarted kind="project" /> : null}
          {state.recentProjects.length > 0 ? <RecentProjects projects={state.recentProjects} /> : null}
          <QuickActions compact={isGettingStarted} />
        </div>
      </div>
    </main>
  );
}

function HomeHeader({ state }: { state: HomeState }) {
  return (
    <header className="border-b border-black/6 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <Link className="flex shrink-0 items-center gap-3" href="/" aria-label="Bright Studio home">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-[13px] bg-[#ff6b6b] font-bold text-white shadow-[0_8px_24px_rgba(255,107,107,0.24)]">B</span>
          <span className="text-lg font-semibold tracking-[-0.03em]">Bright Studio</span>
        </Link>
        <WorkspaceSelector state={state} />
        <nav aria-label="Global navigation" className="order-3 w-full overflow-x-auto lg:order-2 lg:ml-auto lg:w-auto">
          <ul className="flex min-w-max items-center gap-1">
            {navigationItems.map((item) => (
              <li key={item}>
                <a aria-current={item === "Home" ? "page" : undefined} className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${item === "Home" ? "bg-[#fff0f0] text-[#d94848]" : "text-[#65656d] hover:bg-[#f8f8fa] hover:text-[#19191b]"}`} href={item === "Home" ? "/" : `#${item.toLowerCase()}`}>{item}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function WorkspaceSelector({ state }: { state: HomeState }) {
  if (state.workspaces.length === 0) return <span className="order-2 ml-auto rounded-xl border border-black/8 bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#77777f]">No workspace</span>;

  return (
    <label className="order-2 ml-auto lg:order-3 lg:ml-3">
      <span className="sr-only">Workspace</span>
      <select className="max-w-44 rounded-xl border border-black/8 bg-[#fafafa] px-3 py-2 text-sm font-medium text-[#44444b] outline-none focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10" defaultValue={state.selectedWorkspaceId ?? state.workspaces[0].id}>
        {state.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
    </label>
  );
}

function ContinueWorking({ project }: { project: NonNullable<HomeState["activeProject"]> }) {
  return (
    <section aria-labelledby="continue-title" className="overflow-hidden rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_16px_50px_rgba(24,24,27,0.06)] sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">Continue Working</p>
          <h2 id="continue-title" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{project.name}</h2>
          <p className="mt-2 text-sm text-[#77777f]">{project.nextAction}</p>
        </div>
        <PrimaryLink href={`#project-${project.id}`}>Continue project</PrimaryLink>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs font-medium"><span className="text-[#77777f]">Project progress</span><span className="text-[#d94848]">{project.progress}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-[#f0f0f2]"><div className="h-full rounded-full bg-[#ff6b6b]" style={{ width: `${project.progress}%` }} /></div>
      </div>
    </section>
  );
}

function GettingStarted({ kind }: { kind: "workspace" | "project" }) {
  const isWorkspace = kind === "workspace";
  return (
    <section aria-labelledby="getting-started-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-8">
      <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{isWorkspace ? "Start here" : "Workspace ready"}</p>
      <h2 id="getting-started-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{isWorkspace ? "Create your first workspace" : "Create the first project for this workspace"}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#77777f]">{isWorkspace ? "A workspace represents one brand. Create it first, then add a project with a clear goal." : "A project is one goal inside this workspace. Content will be created as its deliverables."}</p>
      <button className="mt-5 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)]" type="button">Create {kind}</button>
    </section>
  );
}

function RecentProjects({ projects }: { projects: readonly ProjectSummary[] }) {
  return (
    <section aria-labelledby="recent-title">
      <SectionHeading description="Return to the projects you touched most recently." id="recent-title" title="Recent Projects" />
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <article className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]" id={`project-${project.id}`} key={project.id}>
            <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#d94848]">{formatStatus(project.status)}</span><span className="text-xs text-[#92929a]">{project.updatedAt}</span></div>
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{project.name}</h3>
            <p className="mt-2 text-sm leading-6 text-[#77777f]">{project.description}</p>
            <a className="mt-5 inline-flex text-sm font-semibold text-[#d94848]" href={`#open-${project.id}`}>Open project →</a>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuickActions({ compact }: { compact: boolean }) {
  const actions = compact ? quickActions.slice(0, 1) : quickActions;
  return (
    <section aria-labelledby="quick-title" id="quick-actions">
      <SectionHeading description="Choose the shortest path to your next task." id="quick-title" title="Quick Actions" />
      <div className={`mt-4 grid gap-3 ${compact ? "max-w-md" : "sm:grid-cols-3"}`}>
        {actions.map((action) => (
          <button className="flex items-center gap-3 rounded-[20px] border border-black/6 bg-white p-4 text-left shadow-[0_8px_30px_rgba(24,24,27,0.04)] transition hover:-translate-y-0.5" key={action.label} type="button">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#fff0f0] text-sm font-bold text-[#e85656]">{action.symbol}</span>
            <span><span className="block text-sm font-semibold">{action.label}</span><span className="mt-1 block text-xs text-[#92929a]">{action.detail}</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SectionHeading({ description, id, title }: { description: string; id: string; title: string }) {
  return <div><h2 id={id} className="text-lg font-semibold tracking-[-0.025em]">{title}</h2><p className="mt-1 text-sm text-[#8b8b93]">{description}</p></div>;
}

function PrimaryLink({ children, href }: { children: React.ReactNode; href: string }) {
  return <a className="inline-flex w-fit shrink-0 items-center justify-center rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)] transition hover:bg-[#f45d5d] focus:ring-4 focus:ring-[#ff6b6b]/20 focus:outline-none" href={href}>{children}</a>;
}

const homeCopy: Record<HomeState["name"], { title: string; description: string }> = {
  "first-visit": { title: "Build your content home", description: "Start with one brand workspace and give every project a clear purpose." },
  "empty-workspace": { title: "Your workspace is ready", description: "Add a project to turn this brand into a focused content workflow." },
  working: { title: "Ready for the next step", description: "Continue the active project or choose another recent goal." },
  "power-user": { title: "Pick up where you left off", description: "Your active work and recent projects are ready without extra searching." },
  "publish-complete": { title: "Published. Keep the momentum", description: "Your latest work is live. Continue the project or begin the next goal." },
};

function formatStatus(status: ProjectSummary["status"]): string {
  return status.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}
