import type { ContentDocument } from "../content";
import type { ApprovalEvidenceFact } from "./ApprovalReadiness";
import type { ApprovalPolicyProfileId } from "./ApprovalPolicy";

type ApprovalFactPage = Readonly<{
  title: string;
  publisher: string;
  text: string;
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

  return Object.freeze([...found.values()].slice(0, 40));
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

export function approvalFactMatchesPage(
  page: ApprovalFactPage,
  fact: ApprovalEvidenceFact,
): boolean {
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
  };
  const fieldSignals = signalGroups[fact.field];
  if (fieldSignals?.length) {
    return fieldSignals.every((signal) => haystack.includes(normalize(signal)));
  }
  return variants(fact.value).some((value) => value.length >= 3 && haystack.includes(value));
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
  return [
    document.title,
    ...document.blocks.flatMap((block) => {
      if (block.type === "heading" || block.type === "paragraph") return [block.text];
      if (block.type === "table") return [block.caption ?? "", ...block.headers, ...block.rows.flat()];
      return [];
    }),
  ].join("\n");
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/&nbsp;|\u00a0/g, " ")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}
