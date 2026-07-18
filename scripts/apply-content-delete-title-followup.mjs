import { readFile, writeFile } from "node:fs/promises";

const editorPath = "app/user-flow/EditorWorkspace.tsx";
let editor = await readFile(editorPath, "utf8");
editor = editor.replace(' onDeletingChange={(active) => setOperation(active ? "deleting" : "idle")} title={content.title} workspaceId={project.workspaceId}', ' onDeletingChange={(active) => setOperation(active ? "deleting" : "idle")} workspaceId={project.workspaceId}');
await writeFile(editorPath, editor, "utf8");

const routePath = "app/api/studio/route.ts";
let route = await readFile(routePath, "utf8");
route = route.replace('      const baselineDocument = ensureContentSeoPolicy(content.document, content);\n      const baselineQuality = new QualityEngine().review(baselineDocument, qualityContext(content));', '      const baselineQuality = new QualityEngine().review(content.document, qualityContext(content));');
await writeFile(routePath, route, "utf8");
