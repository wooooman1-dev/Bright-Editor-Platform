import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { PersistenceSnapshot, PersistenceSnapshotDriver } from "../../core/data";

type Envelope = Readonly<{ schemaVersion: 1; data: PersistenceSnapshot }>;

export class JsonFileSnapshotDriver implements PersistenceSnapshotDriver {
  constructor(private readonly filePath: string) {}

  async read(): Promise<PersistenceSnapshot | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<Envelope>;
      if (parsed.schemaVersion !== 1 || !parsed.data || typeof parsed.data !== "object") {
        throw new Error("Unsupported Bright Studio data schema.");
      }
      return parsed.data;
    } catch (error) {
      if (isMissingFile(error)) return undefined;
      throw new Error(`Bright Studio data could not be read safely: ${message(error)}`);
    }
  }

  async write(snapshot: PersistenceSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ schemaVersion: 1, data: snapshot }, null, 2), "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function message(error: unknown): string { return error instanceof Error ? error.message : "unknown error"; }
