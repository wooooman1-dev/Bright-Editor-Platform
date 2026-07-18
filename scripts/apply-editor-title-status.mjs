import { readFile, writeFile } from "node:fs/promises";

const file = "app/user-flow/EditorWorkspace.tsx";
let source = await readFile(file, "utf8");
if (source.includes("<ContentSeoTitleStatus")) process.exit(0);

function patch(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: ${count}`);
  source = source.replace(before, after);
}

patch(
  'import { ContentDocumentEditor } from "./ContentDocumentEditor";\nimport { QualityImprovementPreview } from "./QualityImprovementPreview";',
  'import { ContentDocumentEditor } from "./ContentDocumentEditor";\nimport { ContentSeoTitleStatus } from "./ContentSeoTitleStatus";\nimport { QualityImprovementPreview } from "./QualityImprovementPreview";',
  "import",
);

patch(
  '      const response = await api("/api/studio", { action: "review-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { quality?: QualityReport; error?: string };\n      if (!response.quality) throw new Error(response.error ?? "Quality review failed.");\n      const reviewed = updateContent(next, content.id, { quality: response.quality, status: response.quality.approved ? "ready" : "in_review", updatedAt: response.quality.reviewedAt });\n      await onPersist({ ...reviewed, qualityReports: [...(reviewed.qualityReports ?? []).filter((item) => item.contentId !== content.id), { contentId: content.id, report: response.quality }] });\n      setQualityReport(response.quality); setQualityRequestState("idle"); setNotice("품질 검토가 완료되었습니다. 개선 작업을 반영한 뒤 다시 검토할 수 있습니다.");',
  '      const response = await api("/api/studio", { action: "review-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { document?: ContentDocument; quality?: QualityReport; data?: UserData; error?: string };\n      if (!response.quality || !response.data) throw new Error(response.error ?? "Quality review failed.");\n      await onPersist(response.data);\n      const priorTitle = next.contents.find((item) => item.id === content.id)?.title;\n      if (response.document) { setDocumentDraft(response.document); setTitle(response.document.title); }\n      setQualityReport(response.quality); setQualityRequestState("idle"); setNotice(response.document && response.document.title !== priorTitle ? "대표 키워드를 포함하도록 제목을 보정하고 품질 검토를 완료했습니다." : "품질 검토가 완료되었습니다. 개선 작업을 반영한 뒤 다시 검토할 수 있습니다.");',
  "review",
);

patch(
  '<section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><label className="block text-sm font-semibold">제목<input className="mt-2 w-full rounded-xl border px-4 py-3 text-xl" onBlur={() => liveDocument && void commitDocument({ ...liveDocument, title }, "문서 제목을 저장했습니다.")} onChange={(event) => { setTitle(event.target.value); setQualityRequestState("idle"); setFinalConfirmation(false); }} value={title} /></label><p className="mt-3 text-sm text-[#77777f]">',
  '<section className="mt-6 rounded-[24px] border border-black/6 bg-white p-6"><label className="block text-sm font-semibold">제목<input className="mt-2 w-full rounded-xl border px-4 py-3 text-xl" onBlur={() => liveDocument && void commitDocument({ ...liveDocument, title }, "문서 제목을 저장했습니다.")} onChange={(event) => { setTitle(event.target.value); setQualityRequestState("idle"); setFinalConfirmation(false); }} value={title} /></label><ContentSeoTitleStatus currentTitle={title} disabled={working || !liveDocument} onApply={async (seoTitle) => { if (liveDocument) await commitDocument({ ...liveDocument, title: seoTitle }, "대표 키워드를 포함한 제목으로 보정했습니다."); }} primaryKeyword={content.primaryKeyword} /><p className="mt-3 text-sm text-[#77777f]">',
  "title",
);

await writeFile(file, source, "utf8");
