import { describe, expect, it } from "vitest";

import { platformPreviewDocument } from "../../../../app/user-flow/PlatformPreviewDocument";

describe("platform Preview document", () => {
  it("wraps WordPress Renderer fragments in an isolated responsive HTML shell", () => {
    const fragment = '<figure class="wp-block-table"><table><thead><tr><th>항목</th></tr></thead><tbody><tr><td>값</td></tr></tbody></table></figure>';
    const html = platformPreviewDocument(fragment, "wordpress", "예금자보호 확인 방법");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(html).toContain("figure.wp-block-table{display:block;max-width:100%;overflow-x:auto");
    expect(html).toContain("figure.wp-block-table th,figure.wp-block-table td{border:1px solid #dcdcde;padding:12px 14px");
    expect(html).toContain(fragment);
  });
});
