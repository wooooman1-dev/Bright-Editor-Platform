import Link from "next/link";

import type { WorkspaceSummary } from "../view-models/workspace";
import { PageContainer } from "./PageContainer";

const navigationItems = [
  { id: "Home", label: "홈" },
  { id: "Projects", label: "프로젝트" },
  { id: "Library", label: "라이브러리" },
  { id: "Templates", label: "템플릿" },
  { id: "Publish", label: "발행" },
  { id: "Analytics", label: "분석" },
  { id: "Settings", label: "설정" },
] as const;
type NavigationItem = (typeof navigationItems)[number]["id"];

export function GlobalHeader({
  activeItem,
  selectedWorkspaceId,
  workspaces,
}: {
  activeItem: NavigationItem;
  selectedWorkspaceId?: string;
  workspaces: readonly WorkspaceSummary[];
}) {
  return (
    <header className="border-b border-black/6 bg-white">
      <PageContainer className="flex flex-wrap items-center gap-4 py-4">
        <Link aria-label="Bright Studio 홈" className="flex shrink-0 items-center gap-3" href="/">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-[13px] bg-[#ff6b6b] font-bold text-white shadow-[0_8px_24px_rgba(255,107,107,0.24)]">B</span>
          <span className="text-lg font-semibold tracking-[-0.03em]">Bright Studio</span>
        </Link>
        <WorkspaceSelector selectedWorkspaceId={selectedWorkspaceId} workspaces={workspaces} />
        <nav aria-label="전체 탐색" className="order-3 w-full overflow-x-auto lg:order-2 lg:ml-auto lg:w-auto">
          <ul className="flex min-w-max items-center gap-1">
            {navigationItems.map((item) => (
              <li key={item.id}>
                <Link aria-current={item.id === activeItem ? "page" : undefined} className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${item.id === activeItem ? "bg-[#fff0f0] text-[#d94848]" : "text-[#65656d] hover:bg-[#f8f8fa] hover:text-[#19191b]"}`} href={item.id === "Home" ? "/" : `#${item.id.toLowerCase()}`}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageContainer>
    </header>
  );
}

function WorkspaceSelector({ selectedWorkspaceId, workspaces }: { selectedWorkspaceId?: string; workspaces: readonly WorkspaceSummary[] }) {
  if (workspaces.length === 0) return null;

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0];
  if (workspaces.length === 1) return <span className="order-2 ml-auto text-sm font-medium text-[#65656d] lg:order-3 lg:ml-3">{selectedWorkspace.name}</span>;

  return (
    <label className="order-2 ml-auto lg:order-3 lg:ml-3">
      <span className="sr-only">워크스페이스 전환 준비 중</span>
      <select aria-disabled="true" className="max-w-44 cursor-not-allowed rounded-xl border border-black/8 bg-[#fafafa] px-3 py-2 text-sm font-medium text-[#77777f] opacity-80" defaultValue={selectedWorkspace.id} disabled>
        {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
    </label>
  );
}
