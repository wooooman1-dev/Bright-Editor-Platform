export type WorkspaceSummary = Readonly<{
  id: string;
  name: string;
  description?: string;
  audience?: string;
  updatedAt?: string;
}>;

export type ProjectSummary = Readonly<{
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  status: "planning" | "in-progress" | "review" | "complete";
  updatedAt: string;
}>;
