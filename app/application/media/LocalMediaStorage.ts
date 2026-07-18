import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { studioDataPath } from "../studio-store";

const storageKeyPattern = /^[a-f0-9-]+\.(?:png|jpe?g|webp)$/i;

export const localMediaRoot = process.env.BRIGHT_STUDIO_MEDIA_PATH
  ? path.resolve(process.env.BRIGHT_STUDIO_MEDIA_PATH)
  : path.join(path.dirname(studioDataPath), "media");

export type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp";
export type SupportedImageExtension = "png" | "jpeg" | "webp";

export class LocalMediaStorage {
  async save(bytes: Uint8Array, extension: SupportedImageExtension): Promise<Readonly<{ storageKey: string; source: string }>> {
    if (!bytes.byteLength) throw new Error("Image data is empty.");
    const storageKey = `${randomUUID()}.${extension}`;
    await mkdir(localMediaRoot, { recursive: true });
    await writeFile(path.join(localMediaRoot, storageKey), bytes);
    return Object.freeze({ storageKey, source: `/api/media/${storageKey}` });
  }

  async read(storageKey: string): Promise<Uint8Array> {
    validateStorageKey(storageKey);
    return readFile(path.join(localMediaRoot, storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    validateStorageKey(storageKey);
    await unlink(path.join(localMediaRoot, storageKey)).catch(() => undefined);
  }
}

export function imageTypeFromMimeType(mimeType: string): Readonly<{ extension: SupportedImageExtension; mimeType: SupportedImageMimeType }> {
  if (mimeType === "image/png") return { extension: "png", mimeType };
  if (mimeType === "image/jpeg") return { extension: "jpeg", mimeType };
  if (mimeType === "image/webp") return { extension: "webp", mimeType };
  throw new Error("PNG, JPEG, WEBP 이미지만 불러올 수 있습니다.");
}

export function imageMimeTypeFromStorageKey(storageKey: string): SupportedImageMimeType {
  validateStorageKey(storageKey);
  if (/\.png$/i.test(storageKey)) return "image/png";
  if (/\.webp$/i.test(storageKey)) return "image/webp";
  return "image/jpeg";
}

function validateStorageKey(storageKey: string): void {
  if (!storageKeyPattern.test(storageKey)) throw new Error("Invalid media storage key.");
}
