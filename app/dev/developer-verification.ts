import { contentSummaryFixtures } from "../shared/fixtures/content";
import { projectFixtures, workspaceFixtures } from "../workspaces/workspace-fixtures";

export type VerificationItem = Readonly<{
  label: string;
  value: string;
  detail: string;
}>;

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

export const fixtureCounts = {
  workspaces: workspaceFixtures.length,
  projects: projectFixtures.length,
  contents: contentSummaryFixtures.length,
} as const;

export const connectionStatus: readonly VerificationItem[] = [
  { label: "Editor", value: "Connected", detail: "Project Content routes open the local Content Editor UI." },
  { label: "Publish", value: "Not connected", detail: "Preparation UI only. No platform adapter or publishing action is connected." },
  { label: "Fixture state", value: "Placeholder", detail: "Read-only in-memory presentation fixtures; no operational data." },
  { label: "Architecture", value: "Freeze", detail: "Workspace → Project → Content remains unchanged." },
] as const;

export const verificationCommands: readonly VerificationItem[] = [
  { label: "Build", value: "npm run build", detail: "Next.js production build verification." },
  { label: "Tests", value: "npm test", detail: "Vitest repository test suite." },
  { label: "Types", value: "npm run typecheck", detail: "TypeScript no-emit verification." },
  { label: "Lint", value: "npm run lint", detail: "Repository ESLint verification." },
] as const;
