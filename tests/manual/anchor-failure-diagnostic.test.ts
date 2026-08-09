import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "vitest";

import { fetchPreflightPage } from "../../core/ai/ApprovalSourcePreflight";
import { canonicalEvidenceAnchorText } from "../../core/approval";

const enabled = process.env.RUN_ANCHOR_FAILURE_DIAGNOSTIC === "1";

const cases = [
  {
    url: "https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lspttninfSeq=129152",
    excerpt: "제95조(월세 세액공제) ② 법 제95조의2제1항 본문에서 “대통령령으로 정하는 주택”이란 다음 각 호의 요건을 모두 갖춘 주택(「주택법 시행령」 제4조제4호에 따른 오피스텔 및 「건축법 시행령」 별표 1 제4호거목에 따른 고시원업의 시설을 포함한다. 이하 이 조에서 같다)을 말한다.",
  },
  {
    url: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=239025&mi=40613",
    excerpt: "#### 구비 서류\n\n* ①주민등록표등본, ②임대차계약증서 사본, ③계좌이체 영수증 및 무통장입금증 등 월세액 지급 증빙 서류 → 연말정산 시 회사에 제출",
  },
];

function divergenceIndex(haystack: string, needle: string): number {
  let low = 0;
  let high = needle.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (haystack.includes(needle.slice(0, mid))) low = mid; else high = mid - 1;
  }
  return low;
}

describe.skipIf(!enabled)("evidence anchor failure diagnostic", () => {
  it("locates where each rejected excerpt stops matching its fetched page", async () => {
    const report = [];
    for (const item of cases) {
      const page = await fetchPreflightPage(item.url, fetch);
      const canonicalPage = canonicalEvidenceAnchorText(page.text);
      const canonicalExcerpt = canonicalEvidenceAnchorText(item.excerpt);
      const cut = divergenceIndex(canonicalPage, canonicalExcerpt);
      const anchorAt = canonicalPage.indexOf(canonicalExcerpt.slice(Math.max(0, cut - 30), cut));
      report.push({
        url: item.url,
        status: page.status,
        extractionStatus: page.extractionStatus,
        pageTextLength: page.text.length,
        canonicalPageLength: canonicalPage.length,
        canonicalExcerptLength: canonicalExcerpt.length,
        matchedPrefixLength: cut,
        matchedPrefixTail: canonicalExcerpt.slice(Math.max(0, cut - 60), cut),
        excerptContinues: canonicalExcerpt.slice(cut, cut + 60),
        pageContinuesAtSamePoint: anchorAt >= 0
          ? canonicalPage.slice(anchorAt + Math.min(30, cut), anchorAt + Math.min(30, cut) + 90)
          : "(anchor not located)",
        pageTextHead: page.text.slice(0, 300),
      });
    }
    writeFileSync(resolve(process.cwd(), "anchor-failure-diagnostic.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }, 120_000);
});
