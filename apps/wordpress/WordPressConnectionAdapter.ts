export type WordPressConnectionInput = Readonly<{ siteUrl: string; username: string; applicationPassword: string }>;
export type WordPressPublicMetadata = Readonly<{ siteUrl: string; siteTitle: string; username: string; authenticatedUserDisplayName: string; canCreateDrafts: boolean }>;

export class WordPressConnectionAdapter {
  async verify(input: WordPressConnectionInput): Promise<WordPressPublicMetadata> {
    const siteUrl = normalizeSiteUrl(input.siteUrl);
    if (!input.username.trim() || !input.applicationPassword.trim()) throw new Error("Enter your WordPress username and Application Password.");
    const authorization = `Basic ${Buffer.from(`${input.username}:${input.applicationPassword}`).toString("base64")}`;
    const [siteResponse, userResponse] = await Promise.all([
      fetch(`${siteUrl}/wp-json`, { headers: { Accept: "application/json" } }),
      fetch(`${siteUrl}/wp-json/wp/v2/users/me?context=edit`, { headers: { Accept: "application/json", Authorization: authorization } }),
    ]);
    if (!siteResponse.ok) throw new Error("WordPress could not be reached or its API is unavailable.");
    if (userResponse.status === 401 || userResponse.status === 403) throw new Error("WordPress authentication failed. Check your username and Application Password.");
    if (!userResponse.ok) throw new Error("WordPress connection could not be verified.");
    const site = await siteResponse.json() as { name?: string; home?: string };
    const user = await userResponse.json() as { name?: string; slug?: string; capabilities?: Record<string, boolean> };
    const canCreateDrafts = Boolean(user.capabilities?.edit_posts);
    if (!canCreateDrafts) throw new Error("This WordPress user cannot create draft posts.");
    return Object.freeze({ siteUrl: typeof site.home === "string" ? site.home : siteUrl, siteTitle: site.name ?? siteUrl, username: input.username.trim(), authenticatedUserDisplayName: user.name ?? user.slug ?? input.username.trim(), canCreateDrafts });
  }
}
export function normalizeSiteUrl(value: string): string {
  let url: URL; try { url = new URL(value.trim()); } catch { throw new Error("Enter a valid WordPress site address."); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("WordPress site address must use HTTP or HTTPS.");
  return `${url.protocol}//${url.host}`;
}
