import { contentSummaryFixtures } from "../shared/fixtures/content";
import { projectFixtures, workspaceFixtures } from "../workspaces/workspace-fixtures";
import type { PersistenceStore } from "../../core/data";
import { studioStore } from "../application/studio-store";
import type { UserData } from "../user-flow/user-data";

export type VerificationItem = Readonly<{
  label: string;
  value: string;
  detail: string;
}>;

export type DashboardCounts = Readonly<{
  workspaces: number;
  projects: number;
  contents: number;
}>;

export type DashboardMode = "fixture" | "live";

export const completedSprintThreeFeatures = [
  "Feature #1 · Home Layout Foundation",
  "Feature #2 · Workspace Layout",
  "Feature #3 · Project Dashboard",
  "Feature #4 · Content Editor",
  "Feature #5 · Publish Preparation",
  "Feature #6 · Developer Verification",
] as const;

export const implementedRoutes = [
  "/",
  "/workspaces/[workspaceId]",
  "/workspaces/[workspaceId]/projects/[projectId]",
  "/workspaces/[workspaceId]/projects/[projectId]/contents/[contentId]/edit",
  "/workspaces/[workspaceId]/projects/[projectId]/contents/[contentId]/publish",
  "/dev",
  "/dev/content-processing",
] as const;

export const fixtureCounts: DashboardCounts = {
  workspaces: workspaceFixtures.length,
  projects: projectFixtures.length,
  contents: contentSummaryFixtures.length,
} as const;

export async function loadLiveCounts(
  store: Pick<PersistenceStore, "get"> = studioStore,
): Promise<DashboardCounts> {
  const data = await store.get<UserData>("application", "user-data");
  return {
    workspaces: data?.workspace ? 1 : 0,
    projects: data?.projects.length ?? 0,
    contents: data?.contents.length ?? 0,
  };
}

export const connectionStatus: readonly VerificationItem[] = [
  { label: "Editor", value: "Connected", detail: "Project Content routes open the local Content Editor UI." },
  { label: "Publish", value: "Not connected", detail: "Preparation UI only. No platform adapter or publishing action is connected." },
  { label: "Fixture state", value: "Placeholder", detail: "Read-only in-memory presentation fixtures; no operational data." },
  { label: "Architecture", value: "Freeze", detail: "Workspace → Project → Content remains unchanged." },
] as const;

export const liveStatus: readonly VerificationItem[] = [
  { label: "Data source", value: "Operational", detail: "Counts come only from the persisted application service state." },
  { label: "Persistence", value: "Live local state", detail: "No presentation fixtures are included in Live mode." },
  { label: "Editor", value: "Connected", detail: "Project Content routes open the operational local Content Editor UI." },
  { label: "Architecture", value: "Freeze", detail: "Workspace → Project → Content remains unchanged." },
] as const;

export const verificationCommands: readonly VerificationItem[] = [
  { label: "Build", value: "npm run build", detail: "Next.js production build verification." },
  { label: "Tests", value: "npm test", detail: "Vitest repository test suite." },
  { label: "Types", value: "npm run typecheck", detail: "TypeScript no-emit verification." },
  { label: "Lint", value: "npm run lint", detail: "Repository ESLint verification." },
] as const;
