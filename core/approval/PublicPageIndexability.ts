/**
 * Whether a public page is allowed into a search index.
 *
 * This lives in Core because both platform audits owe the same answer. The
 * WordPress audit had its own home-page-only version and Tistory had none, so
 * the readiness gate could report a site ready while the pages AdSense actually
 * looks for were excluded.
 *
 * Measured on brightjaetech.kr, 2026-08-14: the gate reported all 15 checks
 * passing on the same day Search Console listed `/about/`, `/disclaimer/` and
 * the `http://` root as excluded by NOINDEX. Nothing was wrong with the gate's
 * logic — it simply never opened those pages.
 */

export type PublicPageIndexability = Readonly<{
  indexable: boolean;
  /** Where the exclusion came from, when there is one. */
  blockedBy?: "meta" | "header";
  /** The directive as written, so a diagnostic can quote it back. */
  directive?: string;
}>;

/**
 * A page is excluded when either the markup or the response header says so.
 *
 * The header matters as much as the tag: a host or a plugin can set
 * `X-Robots-Tag: noindex` without touching the HTML, and a check that only
 * parses markup reports that page as indexable.
 */
export function evaluatePublicPageIndexability(input: Readonly<{
  html?: string;
  xRobotsTag?: string;
}>): PublicPageIndexability {
  const header = String(input.xRobotsTag ?? "");
  if (header && crawlerDirectiveExcludes(header)) {
    return Object.freeze({ indexable: false, blockedBy: "header" as const, directive: header.trim() });
  }
  for (const tag of String(input.html ?? "").matchAll(/<meta\b[^>]*>/gi)) {
    if (!robotsMetaName.test(tag[0])) continue;
    const content = /content=["']([^"']*)["']/i.exec(tag[0])?.[1] ?? "";
    if (!/\bnoindex\b/i.test(content)) continue;
    return Object.freeze({ indexable: false, blockedBy: "meta" as const, directive: content.trim() });
  }
  return Object.freeze({ indexable: true });
}

/**
 * `X-Robots-Tag` may be scoped to one crawler — `googlebot: noindex` — or apply
 * to all of them. Both exclude the page; a directive naming some other agent
 * does not, so the agent prefix is read rather than ignored.
 */
function crawlerDirectiveExcludes(value: string): boolean {
  return value.split(",").some((part) => {
    const directive = part.trim();
    if (!/\bnoindex\b/i.test(directive)) return false;
    const agent = /^([a-z0-9_-]+)\s*:/i.exec(directive)?.[1];
    return !agent || publicSearchAgents.test(agent);
  });
}

const publicSearchAgents = /^(?:googlebot|googlebot-news|bingbot|robots|otherbot)$/i;
const robotsMetaName = /(?:name|property)=["'](?:robots|googlebot|bingbot)["']/i;
