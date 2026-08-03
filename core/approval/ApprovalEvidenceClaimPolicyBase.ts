import { serializeStructuredList, type ContentDocument } from "../content";
import type { ApprovalEvidenceFact } from "./ApprovalReadiness";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";

type ApprovalFactPage = Readonly<{
  title: string;
  publisher: string;
  text: string;
  requestedUrl?: string;
  finalUrl?: string;
}>;

export function extractProfileApprovalFacts(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  return extractProfileApprovalFactsFromText(documentText(document), profileId);
}

export function extractProfileApprovalFactsFromText(
  text: string,
  profileId: ApprovalPolicyProfileId,
): readonly ApprovalEvidenceFact[] {
  const found = new Map<string, ApprovalEvidenceFact>();
  const add = (field: string, value: string) => {
    const cleaned = value.replace(/https:\/\/\S+/gi, "").replace(/\s+/g, " ").replace(/[.;,]+$/g, "").trim();
    if (cleaned.length < 2 || cleaned.length > 240) return;
    const key = `${field}:${normalize(cleaned)}`;
    if (!found.has(key)) found.set(key, Object.freeze({ field, value: cleaned }));
  };
  const collect = (field: string, pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) add(field, match[1] ?? match[0]);
  };

  if (profileId === "tistory_vivarain_art_v1") {
    collect("artworkTitle", /(?:작품명|작품 제목)\s*[:：]\s*([^\n|]{2,120})/gi);
    collect("creationYear", /(?:제작\s*(?:연도|년도)|연도)\s*[:：]\s*((?:1[3-9]\d{2}|20\d{2})(?:년)?)/gi);
    collect("medium", /(?:재료|기법)\s*[:：]\s*([^\n|]{2,120})/gi);
    collect("dimensions", /(?:크기|규격)\s*[:：]\s*([^\n|]{2,120})/gi);
    collect("holdingInstitution", /(?:소장처|소장\s*기관)\s*[:：]\s*([^\n|]{2,160})/gi);
    return Object.freeze([...found.values()].slice(0, 30));
  }

  const retirementTopic = /퇴직금|퇴직급여|계속\s*근로|평균\s*임금/i.test(text);
  if (retirementTopic) add("retirementTopic", "퇴직금");
  const depositProtectionTopic = /예금자\s*보호|예금\s*보호|예금보험|보호\s*한도|보호\s*대상\s*금융상품/i.test(text);
  if (depositProtectionTopic) add("depositProtectionTopic", "예금자보호");
  const revolvingTopic = /리볼빙|일부결제금액이월약정|약정결제비율|이월잔액/i.test(text);
  if (revolvingTopic) add("revolvingTopic", "신용카드 리볼빙");

  collect("eligibility", /(?:지원|신청|지급|적용)\s*대상\s*[:：]?\s*([^\n.]{2,200})/gi);
  collect("period", /(?:신청|적용|지급)\s*기간\s*[:：]?\s*([^\n.]{2,160})/gi);
  collect("amount", /(?:지원\s*금액|지급액|금액|한도)\s*[:：]?\s*([^\n.]{2,160})/gi);
  collect("incomeThreshold", /(?:소득\s*기준|기준\s*중위소득)\s*[:：]?\s*([^\n.]{2,160})/gi);
  collect("interestRate", /(?:금리|이자율)\s*[:：]?\s*([^\n.]{2,120})/gi);
  collect("taxRate", /(?:세율|공제율)\s*[:：]?\s*([^\n.]{2,120})/gi);
  collect("continuousServicePeriod", /(?:계속\s*근로\s*기간|근속\s*기간)[^\n.]{0,60}?((?:\d+(?:\.\d+)?\s*(?:년|개월|일))[^\n.]{0,60})/gi);
  collect("averageWage", /(?:평균\s*임금)\s*[:：]?\s*([^\n.]{2,200})/gi);
  collect("retirementPayFormula", /((?:퇴직금|퇴직급여)[^\n.]{0,120}(?:30일|평균\s*임금|계속\s*근로)[^\n.]{0,120})/gi);
  collect("ordinaryWageFallback", /((?:통상\s*임금)[^\n.]{0,160}(?:평균\s*임금|퇴직금)[^\n.]{0,120})/gi);
  collect("leaveTreatment", /((?:휴직|휴업|출산전후휴가|육아휴직)[^\n.]{0,180}(?:평균\s*임금|산정|제외)[^\n.]{0,120})/gi);
  collect("interimSettlement", /((?:퇴직금|퇴직급여)\s*중간\s*정산[^\n.]{0,220})/gi);
  collect("paymentDeadline", /((?:퇴직|지급)[^\n.]{0,120}14\s*일\s*이내[^\n.]{0,100})/gi);
  collect("statutoryBasis", /((?:근로자퇴직급여\s*보장법|근로기준법|소득세법)[^\n.]{0,160})/gi);
  collect("exceptions", /(?:예외|제외|주의(?:사항)?)\s*[:：]?\s*([^\n.]{2,220})/gi);

  collect(
    "continuingTransactionDefinition",
    /((?:방문판매법상\s*)?계속거래[^\n.]{0,220}?1\s*개월\s*이상[^\n.]{0,220}?(?:(?:대금\s*)?환급[^\n.]{0,60}?제한|위약금[^\n.]{0,60}?(?:약정|조건))[^\n.]{0,100})/gi,
  );
  collect(
    "continuingTransactionArticle30Threshold",
    /((?:법\s*제?\s*30조|제30조|사전\s*설명|계약서\s*발급)[^\n.]{0,220}?(?:10\s*만\s*원[^\n.]{0,140}?3\s*개월|법령[^\n.]{0,60}?(?:금액|기간)[^\n.]{0,80}?요건)[^\n.]{0,100})/gi,
  );
  collect("continuingTransactionContractDocument", /((?:계속거래|계속\s*이용)[^\n.]{0,180}?계약서[^\n.]{0,100}?(?:소비자[^\n.]{0,40}?)?발급[^\n.]{0,60})/gi);
  collect("excessiveTerminationPenalty", /((?:해지|해제)[^\n.]{0,140}?손실[^\n.]{0,40}?현저히\s*초과[^\n.]{0,80}?위약금[^\n.]{0,80})/gi);
  collect("excessPaymentRefund", /((?:실제\s*공급(?:분|된\s*재화등의\s*대가))[^\n.]{0,140}?(?:초과)[^\n.]{0,100}?환급[^\n.]{0,80}?(?:부당[^\n.]{0,40}?)?거부[^\n.]{0,60})/gi);

  if (depositProtectionTopic) {
    collect("depositProtectedProducts", /((?:예금자\s*보호|예금\s*보호|예금보험)[^\n.]{0,160}(?:보호\s*대상|금융상품|예금|적금)[^\n.]{0,80})/gi);
    collect("depositProtectionLimit", /((?:보호\s*한도|예금\s*보호\s*한도|예금자\s*보호\s*한도|원금)[^\n.]{0,160}(?:1\s*억\s*원|100,?000,?000\s*원|원금[^\n.]{0,40}이자)[^\n.]{0,100})/gi);
    collect("depositProtectionUnit", /((?:(?:예금자|1\s*인)\s*(?:1\s*인당|당)?|금융회사)[^\n.]{0,140}(?:금융회사\s*별|부보금융회사\s*별|각\s*금융회사)[^\n.]{0,100})/gi);
    collect("depositProtectionExclusions", /((?:보호되지\s*않|보호\s*대상이\s*아니|비보호|보호\s*제외)[^\n.]{0,220})/gi);
    collect("depositProtectionCheckPath", /((?:예금보험공사|금융회사|상품설명서|통장|예금보험관계)[^\n.]{0,180}(?:확인|조회|표시|설명)[^\n.]{0,100})/gi);
    collect("depositProtectionEffectiveDate", /((?:2025\s*년\s*9\s*월\s*1\s*일|2025[-./]\s*9[-./]\s*1)[^\n.]{0,140})/gi);
    collect("depositProtectionStatutoryBasis", /((?:예금자보호법|예금자보호법\s*시행령)[^\n.]{0,180})/gi);
  }

  if (revolvingTopic) {
    collect("revolvingDefinition", /((?:리볼빙|일부결제금액이월약정)[^\n.]{0,220}(?:일부[^\n.]{0,80}결제|나머지[^\n.]{0,80}이월|이월잔액)[^\n.]{0,100})/gi);
    collect("revolvingInstallmentDifference", /((?:리볼빙|일부결제금액이월약정)[^\n.]{0,220}할부[^\n.]{0,180}(?:다르|구분|아니)[^\n.]{0,100})/gi);
    collect("revolvingPaymentStructure", /((?:약정결제비율|결제비율)[^\n.]{0,180}(?:이월|잔액|일부결제)[^\n.]{0,100})/gi);
    collect("revolvingFeeRisk", /((?:리볼빙|이월잔액)[^\n.]{0,220}(?:수수료율|수수료|이자)[^\n.]{0,180}(?:높|부담|증가|발생)[^\n.]{0,100})/gi);
    collect("revolvingDisclosureDuty", /((?:리볼빙|일부결제금액이월약정)[^\n.]{0,220}(?:설명서|설명의무|설명)[^\n.]{0,120})/gi);
    collect("revolvingFeeDisclosure", /((?:리볼빙|일부결제금액이월약정)[^\n.]{0,220}(?:수수료율)[^\n.]{0,140}(?:비교|공시|고지|안내)[^\n.]{0,100})/gi);
    collect("revolvingMinimumPaymentRatio", /((?:최소결제비율)[^\n.]{0,120}(?:10\s*%|10\s*퍼센트)[^\n.]{0,100})/gi);
    collect("revolvingCancellationGuidance", /((?:리볼빙|일부결제금액이월약정)[^\n.]{0,220}(?:해지|전액결제|상환)[^\n.]{0,120})/gi);
  }

  return Object.freeze([...found.values()].slice(0, 60));
}

export function requiredApprovalFactFields(
  document: ContentDocument,
  profileId: ApprovalPolicyProfileId,
  facts: readonly ApprovalEvidenceFact[],
): readonly string[] {
  const text = documentText(document);
  const available = new Set(facts.map((fact) => fact.field));
  if (profileId === "tistory_vivarain_art_v1") {
    const preferred = ["artworkTitle", "creationYear", "medium", "dimensions", "holdingInstitution"]
      .filter((field) => available.has(field));
    return Object.freeze(preferred);
  }

  if (/퇴직금|퇴직급여|계속\s*근로|평균\s*임금/i.test(text)) {
    return Object.freeze([
      "continuousServicePeriod",
      "averageWage",
      "retirementPayFormula",
      "paymentDeadline",
      ...(available.has("leaveTreatment") ? ["leaveTreatment"] : []),
      ...(available.has("interimSettlement") ? ["interimSettlement"] : []),
      ...(available.has("statutoryBasis") ? ["statutoryBasis"] : []),
    ]);
  }

  if (/예금자\s*보호|예금\s*보호|예금보험|보호\s*한도|보호\s*대상\s*금융상품/i.test(text)) {
    return Object.freeze([
      "depositProtectedProducts",
      "depositProtectionLimit",
      "depositProtectionUnit",
      "depositProtectionExclusions",
      "depositProtectionCheckPath",
      "depositProtectionEffectiveDate",
      "depositProtectionStatutoryBasis",
    ]);
  }

  if (/리볼빙|일부결제금액이월약정|약정결제비율|이월잔액/i.test(text)) {
    return Object.freeze([
      "revolvingDefinition",
      "revolvingPaymentStructure",
      ...(/할부/i.test(text) ? ["revolvingInstallmentDifference"] : []),
      ...(/수수료|수수료율|이자/i.test(text) ? ["revolvingFeeRisk"] : []),
      ...(/설명서|설명의무|설명/i.test(text) ? ["revolvingDisclosureDuty"] : []),
      ...(/비교|공시|고지|안내/i.test(text) ? ["revolvingFeeDisclosure"] : []),
      ...(/최소결제비율/i.test(text) ? ["revolvingMinimumPaymentRatio"] : []),
      ...(/해지|상환|전액결제/i.test(text) ? ["revolvingCancellationGuidance"] : []),
    ]);
  }

  if (/계속거래[^\n.]{0,260}(?:계약서|설명|위약금|환급|해지)|(?:계약서|위약금|환급)[^\n.]{0,260}계속거래/iu.test(text)) {
    const mentionsArticle30Duty = /(?:법\s*제?\s*30조|제30조|계약[^\n.]{0,100}설명|계약서[^\n.]{0,100}발급)/iu.test(text);
    return Object.freeze([
      ...(available.has("continuingTransactionDefinition") ? ["continuingTransactionDefinition"] : []),
      ...(mentionsArticle30Duty
        ? [...(available.has("continuingTransactionArticle30Threshold") ? ["continuingTransactionArticle30Threshold"] : []), "continuingTransactionContractDocument"]
        : []),
      ...(/손실[^\n.]{0,100}현저히\s*초과[^\n.]{0,120}위약금/iu.test(text) ? ["excessiveTerminationPenalty"] : []),
      ...(/실제\s*공급(?:분|된\s*재화등의\s*대가)[^\n.]{0,220}환급/iu.test(text) ? ["excessPaymentRefund"] : []),
    ]);
  }

  const preferred = [
    "eligibility",
    "period",
    "amount",
    "incomeThreshold",
    "interestRate",
    "taxRate",
    "exceptions",
    "statutoryBasis",
  ].filter((field) => available.has(field));
  return Object.freeze(preferred.length >= 2 ? preferred : ["eligibility", "statutoryBasis"]);
}

/** Claim roles for canonical official pages used by approval profiles. */
export function approvalEvidenceClaimFieldsForSourceUrl(urlValue: string): readonly string[] | undefined {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return undefined;
  }
  const host = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./, "");
  const path = url.pathname;
  if (host === "law.go.kr" && path.endsWith("/lsLinkCommonInfo.do") && url.searchParams.get("lsJoLnkSeq") === "1031805825") {
    return Object.freeze(["continuingTransactionDefinition"]);
  }
  if (host === "law.go.kr" && ((path.endsWith("/lsLawLinkInfo.do") && url.searchParams.get("lsJoLnkSeq") === "1000070098") || (path.endsWith("/lsLinkCommonInfo.do") && url.searchParams.get("lspttninfSeq") === "58591"))) {
    return Object.freeze(["continuingTransactionArticle30Threshold"]);
  }
  if (host === "law.go.kr" && path.endsWith("/lsLinkCommonInfo.do") && url.searchParams.get("lsJoLnkSeq") === "1025033501") {
    return Object.freeze(["continuingTransactionContractDocument", "excessiveTerminationPenalty", "excessPaymentRefund"]);
  }
  if (host === "kdic.or.kr") {
    if (path.includes("selectProtSystProtTrgtPrdctSumr.do")) return Object.freeze(["depositProtectedProducts", "depositProtectionExclusions"]);
    if (path.includes("ProtSystProtLmts/selectScrn.do")) return Object.freeze(["depositProtectionLimit", "depositProtectionUnit"]);
    if (path.includes("ProtSystProtGudn/selectScrn.do")) return Object.freeze(["depositProtectionCheckPath"]);
  }
  if (host === "fsc.go.kr" && path.endsWith("/84975")) {
    return Object.freeze(["depositProtectedProducts", "depositProtectionLimit", "depositProtectionUnit", "depositProtectionExclusions", "depositProtectionCheckPath"]);
  }
  if (host === "fsc.go.kr" && path.endsWith("/84974")) {
    return Object.freeze(["depositProtectionLimit", "depositProtectionUnit", "depositProtectionEffectiveDate"]);
  }
  if (host === "fsc.go.kr" && path.endsWith("/no040101") && url.searchParams.get("cnId") === "2396") {
    return Object.freeze(["revolvingDefinition", "revolvingInstallmentDifference", "revolvingPaymentStructure", "revolvingFeeRisk", "revolvingCancellationGuidance"]);
  }
  if (host === "fsc.go.kr" && path.endsWith("/po020201/27315")) {
    return Object.freeze(["revolvingDefinition", "revolvingFeeRisk"]);
  }
  if (host === "fsc.go.kr" && path.endsWith("/po010106/78357")) {
    return Object.freeze(["revolvingDisclosureDuty", "revolvingFeeDisclosure", "revolvingMinimumPaymentRatio", "revolvingFeeRisk"]);
  }
  if (host === "law.go.kr" && path.endsWith("/lsInfoP.do")) {
    return Object.freeze(["depositProtectionLimit", "depositProtectionUnit", "depositProtectionEffectiveDate", "depositProtectionStatutoryBasis"]);
  }
  return undefined;
}

export function approvalFactMatchesPage(page: ApprovalFactPage, fact: ApprovalEvidenceFact): boolean {
  if (fact.field === "depositProtectionEffectiveDate") {
    return approvalEffectiveDateMatchesPage(page, fact.value);
  }
  const haystack = normalize(`${page.title} ${page.publisher} ${page.text}`);
  const signalGroups: Readonly<Record<string, readonly string[]>> = {
    continuousServicePeriod: ["계속근로", "1년"],
    averageWage: ["평균임금", "3개월"],
    retirementPayFormula: ["퇴직", "30일", "평균임금"],
    ordinaryWageFallback: ["통상임금", "평균임금"],
    leaveTreatment: ["휴직", "평균임금"],
    interimSettlement: ["중간정산"],
    paymentDeadline: ["14일"],
    statutoryBasis: ["근로자퇴직급여보장법"],
    continuingTransactionDefinition: ["계속거래", "1개월", "환급", "위약금"],
    continuingTransactionArticle30Threshold: ["10만원", "3개월"],
    continuingTransactionContractDocument: ["계속거래", "계약서", "소비자", "발급"],
    excessiveTerminationPenalty: ["손실", "현저", "초과", "위약금"],
    excessPaymentRefund: ["실제공급", "대가", "초과", "환급", "부당", "거부"],
    depositProtectedProducts: ["예금", "보호"],
    depositProtectionLimit: ["1억원", "원금", "이자"],
    depositProtectionUnit: ["금융회사", "별", "1인"],
    depositProtectionExclusions: ["보호", "대상", "아니"],
    depositProtectionCheckPath: ["확인"],
    depositProtectionStatutoryBasis: ["예금자보호법"],
    revolvingDefinition: ["일부결제금액이월약정", "이월"],
    revolvingInstallmentDifference: ["리볼빙", "할부"],
    revolvingPaymentStructure: ["결제비율", "이월"],
    revolvingFeeRisk: ["수수료율", "높"],
    revolvingDisclosureDuty: ["설명", "설명서"],
    revolvingFeeDisclosure: ["수수료율", "비교"],
    revolvingMinimumPaymentRatio: ["최소결제비율", "10"],
    revolvingCancellationGuidance: ["리볼빙", "해지"],
  };
  const fieldSignals = signalGroups[fact.field];
  if (fieldSignals?.length) return fieldSignals.every((signal) => haystack.includes(normalize(signal)));
  return variants(fact.value).some((value) => value.length >= 3 && haystack.includes(value));
}

function approvalEffectiveDateMatchesPage(
  page: ApprovalFactPage,
  expectedValue: string,
): boolean {
  const expectedDates = extractCanonicalDates(expectedValue);
  if (!expectedDates.size) return false;
  const observedDates = extractCanonicalDates([
    page.title,
    page.publisher,
    page.text,
    page.requestedUrl ?? "",
    page.finalUrl ?? "",
  ].join(" "));
  return [...expectedDates].some((date) => observedDates.has(date));
}

function extractCanonicalDates(value: string): ReadonlySet<string> {
  const normalized = value.normalize("NFKC");
  const found = new Set<string>();
  const add = (year: string, month: string, day: string) => {
    const numericMonth = Number(month);
    const numericDay = Number(day);
    if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31) return;
    found.add(`${year}${numericMonth.toString().padStart(2, "0")}${numericDay.toString().padStart(2, "0")}`);
  };

  for (const match of normalized.matchAll(
    /(?<!\d)(20\d{2})\s*(?:년|[-./])\s*(0?[1-9]|1[0-2])\s*(?:월|[-./])\s*(0?[1-9]|[12]\d|3[01])\s*일?/gu,
  )) {
    add(match[1] ?? "", match[2] ?? "", match[3] ?? "");
  }
  for (const match of normalized.matchAll(
    /(?<!\d)(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/gu,
  )) {
    add(match[1] ?? "", match[2] ?? "", match[3] ?? "");
  }
  return found;
}

function variants(value: string): readonly string[] {
  const raw = value.normalize("NFKC");
  return Object.freeze([...new Set([
    raw,
    raw.replace(/(\d{4})\s*년/g, "$1"),
    raw.replace(/센티미터|㎝/g, "cm").replace(/밀리미터/g, "mm"),
    raw.replace(/\s*이상|\s*이하|\s*이내/g, ""),
  ].map(normalize).filter(Boolean))]);
}

function documentText(document: ContentDocument): string {
  return [document.title, ...document.blocks.flatMap((block) => {
    if (block.type === "heading" || block.type === "paragraph") return [block.text];
    if (block.type === "list") return [serializeStructuredList(block)];
    if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
    return [];
  })].join("\n");
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/&nbsp;|\u00a0/g, " ").replace(/[\s\p{P}\p{S}]+/gu, "");
}
