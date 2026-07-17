import { readFile, writeFile } from "node:fs/promises";

const path = "app/api/studio/route.ts";
let source = await readFile(path, "utf8");

if (source.includes('body.action === "delete-content"')) process.exit(0);

function replaceExact(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one target, found ${count}.`);
  source = source.replace(before, after);
}

replaceExact(
  'import { placeRecommendedPosts, rankRelatedPosts, restoreVerifiedEditorialLinks, type ContentDocument } from "../../../core/content";\n',
  'import { ensureSeoKeywordPlacement, placeRecommendedPosts, rankRelatedPosts, restoreVerifiedEditorialLinks, type ContentDocument } from "../../../core/content";\nimport { ContentDeletionService } from "../../application/content/ContentDeletionService";\n',
  "imports",
);

replaceExact(
  '      const initialDocument = await placeAvailableTistoryPosts(owned, existing, result.document);',
  '      const initialDocument = ensureContentSeoPolicy(await placeAvailableTistoryPosts(owned, existing, result.document), existing);',
  "generation document",
);

replaceExact(
  '          placeDocument: (document) => placeAvailableTistoryPosts(owned, existing, document),',
  '          placeDocument: async (document) => ensureContentSeoPolicy(await placeAvailableTistoryPosts(owned, existing, document), existing),',
  "pipeline placement",
);

replaceExact(
  '      document = await placeAvailableTistoryPosts(data, content, document);\n      const reviewedAt = new Date().toISOString();',
  '      document = ensureContentSeoPolicy(await placeAvailableTistoryPosts(data, content, document), content);\n      const reviewedAt = new Date().toISOString();',
  "final review",
);

replaceExact(
  '      const document = new EditorialGenerationStrategy().parse(response.content, {\n        contentId: required(input.contentId), contentType: (typeof input.contentType === "string" ? input.contentType : "article") as never,\n        keywords: [typeof input.primaryKeyword === "string" ? input.primaryKeyword : "content"],\n        platform: "editor" as never, projectId,\n      });\n      return NextResponse.json({ document });',
  '      const parsed = new EditorialGenerationStrategy().parse(response.content, {\n        contentId: required(input.contentId), contentType: (typeof input.contentType === "string" ? input.contentType : "article") as never,\n        keywords: [current.primaryKeyword ?? (typeof input.primaryKeyword === "string" ? input.primaryKeyword : "content")],\n        platform: "editor" as never, projectId,\n      });\n      const document = ensureContentSeoPolicy(parsed, current);\n      return NextResponse.json({ document });',
  "revision policy",
);

replaceExact(
  '      document = await placeAvailableTistoryPosts(data, content, document);\n      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document) });',
  '      document = ensureContentSeoPolicy(await placeAvailableTistoryPosts(data, content, document), content);\n      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document) });',
  "quality improvement policy",
);

replaceExact(
  '      document = await placeAvailableTistoryPosts(data, content, document);\n      const baselineQuality = new QualityEngine().review(content.document, qualityContext(content));',
  '      document = ensureContentSeoPolicy(await placeAvailableTistoryPosts(data, content, document), content);\n      const baselineDocument = ensureContentSeoPolicy(content.document, content);\n      const baselineQuality = new QualityEngine().review(baselineDocument, qualityContext(content));',
  "accept improvement policy",
);

replaceExact(
  '    if (body.action === "render-tistory") {',
  '    if (body.action === "content-deletion-impact") {\n      const data = await ownedWorkspace(required(body.input?.workspaceId));\n      const impact = new ContentDeletionService().impact(data, data.workspace!.id, required(body.input?.contentId));\n      return NextResponse.json({ impact });\n    }\n    if (body.action === "delete-content") {\n      const data = await ownedWorkspace(required(body.input?.workspaceId));\n      const result = await new ContentDeletionService().delete(data, {\n        workspaceId: data.workspace!.id,\n        contentId: required(body.input?.contentId),\n        confirmationTitle: required(body.input?.confirmationTitle),\n      });\n      await studioStore.set(collection, stateId, result.data);\n      return NextResponse.json(result);\n    }\n    if (body.action === "render-tistory") {',
  "delete actions",
);

replaceExact(
  '      const document = await placeAvailableTistoryPosts(data, content, content.document);\n      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document) });',
  '      const document = ensureContentSeoPolicy(await placeAvailableTistoryPosts(data, content, content.document), content);\n      const quality = new QualityEngine().review(document, { ...qualityContext(content), revisionId: contentRevisionId(document) });',
  "review quality policy",
);

replaceExact(
  'function qualityContext(content: UserData["contents"][number]) {',
  'function ensureContentSeoPolicy(document: ContentDocument, content: UserData["contents"][number]): ContentDocument {\n  return ensureSeoKeywordPlacement(document, content.primaryKeyword);\n}\n\nfunction qualityContext(content: UserData["contents"][number]) {',
  "seo helper",
);

await writeFile(path, source, "utf8");
