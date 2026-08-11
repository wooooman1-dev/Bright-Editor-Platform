/**
 * Whether a quoted excerpt is genuinely carried by the page it was quoted from.
 *
 * The excerpt is the model's verbatim quote of a page it read. The page text is
 * the server's own fetch and extraction of the same URL, performed separately.
 * Requiring the quote to be an exact substring therefore required two
 * independent extractions of a live page to agree character for character, and
 * a 국세청 page carrying the required evidence word for word was rejected because
 * the two renderings differed somewhere inside the quote.
 *
 * An exact match is the fast path. Otherwise **every** character of the quote
 * must still appear in the page, in order, as a small number of long verbatim
 * runs — which is what an inserted clause does to a quotation: it splits the
 * quote without removing any of it. Nothing is forgiven. A quote containing a
 * word the page does not have still fails, so this cannot admit invented
 * evidence.
 *
 * Both arguments must already be normalized by the caller. The two call sites
 * normalize differently — the preflight keeps only digits, ASCII letters and
 * Hangul, while Coverage strips punctuation and symbols but keeps every script
 * — and sharing the algorithm rather than the normalization leaves each one's
 * own rules intact.
 */
export function evidenceExcerptAnchored(page: string, excerpt: string): boolean {
  if (!excerpt) return false;
  if (page.includes(excerpt)) return true;
  return excerptSplitAcrossPage(page, excerpt);
}

/**
 * A run this long in normalized Korean text is a quotation rather than a
 * collision of common phrasing, and three runs allow the two insertions an
 * extraction difference realistically produces inside one quoted sentence. The
 * whole excerpt still has to be accounted for by those runs.
 */
const minimumAnchorRunLength = 10;
const maximumAnchorRuns = 3;

/**
 * Consumes the excerpt from the left, taking the longest run that still appears
 * after everything already matched. Requiring the runs to advance through the
 * page keeps the quote in the order the page states it, so fragments cannot be
 * gathered from unrelated parts of a long document.
 */
function excerptSplitAcrossPage(page: string, excerpt: string): boolean {
  let index = 0;
  let searchFrom = 0;
  let runs = 0;
  while (index < excerpt.length) {
    const run = longestVerbatimRun(page, excerpt, index, searchFrom);
    if (!run || run.length < minimumAnchorRunLength) return false;
    runs += 1;
    if (runs > maximumAnchorRuns) return false;
    index += run.length;
    searchFrom = run.at + run.length;
  }
  return true;
}

/**
 * A prefix of a substring is itself a substring found no later, so run length is
 * monotone and can be found by bisection rather than one character at a time.
 */
function longestVerbatimRun(
  page: string,
  excerpt: string,
  start: number,
  searchFrom: number,
): Readonly<{ at: number; length: number }> | undefined {
  let low = 0;
  let high = excerpt.length - start;
  let found: Readonly<{ at: number; length: number }> | undefined;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const at = page.indexOf(excerpt.slice(start, start + middle), searchFrom);
    if (at < 0) {
      high = middle - 1;
      continue;
    }
    found = Object.freeze({ at, length: middle });
    low = middle;
  }
  return found;
}
