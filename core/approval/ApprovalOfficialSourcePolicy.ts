import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";

/**
 * Canonical official-domain policy shared by Generation search and deterministic
 * Evidence verification. Keeping one Core allow-list prevents the two paths
 * from accepting different institutions.
 */
export const wordpressLifeEconomyOfficialDomains = Object.freeze([
  "gov.kr",
  "go.kr",
  "korea.kr",
  "law.go.kr",
  "nts.go.kr",
  "fsc.go.kr",
  "fss.or.kr",
  "bok.or.kr",
  "molit.go.kr",
  "moel.go.kr",
  "mohw.go.kr",
  "mois.go.kr",
  "lh.or.kr",
  "hf.go.kr",
  "nhuf.molit.go.kr",
  "kdic.or.kr",
]);

/**
 * 금융회사가 자기 상품을 설명하는 공식 사이트.
 *
 * 예금 금리·중도해지이율·카드 연회비·수수료는 그 회사가 소유한 사실이고, 그
 * 회사 페이지가 1차 출처다 (D-037). 그런데 허용 목록이 정부 도메인 15개뿐이라
 * 승인용 생성의 웹 검색이 은행 페이지를 아예 결과로 받지 못했다. 2026-08-14
 * 실측: 적금 중도해지 원고가 근거를 찾지 못한 채 막혔고, 국세환급금 원고는
 * 국세청 도메인 형태를 지어낸 `j.nts.go.kr` 을 들고 왔다. 찾을 수 없는 곳을
 * 요구하면 생성은 지어낸다.
 *
 * 목록이 빠짐없을 필요는 없다. 여기 없는 회사는 검색되지 않을 뿐이고, 필요해질
 * 때 한 줄 추가하면 된다. 잘못 넣는 것보다 빠뜨리는 편이 안전하므로 그 회사가
 * 실제로 쓰는 도메인만 넣는다.
 */
export const koreanFinancialInstitutionDomains = Object.freeze([
  // 은행
  "kbstar.com",
  "shinhan.com",
  "wooribank.com",
  "hanabank.com",
  "nonghyup.com",
  "ibk.co.kr",
  "kdb.co.kr",
  "sc.co.kr",
  "citibank.co.kr",
  "kakaobank.com",
  "kbanknow.com",
  "tossbank.com",
  "busanbank.co.kr",
  "dgb.co.kr",
  "kjbank.com",
  "jbbank.co.kr",
  "e-jeju.co.kr",
  "kfcc.co.kr",
  "cu.co.kr",
  "epostbank.go.kr",
  // 카드
  "kbcard.com",
  "shinhancard.com",
  "samsungcard.com",
  "hyundaicard.com",
  "lottecard.co.kr",
  "hanacard.com",
  "wooricard.com",
  "nhcard.com",
  "bccard.com",
  // 증권
  "samsungpop.com",
  "miraeassetsecurities.com",
  "kiwoom.com",
  "nhqv.com",
  "koreainvestment.com",
  "kbsec.com",
  "shinhaninvest.com",
  "hanaw.com",
  "daishin.com",
  "truefriend.com",
]);

export type ApprovalSourceTier =
  /** 정부·공공기관. 법령·세율·정부 지원처럼 정부가 소유한 사실의 원문. */
  | "public_sector"
  /** 은행·카드사·증권사. 자기 상품 조건의 1차 출처. */
  | "financial_institution"
  /** 그 밖의 사이트. 개인 블로그·커뮤니티·언론사가 여기 들어온다. */
  | "unofficial";

/**
 * 출처를 한 곳에서 등급으로 나눈다.
 *
 * 판정이 그동안 "정부 도메인인가"라는 예/아니오 하나였다. 그래서 은행이 자기
 * 금리를 올린 공식 페이지와 개인 블로그가 같은 칸에 들어갔다. 등급을 나누면
 * 개인 블로그를 막으면서 금융회사를 잃지 않는다.
 *
 * 언론사는 unofficial 이다. 기사는 발표를 옮긴 2차 자료라 원문이 항상 존재하고,
 * 제휴 언론사 수백 곳의 목록을 관리하는 비용에 견줄 이득이 없다.
 */
export function approvalSourceTier(host: string): ApprovalSourceTier {
  const normalized = host.toLocaleLowerCase("en-US").replace(/\.$/, "");
  if (publicSectorDomainAllowed(normalized)
    || officialDomainAllowed(normalized, wordpressLifeEconomyOfficialDomains)) {
    return "public_sector";
  }
  if (officialDomainAllowed(normalized, koreanFinancialInstitutionDomains)) {
    return "financial_institution";
  }
  return "unofficial";
}

/** 출처로 인용할 수 있는 곳인가. */
export function approvalSourceTrusted(host: string): boolean {
  return approvalSourceTier(host) !== "unofficial";
}

/**
 * 생성의 웹 검색이 볼 수 있는 곳.
 *
 * 검색 필터가 곧 인용 가능 범위다. 개인 블로그가 결과로 들어오지 않으므로
 * 비공식 출처는 여기서 차단되고, 반대로 여기 없는 곳은 생성이 근거를 찾을 수
 * 없다. 그래서 정부와 금융회사를 함께 연다 — 이 사이트의 주제가 정부 제도
 * 아니면 금융상품 조건이고, 둘 중 하나는 반드시 필요하다.
 */
export function approvalOfficialDomains(
  profileId: ApprovalPolicyProfileId,
): readonly string[] | undefined {
  return profileId === "wordpress_life_economy_v1"
    ? approvalSearchableDomains
    : undefined;
}

const approvalSearchableDomains = Object.freeze([
  ...wordpressLifeEconomyOfficialDomains,
  ...koreanFinancialInstitutionDomains,
]);

export function officialDomainAllowed(
  host: string,
  domains: readonly string[],
): boolean {
  const normalized = host.toLocaleLowerCase("en-US").replace(/\.$/, "");
  return domains.some((domain) =>
    normalized === domain || normalized.endsWith(`.${domain}`));
}

export function publicSectorDomainAllowed(host: string): boolean {
  const normalized = host.toLocaleLowerCase("en-US").replace(/\.$/, "");
  return /(?:^|\.)gov(?:\.[a-z]{2,})?$/u.test(normalized)
    || /(?:^|\.)mil(?:\.[a-z]{2,})?$/u.test(normalized)
    || /(?:^|\.)(?:go|gob)\.[a-z]{2,}$/u.test(normalized);
}
