import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import DevDashboard from "../../../../app/dev/page";

async function renderDashboard(blogName?: string): Promise<string> {
  const page = await DevDashboard({
    searchParams: Promise.resolve(
      blogName === undefined ? {} : { blogName },
    ),
  });

  return renderToStaticMarkup(page);
}

describe("Developer Dashboard", () => {
  it("renders the development notice and completed module status", async () => {
    const html = await renderDashboard();

    expect(html).toContain("Developer Dashboard");
    expect(html).toContain("Development only");
    expect(html).toContain("BrowserManager");
    expect(html).toContain("BrowserSessionManager");
    expect(html).toContain("BrowserContextManager");
    expect(html).toContain("Tistory Application");
    expect(html).toContain("Login page foundation");
  });

  it("renders generated URLs for a valid blog identifier", async () => {
    const html = await renderDashboard("bright-editor");

    expect(html).toContain("https://www.tistory.com/auth/login");
    expect(html).toContain("https://bright-editor.tistory.com/manage");
    expect(html).toContain("https://bright-editor.tistory.com/manage/newpost");
  });

  it("uses the existing URL API to normalize surrounding whitespace", async () => {
    const html = await renderDashboard("  bright-editor  ");

    expect(html).toContain("https://bright-editor.tistory.com/manage");
    expect(html).not.toContain("https://  bright-editor  .tistory.com");
  });

  it("renders a safe validation message for an invalid identifier", async () => {
    const html = await renderDashboard("https://example.tistory.com");

    expect(html).toContain("Enter a valid Tistory blog identifier.");
    expect(html).not.toContain("TypeError");
    expect(html).not.toContain("at createTistoryUrls");
  });
});
