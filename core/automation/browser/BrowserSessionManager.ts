import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, parse, resolve } from "node:path";

import type { BrowserContext } from "playwright";

import { BrowserSessionError } from "./BrowserErrors";

export class BrowserSessionManager {
  private readonly storageStatePath: string;

  constructor(storageStatePath: string) {
    this.storageStatePath = normalizeStorageStatePath(storageStatePath);
  }

  getStorageStatePath(): string {
    return this.storageStatePath;
  }

  async exists(): Promise<boolean> {
    try {
      return (await stat(this.storageStatePath)).isFile();
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return false;
      }

      throw new BrowserSessionError("Unable to inspect browser session storage.", {
        cause: error,
      });
    }
  }

  async save(context: BrowserContext): Promise<void> {
    try {
      await mkdir(dirname(this.storageStatePath), { recursive: true });
      await context.storageState({ path: this.storageStatePath });
    } catch (error) {
      throw new BrowserSessionError("Unable to save browser session storage.", {
        cause: error,
      });
    }
  }

  async delete(): Promise<void> {
    try {
      await rm(this.storageStatePath, { force: true });
    } catch (error) {
      throw new BrowserSessionError("Unable to delete browser session storage.", {
        cause: error,
      });
    }
  }
}

function normalizeStorageStatePath(storageStatePath: string): string {
  const trimmedPath = storageStatePath.trim();

  if (!trimmedPath || trimmedPath.includes("\0")) {
    throw new BrowserSessionError("A valid browser session file path is required.");
  }

  const resolvedPath = resolve(trimmedPath);

  if (resolvedPath === parse(resolvedPath).root) {
    throw new BrowserSessionError("Browser session storage must target a file.");
  }

  return resolvedPath;
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
