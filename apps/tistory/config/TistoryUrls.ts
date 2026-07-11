const TISTORY_LOGIN_URL = "https://www.tistory.com/auth/login";
const TISTORY_BLOG_IDENTIFIER_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type TistoryUrls = Readonly<{
  admin: string;
  editor: string;
  login: string;
}>;

export function createTistoryUrls(blogName: string): TistoryUrls {
  const normalizedBlogName = blogName.trim();

  if (!TISTORY_BLOG_IDENTIFIER_PATTERN.test(normalizedBlogName)) {
    throw new TypeError("A valid Tistory blog identifier is required.");
  }

  const blogBaseUrl = `https://${normalizedBlogName}.tistory.com`;

  return Object.freeze({
    admin: `${blogBaseUrl}/manage`,
    editor: `${blogBaseUrl}/manage/newpost`,
    login: TISTORY_LOGIN_URL,
  });
}
