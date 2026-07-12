import { notFound } from "next/navigation";

import { WorkspaceLayout } from "../WorkspaceLayout";
import { getWorkspaceViewState } from "../workspace-fixtures";

type WorkspacePageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceId } = await params;
  const state = getWorkspaceViewState(workspaceId);

  if (!state) notFound();

  return <WorkspaceLayout state={state} />;
}
