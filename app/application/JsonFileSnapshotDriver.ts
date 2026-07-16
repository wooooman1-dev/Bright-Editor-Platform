import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import type { PersistenceSnapshot, PersistenceSnapshotDriver } from "../../core/data";

type Envelope = Readonly<{ schemaVersion: 1; data: PersistenceSnapshot }>;
type FileOperations = Readonly<{
  mkdir: typeof mkdir;
  open: typeof open;
  rename: typeof rename;
  unlink: typeof unlink;
}>;

const defaultOperations: FileOperations = { mkdir, open, rename, unlink };
const retryableCodes = new Set(["EPERM", "EBUSY", "EACCES", "EEXIST"]);

export class JsonFileSnapshotDriver implements PersistenceSnapshotDriver {
  constructor(private readonly filePath: string, private readonly operations: FileOperations = defaultOperations) {}

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
    await this.operations.mkdir(dirname(this.filePath), { recursive: true });
    const suffix = `${process.pid}.${randomUUID()}`;
    const temporaryPath = `${this.filePath}.${suffix}.tmp`;
    const backupPath = `${this.filePath}.${suffix}.bak`;
    let destinationMoved = false;
    try {
      const handle = await this.operations.open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify({ schemaVersion: 1, data: snapshot }, null, 2), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }

      try {
        await retry(() => this.operations.rename(temporaryPath, this.filePath));
      } catch (error) {
        if (!isRetryable(error)) throw error;
        try {
          await retry(() => this.operations.rename(this.filePath, backupPath));
          destinationMoved = true;
        } catch (backupError) {
          if (!isMissingFile(backupError)) throw backupError;
        }
        await retry(() => this.operations.rename(temporaryPath, this.filePath));
        destinationMoved = false;
        await removeIfPresent(this.operations, backupPath);
      }
    } catch (error) {
      if (destinationMoved) {
        try { await retry(() => this.operations.rename(backupPath, this.filePath)); }
        catch (restoreError) {
          throw new Error(`Bright Studio data write failed and backup restoration failed (${code(error)}/${code(restoreError)}).`);
        }
      }
      throw new Error(`Bright Studio data could not be saved safely (${code(error)} during ${operation(error)}).`);
    } finally {
      await removeIfPresent(this.operations, temporaryPath);
      if (!destinationMoved) await removeIfPresent(this.operations, backupPath);
    }
  }
}

async function retry(action: () => Promise<void>): Promise<void> {
  const delays = [15, 40, 90];
  for (let attempt = 0; ; attempt += 1) {
    try { await action(); return; }
    catch (error) {
      if (!isRetryable(error) || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

async function removeIfPresent(operations: FileOperations, filePath: string): Promise<void> {
  try { await operations.unlink(filePath); }
  catch (error) { if (!isMissingFile(error)) console.warn("[studio-persistence] cleanup failed", { code: code(error), operation: operation(error) }); }
}

function isRetryable(error: unknown): boolean { return retryableCodes.has(code(error)); }

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
function code(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "UNKNOWN"; }
function operation(error: unknown): string { return typeof error === "object" && error !== null && "syscall" in error ? String(error.syscall) : "filesystem operation"; }
function message(error: unknown): string { return error instanceof Error ? error.message : "unknown error"; }
