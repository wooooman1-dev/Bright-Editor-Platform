import { notFound } from "next/navigation";

import { ContentEditor } from "../../../../../../../contents/ContentEditor";
import { getContentEditorState } from "../../../../../../../contents/content-editor-fixtures";

type ContentEditorPageProps = {
  params: Promise<{ workspaceId: string; projectId: string; contentId: string }>;
};

export default async function ContentEditorPage({ params }: ContentEditorPageProps) {
  const { workspaceId, projectId, contentId } = await params;
  const state = getContentEditorState(workspaceId, projectId, contentId);

  if (!state) notFound();

  return <ContentEditor state={state} />;
}
