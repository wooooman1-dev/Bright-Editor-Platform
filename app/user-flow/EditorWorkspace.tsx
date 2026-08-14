"use client";

import type { UserContent, UserData, UserProject } from "./user-data";
import { AIUsageCostSummary } from "./AIUsageCostSummary";
import { EditorWorkspace as EditorWorkspaceImplementation } from "./EditorWorkspaceImplementation";

export function EditorWorkspace(props: Readonly<{
  content: UserContent;
  data: UserData;
  project: UserProject;
  onBack: () => void;
  onOpenPlanning?: () => void;
  onPersist: (data: UserData) => Promise<void>;
}>) {
  return <>
    <EditorWorkspaceImplementation {...props} />
    <AIUsageCostSummary content={props.content} document={props.content.document} />
  </>;
}
