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

describe("개발 대시보드", () => {
  it("renders the development notice and completed module status", async () => {
    const html = await renderDashboard();

    expect(html).toContain("Bright Studio");
    expect(html).toContain("AI 콘텐츠 자동화 플랫폼");
    expect(html).toContain("Development Mode");
    expect(html).toContain("개발 현황");
    expect(html).toContain("BrowserManager");
    expect(html).toContain("BrowserSessionManager");
    expect(html).toContain("BrowserContextManager");
    expect(html).toContain("티스토리");
    expect(html).toContain("워드프레스");
    expect(html).toContain("유튜브");
    expect(html).toContain("네이버 카페");
    expect(html).not.toContain("Bright Editor Platform");
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

    expect(html).toContain("올바른 티스토리 블로그 이름을 입력해 주세요.");
    expect(html).not.toContain("TypeError");
    expect(html).not.toContain("at createTistoryUrls");
  });
});
