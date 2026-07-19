import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { RawDataSourceSnapshotStore } from "../../../core/intelligence";

export class FileRawSnapshotStore implements RawDataSourceSnapshotStore {
  constructor(private readonly root: string) {}
  async write(workspaceId: string, connectionId: string, snapshotId: string, payload: unknown): Promise<string> {
    const relative = path.join(safe(workspaceId), safe(connectionId), `${safe(snapshotId)}.json`);
    const destination = this.resolve(relative), temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(temporary, JSON.stringify(payload), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
    return relative.replace(/\\/g, "/");
  }
  async read(reference: string): Promise<unknown> { return JSON.parse(await readFile(this.resolve(reference), "utf8")); }
  private resolve(reference: string): string {
    const target = path.resolve(this.root, reference), root = path.resolve(this.root);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid raw snapshot reference.");
    return target;
  }
}
function safe(value: string): string { const result = value.replace(/[^a-zA-Z0-9_-]/g, "-"); if (!result) throw new Error("Invalid snapshot identifier."); return result; }
