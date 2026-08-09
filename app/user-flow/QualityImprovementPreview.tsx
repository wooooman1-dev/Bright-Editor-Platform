"use client";

import type { ContentDocument } from "../../core/content";
import type { QualityCategory, QualityReport } from "../../core/quality";

type Props = Readonly<{
  baseline: QualityReport;
  candidate: QualityReport;
  document: ContentDocument;
  disabled?: boolean;
  improvementAccepted: boolean;
  rejectionReasons?: readonly string[];
  onApply: () => void;
  onCancel: () => void;
}>;

const editorialTargets = new Set<QualityCategory>(["searchIntent", "seo", "readability", "completeness"]);

export function QualityImprovementPreview({ baseline, candidate, document, disabled = false, improvementAccepted, rejectionReasons = [], onApply, onCancel }: Props) {
  const comparisons = baseline.dimensions.map((before) => {
    const after = candidate.dimensions.find((item) => item.category === before.category) ?? before;
    return { category: before.category, before: before.score, after: after.score, target: editorialTargets.has(before.category) ? 95 : 80 };
  }).sort((left, right) => Number(left.before === left.after) - Number(right.before === right.after));
  const standardApproved = candidate.approved && candidate.approvalType === "standard";
  const canApply = improvementAccepted && standardApproved && !disabled;

  return <section className="mt-5 rounded-xl border border-[#ffb3b3] bg-[#fffafa] p-4" aria-label="AI 개선안 점수 비교">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold">AI 개선안 미리보기</h3>
        <p className="mt-1 text-sm text-[#66666f]">현재 원고는 아직 변경되지 않았습니다. 품질 승인 기준을 충족한 개선안만 적용할 수 있습니다.</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${improvementAccepted && standardApproved ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
        {!improvementAccepted ? "현재 원고보다 개선되지 않음" : standardApproved ? "standard 품질 승인 기준 충족" : "standard 품질 승인 기준 미달"}
      </span>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <ScoreCard label="현재 점수" value={baseline.overallScore} />
      <ScoreCard label="개선안 점수" value={candidate.overallScore} emphasized />
    </div>

    <div className="mt-4 overflow-hidden rounded-xl border border-black/6 bg-white">
      {comparisons.map((item) => <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-black/6 px-4 py-3 last:border-b-0" key={item.category}>
        <div><strong className="text-sm">{qualityLabel(item.category)}</strong><p className="mt-1 text-xs text-[#77777f]">승인 기준 {item.target}점 이상</p></div>
        <div className="flex items-center gap-2 text-sm font-semibold"><span>{item.before}</span><span aria-hidden="true" className="text-[#9999a2]">→</span><span className={item.after >= item.target ? "text-emerald-700" : "text-amber-700"}>{item.after}</span></div>
      </div>)}
    </div>

    <details className="mt-4 rounded-xl bg-white p-3 text-sm"><summary className="cursor-pointer font-semibold">개선 원고 내용 보기</summary><p className="mt-2 text-[#66666f]">{document.title} · {document.blocks.length}개 canonical block</p><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-[#f8f8fa] p-3 text-xs">{documentToPreview(document)}</pre></details>

    {!improvementAccepted ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{rejectionReasons.join(" ") || "현재 원고보다 품질이 좋아지지 않아 적용할 수 없습니다."}</p> : !standardApproved ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">전체 95점 이상이며 검색 의도·SEO·가독성·정보 완성도는 각각 95점 이상인 standard 승인만 적용할 수 있습니다.</p> : null}

    <div className="mt-4 flex gap-2"><button className="rounded-lg bg-[#ff6b6b] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" disabled={!canApply} onClick={onApply} type="button">개선안 적용</button><button className="rounded-lg border px-4 py-2 text-sm" disabled={disabled} onClick={onCancel} type="button">취소</button></div>
  </section>;
}

function ScoreCard({ label, value, emphasized = false }: { label: string; value: number; emphasized?: boolean }) {
  return <div className={`rounded-xl border p-4 ${emphasized ? "border-[#ffb3b3] bg-white" : "border-black/6 bg-white"}`}><p className="text-sm text-[#66666f]">{label}</p><strong className="mt-1 block text-3xl">{value}</strong></div>;
}

function qualityLabel(category: QualityCategory) {
  return ({ searchIntent: "검색 의도", seo: "SEO", readability: "가독성", structure: "콘텐츠 구조", completeness: "정보 완성도", usefulness: "정보 유용성", htmlQuality: "HTML 품질", imageStrategy: "이미지 전략", internalLinks: "내부 링크", cta: "CTA" })[category];
}

function documentToPreview(document: ContentDocument) {
  return document.blocks.map((block, index) => {
    if (block.type === "heading") return `${index + 1}번째 블록 · ${"#".repeat(block.level)} ${block.text}`;
    if (block.type === "paragraph") return `${index + 1}번째 블록 · ${block.text}`;
    if (block.type === "list") return `${index + 1}번째 목록 · ${block.items.join(" / ")}`;
    if (block.type === "image") return `${index + 1}번째 블록 · [이미지: ${block.alt}]`;
    if (block.type === "button") return `${index + 1}번째 블록 · [${block.purpose ?? "button"}: ${block.label}]`;
    if (block.type === "video") return `${index + 1}번째 블록 · [동영상]`;
    return `${index + 1}번째 블록 · 지원하지 않는 블록`;
  }).join("\n\n");
}
