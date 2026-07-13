export function parseTistoryBlogAddress(value: string): Readonly<{ blogId: string; blogUrl: string }> {
  const trimmed = value.trim().toLowerCase();
  const identifier = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(trimmed) ? trimmed : parseUrl(trimmed);
  if (!identifier) throw new Error("Enter a valid Tistory blog address.");
  return Object.freeze({ blogId: identifier, blogUrl: `https://${identifier}.tistory.com` });
}
function parseUrl(value: string): string | undefined {
  try { const url = new URL(value); if (url.protocol !== "https:" && url.protocol !== "http:") return; const match = url.hostname.match(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.tistory\.com$/); return match?.[1]; } catch { return; }
}
