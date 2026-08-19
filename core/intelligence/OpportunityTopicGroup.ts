/**
 * Subject areas that let Planning attach market Evidence to a candidate written
 * with a different word for the same thing.
 *
 * Matching used to require a shared substring between the candidate's terms and
 * the Evidence keyword. 2026-08-19 밝은재테크 실측: 「연금저축 IRP 차이」와
 * 「전입신고 확정일자」 두 후보 모두 매칭 Evidence 0건이었다. 등록 키워드 예금,
 * 적금, 보험, 대출, 월세, 전세 중 어느 것도 후보 용어와 문자열이 겹치지 않았기
 * 때문이다. 연결 4개가 정상 동기화 중이었고 외부 Evidence 184건이 모두 fresh인
 * 상태였다. NAVER Search Trend는 연결 하나당 키워드 5개가 상한이므로 키워드를
 * 늘려 해결할 수 있는 문제도 아니다.
 *
 * 이 표는 로직이 아니라 데이터다. 새 콘텐츠 도메인은 그룹을 추가하면 되고 아래
 * 판정 규칙은 바뀌지 않는다. 멤버는 어간에 해당하는 짧은 형태만 둔다. 판정은
 * 「용어가 멤버를 포함한다」 한 방향이다. 그래서 전세자금대출처럼 두 어간을 모두
 * 담은 합성어는 주거와 대출 두 그룹에 들어가지만, 용어 「전세」는 주거 하나로만
 * 풀린다. 양방향으로 비교하면 멤버 목록에 긴 합성어가 하나 들어오는 순간 짧은
 * 용어가 엉뚱한 그룹까지 끌려 들어간다.
 *
 * 판정은 결정론적이다. 같은 용어는 언제나 같은 그룹으로 풀리고 Provider 호출이
 * 개입하지 않는다. (D-047)
 */
export const opportunityTopicGroupMembers = Object.freeze({
  retirement: Object.freeze(["연금", "irp", "퇴직", "노후"]),
  savings: Object.freeze(["예금", "적금", "저축", "목돈", "금리", "이자"]),
  credit: Object.freeze(["카드", "명세서", "할부", "결제"]),
  loan: Object.freeze(["대출", "신용점수", "상환", "연체"]),
  insurance: Object.freeze(["보험", "실손", "실비", "보장"]),
  tax: Object.freeze(["연말정산", "세금", "공제", "환급", "원천징수", "소득세"]),
  housing: Object.freeze(["월세", "전세", "임대차", "전입신고", "확정일자", "보증금", "이사", "등기", "청약"]),
  subsidy: Object.freeze(["지원금", "실업급여", "보조금", "수당", "바우처"]),
  livingCost: Object.freeze(["고정비", "통신비", "공과금", "관리비", "생활비", "구독"]),
  health: Object.freeze(["건강", "운동", "영양", "수면", "다이어트"]),
} as const);

export type OpportunityTopicGroupId = keyof typeof opportunityTopicGroupMembers;

const opportunityTopicGroupIds = Object.freeze(Object.keys(opportunityTopicGroupMembers) as readonly OpportunityTopicGroupId[]);

/**
 * Normalizes here rather than trusting the caller. Callers already lowercase and
 * strip punctuation for their own comparisons, but group membership must not
 * depend on which caller asked.
 */
function normalizeTerm(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/gu, "");
}

export function opportunityTopicGroupsOf(terms: readonly string[]): ReadonlySet<OpportunityTopicGroupId> {
  const normalized = terms.map(normalizeTerm).filter(Boolean);
  const result = new Set<OpportunityTopicGroupId>();
  for (const id of opportunityTopicGroupIds) {
    if (opportunityTopicGroupMembers[id].some((member) => normalized.some((term) => term.includes(member)))) result.add(id);
  }
  return result;
}

/**
 * True when both sides resolve to at least one shared subject area. Terms that
 * belong to no group never match: an unknown domain must fall back to the
 * caller's literal comparison instead of matching everything.
 */
export function sharesOpportunityTopicGroup(left: readonly string[], right: readonly string[]): boolean {
  const leftGroups = opportunityTopicGroupsOf(left);
  if (!leftGroups.size) return false;
  const rightGroups = opportunityTopicGroupsOf(right);
  for (const id of leftGroups) if (rightGroups.has(id)) return true;
  return false;
}
