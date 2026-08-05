import { opportunityEvidenceLabel, type ContentOpportunityCandidate } from "../../core/content";
import type { ContentPlanningResult } from "./user-data";
import {
  contentDepthLabel,
  contentTypeLabel,
  evidenceTypeLabel,
  formatEvidenceLimitations,
  formatOpportunityConfidence,
  formatOpportunityEvidenceSummary,
  freshnessLabel,
  platformLabel,
  providerLabel,
  topicComplexityLabel,
} from "./opportunity-presentation";

export function PrimaryKeywordConfirmation({
  customKeyword,
  customKeywordSelected,
  disabled,
  onCustomKeywordChange,
  onSelectCandidate,
  onSelectCustom,
  onReanalyzeCustom,
  opportunityCandidates,
  plan,
  request,
  selectedOpportunityId,
}: Readonly<{
  customKeyword: string;
  customKeywordSelected: boolean;
  disabled: boolean;
  onCustomKeywordChange: (value: string) => void;
  onSelectCandidate: (value: ContentOpportunityCandidate) => void;
  onSelectCustom: () => void;
  onReanalyzeCustom: () => void;
  opportunityCandidates: readonly ContentOpportunityCandidate[];
  plan: ContentPlanningResult;
  request: string;
  selectedOpportunityId: string;
}>) {
  return (
    <>
      <p className="text-xs font-semibold tracking-[0.12em] text-[#ff6b6b] uppercase">콘텐츠 기회 확인</p>
      <h2 className="mt-2 text-xl font-semibold">이 글의 주제와 대표 키워드를 함께 선택해 주세요.</h2>
      <p className="mt-2 text-sm text-[#77777f]">주제·검색 의도·보조 키워드가 하나의 전략으로 저장되며 생성과 품질 검토에서 분리되지 않습니다.</p>
      <fieldset className="mt-5 space-y-3" disabled={disabled}>
        <legend className="sr-only">콘텐츠 기회 후보</legend>
        {opportunityCandidates.map((candidate) => {
          const selected = !customKeywordSelected && candidate.opportunityId === selectedOpportunityId;
          const expectedCoverage = stringArray(candidate.expectedCoverage);
          const secondaryKeywords = stringArray(candidate.secondaryKeywords);
          const limitations = formatEvidenceLimitations(stringArray(candidate.limitations));
          const evidence = Array.isArray(candidate.opportunityEvidence) ? candidate.opportunityEvidence : [];
          const target = candidate.qualityTarget;
          return (
            <label className={`block cursor-pointer rounded-xl border px-4 py-4 text-sm ${selected ? "border-[#ff6b6b] bg-[#fff7f7]" : "border-black/8"}`} key={candidate.opportunityId}>
              <span className="flex items-start gap-3">
                <input checked={selected} className="mt-1" name="content-opportunity" onChange={() => onSelectCandidate(candidate)} type="radio" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><strong>{candidate.selectedTopic}</strong><span className="rounded-full bg-[#f3f3f5] px-2.5 py-1 text-xs font-semibold text-[#5f5f68]">{recommendationTypeLabel(candidate.recommendationType)}</span></span>
                  <span className="mt-2 block"><span className="font-semibold text-[#66666f]">대표 키워드</span> · {candidate.primaryKeyword}</span>
                  <span className="mt-1 block"><span className="font-semibold text-[#66666f]">검색 의도</span> · {candidate.searchIntent}</span>
                  <span className="mt-1 block"><span className="font-semibold text-[#66666f]">주요 내용</span> · {expectedCoverage.join(", ") || secondaryKeywords.join(", ") || "후보 확정 후 원고에서 구체화"}</span>
                  <span className="mt-1 block"><span className="font-semibold text-[#66666f]">추천 이유</span> · {candidate.selectionRationale}</span>
                  {target ? (
                    <span className="mt-2 block rounded-lg bg-white/80 px-3 py-2 text-xs leading-5 text-[#66666f]">
                      <span className="font-semibold text-[#34343a]">콘텐츠 깊이 · {contentDepthLabel(target.contentDepth)}</span>
                      <span className="block">콘텐츠 유형 · {contentTypeLabel(candidate.contentType)}</span>
                      <span className="block">주제 복잡도 · {topicComplexityLabel(target.topicComplexity)} · 독자 문제 · {target.readerProblem}</span>
                      <span className="block">핵심 질문 · {target.coreQuestions.join(", ")}</span>
                      <span className="block">필수 요소 · {target.requiredContentElements.join(", ")}</span>
                      <span className="block">판단 기준 · {target.decisionCriteria.join(", ")}</span>
                    </span>
                  ) : null}
                  <span className="mt-2 block text-xs text-[#77777f]">근거 · {[...new Set(evidence.map((item) => item.evidenceType ? evidenceTypeLabel(item.evidenceType) : opportunityEvidenceLabel(item.source)))].join(", ")}</span>
                  <span className="mt-1 block text-xs text-[#77777f]">데이터 출처 · {[...new Set(evidence.map((item) => item.provider ? providerLabel(item.provider) : opportunityEvidenceLabel(item.source)))].join(", ") || "외부 데이터 없음"}</span>
                  <span className="mt-1 block text-xs text-[#77777f]">데이터 기간 · {[...new Set(evidence.map((item) => item.periodStart || item.periodEnd ? `${item.periodStart ?? "?"}~${item.periodEnd ?? "?"}` : "내부 현재 상태"))].join(", ")}</span>
                  <span className={`mt-1 block text-xs ${candidate.freshness === "stale" ? "font-semibold text-amber-800" : "text-[#77777f]"}`}>최신성 · {freshnessLabel(candidate.freshness)} · 신뢰도 {formatOpportunityConfidence(candidate.confidence)}</span>
                  <span className="mt-1 block text-xs leading-5 text-amber-800">제한사항 · {limitations.join(" ") || "없음"}</span>
                </span>
              </span>
            </label>
          );
        })}
        <label className={`block rounded-xl border px-4 py-3 text-sm ${customKeywordSelected ? "border-[#ff6b6b] bg-[#fff7f7]" : "border-black/8"}`}>
          <span className="flex items-center gap-3"><input checked={customKeywordSelected} name="content-opportunity" onChange={onSelectCustom} type="radio" /><strong>직접 입력</strong></span>
          <input className="mt-3 w-full rounded-lg border bg-white px-3 py-2 disabled:opacity-60" disabled={!customKeywordSelected || disabled} onChange={(event) => onCustomKeywordChange(event.target.value)} onFocus={onSelectCustom} placeholder="새 대표 키워드를 입력해 주세요" value={customKeyword} />
          {customKeywordSelected ? <p className="mt-2 text-xs leading-5 text-amber-800">대표 키워드만 바꾸면 이전 후보의 주제와 검색 의도가 섞일 수 있습니다. 직접 입력한 키워드를 요청에 포함해 다시 분석한 뒤 완전한 콘텐츠 기회를 확인해 주세요.</p> : null}
          {customKeywordSelected ? <button className="mt-3 rounded-lg border bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50" disabled={disabled || !customKeyword.trim()} onClick={onReanalyzeCustom} type="button">이 키워드로 콘텐츠 기회 다시 분석</button> : null}
        </label>
      </fieldset>
      <details className="mt-5 rounded-xl bg-[#f8f8fa] p-4">
        <summary className="cursor-pointer text-sm font-semibold">AI 분석 상세보기</summary>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Info label="해석된 요청" value={request} />
          <Info label="의도" value={plan.interpretedIntent} />
          <Info label="분야" value={plan.domain} />
          <Info label="대상 독자" value={plan.targetAudience} />
          <Info label="목표" value={plan.contentGoal} />
          <Info label="선정 방식" value={plan.selectionMode === "automatic" ? "AI 자동 선정" : "사용자 지정"} />
          <Info label="후보 수" value={`${opportunityCandidates.length}개`} />
          <Info label="신뢰도" value={formatOpportunityConfidence(plan.confidence)} />
          <Info label="주의사항" value={formatEvidenceLimitations([plan.estimateDisclosure]).join(" ") || "없음"} />
          <Info label="선택된 플랫폼" value={plan.recommendedPlatforms.map(platformLabel).join(", ") || platformLabel("canonical")} />
        </dl>
        <p className="mt-4 text-sm leading-6 text-[#77777f]">{plan.recommendationReason}</p>
        <div className="mt-5 space-y-3">
          {opportunityCandidates.map((candidate) => {
            const evidence = Array.isArray(candidate.opportunityEvidence) ? candidate.opportunityEvidence : [];
            return <div className="rounded-xl border bg-white p-3" key={`${candidate.opportunityId}-evidence`}><p className="text-sm font-semibold">{candidate.selectedTopic} · {recommendationTypeLabel(candidate.recommendationType)}</p>{evidence.map((item) => <p className="mt-2 text-xs leading-5 text-[#66666f]" key={item.evidenceId ?? `${item.source}-${item.summary}`}>{formatOpportunityEvidenceSummary(item)}{item.sourceReference ? ` · ${item.sourceReference}` : ""}</p>)}</div>;
          })}
        </div>
      </details>
    </>
  );
}

function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []; }

function recommendationTypeLabel(value: ContentOpportunityCandidate["recommendationType"]) { return value === "comprehensive" ? "종합 추천" : value === "marketOpportunity" ? "시장 기회 추천" : "블로그 성장 추천"; }
function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase text-[#92929a]">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>;
}
