export function publicPostListingUrls(origin, pageNumber) {
  return [`${origin}/category?page=${pageNumber}`, `${origin}/?page=${pageNumber}`];
}

export async function extractPublicPostRows(page, expectedOrigin) {
  return page.evaluate(({ origin }) => {
    const anchors = [...document.querySelectorAll('a[href*="/entry/"]')];
    return anchors.flatMap((anchor) => {
      if (!(anchor instanceof HTMLAnchorElement)) return [];
      const href = anchor.href.split("#")[0];
      if (!href.startsWith(`${origin}/entry/`)) return [];
      const container = anchor.closest("article, li, .post-item, .entry, .list_content, .post, .item, .article") ?? anchor.parentElement;
      const titleNode = container?.querySelector("h1, h2, h3, h4, [class*=title], [class*=tit_post], [class*=link_post]");
      const imageAlt = anchor.querySelector("img")?.getAttribute("alt") ?? "";
      const title = (anchor.getAttribute("title") || titleNode?.textContent || anchor.textContent || imageAlt)
        .replace(/\s+/g, " ")
        .trim();
      if (!title) return [];
      const categoryAnchor = container?.querySelector('a[href*="/category/"]');
      const time = container?.querySelector("time");
      const excerpt = (container?.querySelector("p, .summary, .excerpt, [class*=summary], [class*=excerpt]")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();
      return [{
        title,
        publishedUrl: href,
        categoryName: categoryAnchor?.textContent?.trim(),
        publishedAt: time?.getAttribute("datetime") || time?.textContent?.trim(),
        excerpt,
      }];
    });
  }, { origin: expectedOrigin });
}

export async function listingHasNoPostsMessage(page) {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  return /게시물이?\s*없|등록된\s*글이\s*없|no posts/i.test(bodyText);
}
