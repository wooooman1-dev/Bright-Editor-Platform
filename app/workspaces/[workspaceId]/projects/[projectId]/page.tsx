import { notFound } from "next/navigation";

import { ProjectDashboard } from "../../../../projects/ProjectDashboard";
import { getProjectDashboardState } from "../../../../projects/project-dashboard-fixtures";

type ProjectDashboardPageProps = {
  params: Promise<{ workspaceId: string; projectId: string }>;
};

export default async function ProjectDashboardPage({ params }: ProjectDashboardPageProps) {
  const { workspaceId, projectId } = await params;
  const state = getProjectDashboardState(workspaceId, projectId);

  if (!state) notFound();

  return <ProjectDashboard state={state} />;
}
