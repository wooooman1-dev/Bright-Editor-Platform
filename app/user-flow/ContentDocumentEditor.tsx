"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";

import { ContentNormalizer, createContentOutline, type ContentBlock, type ContentDocument, type ContentOutlineEntry, type PublicPostCandidate } from "../../core/content";
import { brightBodyVisualContent, isFreeBodyVisualBlock } from "../../core/media";
import { ImageBlockEditor } from "./ImageBlockEditor";
import type { EditorPublishingPlatform } from "./editor-publishing-platform";

type ButtonPurpose = "cta" | "internal_link" | "monetization" | "related_post" | "source";

export function ContentDocumentEditor({
  document: inputDocument,
  candidates,
  disabled,
  onChange,
  publishingPlatform,
}: {
  document: ContentDocument;
  candidates: readonly PublicPostCandidate[];
  disabled: boolean;
  onChange: (document: ContentDocument, message: string) => Promise<void>;
  publishingPlatform?: EditorPublishingPlatform;
}) {
  const [draggedId, setDraggedId] = useState<string>();
  const document = useMemo(
    () => new ContentNormalizer().normalize(inputDocument),
    [inputDocument],
  );
  const outline = useMemo(() => createContentOutline(document), [document]);
  const firstOutlineBlockId = outline[0]?.id;

  const replace = async (id: string, block: ContentBlock) => onChange(
    { ...document, blocks: document.blocks.map((item) => item.id === id ? block : item) },
    "콘텐츠 블록을 수정했습니다.",
  );
  const remove = async (id: string) => onChange(
    { ...document, blocks: document.blocks.filter((item) => item.id !== id) },
    "콘텐츠 블록을 삭제했습니다.",
  );
  const move = async (id: string, targetIndex: number) => {
    const source = document.blocks.findIndex((item) => item.id === id);
    if (source < 0 || targetIndex < 0 || targetIndex >= document.blocks.length || source === targetIndex) return;
    const blocks = [...document.blocks];
    const [block] = blocks.splice(source, 1);
    blocks.splice(targetIndex, 0, block);
    await onChange({ ...document, blocks }, "콘텐츠 블록 위치를 변경했습니다.");
  };
  const addLink = async (purpose: ButtonPurpose, label = "", targetUrl = "") => onChange({
    ...document,
    blocks: [...document.blocks, { id: `${document.id}-${purpose}-${Date.now()}`, type: "button", purpose, label, targetUrl, target: "_self" }],
  }, `${purposeLabel(purpose)} 블록을 추가했습니다.`);
  const addImage = async () => onChange({
    ...document,
    blocks: [...document.blocks, {
      id: `${document.id}-image-${Date.now()}`,
      type: "image",
      source: "",
      alt: "",
      prompt: "",
      purpose: "inline",
      sourceType: "planned",
    }],
  }, "새 이미지 제작 영역을 추가했습니다.");
  const addTable = async () => onChange({
    ...document,
    blocks: [...document.blocks, {
      id: `${document.id}-table-${Date.now()}`,
      type: "table",
      headers: ["항목", "내용"],
      rows: [["비교 항목", "설명"]],
    }],
  }, "새 표를 추가했습니다.");
  const addCandidate = async (purpose: "internal_link" | "related_post", candidate: PublicPostCandidate) => {
    const block: ContentBlock = {
      id: `${document.id}-${purpose}-${Date.now()}`,
      type: "button",
      purpose,
      label: candidate.title,
      targetUrl: candidate.publishedUrl,
      target: "_self",
      sourceExternalPostId: candidate.externalPostId,
      ownership: "user_manual",
    };
    if (purpose === "related_post") return onChange({ ...document, blocks: [...document.blocks, block] }, `관련 글을 추가했습니다: ${candidate.title}`);
    const headingIndexes = document.blocks
      .map((item, index) => item.type === "heading" && (item.level === 2 || item.level === 3) ? index : -1)
      .filter((index) => index >= 0);
    const insertAt = (headingIndexes[Math.floor(headingIndexes.length / 2)] ?? Math.max(0, document.blocks.length - 1)) + 1;
    const blocks = [...document.blocks];
    blocks.splice(insertAt, 0, block);
    return onChange({ ...document, blocks }, `본문 중간에 내부 링크를 배치했습니다: ${candidate.title}`);
  };

  return <section className="mx-auto mt-6 max-w-[900px] rounded-[24px] border border-black/6 bg-white px-6 py-8 shadow-[0_14px_50px_rgba(24,24,27,0.05)] sm:px-10 lg:px-14">
    <details className="mb-8 rounded-xl bg-[#f8f8fa] p-4">
      <summary className="cursor-pointer font-semibold">문서 구조 보기</summary>
      <nav aria-label="문서 구조" className="mt-3 space-y-1">
        {outline.map((heading) => <button className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white ${heading.level === 3 ? "pl-6 text-[#66666f]" : "font-semibold"}`} key={heading.id} onClick={() => globalThis.document.getElementById(`editor-${heading.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} type="button">{heading.text}</button>)}
      </nav>
    </details>

    <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-lg font-semibold">원고</h2><p className="mt-1 text-sm text-[#77777f]">본문을 클릭해 바로 수정하세요. 대표이미지는 AI 생성이 가능하고, 명시적으로 저장된 Bright 시각 카드는 본문 블록으로 표시됩니다.</p></div>
      <details className="relative">
        <summary className="cursor-pointer rounded-lg border px-3 py-2 text-sm font-semibold">요소 추가</summary>
        <div className="absolute right-0 z-20 mt-2 flex w-48 flex-col gap-1 rounded-xl border bg-white p-2 shadow-xl">
          <button className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8f8fa]" disabled={disabled} onClick={() => void addTable()} type="button">표 추가</button>
          <button className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8f8fa]" disabled={disabled} onClick={() => void addImage()} type="button">이미지 추가</button>
          <button className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8f8fa]" disabled={disabled} onClick={() => void addLink("cta")} type="button">CTA 추가</button>
          <button className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8f8fa]" disabled={disabled} onClick={() => void addLink("internal_link")} type="button">내부 링크 추가</button>
          <button className="rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8f8fa]" disabled={disabled} onClick={() => void addLink("monetization")} type="button">수익 링크 추가</button>
        </div>
      </details>
    </div>

    <div className="space-y-1">
      {document.blocks.map((block, index) => <Fragment key={block.id}>
        {block.id === firstOutlineBlockId ? <DerivedTableOfContents outline={outline} /> : null}
        <article className={`group relative rounded-lg border border-transparent px-2 py-2 transition hover:border-black/8 hover:bg-[#fcfcfd] ${draggedId === block.id ? "border-[#ff6b6b] bg-[#fff7f7] opacity-60" : ""}`} draggable={!disabled} id={`editor-${block.id}`} onDragEnd={() => setDraggedId(undefined)} onDragOver={(event) => event.preventDefault()} onDragStart={() => setDraggedId(block.id)} onDrop={(event) => { event.preventDefault(); if (draggedId) void move(draggedId, index); }}>
        <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-lg border bg-white p-1 opacity-0 shadow-sm transition group-focus-within:opacity-100 group-hover:opacity-100">
          <span aria-label="이동 핸들" className="cursor-grab px-1 text-[#92929a]" title={`끌어서 ${blockLabel(block)} 이동`}>⠿</span>
          <button aria-label="위로 이동" className="rounded px-2 py-1 text-xs hover:bg-[#f2f2f4]" disabled={disabled || index === 0} onClick={() => void move(block.id, index - 1)} type="button">↑</button>
          <button aria-label="아래로 이동" className="rounded px-2 py-1 text-xs hover:bg-[#f2f2f4]" disabled={disabled || index === document.blocks.length - 1} onClick={() => void move(block.id, index + 1)} type="button">↓</button>
          <button className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50" disabled={disabled} onClick={() => void remove(block.id)} type="button">삭제</button>
        </div>

        {block.type === "heading" ? <div className="flex items-start gap-2"><select aria-label="제목 단계" className="mt-2 rounded-md border border-transparent bg-transparent px-1 py-1 text-xs text-[#92929a] opacity-0 group-focus-within:opacity-100 group-hover:opacity-100" onChange={(event) => void replace(block.id, { ...block, level: Number(event.target.value) as 2 | 3 })} value={block.level === 3 ? 3 : 2}><option value="2">H2</option><option value="3">H3</option></select><input className={`w-full border-0 bg-transparent px-1 py-2 outline-none ${block.level === 3 ? "mt-3 text-xl font-semibold" : "mt-7 text-3xl font-bold tracking-[-0.035em]"}`} defaultValue={block.text} onBlur={(event) => event.target.value !== block.text && void replace(block.id, { ...block, text: event.target.value })} /></div> : null}
        {block.type === "paragraph" ? <textarea className="w-full resize-none overflow-hidden border-0 bg-transparent px-1 py-2 text-[17px] leading-8 outline-none" defaultValue={block.text} onBlur={(event) => event.target.value !== block.text && void replace(block.id, { ...block, text: event.target.value })} rows={Math.max(2, Math.ceil(block.text.length / 55) + block.text.split("\n").length - 1)} /> : null}
        {block.type === "list" ? <div className="flex items-start gap-2"><select aria-label="목록 종류" className="mt-2 rounded-md border bg-white px-2 py-1 text-xs" disabled={disabled} onChange={(event) => void replace(block.id, { ...block, style: event.target.value as "ordered" | "unordered" })} value={block.style}><option value="ordered">순서 목록</option><option value="unordered">글머리 목록</option></select><textarea className="w-full resize-none overflow-hidden border-0 bg-transparent px-1 py-2 text-[17px] leading-8 outline-none" defaultValue={block.items.join("\n")} onBlur={(event) => { const items = event.target.value.split("\n").map((item) => item.trim()).filter(Boolean); if (items.join("\n") !== block.items.join("\n")) void replace(block.id, { ...block, items }); }} rows={Math.max(2, block.items.length)} /></div> : null}
        {block.type === "table" ? <TableEditor block={block} disabled={disabled} onChange={(next) => replace(block.id, next)} /> : null}
        {block.type === "image" ? block.source || !isFreeBodyVisualBlock(block)
          ? <ImageBlockEditor key={`${block.id}:${block.alt}:${block.prompt ?? ""}:${block.purpose ?? ""}`} block={block} contentId={document.id} disabled={disabled} onChange={(next) => replace(block.id, next)} publishingPlatform={publishingPlatform} />
          : <FreeBodyVisualCard block={block} contentId={document.id} disabled={disabled} onChange={(next) => replace(block.id, next)} publishingPlatform={publishingPlatform} />
          : null}
        {block.type === "button" ? <ButtonEditor block={block} disabled={disabled} onChange={(next) => replace(block.id, next)} /> : null}
        {block.type === "video" ? <p className="rounded-lg bg-[#f8f8fa] p-3 text-sm">비디오: {block.source}</p> : null}
      </article>
      </Fragment>)}
    </div>
    <RelatedPosts candidates={candidates} current={document} disabled={disabled} onAdd={(purpose, candidate) => void addCandidate(purpose, candidate)} />
  </section>;
}

function DerivedTableOfContents({ outline }: { outline: readonly ContentOutlineEntry[] }) {
  return <nav aria-label="원고 자동 목차" className="my-8 rounded-xl border border-[#e8e3dc] bg-[#fbfaf8] px-6 py-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-lg">목차</strong><span className="text-xs text-[#77777f]">H2/H3에서 자동 생성 · 미리보기와 동일</span></div>
    <ul className="mt-4 space-y-2 text-[16px] leading-7">
      {outline.map((entry) => <li className={entry.level === 3 ? "pl-5 text-[#66666f]" : "font-medium"} key={entry.id}>
        <button className="text-left hover:underline" onClick={() => globalThis.document.getElementById(`editor-${entry.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} type="button">{entry.text}</button>
      </li>)}
    </ul>
  </nav>;
}

function FreeBodyVisualCard({ block, contentId, disabled, onChange, publishingPlatform }: {
  block: Extract<ContentBlock, { type: "image" }>;
  contentId: string;
  disabled: boolean;
  onChange: (block: Extract<ContentBlock, { type: "image" }>) => Promise<void>;
  publishingPlatform?: EditorPublishingPlatform;
}) {
  const content = brightBodyVisualContent(block);
  const tone = content.purpose === "warning"
    ? "border-amber-300 bg-amber-50"
    : content.purpose === "checklist"
      ? "border-emerald-200 bg-emerald-50"
      : content.purpose === "summary"
        ? "border-violet-200 bg-violet-50"
        : "border-blue-200 bg-blue-50";

  return <div className="my-5">
    <aside className={`rounded-2xl border p-6 ${tone}`} data-free-visual="true">
      <span className="inline-flex rounded-full border bg-white/80 px-3 py-1 text-xs font-semibold">{content.label} · 무료</span>
      <strong className="mt-3 block text-xl leading-7">{content.title}</strong>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7">{content.items.map((item, index) => <li key={`${block.id}-visual-${index}`}>{item}</li>)}</ul>
    </aside>
    <details className="mt-3 rounded-xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">Project 이미지·파일·AI로 교체</summary>
      <div className="mt-4"><ImageBlockEditor block={block} contentId={contentId} disabled={disabled} onChange={onChange} publishingPlatform={publishingPlatform} /></div>
    </details>
  </div>;
}

function TableEditor({ block, disabled, onChange }: { block: Extract<ContentBlock, { type: "table" }>; disabled: boolean; onChange: (block: Extract<ContentBlock, { type: "table" }>) => Promise<void> }) {
  const updateHeader = (column: number, value: string) => {
    const headers = block.headers.map((cell, index) => index === column ? value : cell);
    return onChange({ ...block, headers });
  };
  const updateCell = (rowIndex: number, column: number, value: string) => {
    const rows = block.rows.map((row, index) => index === rowIndex ? row.map((cell, cellIndex) => cellIndex === column ? value : cell) : row);
    return onChange({ ...block, rows });
  };
  return <div className="my-5 rounded-xl border border-black/8 bg-white p-4">
    <label className="block text-xs font-semibold text-[#77777f]">표 설명<input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm font-normal" defaultValue={block.caption ?? ""} disabled={disabled} onBlur={(event) => event.target.value !== (block.caption ?? "") && void onChange({ ...block, caption: event.target.value.trim() || undefined })} placeholder="선택 입력" /></label>
    <div className="mt-4 max-w-full overflow-x-auto">
      <table className="min-w-[640px] w-full border-collapse text-sm leading-6">
        <thead><tr>{block.headers.map((cell, column) => <th className="border bg-[#f6f6f8] p-2 text-left align-top" key={`${block.id}-header-${column}`} scope="col"><input aria-label={`표 머리글 ${column + 1}`} className="w-full bg-transparent font-semibold outline-none" defaultValue={cell} disabled={disabled} onBlur={(event) => event.target.value !== cell && void updateHeader(column, event.target.value)} /></th>)}</tr></thead>
        <tbody>{block.rows.map((row, rowIndex) => <tr key={`${block.id}-row-${rowIndex}`}>{row.map((cell, column) => <td className="border p-2 align-top" key={`${block.id}-cell-${rowIndex}-${column}`}><input aria-label={`표 ${rowIndex + 1}행 ${column + 1}열`} className="w-full min-w-28 bg-transparent outline-none" defaultValue={cell} disabled={disabled} onBlur={(event) => event.target.value !== cell && void updateCell(rowIndex, column, event.target.value)} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>;
}

function ButtonEditor({ block, disabled, onChange }: { block: Extract<ContentBlock, { type: "button" }>; disabled: boolean; onChange: (block: Extract<ContentBlock, { type: "button" }>) => Promise<void> }) {
  const [value, setValue] = useState(block);
  const [editing, setEditing] = useState(false);
  if (!editing) return <button className={`block w-full rounded-xl p-4 text-left ${value.purpose === "related_post" ? "bg-sky-50" : value.purpose === "internal_link" ? "border border-sky-100 bg-white" : value.purpose === "monetization" ? "bg-violet-50" : "bg-[#fff0f0]"}`} onClick={() => setEditing(true)} type="button"><span className="block text-xs font-semibold text-[#77777f]">{purposeLabel(value.purpose ?? "cta")}{value.targetUrl ? "" : " · 링크 입력 필요"}</span><span className={`${value.purpose === "cta" || value.purpose === "monetization" ? "mt-2 inline-flex rounded-lg bg-[#ff6b6b] px-5 py-3 font-semibold text-white" : "mt-1 block font-semibold text-sky-900"}`}>{value.label || "버튼 문구 입력"}</span></button>;
  return <div className={`rounded-xl p-4 ${value.purpose === "monetization" ? "bg-violet-50" : value.purpose === "related_post" ? "bg-sky-50" : "bg-[#fff0f0]"}`}>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="유형"><select className="input" onChange={(event) => setValue({ ...value, purpose: event.target.value as ButtonPurpose, target: event.target.value === "monetization" ? "_blank" : "_self" })} value={value.purpose ?? "cta"}><option value="cta">CTA</option><option value="internal_link">내부 링크</option><option value="monetization">수익 링크</option><option value="related_post">관련 글</option><option value="source">공식 출처</option></select></Field>
      <Field label="열기 방식"><select className="input" onChange={(event) => setValue({ ...value, target: event.target.value as "_self" | "_blank" })} value={value.target ?? "_self"}><option value="_self">현재 창</option><option value="_blank">새 창</option></select></Field>
      <Field label="버튼 문구"><input className="input" onChange={(event) => setValue({ ...value, label: event.target.value })} value={value.label} /></Field>
      <Field label={`URL ${value.targetUrl ? "" : "· 입력 필요"}`}><input className="input" onChange={(event) => setValue({ ...value, targetUrl: event.target.value })} value={value.targetUrl} /></Field>
      {value.purpose === "monetization" ? <><Field label="링크 설명"><input className="input" onChange={(event) => setValue({ ...value, description: event.target.value })} value={value.description ?? ""} /></Field><label className="flex items-center gap-2 text-sm"><input checked={value.affiliate === true} onChange={(event) => setValue({ ...value, affiliate: event.target.checked })} type="checkbox" />광고 또는 제휴 링크</label></> : null}
    </div>
    <div className="mt-3 flex gap-2"><button className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={disabled || !value.label.trim()} onClick={() => void onChange(value).then(() => setEditing(false))} type="button">저장</button><button className="rounded-lg px-3 py-2 text-sm" onClick={() => { setValue(block); setEditing(false); }} type="button">취소</button></div>
  </div>;
}

function RelatedPosts({ candidates, current, disabled, onAdd }: { candidates: readonly PublicPostCandidate[]; current: ContentDocument; disabled: boolean; onAdd: (purpose: "internal_link" | "related_post", candidate: PublicPostCandidate) => void }) {
  const selected = current.blocks.filter((block) => block.type === "button" && block.purpose === "related_post").length;
  const used = new Set(current.blocks.flatMap((block) => block.type === "button" ? [block.targetUrl] : []));
  return <details className="mt-8 rounded-xl bg-[#f8f8fa] p-4"><summary className="cursor-pointer font-semibold">자동 추천 변경 · 관련 글 {selected}개 · 최대 3개</summary><p className="mt-2 text-sm text-[#77777f]">같은 카테고리의 검증된 공개 글만 자동 배치하며, 후보가 부족하면 있는 만큼만 표시합니다.</p><div className="mt-3 max-h-96 space-y-2 overflow-auto">{candidates.map((post) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3 text-sm" key={post.externalPostId}><span><strong>{post.title}</strong><span className="ml-2 text-[#77777f]">{post.categoryName ?? "카테고리 미확인"}</span></span><div className="flex gap-2"><a className="rounded border px-3 py-1.5" href={post.publishedUrl} rel="noopener noreferrer" target="_blank">실제 글 열기</a><button className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={disabled || used.has(post.publishedUrl)} onClick={() => onAdd("internal_link", post)} type="button">본문 링크로 변경</button><button className="rounded border px-3 py-1.5 disabled:opacity-40" disabled={disabled || used.has(post.publishedUrl) || selected >= 3} onClick={() => onAdd("related_post", post)} type="button">관련 글로 변경</button></div></div>)}{!candidates.length ? <p className="text-sm">검증된 공개 게시글 후보가 없습니다.</p> : null}</div></details>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-semibold">{label}{children}</label>; }
function blockLabel(block: ContentBlock) { if (block.type === "heading") return `H${block.level}`; if (block.type === "paragraph") return "문단"; if (block.type === "list") return "목록"; if (block.type === "table") return "표"; if (block.type === "image") return block.source ? "이미지" : isFreeBodyVisualBlock(block) ? "무료 시각 카드" : "추천 이미지"; if (block.type === "button") return purposeLabel(block.purpose ?? "cta"); return "비디오"; }
function purposeLabel(value: ButtonPurpose) { return ({ cta: "CTA", internal_link: "내부 링크", monetization: "수익 링크", related_post: "관련 글", source: "공식 출처" })[value]; }
