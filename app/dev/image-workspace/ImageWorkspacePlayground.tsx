"use client";

import { useEffect, useState } from "react";

import type { ContentDocument } from "../../../core/content";
import { ContentDocumentEditor } from "../../user-flow/ContentDocumentEditor";
import type { UserData } from "../../user-flow/user-data";

const workspaceId = "ci-image-workspace";
const projectId = "ci-image-project";
const contentId = "ci-image-content";
const imageBlockId = "ci-image-block";
const now = "2026-07-18T00:00:00.000Z";

const seedDocument: ContentDocument = {
  id: contentId,
  title: "이미지 작업 공간 자동 검증",
  blocks: [
    { id: "ci-heading", type: "heading", level: 2, text: "이미지 작업 공간" },
    { id: "ci-paragraph", type: "paragraph", text: "파일 업로드와 이미지 전략 편집을 자동으로 검증합니다." },
    {
      id: imageBlockId,
      type: "image",
      source: "",
      alt: "건강 정보를 설명하는 예시 이미지",
      prompt: "밝고 신뢰감 있는 건강 정보 카드, 불필요한 텍스트와 로고 없음",
      purpose: "inline",
      sourceType: "planned",
    },
  ],
};

const seedData: UserData = {
  workspace: {
    id: workspaceId,
    name: "Image Workspace CI",
    createdAt: now,
    updatedAt: now,
    settings: {
      enabledPlatforms: ["tistory"],
      publishing: {
        reviewFirst: true,
        draftOnly: true,
        publicPublish: false,
        sequentialDraftSave: true,
        qualityApprovalRequired: true,
      },
      appearance: { theme: "light" },
    },
  },
  brands: [],
  projects: [
    {
      id: projectId,
      workspaceId,
      name: "Image Workspace CI Project",
      description: "Automated browser verification fixture",
      selectedPublishingAccountIds: [],
      createdAt: now,
      updatedAt: now,
    },
  ],
  contents: [
    {
      id: contentId,
      workspaceId,
      projectId,
      title: seedDocument.title,
      body: "파일 업로드와 이미지 전략 편집을 자동으로 검증합니다.",
      status: "draft",
      creationMethod: "manual",
      createdAt: now,
      updatedAt: now,
      document: seedDocument,
      selectedPublishingAccountIds: [],
    },
  ],
  history: [],
  mediaMetadata: [],
  qualityReports: [],
  publishingRecords: [],
  scheduledPublishing: [],
};

export function ImageWorkspacePlayground() {
  const [data, setData] = useState<UserData>();
  const [document, setDocument] = useState<ContentDocument>();
  const [notice, setNotice] = useState("준비 중");

  useEffect(() => {
    let active = true;

    void loadOrSeed().then(({ data: nextData, document: nextDocument }) => {
      if (!active) return;
      setData(nextData);
      setDocument(nextDocument);
      setNotice("준비됨");
    }).catch((error) => {
      if (active) setNotice(error instanceof Error ? error.message : "검증 데이터를 준비하지 못했습니다.");
    });

    return () => { active = false; };
  }, []);

  const persistDocument = async (nextDocument: ContentDocument, message: string) => {
    if (!data) throw new Error("검증 데이터가 준비되지 않았습니다.");

    const nextData: UserData = {
      ...data,
      contents: data.contents.map((content) => content.id === contentId ? {
        ...content,
        title: nextDocument.title,
        document: nextDocument,
        updatedAt: new Date().toISOString(),
      } : content),
    };

    await save(nextData);
    setData(nextData);
    setDocument(nextDocument);
    setNotice(message);
  };

  return (
    <main className="min-h-screen bg-[#f8f8fa] px-4 py-8 text-[#19191b] sm:px-8">
      <header className="mx-auto max-w-[900px]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ff6b6b]">Developer Verification</p>
        <h1 className="mt-2 text-3xl font-semibold">Image Workspace Verification</h1>
        <p aria-live="polite" className="mt-2 text-sm text-[#66666f]">{notice}</p>
      </header>

      {document ? (
        <ContentDocumentEditor
          candidates={[]}
          disabled={!data}
          document={document}
          onChange={persistDocument}
        />
      ) : null}
    </main>
  );
}

async function loadOrSeed(): Promise<Readonly<{ data: UserData; document: ContentDocument }>> {
  const response = await fetch("/api/studio", { cache: "no-store" });
  const result = await response.json() as { data?: UserData | null; error?: string };
  if (!response.ok) throw new Error(result.error ?? "검증 데이터를 불러오지 못했습니다.");

  const existing = result.data;
  const content = existing?.contents.find((item) => item.id === contentId && item.workspaceId === workspaceId && item.projectId === projectId);
  if (existing && content?.document) return { data: existing, document: content.document };

  await save(seedData);
  return { data: seedData, document: seedDocument };
}

async function save(data: UserData): Promise<void> {
  const response = await fetch("/api/studio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (response.ok) return;
  const result = await response.json() as { error?: string };
  throw new Error(result.error ?? "검증 데이터를 저장하지 못했습니다.");
}
