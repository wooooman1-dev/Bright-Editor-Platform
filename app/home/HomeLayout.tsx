import type { ProjectSummary } from "../shared/view-models/workspace";
import { GlobalHeader } from "../shared/ui/GlobalHeader";
import { PageContainer } from "../shared/ui/PageContainer";
import type { HomeState } from "./home-state";

const quickActions = [
  { label: "새 프로젝트", detail: "명확한 목표로 시작하기", symbol: "+" },
  { label: "라이브러리 열기", detail: "검증된 콘텐츠 다시 활용하기", symbol: "L" },
  { label: "템플릿 둘러보기", detail: "준비된 구조에서 시작하기", symbol: "T" },
] as const;

export function HomeLayout({ state }: { state: HomeState }) {
  const workspace = state.workspaces.find((item) => item.id === state.selectedWorkspaceId);
  const isGettingStarted = state.name === "first-visit" || state.name === "empty-workspace";

  return (
    <main className="min-h-screen bg-[#f8f8fa] text-[#19191b]">
      <GlobalHeader activeItem="Home" selectedWorkspaceId={state.selectedWorkspaceId} workspaces={state.workspaces} />
      <PageContainer className="py-8 sm:py-10 lg:py-12">
        <section aria-labelledby="home-title" className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{workspace?.name ?? "Bright Studio"}</p>
            <h1 id="home-title" className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{homeCopy[state.name].title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#77777f] sm:text-base">{homeCopy[state.name].description}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {workspace ? <PrimaryLink href={`/workspaces/${workspace.id}`}>워크스페이스 열기</PrimaryLink> : null}
            {state.name !== "first-visit" ? <PrimaryLink href="#quick-actions">새 프로젝트</PrimaryLink> : null}
          </div>
        </section>

        <div className="mt-8 space-y-8">
          {state.activeProject ? <ContinueWorking project={state.activeProject} /> : null}
          {state.name === "first-visit" ? <GettingStarted kind="workspace" /> : null}
          {state.name === "empty-workspace" ? <GettingStarted kind="project" /> : null}
          {state.recentProjects.length > 0 ? <RecentProjects projects={state.recentProjects} /> : null}
          <QuickActions compact={isGettingStarted} />
        </div>
      </PageContainer>
    </main>
  );
}

function ContinueWorking({ project }: { project: NonNullable<HomeState["activeProject"]> }) {
  return (
    <section aria-labelledby="continue-title" className="overflow-hidden rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_16px_50px_rgba(24,24,27,0.06)] sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">이어서 작업하기</p>
          <h2 id="continue-title" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{project.name}</h2>
          <p className="mt-2 text-sm text-[#77777f]">{project.nextAction}</p>
        </div>
        <PrimaryLink href={`#project-${project.id}`}>프로젝트 이어가기</PrimaryLink>
      </div>
      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs font-medium"><span className="text-[#77777f]">프로젝트 진행률</span><span className="text-[#d94848]">{project.progress}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-[#f0f0f2]"><div className="h-full rounded-full bg-[#ff6b6b]" style={{ width: `${project.progress}%` }} /></div>
      </div>
    </section>
  );
}

function GettingStarted({ kind }: { kind: "workspace" | "project" }) {
  const isWorkspace = kind === "workspace";
  return (
    <section aria-labelledby="getting-started-title" className="rounded-[24px] border border-black/6 bg-white p-6 shadow-[0_10px_40px_rgba(24,24,27,0.045)] sm:p-8">
      <p className="text-xs font-semibold tracking-[0.14em] text-[#ff6b6b] uppercase">{isWorkspace ? "여기서 시작하세요" : "워크스페이스 준비 완료"}</p>
      <h2 id="getting-started-title" className="mt-2 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{isWorkspace ? "첫 워크스페이스 만들기" : "이 워크스페이스의 첫 프로젝트 만들기"}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[#77777f]">{isWorkspace ? "워크스페이스는 하나의 브랜드입니다. 먼저 워크스페이스를 만들고 명확한 목적의 프로젝트를 추가하세요." : "프로젝트는 워크스페이스 안의 하나의 목적입니다. 콘텐츠는 프로젝트의 실제 결과물로 만들어집니다."}</p>
      <button className="mt-5 rounded-xl bg-[#ff6b6b] px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(255,107,107,0.22)]" type="button">{isWorkspace ? "워크스페이스 만들기" : "프로젝트 만들기"}</button>
    </section>
  );
}

function RecentProjects({ projects }: { projects: readonly ProjectSummary[] }) {
  return (
    <section aria-labelledby="recent-title">
      <SectionHeading description="최근 작업한 프로젝트로 돌아가세요." id="recent-title" title="최근 프로젝트" />
      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <article className="rounded-[20px] border border-black/6 bg-white p-5 shadow-[0_8px_30px_rgba(24,24,27,0.04)]" id={`project-${project.id}`} key={project.id}>
            <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[#fff0f0] px-2.5 py-1 text-[11px] font-semibold text-[#d94848]">{formatStatus(project.status)}</span><span className="text-xs text-[#92929a]">{project.updatedAt}</span></div>
            <h3 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{project.name}</h3>
            <p className="mt-2 text-sm leading-6 text-[#77777f]">{project.description}</p>
            <a className="mt-5 inline-flex text-sm font-semibold text-[#d94848]" href={`#open-${project.id}`}>프로젝트 열기 →</a>
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
      <SectionHeading description="다음 작업으로 가장 빠르게 이동하세요." id="quick-title" title="빠른 작업" />
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
  "first-visit": { title: "콘텐츠 작업 공간을 시작하세요", description: "하나의 브랜드 워크스페이스를 만들고 각 프로젝트에 명확한 목적을 부여하세요." },
  "empty-workspace": { title: "워크스페이스가 준비되었습니다", description: "프로젝트를 추가해 이 브랜드의 콘텐츠 작업을 시작하세요." },
  working: { title: "다음 작업을 시작할 준비가 되었습니다", description: "진행 중인 프로젝트를 이어가거나 최근 프로젝트를 선택하세요." },
  "power-user": { title: "중단한 곳에서 이어가세요", description: "진행 중인 작업과 최근 프로젝트를 바로 확인할 수 있습니다." },
  "publish-complete": { title: "발행 준비를 이어가세요", description: "최근 작업을 확인하고 프로젝트의 다음 콘텐츠를 준비하세요." },
};

function formatStatus(status: ProjectSummary["status"]): string {
  return { planning: "기획 중", "in-progress": "진행 중", review: "검토 중", complete: "완료" }[status];
}
