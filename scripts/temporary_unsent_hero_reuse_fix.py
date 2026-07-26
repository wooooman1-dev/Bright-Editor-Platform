from pathlib import Path


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    text = path.read_text(encoding="utf-8-sig")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected target missing in {path_value}: {old[:180]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


Path("core/media/ProjectMediaLibrary.ts").write_text('''import type { ContentDocument, ImageBlock, ImageBlockPurpose } from "../content";
import type { MediaAsset, MediaSourceType } from "./Media";

export type ProjectMediaContent = Readonly<{
  id: string;
  projectId: string;
  title: string;
  updatedAt: string;
  status?: string;
  document?: ContentDocument;
}>;

export type ProjectMediaPublishingRecord = Readonly<{
  contentId: string;
  status: "saved" | "partially_verified" | "failed";
}>;

export type ProjectMediaReference = Readonly<{
  blockId: string;
  contentId: string;
  contentTitle: string;
  purpose?: ImageBlockPurpose;
  sentToDraft?: boolean;
  updatedAt: string;
}>;

export type ProjectMediaAsset = MediaAsset & Readonly<{
  lastReferencedAt?: string;
  referenceCount: number;
  references: readonly ProjectMediaReference[];
}>;

export function buildProjectMediaLibrary(input: Readonly<{
  assets?: readonly MediaAsset[];
  contents: readonly ProjectMediaContent[];
  projectId: string;
  publishingRecords?: readonly ProjectMediaPublishingRecord[];
}>): readonly ProjectMediaAsset[] {
  const contents = input.contents.filter((content) => content.projectId === input.projectId);
  const sentContentIds = new Set([
    ...contents.filter((content) => content.status === "draft_saved").map((content) => content.id),
    ...(input.publishingRecords ?? [])
      .filter((record) => record.status === "saved" || record.status === "partially_verified")
      .map((record) => record.contentId),
  ]);
  const known = new Map<string, MediaAsset>();

  for (const asset of input.assets ?? []) {
    if (asset.kind !== "image" || asset.metadata.projectId !== input.projectId || !asset.source.trim()) continue;
    known.set(asset.id, asset);
  }

  for (const content of contents) {
    for (const block of imageBlocks(content.document)) {
      if (!block.source.trim()) continue;
      const existing = [...known.values()].find((asset) => asset.id === block.assetId || asset.source === block.source);
      if (existing) continue;
      const id = block.assetId?.trim() || `legacy:${block.source}`;
      known.set(id, Object.freeze({
        id,
        kind: "image",
        metadata: Object.freeze({
          alt: block.alt,
          blockId: block.id,
          contentId: content.id,
          createdAt: content.updatedAt,
          fileName: block.fileName,
          mimeType: block.mimeType,
          projectId: input.projectId,
          prompt: block.prompt,
          purpose: block.purpose,
          sourceType: legacySourceType(block),
        }),
        source: block.source,
      }));
    }
  }

  return Object.freeze([...known.values()].map((asset) => {
    const matchingBlocks = contents.flatMap((content) => imageBlocks(content.document)
      .filter((block) => block.assetId === asset.id || block.source === asset.source)
      .map((block) => ({ block, content })));
    const references = matchingBlocks.map(({ block, content }) => Object.freeze({
      blockId: block.id,
      contentId: content.id,
      contentTitle: content.title,
      ...(block.purpose ? { purpose: block.purpose } : {}),
      sentToDraft: sentContentIds.has(content.id),
      updatedAt: content.updatedAt,
    }));
    const lastReferencedAt = references.map((reference) => reference.updatedAt).sort().at(-1);
    const referencedPurpose = matchingBlocks.find(({ block }) => block.purpose)?.block.purpose;
    const metadata = asset.metadata.purpose || !referencedPurpose
      ? asset.metadata
      : Object.freeze({ ...asset.metadata, purpose: referencedPurpose });
    return Object.freeze({
      ...asset,
      metadata,
      ...(lastReferencedAt ? { lastReferencedAt } : {}),
      referenceCount: references.length,
      references: Object.freeze(references),
    });
  }).sort((left, right) => {
    const leftDate = left.lastReferencedAt ?? left.metadata.createdAt;
    const rightDate = right.lastReferencedAt ?? right.metadata.createdAt;
    return rightDate.localeCompare(leftDate) || left.id.localeCompare(right.id);
  }));
}

function imageBlocks(document?: ContentDocument): readonly ImageBlock[] {
  return document?.blocks.filter((block): block is ImageBlock => block.type === "image") ?? [];
}

function legacySourceType(block: ImageBlock): MediaSourceType {
  if (block.sourceType === "ai_generated") return "ai_generated";
  if (block.sourceType === "external") return "external";
  return block.source.startsWith("/api/media/") ? "upload" : "external";
}
''', encoding="utf-8")

Path("core/media/ImageCostPolicy.ts").write_text('''import type { ContentDocument, ImageBlock, ImageBlockPurpose } from "../content";
import type { MediaAsset } from "./Media";
import type { ProjectMediaAsset } from "./ProjectMediaLibrary";

export const automaticAIImageLimit = 1;

const componentPurposes = new Set<ImageBlockPurpose>([
  "comparison",
  "checklist",
  "infographic",
  "summary",
  "warning",
]);

export function isBrightComponentPurpose(purpose: ImageBlockPurpose | undefined): boolean {
  return purpose ? componentPurposes.has(purpose) : false;
}

/** Automatic paid generation is reserved for one unique representative image. */
export function selectAutomaticImageBlock(document: ContentDocument): ImageBlock | undefined {
  return document.blocks.find((block): block is ImageBlock => block.type === "image"
    && block.purpose === "hero"
    && !block.source.trim()
    && (block.sourceType ?? "planned") === "planned");
}

/**
 * Keeps a source-empty hero recommendation only. Body visual information must use
 * a table/Bright component, Project media, or a user upload instead of paid AI generation.
 * Existing connected images are always preserved.
 */
export function applyGeneratedImageCostPolicy(document: ContentDocument): ContentDocument {
  const blocks = document.blocks.filter((block) => {
    if (block.type !== "image" || block.source.trim() || (block.sourceType ?? "planned") !== "planned") return true;
    return block.purpose === "hero";
  });
  if (blocks.length === document.blocks.length) return document;
  return Object.freeze({
    ...document,
    blocks: Object.freeze(blocks),
    ...(document.metadata ? { metadata: Object.freeze({
      ...document.metadata,
      imageCount: blocks.filter((block) => block.type === "image").length,
    }) } : {}),
  });
}

/**
 * A representative asset can be selected manually only while it has never been sent
 * to a platform draft. Automatic generation never calls this policy for hero reuse.
 * Body reuse continues to exclude every asset created or referenced as a hero.
 */
export function isProjectImageReusableForBlock(asset: ProjectMediaAsset, block: ImageBlock): boolean {
  if (asset.kind !== "image" || !asset.source.trim()) return false;
  const heroReferences = asset.references.filter((reference) => reference.purpose === "hero");
  if (block.purpose === "hero") {
    const isHeroAsset = asset.metadata.purpose === "hero" || heroReferences.length > 0;
    return isHeroAsset && !heroReferences.some((reference) => reference.sentToDraft === true);
  }
  if (asset.metadata.purpose === "hero") return false;
  return heroReferences.length === 0;
}

export function findReusableProjectImage(
  assets: readonly ProjectMediaAsset[],
  block: ImageBlock,
): ProjectMediaAsset | undefined {
  if (block.purpose === "hero") return undefined;
  const targetTerms = terms(`${block.alt} ${block.prompt ?? ""}`);
  const targetText = comparable(`${block.alt} ${block.prompt ?? ""}`);
  return assets
    .filter((asset) => isProjectImageReusableForBlock(asset, block))
    .map((asset) => ({ asset, score: reuseScore(asset, block, targetText, targetTerms) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => right.score - left.score
      || (right.asset.lastReferencedAt ?? right.asset.metadata.createdAt)
        .localeCompare(left.asset.lastReferencedAt ?? left.asset.metadata.createdAt))[0]?.asset;
}

export function generatedImageCountForContent(assets: readonly MediaAsset[] | undefined, contentId: string): number {
  return (assets ?? []).filter((asset) => asset.kind === "image"
    && asset.metadata.contentId === contentId
    && asset.metadata.sourceType === "ai_generated").length;
}

function reuseScore(
  asset: ProjectMediaAsset,
  block: ImageBlock,
  targetText: string,
  targetTerms: readonly string[],
): number {
  const assetText = comparable(`${asset.metadata.alt ?? ""} ${asset.metadata.prompt ?? ""}`);
  if (targetText && assetText && targetText === assetText) return 100;
  const assetTerms = terms(assetText);
  const overlap = targetTerms.filter((term) => assetTerms.some((candidate) => candidate === term || candidate.includes(term) || term.includes(candidate))).length;
  const purposeMatch = Boolean(block.purpose && asset.metadata.purpose === block.purpose);
  if (overlap < 2) return -1;
  return overlap * 10 + (purposeMatch ? 6 : 0) + Math.min(asset.referenceCount, 5);
}

function comparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]+/gi, " ").trim();
}

function terms(value: string): string[] {
  const ignored = new Set(["이미지", "사진", "일러스트", "고품질", "블로그", "콘텐츠", "장면", "구성", "설명", "대표"]);
  return [...new Set(comparable(value).split(/\s+/).filter((term) => term.length >= 2 && !ignored.has(term)))];
}
''', encoding="utf-8")

# API supplies confirmed draft-save records to the Project media policy.
path = "app/api/media/route.ts"
replace_once(path,
    '''      contents: data.contents,
      projectId: content.projectId,
    });''',
    '''      contents: data.contents,
      projectId: content.projectId,
      publishingRecords: data.publishingRecords,
    });''')
replace_once(path,
    '''      reuseAllowed: block ? block.purpose !== "hero" : true,
      reusePolicy: block?.purpose === "hero" ? "hero_unique" : "body_only",''',
    '''      reuseAllowed: true,
      reusePolicy: block?.purpose === "hero" ? "unused_hero" : "body_only",''')

# Hero workspace now exposes only representative assets that have never reached a platform draft.
path = "app/user-flow/ImageBlockEditor.tsx"
replace_once(path,
    '  reusePolicy?: "hero_unique" | "body_only";',
    '  reusePolicy?: "unused_hero" | "body_only";')
replace_once(path,
    '''  const loadLibrary = async () => {
    if (isHero) {
      setNotice("대표이미지는 다른 포스팅 이미지와 중복되지 않도록 Project 재사용을 제공하지 않습니다.");
      return;
    }
    if (libraryState === "loading") return;''',
    '''  const loadLibrary = async () => {
    if (libraryState === "loading") return;''')
replace_once(path,
    '''  const reuseAsset = async (asset: ProjectMediaAsset) => {
    if (isHero) {
      setNotice("대표이미지는 Project 이미지 재사용 대상이 아닙니다.");
      return;
    }
    if (asset.id === block.assetId && asset.source === block.source) return;''',
    '''  const reuseAsset = async (asset: ProjectMediaAsset) => {
    if (asset.id === block.assetId && asset.source === block.source) return;''')
replace_once(path,
    '      setNotice("Project 이미지를 현재 본문 블록에 재사용했습니다. 파일 복사본은 생성하지 않았습니다.");',
    '      setNotice(isHero ? "임시저장에 사용되지 않은 Project 대표이미지를 연결했습니다. 파일 복사본은 생성하지 않았습니다." : "Project 이미지를 현재 본문 블록에 재사용했습니다. 파일 복사본은 생성하지 않았습니다.");')
replace_once(path,
    '? "대표이미지는 다른 포스팅과 중복되지 않도록 새로 생성하거나 직접 업로드합니다."',
    '? "대표이미지는 새로 생성·업로드하거나, 아직 Tistory 임시저장에 보내지 않은 Project 대표이미지를 재사용합니다."')
replace_once(path,
    '''    {isHero ? <div className="mt-4 rounded-xl border bg-white/85 p-4">
      <strong className="text-sm">대표이미지 중복 방지</strong>
      <p className="mt-2 text-xs leading-5 text-[#77777f]">다른 콘텐츠에서 사용한 Project 이미지는 대표이미지로 재사용하지 않습니다. 같은 콘텐츠를 다시 열었을 때는 현재 연결된 대표이미지를 그대로 유지합니다.</p>
    </div> : <details className="mt-4 rounded-xl border bg-white/85 p-4" onToggle={(event) => { if (event.currentTarget.open && libraryState === "idle") void loadLibrary(); }}>
      <summary className="cursor-pointer text-sm font-semibold">Project 이미지 재사용</summary>
      <p className="mt-2 text-xs leading-5 text-[#77777f]">같은 Project의 본문용 이미지 중 대표이미지 사용 이력이 없는 자산만 표시합니다. 선택해도 파일 복사본은 만들지 않습니다.</p>
      {libraryState === "loading" ? <p className="mt-4 text-sm text-[#66666f]">Project 이미지를 불러오는 중입니다.</p> : null}
      {libraryState === "error" ? <button className="mt-4 rounded-lg border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={() => void loadLibrary()} type="button">다시 불러오기</button> : null}
      {libraryState === "ready" && !libraryAssets.length ? <p className="mt-4 rounded-lg bg-[#f8f8fa] p-3 text-sm text-[#66666f]">아직 재사용 가능한 본문 이미지가 없습니다.</p> : null}
      {libraryState === "ready" && libraryAssets.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {libraryAssets.map((asset) => {
          const selected = asset.id === block.assetId && asset.source === block.source;
          return <article className={`overflow-hidden rounded-xl border ${selected ? "border-emerald-300 bg-emerald-50" : "bg-white"}`} key={asset.id}>
            <div className="flex h-40 items-center justify-center bg-[#f8f8fa]"><img alt={asset.metadata.alt || "Project 이미지"} className="max-h-40 w-full object-contain" src={asset.source} /></div>
            <div className="p-3">
              <strong className="block truncate text-sm">{asset.metadata.fileName || asset.metadata.alt || "Project 이미지"}</strong>
              <p className="mt-1 text-xs text-[#77777f]">{sourceTypeLabel(asset.metadata.sourceType)} · 사용 중 {asset.referenceCount}곳</p>
              {asset.metadata.alt ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#66666f]">ALT: {asset.metadata.alt}</p> : null}
              <button className="mt-3 w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || selected} onClick={() => void reuseAsset(asset)} type="button">{selected ? "현재 이미지" : working === "reuse" ? "연결 중…" : "이 이미지 사용"}</button>
            </div>
          </article>;
        })}
      </div> : null}
    </details>}''',
    '''    {isHero ? <div className="mt-4 rounded-xl border bg-white/85 p-4">
      <strong className="text-sm">대표이미지 중복 방지</strong>
      <p className="mt-2 text-xs leading-5 text-[#77777f]">Tistory 임시저장에 실제로 사용된 대표이미지는 목록에서 제외합니다. 같은 콘텐츠를 다시 열었을 때는 현재 연결된 대표이미지를 그대로 유지합니다.</p>
    </div> : null}
    <details className="mt-4 rounded-xl border bg-white/85 p-4" onToggle={(event) => { if (event.currentTarget.open && libraryState === "idle") void loadLibrary(); }}>
      <summary className="cursor-pointer text-sm font-semibold">{isHero ? "미사용 대표이미지 재사용" : "Project 이미지 재사용"}</summary>
      <p className="mt-2 text-xs leading-5 text-[#77777f]">{isHero
        ? "같은 Project에서 생성했지만 Tistory 임시저장에 보내지 않은 대표이미지만 표시합니다. 선택해도 파일 복사본은 만들지 않습니다."
        : "같은 Project의 본문용 이미지 중 대표이미지 사용 이력이 없는 자산만 표시합니다. 선택해도 파일 복사본은 만들지 않습니다."}</p>
      {libraryState === "loading" ? <p className="mt-4 text-sm text-[#66666f]">Project 이미지를 불러오는 중입니다.</p> : null}
      {libraryState === "error" ? <button className="mt-4 rounded-lg border px-3 py-2 text-sm font-semibold" disabled={busy} onClick={() => void loadLibrary()} type="button">다시 불러오기</button> : null}
      {libraryState === "ready" && !libraryAssets.length ? <p className="mt-4 rounded-lg bg-[#f8f8fa] p-3 text-sm text-[#66666f]">{isHero ? "아직 재사용 가능한 미사용 대표이미지가 없습니다." : "아직 재사용 가능한 본문 이미지가 없습니다."}</p> : null}
      {libraryState === "ready" && libraryAssets.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {libraryAssets.map((asset) => {
          const selected = asset.id === block.assetId && asset.source === block.source;
          return <article className={`overflow-hidden rounded-xl border ${selected ? "border-emerald-300 bg-emerald-50" : "bg-white"}`} key={asset.id}>
            <div className="flex h-40 items-center justify-center bg-[#f8f8fa]"><img alt={asset.metadata.alt || "Project 이미지"} className="max-h-40 w-full object-contain" src={asset.source} /></div>
            <div className="p-3">
              <strong className="block truncate text-sm">{asset.metadata.fileName || asset.metadata.alt || "Project 이미지"}</strong>
              <p className="mt-1 text-xs text-[#77777f]">{sourceTypeLabel(asset.metadata.sourceType)} · 연결 {asset.referenceCount}곳</p>
              {asset.metadata.alt ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#66666f]">ALT: {asset.metadata.alt}</p> : null}
              <button className="mt-3 w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy || selected} onClick={() => void reuseAsset(asset)} type="button">{selected ? "현재 이미지" : working === "reuse" ? "연결 중…" : "이 이미지 사용"}</button>
            </div>
          </article>;
        })}
      </div> : null}
    </details>''')

# Route regression coverage.
path = "tests/unit/app/api/MediaRoute.test.ts"
replace_once(path,
    '''  it("returns no Project reuse candidates for a hero block", async () => {
    current = {
      ...current,
      mediaMetadata: [asset({
        id: "old-inline",
        contentId: "older-content",
        alt: "본문 운동 이미지",
        prompt: "운동 자세 설명 장면",
        purpose: "inline",
        sourceType: "upload",
      })],
    };

    const response = await GET(new Request("http://localhost/api/media?contentId=content-1&blockId=hero"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ assets: [], reuseAllowed: false, reusePolicy: "hero_unique" });
  });''',
    '''  it("lists a generated hero that has never been sent to a platform draft", async () => {
    const unusedHero = asset({
      id: "unused-hero",
      contentId: "older-content",
      alt: "미사용 운동 대표 이미지",
      prompt: "아직 임시저장하지 않은 대표 장면",
      purpose: "hero",
      sourceType: "ai_generated",
    });
    current = userData([planned("hero", "hero", "새 글 대표 이미지")], [unusedHero]);

    const response = await GET(new Request("http://localhost/api/media?contentId=content-1&blockId=hero"));
    const body = await response.json() as { assets: MediaAsset[]; reuseAllowed: boolean; reusePolicy: string };

    expect(response.status).toBe(200);
    expect(body.reuseAllowed).toBe(true);
    expect(body.reusePolicy).toBe("unused_hero");
    expect(body.assets.map((item) => item.id)).toEqual(["unused-hero"]);
  });

  it("excludes a representative image that was already sent to a platform draft", async () => {
    const sentHero = asset({
      id: "sent-hero",
      contentId: "older-content",
      alt: "임시저장 완료 대표 이미지",
      prompt: "이미 임시저장에 사용한 대표 장면",
      purpose: "hero",
      sourceType: "ai_generated",
    });
    current = userData([planned("hero", "hero", "새 글 대표 이미지")], [sentHero]);
    current = {
      ...current,
      contents: [...current.contents, contentWithHero(sentHero)],
      publishingRecords: [{ id: "publishing-1", contentId: "older-content", platformConnectionId: "connection-1", status: "saved", createdAt: "2026-07-26T01:00:00.000Z" }],
    };

    const response = await GET(new Request("http://localhost/api/media?contentId=content-1&blockId=hero"));
    const body = await response.json() as { assets: MediaAsset[]; reuseAllowed: boolean; reusePolicy: string };

    expect(response.status).toBe(200);
    expect(body.reuseAllowed).toBe(true);
    expect(body.reusePolicy).toBe("unused_hero");
    expect(body.assets).toEqual([]);
  });''')
replace_once(path,
    '''function planned(id: string, purpose: ImageBlockPurpose, alt: string): ImageBlock {''',
    '''function contentWithHero(hero: MediaAsset): UserData["contents"][number] {
  return {
    id: "older-content",
    workspaceId: "workspace-1",
    projectId: "project-1",
    title: "Older draft",
    body: "",
    status: "draft",
    updatedAt: "2026-07-26T00:30:00.000Z",
    document: {
      id: "older-content",
      title: "Older draft",
      blocks: [{ id: "older-hero", type: "image", source: hero.source, assetId: hero.id, sourceType: "ai_generated", purpose: "hero", alt: hero.metadata.alt ?? "대표 이미지" }],
    },
  };
}

function planned(id: string, purpose: ImageBlockPurpose, alt: string): ImageBlock {''')

# Core policy regression coverage.
path = "tests/unit/core/media/ImageCostPolicy.test.ts"
replace_once(path,
    '''  it("never reuses Project media as a representative image", () => {
    const hero = planned("hero", "hero", "근력운동과 유산소운동 비교 대표 이미지");
    const suitable = projectAsset({
      id: "suitable",
      alt: "근력운동 유산소운동 비교 대표 이미지",
      prompt: "근력운동과 유산소운동을 나란히 비교한 장면",
      purpose: "inline",
    });

    expect(isProjectImageReusableForBlock(suitable, hero)).toBe(false);
    expect(findReusableProjectImage([suitable], hero)).toBeUndefined();
  });''',
    '''  it("allows explicit reuse of an unsent hero but never selects it automatically", () => {
    const hero = planned("hero", "hero", "근력운동과 유산소운동 비교 대표 이미지");
    const unusedHero = projectAsset({
      id: "unused-hero",
      alt: "근력운동 유산소운동 비교 대표 이미지",
      prompt: "근력운동과 유산소운동을 나란히 비교한 장면",
      purpose: "hero",
      references: [{ blockId: "old-hero", contentId: "old", contentTitle: "미전송 글", purpose: "hero", sentToDraft: false, updatedAt: "2026-07-25T00:00:00.000Z" }],
    });
    const sentHero = projectAsset({
      id: "sent-hero",
      alt: "근력운동 유산소운동 비교 대표 이미지",
      prompt: "근력운동과 유산소운동을 나란히 비교한 장면",
      purpose: "hero",
      references: [{ blockId: "sent-hero", contentId: "sent", contentTitle: "임시저장 글", purpose: "hero", sentToDraft: true, updatedAt: "2026-07-25T01:00:00.000Z" }],
    });

    expect(isProjectImageReusableForBlock(unusedHero, hero)).toBe(true);
    expect(isProjectImageReusableForBlock(sentHero, hero)).toBe(false);
    expect(findReusableProjectImage([unusedHero], hero)).toBeUndefined();
  });''')

# Source-level UI contract.
path = "tests/unit/app/user-flow/ImageWorkspace.test.ts"
replace_once(path,
    '    expect(imageEditorSource).toContain("대표이미지 중복 방지");',
    '    expect(imageEditorSource).toContain("대표이미지 중복 방지");\n    expect(imageEditorSource).toContain("미사용 대표이미지 재사용");\n    expect(imageEditorSource).toContain("Tistory 임시저장에 보내지 않은 대표이미지만 표시");')
replace_once(path,
    '  it("lists only body-reusable Project images without creating duplicate files", () => {',
    '  it("lists body-reusable images and unsent representative images without creating duplicate files", () => {')

print("unsent hero reuse fix applied")
