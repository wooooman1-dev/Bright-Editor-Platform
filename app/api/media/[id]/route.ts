import { LocalMediaStorage, imageMimeTypeFromStorageKey } from "../../../application/media/LocalMediaStorage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: Readonly<{ params: Promise<{ id: string }> }>) {
  try {
    const { id } = await context.params;
    const bytes = await new LocalMediaStorage().read(id);
    const body = new Uint8Array(bytes.byteLength);
    body.set(bytes);
    return new Response(body.buffer, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": imageMimeTypeFromStorageKey(id),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image not found.", { status: 404 });
  }
}
