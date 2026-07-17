import { notFound } from "next/navigation";

import { studioStore } from "../../application/studio-store";
import { FirstRunExperience } from "../../user-flow/FirstRunExperience";
import type { UserData } from "../../user-flow/user-data";

type WorkspacePageProps = {
  params: Promise<{ workspaceId: string }>;
};

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const { workspaceId } = await params;
  const data = await studioStore.get<UserData>("application", "user-data");
  if (data?.workspace?.id !== workspaceId) notFound();
  return <FirstRunExperience />;
}
