import { notFound, redirect } from "next/navigation";

import { studioStore } from "../../../application/studio-store";
import { WorkspaceSettings } from "../../../settings/WorkspaceSettings";
import type { SettingsSection } from "../../../settings/settings-types";
import { hasConfiguredEnabledPlatforms, type UserData } from "../../../user-flow/user-data";

export default async function WorkspaceSettingsPage({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  const { workspaceId } = await params;
  const data = await studioStore.get<UserData>("application", "user-data");
  if (!data?.workspace || data.workspace.id !== workspaceId) notFound();
  if (!hasConfiguredEnabledPlatforms(data)) redirect("/");
  const query = await searchParams;
  const requested = Array.isArray(query.section) ? query.section[0] : query.section;
  return <WorkspaceSettings initialSection={readSection(requested)} workspaceId={workspaceId} />;
}

function readSection(value?: string): SettingsSection {
  const allowed: readonly SettingsSection[] = ["overview", "ai", "enabled-platforms", "connections", "publishing", "automation", "workspace", "appearance", "danger"];
  return allowed.includes(value as SettingsSection) ? value as SettingsSection : "overview";
}
