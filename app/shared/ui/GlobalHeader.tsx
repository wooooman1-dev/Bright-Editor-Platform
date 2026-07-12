import Link from "next/link";

import type { WorkspaceSummary } from "../view-models/workspace";

const navigationItems = ["Home", "Projects", "Library", "Templates", "Publish", "Analytics", "Settings"] as const;
type NavigationItem = (typeof navigationItems)[number];

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
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-5 py-4 sm:px-8 lg:px-10">
        <Link aria-label="Bright Studio home" className="flex shrink-0 items-center gap-3" href="/">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-[13px] bg-[#ff6b6b] font-bold text-white shadow-[0_8px_24px_rgba(255,107,107,0.24)]">B</span>
          <span className="text-lg font-semibold tracking-[-0.03em]">Bright Studio</span>
        </Link>
        <WorkspaceSelector selectedWorkspaceId={selectedWorkspaceId} workspaces={workspaces} />
        <nav aria-label="Global navigation" className="order-3 w-full overflow-x-auto lg:order-2 lg:ml-auto lg:w-auto">
          <ul className="flex min-w-max items-center gap-1">
            {navigationItems.map((item) => (
              <li key={item}>
                <Link aria-current={item === activeItem ? "page" : undefined} className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${item === activeItem ? "bg-[#fff0f0] text-[#d94848]" : "text-[#65656d] hover:bg-[#f8f8fa] hover:text-[#19191b]"}`} href={item === "Home" ? "/" : `#${item.toLowerCase()}`}>{item}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function WorkspaceSelector({ selectedWorkspaceId, workspaces }: { selectedWorkspaceId?: string; workspaces: readonly WorkspaceSummary[] }) {
  if (workspaces.length === 0) return <span className="order-2 ml-auto rounded-xl border border-black/8 bg-[#fafafa] px-3 py-2 text-xs font-medium text-[#77777f]">No workspace</span>;

  return (
    <label className="order-2 ml-auto lg:order-3 lg:ml-3">
      <span className="sr-only">Workspace</span>
      <select className="max-w-44 rounded-xl border border-black/8 bg-[#fafafa] px-3 py-2 text-sm font-medium text-[#44444b] outline-none focus:border-[#ff6b6b]/60 focus:ring-4 focus:ring-[#ff6b6b]/10" defaultValue={selectedWorkspaceId ?? workspaces[0].id}>
        {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
      </select>
    </label>
  );
}
