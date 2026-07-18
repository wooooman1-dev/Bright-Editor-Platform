"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import type { ImageBlock } from "../../core/content";
import type { ImageGenerationQuality, ImageGenerationSize, MediaAsset } from "../../core/media";

type ImagePurpose = NonNullable<ImageBlock["purpose"]>;

type ImageApiResponse = Readonly<{
  asset?: MediaAsset;
  error?: string;
  generation?: Readonly<{ model: string; quality: ImageGenerationQuality; size: ImageGenerationSize }>;
}>;

export function ImageBlockEditor({
  block,
  contentId,
  disabled,
  onChange,
}: {
  block: ImageBlock;
  contentId: string;
  disabled: boolean;
  onChange: (block: ImageBlock) => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState(block.alt);
  const [prompt, setPrompt] = useState(block.prompt ?? defaultPrompt(block));
  const [purpose, setPurpose] = useState<ImagePurpose>(block.purpose ?? "inline");
  const [quality, setQuality] = useState<ImageGenerationQuality>("medium");
  const [size, setSize] = useState<ImageGenerationSize>("1536x1024");
  const [working, setWorking] = useState<"idle" | "upload" | "generate">("idle");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setAlt(block.alt);
    setPrompt(block.prompt ?? defaultPrompt(block));
    setPurpose(block.purpose ?? "inline");
  }, [block.alt, block.id, block.prompt, block.purpose]);

  const savePlanningFields = async () => {
    if (alt === block.alt && prompt === (block.prompt ?? "") && purpose === (block.purpose ?? "inline")) return;
    await onChange({ ...block, alt, prompt, purpose, sourceType: block.sourceType ?? "planned" });
    setNotice("이미지 프롬프트와 ALT를 저장했습니다.");
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setWorking("upload");
    setNotice("이미지 파일을 불러오고 있습니다.");
    try {
      const form = new FormData();
      form.set("contentId", contentId);
      form.set("blockId", block.id);
      form.set("alt", alt);
      form.set("prompt", prompt);
      form.set("purpose", purpose);
      form.set("file", file);
      const response = await fetch("/api/media", { method: "POST", body: form });
      const result = await response.json() as ImageApiResponse;
      if (!response.ok || !result.asset) throw new Error(result.error ?? "이미지 파일을 불러오지 못했습니다.");
      await applyAsset(result.asset);
      setNotice("이미지 파일을 불러와 현재 이미지 블록에 연결했습니다.");
    } catch (error) {
      setNotice(message(error));
    } finally {
      setWorking("idle");
    }
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setWorking("generate");
    setNotice("AI가 이미지를 생성하고 있습니다. 생성이 끝날 때까지 이 화면을 유지해 주세요.");
    try {
      const response = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", contentId, blockId: block.id, alt, prompt, purpose, quality, size }),
      });
      const result = await response.json() as ImageApiResponse;
      if (!response.ok || !result.asset) throw new Error(result.error ?? "AI 이미지를 생성하지 못했습니다.");
      await applyAsset(result.asset);
      setNotice(`AI 이미지 생성 완료${result.generation ? ` · ${result.generation.model} · ${result.generation.size}` : ""}`);
    } catch (error) {
      setNotice(message(error));
    } finally {
      setWorking("idle");
    }
  };

  const applyAsset = async (asset: MediaAsset) => {
    await onChange({
      ...block,
      alt,
      assetId: asset.id,
      fileName: asset.metadata.fileName,
      mimeType: asset.metadata.mimeType,
      prompt,
      purpose,
      source: asset.source,
      sourceType: asset.metadata.sourceType === "ai_generated" ? "ai_generated" : "upload",
    });
  };

  const busy = disabled || working !== "idle";
  return <div className={`rounded-2xl border p-5 ${block.source ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#77777f]">이미지 전략</p>
        <strong className="mt-1 block">{block.source ? "이미지 연결 완료" : "추천 이미지 · 제작 필요"}</strong>
        <p className="mt-1 text-sm text-[#66666f]">프롬프트를 수정한 뒤 직접 제작하거나 AI로 생성할 수 있습니다.</p>
      </div>
      <span className="rounded-full border bg-white px-3 py-1 text-xs font-semibold">{purposeLabel(purpose)}</span>
    </div>

    {block.source ? <div className="mt-4 overflow-hidden rounded-xl border bg-white"><img alt={alt || "콘텐츠 이미지 미리보기"} className="max-h-[460px] w-full object-contain" src={block.source} /></div> : null}

    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
      <label className="text-sm font-semibold">이미지 별도 제작용 프롬프트
        <textarea className="mt-2 min-h-32 w-full rounded-xl border bg-white px-4 py-3 font-normal leading-6" disabled={busy} onBlur={() => void savePlanningFields()} onChange={(event) => setPrompt(event.target.value)} placeholder="이미지의 주제, 구도, 인물, 배경, 스타일, 금지 요소를 구체적으로 입력하세요." value={prompt} />
      </label>
      <div className="space-y-3">
        <label className="block text-sm font-semibold">이미지 목적
          <select className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-normal" disabled={busy} onBlur={() => void savePlanningFields()} onChange={(event) => setPurpose(event.target.value as ImagePurpose)} value={purpose}>
            <option value="hero">대표 이미지</option><option value="inline">본문 설명</option><option value="comparison">비교</option><option value="checklist">체크리스트</option><option value="infographic">인포그래픽</option><option value="summary">요약 카드</option><option value="warning">주의 카드</option>
          </select>
        </label>
        <label className="block text-sm font-semibold">ALT
          <input className="mt-2 w-full rounded-xl border bg-white px-3 py-3 font-normal" disabled={busy} onBlur={() => void savePlanningFields()} onChange={(event) => setAlt(event.target.value)} value={alt} />
        </label>
      </div>
    </div>

    <details className="mt-4 rounded-xl border bg-white/80 p-4">
      <summary className="cursor-pointer text-sm font-semibold">AI 생성 설정</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">이미지 비율
          <select className="mt-2 w-full rounded-lg border bg-white px-3 py-2 font-normal" disabled={busy} onChange={(event) => setSize(event.target.value as ImageGenerationSize)} value={size}><option value="1536x1024">가로형 3:2</option><option value="1024x1024">정사각형 1:1</option><option value="1024x1536">세로형 2:3</option></select>
        </label>
        <label className="text-sm font-semibold">생성 품질
          <select className="mt-2 w-full rounded-lg border bg-white px-3 py-2 font-normal" disabled={busy} onChange={(event) => setQuality(event.target.value as ImageGenerationQuality)} value={quality}><option value="low">낮음 · 비용 절약</option><option value="medium">보통 · 기본</option><option value="high">높음</option></select>
        </label>
      </div>
    </details>

    <div className="mt-4 flex flex-wrap gap-2">
      <input accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void upload(event)} ref={fileInput} type="file" />
      <button className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={busy} onClick={() => fileInput.current?.click()} type="button">{working === "upload" ? "불러오는 중…" : "파일 불러오기"}</button>
      <button className="rounded-xl bg-[#ff6b6b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !prompt.trim()} onClick={() => void generate()} type="button">{working === "generate" ? "AI 생성 중…" : "AI 생성하기"}</button>
      <button className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50" disabled={!prompt.trim()} onClick={() => void navigator.clipboard.writeText(prompt).then(() => setNotice("이미지 프롬프트를 복사했습니다."))} type="button">프롬프트 복사</button>
      {block.source ? <a className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold" href={block.source} rel="noopener noreferrer" target="_blank">원본 보기</a> : null}
    </div>
    {notice ? <p aria-live="polite" className="mt-3 text-sm text-[#55555f]">{notice}</p> : null}
  </div>;
}

function defaultPrompt(block: ImageBlock): string {
  const subject = block.alt.trim() || "본문의 핵심 내용을 명확하게 설명하는 장면";
  return `${subject}. 한국 블로그 본문에 적합한 고품질 이미지, 자연스럽고 신뢰감 있는 구성, 핵심 대상이 분명한 구도, 불필요한 텍스트와 로고 없음.`;
}

function purposeLabel(value: ImagePurpose): string {
  return ({ hero: "대표 이미지", inline: "본문 설명", comparison: "비교", checklist: "체크리스트", infographic: "인포그래픽", summary: "요약 카드", warning: "주의 카드" })[value];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "이미지 작업을 완료하지 못했습니다.";
}
