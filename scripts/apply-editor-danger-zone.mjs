import { readFile, writeFile } from "node:fs/promises";

const file = "app/user-flow/EditorWorkspace.tsx";
let source = await readFile(file, "utf8");
if (source.includes("<ContentDangerZone")) process.exit(0);

function patch(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: ${count}`);
  source = source.replace(before, after);
}

patch(
  'import { ContentDocumentEditor } from "./ContentDocumentEditor";',
  'import { ContentDocumentEditor } from "./ContentDocumentEditor";\nimport { ContentDangerZone } from "./ContentDangerZone";',
  "import",
);

patch(
  'type Operation = "idle" | "quality" | "improving" | "applying" | "preview" | "categories" | "category-save" | "draft-save";',
  'type Operation = "idle" | "quality" | "improving" | "applying" | "preview" | "categories" | "category-save" | "draft-save" | "deleting";',
  "operation",
);

patch(
  '    <p aria-live="polite" className={`mt-4 rounded-xl p-4 text-sm ${saveState === "error" ? "bg-red-50 text-red-800" : "bg-white text-[#77777f]"}`}>{notice}</p>\n  </PageContainer>;',
  '    <p aria-live="polite" className={`mt-4 rounded-xl p-4 text-sm ${saveState === "error" ? "bg-red-50 text-red-800" : "bg-white text-[#77777f]"}`}>{notice}</p>\n    <ContentDangerZone contentId={content.id} disabled={working || operation !== "idle"} onDeleted={async (next) => { await onPersist(next); onBack(); }} onDeletingChange={(active) => setOperation(active ? "deleting" : "idle")} title={content.title} workspaceId={project.workspaceId} />\n  </PageContainer>;',
  "component",
);

patch(
  '"draft-save": ["티스토리에 임시저장하고 있습니다.", "외부 Draft 저장과 검증이 끝날 때까지 브라우저를 닫지 마세요."]',
  '"draft-save": ["티스토리에 임시저장하고 있습니다.", "외부 Draft 저장과 검증이 끝날 때까지 브라우저를 닫지 마세요."], deleting: ["콘텐츠를 백업하고 정리하고 있습니다.", "로컬 백업과 연결 데이터 정리가 끝날 때까지 기다려 주세요."]',
  "copy",
);

await writeFile(file, source, "utf8");
