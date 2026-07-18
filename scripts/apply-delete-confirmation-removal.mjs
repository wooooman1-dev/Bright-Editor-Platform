import { readFile, writeFile } from "node:fs/promises";

const file = "app/api/studio/route.ts";
let source = await readFile(file, "utf8");
const before = `      const result = await new ContentDeletionService().delete(data, {
        workspaceId: data.workspace!.id,
        contentId: required(body.input?.contentId),
        confirmationTitle: required(body.input?.confirmationTitle),
      });`;
const after = `      const result = await new ContentDeletionService().delete(data, {
        workspaceId: data.workspace!.id,
        contentId: required(body.input?.contentId),
      });`;
const count = source.split(before).length - 1;
if (count !== 1) throw new Error(`Expected one content deletion confirmation block, found ${count}.`);
source = source.replace(before, after);
await writeFile(file, source, "utf8");
