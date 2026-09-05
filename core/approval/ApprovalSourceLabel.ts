import { approvalSourceInstitutionName } from "./ApprovalOfficialSourcePolicy";

/**
 * 독자가 출처 줄에서 읽는 이름.
 *
 * 기관 이름 하나가 기본이다. 같은 기관에서 온 출처가 둘 이상일 때만 페이지를
 * 가릴 수 있는 만큼 덧붙인다 — 줄이 하나뿐이면 덧붙일 이유가 없다.
 *
 * 덧붙이는 값은 페이지 제목에서 장식 문자와 기관 이름을 걷어낸 나머지다.
 * 사이트가 제목에 넣는 `:: … ::`, `… | 기관명`, `… - 기관명` 이 그대로 나가지
 * 않게 한다. 읽을 수 없는 제목이면 (PDF 메타데이터가 잘못 디코딩된 경우처럼)
 * 덧붙이지 않는다. 뜻 없는 바이트를 보여 주느니 같은 이름 두 줄이 낫다.
 *
 * 제목이 그 사이트의 고정된 화면 껍데기 문구라 페이지마다 똑같을 수도 있다.
 * 2026-09-05 실측(content-mtnqhijd-f1m7e0): 고용노동부 1350 상담 출처 4개가
 * 서로 다른 URL(다른 답변)인데 title이 전부 ":: 고용노동부 모바일페이지
 * 고객센터 ::"로 동일한 SPA 화면이라, 걷어낸 나머지도 4개 다 같은 값이 되어
 * 라벨이 구분되지 않았다. 이때는 실제 답변 발췌(citationExcerpt)로 넘어가고,
 * 그마저 구분되지 않으면 순번으로 구분한다 — 뜻 없이 같은 라벨 넷을 보여
 * 주느니 순번이라도 있는 편이 실제로 구분된다.
 */
export type ApprovalSourceLabelInput = Readonly<{
  url: string;
  canonicalUrl?: string;
  title?: string;
  excerpt?: string;
}>;

export function approvalSourceLabels(
  sources: readonly ApprovalSourceLabelInput[],
): readonly string[] {
  const institutions = sources.map((source) => institutionOf(source));
  const groups = new Map<string, number[]>();
  institutions.forEach((name, index) => {
    const group = groups.get(name) ?? [];
    group.push(index);
    groups.set(name, group);
  });

  const details = new Array<string>(sources.length).fill("");
  for (const [name, indexes] of groups) {
    if (indexes.length < 2) continue;
    const titleDetails = indexes.map((index) => distinguishingDetail(sources[index]?.title ?? "", name));
    indexes.forEach((index, position) => { details[index] = titleDetails[position]!; });
    /**
     * 값이 없는 것과 값이 겹치는 것은 다르다. 값이 없으면 그 항목만 기관 이름
     * 하나로 보여 주면 되고, 다른 항목의 구분력을 해치지 않는다. 문제는 서로
     * 다른 항목이 같은 값을 갖는 경우뿐이다 — 이때만 그 항목들에 한해 다음
     * 단계로 넘어간다.
     */
    const colliding = collidingPositions(titleDetails);
    if (!colliding.length) continue;
    const collidingIndexes = colliding.map((position) => indexes[position]!);
    const excerptDetails = collidingIndexes.map((index) => distinguishingDetail(sources[index]?.excerpt ?? "", name));
    const stillColliding = collidingPositions(excerptDetails);
    if (!stillColliding.length) {
      collidingIndexes.forEach((index, position) => { details[index] = excerptDetails[position]!; });
      continue;
    }
    collidingIndexes.forEach((index, position) => { details[index] = `${position + 1}번째 답변`; });
  }

  return Object.freeze(institutions.map((name, index) => details[index] ? `${name} · ${details[index]}` : name));
}

/** 값이 있는 항목들 중 같은 값을 가진 자리만 골라낸다. 빈 값은 겹침으로 치지 않는다. */
function collidingPositions(values: readonly string[]): readonly number[] {
  const counts = new Map<string, number>();
  for (const value of values) { if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }
  return values.flatMap((value, position) => (value && (counts.get(value) ?? 0) > 1 ? [position] : []));
}

export function approvalSourceLabel(source: ApprovalSourceLabelInput): string {
  return institutionOf(source);
}

function institutionOf(source: ApprovalSourceLabelInput | undefined): string {
  if (!source) return "";
  try {
    return approvalSourceInstitutionName(new URL(source.canonicalUrl ?? source.url).hostname);
  } catch {
    return approvalSourceInstitutionName(source.url);
  }
}

/** 앞뒤 장식 문자. 가운데는 건드리지 않는다 — `법령 > 본문 > …` 은 뜻이 있다. */
const decorativeEdges = /^[\s:|\-–—·~*=<>[\]]+|[\s:|\-–—·~*=<>[\]]+$/gu;

/**
 * 페이지 이름은 제목의 첫 도막이다.
 *
 * 정부 사이트 제목은 `페이지 이름 - 게시판 - 메뉴 - 기관` 처럼 위치를 뒤에
 * 이어 붙인다. 2026-08-20 실측: "월 10만 원 저축하면 … 접수 - 정책뉴스 | 뉴스"
 * 에서 뒤의 두 도막은 어느 페이지인지 가리는 데 보태는 것이 없다. 구분자가
 * 처음 나오는 자리에서 끊는다.
 */
function distinguishingDetail(title: string, institution: string): string {
  const withoutInstitution = institution ? title.split(institution).join(" ") : title;
  // 기관 이름을 걷어내면 앞 도막이 비는 경우가 있다 (`국가법령정보센터 | 조문정보`).
  const detail = withoutInstitution
    .replace(/\s+/gu, " ")
    .split(/\s[-–—|]\s/u)
    .map((segment) => segment.replace(decorativeEdges, "").trim())
    .find(Boolean) ?? "";
  if (!readableDetail(detail)) return "";
  return detail.length > 40 ? `${detail.slice(0, 40).trim()}…` : detail;
}

/**
 * 사람이 읽을 수 있는 글자로 이루어졌는가.
 *
 * PDF 의 `/Title` 이 UTF-16 으로 적혀 있는데 바이트 그대로 읽히면
 * `þÿ È 1Ç¥ Í ÎY` 같은 값이 남는다. 이런 값은 덧붙일 정보가 아니다.
 */
function readableDetail(value: string): boolean {
  if (value.length < 2) return false;
  const readable = (value.match(/[가-힣A-Za-z0-9]/gu) ?? []).length;
  return readable >= Math.ceil(value.length * 0.6);
}
