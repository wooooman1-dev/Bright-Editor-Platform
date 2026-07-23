import { redirect } from "next/navigation";

type ContentEditorPageProps = {
  params: Promise<{ workspaceId: string; projectId: string; contentId: string }>;
};

export default async function ContentEditorPage({ params }: ContentEditorPageProps) {
  const { workspaceId, projectId, contentId } = await params;
  const query = new URLSearchParams({
    view: "editor",
    projectId,
    contentId,
  });

  redirect(`/workspaces/${encodeURIComponent(workspaceId)}?${query.toString()}`);
}
