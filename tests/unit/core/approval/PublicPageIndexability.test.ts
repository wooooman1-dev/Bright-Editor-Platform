import { describe, expect, it } from "vitest";

import { evaluatePublicPageIndexability } from "../../../../core/approval";

const indexableHead = '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">';

describe("PublicPageIndexability", () => {
  it("reads the robots meta tag brightjaetech.kr actually serves", () => {
    expect(evaluatePublicPageIndexability({ html: `<head>${indexableHead}</head>` }))
      .toEqual({ indexable: true });
  });

  it("reports which directive excluded the page", () => {
    const result = evaluatePublicPageIndexability({
      html: '<head><meta name="robots" content="noindex, follow"></head>',
    });
    expect(result.indexable).toBe(false);
    expect(result.blockedBy).toBe("meta");
    expect(result.directive).toBe("noindex, follow");
  });

  it("reads googlebot and bingbot meta tags, not only the generic one", () => {
    expect(evaluatePublicPageIndexability({ html: '<meta name="googlebot" content="noindex">' }).indexable).toBe(false);
    expect(evaluatePublicPageIndexability({ html: '<meta name="bingbot" content="noindex">' }).indexable).toBe(false);
  });

  /**
   * A host or a plugin can exclude a page without touching the markup. A check
   * that only parses HTML calls that page indexable.
   */
  it("reads the X-Robots-Tag header", () => {
    const result = evaluatePublicPageIndexability({ html: `<head>${indexableHead}</head>`, xRobotsTag: "noindex" });
    expect(result.indexable).toBe(false);
    expect(result.blockedBy).toBe("header");
  });

  it("reads a crawler-scoped header directive", () => {
    expect(evaluatePublicPageIndexability({ xRobotsTag: "googlebot: noindex" }).indexable).toBe(false);
    expect(evaluatePublicPageIndexability({ xRobotsTag: "bingbot: noindex, nofollow" }).indexable).toBe(false);
  });

  it("ignores a header directive aimed at some other agent", () => {
    expect(evaluatePublicPageIndexability({ xRobotsTag: "internalcrawler: noindex" }).indexable).toBe(true);
  });

  it("does not treat nofollow or noarchive as exclusion from the index", () => {
    expect(evaluatePublicPageIndexability({ html: '<meta name="robots" content="nofollow, noarchive">' }).indexable).toBe(true);
    expect(evaluatePublicPageIndexability({ xRobotsTag: "noarchive" }).indexable).toBe(true);
  });

  it("treats a page with no directive at all as indexable", () => {
    expect(evaluatePublicPageIndexability({ html: "<html><body>본문</body></html>" }).indexable).toBe(true);
    expect(evaluatePublicPageIndexability({}).indexable).toBe(true);
  });
});
