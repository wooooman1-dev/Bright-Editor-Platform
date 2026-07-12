import { notFound } from "next/navigation";

import { PublishPreparation } from "../../../../../../../publish/PublishPreparation";
import { getPublishPreparationState } from "../../../../../../../publish/publish-preparation-fixtures";

type PublishPreparationPageProps = {
  params: Promise<{ workspaceId: string; projectId: string; contentId: string }>;
};

export default async function PublishPreparationPage({ params }: PublishPreparationPageProps) {
  const { workspaceId, projectId, contentId } = await params;
  const state = getPublishPreparationState(workspaceId, projectId, contentId);

  if (!state) notFound();

  return <PublishPreparation state={state} />;
}
