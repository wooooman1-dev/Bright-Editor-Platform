import {
  createWordPressAuthorizationHeader,
  normalizeSiteUrl,
  type WordPressConnectionInput,
} from "./WordPressConnectionAdapter";

export type WordPressMediaUploadInput = WordPressConnectionInput & Readonly<{
  bytes: Uint8Array;
  fileName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}>;

export type WordPressUploadedMedia = Readonly<{
  externalMediaId: string;
  sourceUrl: string;
}>;

export type WordPressExternalMedia = WordPressUploadedMedia & Readonly<{
  alt: string;
}>;

type WordPressMediaResponse = Readonly<{
  id?: string | number;
  source_url?: string;
  alt_text?: string;
}>;

export class WordPressMediaAdapter {
  constructor(private readonly request: typeof fetch = fetch) {}

  async uploadMedia(input: WordPressMediaUploadInput): Promise<WordPressUploadedMedia> {
    if (!input.bytes.byteLength) throw new Error("WordPress media upload requires image data.");
    const response = await this.safeRequest(`${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
        "Content-Disposition": `attachment; filename="${safeFileName(input.fileName)}"`,
        "Content-Type": input.mimeType,
      },
      body: Buffer.from(input.bytes),
    }, "WordPress media could not be uploaded.");
    return uploadedMedia(await mediaResponse(response));
  }

  async storeAlt(
    input: WordPressConnectionInput & Readonly<{ externalMediaId: string; alt: string }>,
  ): Promise<void> {
    const externalMediaId = mediaId(input.externalMediaId);
    const alt = input.alt.trim();
    if (!alt) throw new Error("WordPress media ALT is required.");
    const response = await this.safeRequest(
      `${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/media/${externalMediaId}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alt_text: alt }),
      },
      "WordPress media ALT could not be saved.",
    );
    await mediaResponse(response);
  }

  async readMedia(
    input: WordPressConnectionInput & Readonly<{ externalMediaId: string }>,
  ): Promise<WordPressExternalMedia> {
    const externalMediaId = mediaId(input.externalMediaId);
    const response = await this.safeRequest(
      `${normalizeSiteUrl(input.siteUrl)}/wp-json/wp/v2/media/${externalMediaId}?context=edit`,
      {
        headers: {
          Accept: "application/json",
          Authorization: createWordPressAuthorizationHeader(input.username, input.applicationPassword),
        },
      },
      "WordPress media could not be verified.",
    );
    const raw = await mediaResponse(response);
    const uploaded = uploadedMedia(raw);
    return Object.freeze({ ...uploaded, alt: typeof raw.alt_text === "string" ? raw.alt_text : "" });
  }

  verifyMedia(
    media: WordPressExternalMedia,
    expected: Readonly<{ externalMediaId: string; sourceUrl: string; alt: string }>,
  ): WordPressExternalMedia {
    if (media.externalMediaId !== expected.externalMediaId
      || media.sourceUrl !== expected.sourceUrl
      || media.alt.trim() !== expected.alt.trim()) {
      throw new Error("WordPress media re-read verification failed.");
    }
    return media;
  }

  private async safeRequest(url: string, init: RequestInit, message: string): Promise<Response> {
    let response: Response;
    try { response = await this.request(url, init); }
    catch { throw new Error(message); }
    if (response.status === 401 || response.status === 403) {
      throw new Error("WordPress media authentication or permission verification failed.");
    }
    if (!response.ok) throw new Error(message);
    return response;
  }
}

async function mediaResponse(response: Response): Promise<WordPressMediaResponse> {
  try {
    const value = await response.json() as unknown;
    if (!value || typeof value !== "object") throw new Error();
    return value as WordPressMediaResponse;
  } catch {
    throw new Error("WordPress returned an invalid media response.");
  }
}

function uploadedMedia(value: WordPressMediaResponse): WordPressUploadedMedia {
  if ((typeof value.id !== "string" && typeof value.id !== "number")
    || !String(value.id).trim()
    || typeof value.source_url !== "string"
    || !httpUrl(value.source_url)) {
    throw new Error("WordPress returned an invalid media response.");
  }
  return Object.freeze({ externalMediaId: String(value.id), sourceUrl: value.source_url });
}

function mediaId(value: string): string {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
    throw new Error("WordPress media ID is invalid.");
  }
  return normalized;
}

function httpUrl(value: string): boolean {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function safeFileName(value: string): string {
  const fileName = value.trim().replace(/[^\x20-\x7e]|[\r\n"\\/]/g, "-");
  if (!fileName) throw new Error("WordPress media file name is required.");
  return fileName;
}
