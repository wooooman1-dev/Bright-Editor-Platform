"use client";

import {
  appendAIUsageRecord,
  totalAIUsageCostUsd,
  totalAIUsageTokens,
  type AIUsageRecord,
} from "../../core/ai";
import type { ContentDocument } from "../../core/content";
import type { UserContent } from "./user-data";

export function AIUsageCostSummary(props: Readonly<{
  content: UserContent;
  document?: ContentDocument;
}>) {
  const records = usageRecords(props.content, props.document);
  const cost = totalAIUsageCostUsd(records);
  const tokens = totalAIUsageTokens(records);
  const complete = records.length > 0 && cost !== undefined;

  return (
    <section className="fixed bottom-5 right-5 z-40 w-[min(360px,calc(100vw-2.5rem))] rounded-[18px] border border-black/10 bg-white/95 p-4 shadow-xl backdrop-blur" aria-label="AI 사용 비용">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#77777f]">AI usage</p>
          <h2 className="mt-1 font-semibold">총 AI 비용</h2>
        </div>
        <strong className="text-lg">{complete ? `$${cost.toFixed(6)}` : records.length ? "계산 불가" : "기록 없음"}</strong>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#66666f]">
        {records.length
          ? `${records.length}회 호출 · ${tokens.toLocaleString()} tokens · OpenAI 표준 단가 기준 추정`
          : "새 AI 호출부터 실제 사용량과 모델을 저장해 계산합니다."}
      </p>
      {records.length ? <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-semibold">호출별 비용 보기</summary>
        <div className="mt-2 space-y-2">
          {records.map((record, index) => <div className="rounded-lg bg-[#f8f8fa] p-3" key={usageKey(record, index)}>
            <div className="flex justify-between gap-3"><strong>{stageLabel(record.stage)}</strong><span>{record.estimatedCostUsd === undefined ? "단가 확인 필요" : `$${record.estimatedCostUsd.toFixed(6)}`}</span></div>
            <p className="mt-1 break-all text-[#66666f]">{record.model} · 입력 {record.inputTokens.toLocaleString()} · 출력 {record.outputTokens.toLocaleString()}{record.webSearchCalls ? ` · 웹검색 ${record.webSearchCalls}회` : ""}</p>
          </div>)}
        </div>
      </details> : null}
    </section>
  );
}

export function usageRecords(content: UserContent, document?: ContentDocument): readonly AIUsageRecord[] {
  let records: readonly AIUsageRecord[] = [];
  const planning = content.planning as (typeof content.planning & Readonly<{ aiUsage?: AIUsageRecord }>) | undefined;
  if (planning?.aiUsage) records = appendAIUsageRecord(records, planning.aiUsage);
  for (const record of document?.metadata?.aiUsage ?? content.document?.metadata?.aiUsage ?? []) {
    records = appendAIUsageRecord(records, record);
  }
  return records;
}

function stageLabel(stage: AIUsageRecord["stage"]): string {
  return ({
    planning: "Planning",
    source_preflight: "출처 사전검증",
    generation: "Generation",
    quality_review: "Quality Review",
    revision: "문서 수정",
    quality_improvement: "품질 개선",
    other: "기타",
  } as const)[stage];
}

function usageKey(record: AIUsageRecord, index: number): string {
  return record.responseId ?? `${record.stage}-${record.recordedAt}-${index}`;
}
