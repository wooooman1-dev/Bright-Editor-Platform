from pathlib import Path


def replace_once(path_value: str, old: str, new: str) -> None:
    path = Path(path_value)
    text = path.read_text(encoding="utf-8-sig")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected target missing in {path_value}: {old[:180]}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


path = "core/media/ProjectMediaLibrary.ts"
replace_once(path,
    '''export type ProjectMediaAsset = MediaAsset & Readonly<{
  lastReferencedAt?: string;
  referenceCount: number;
  references: readonly ProjectMediaReference[];
}>;''',
    '''export type ProjectMediaAsset = MediaAsset & Readonly<{
  lastReferencedAt?: string;
  originSentToDraft?: boolean;
  referenceCount: number;
  references: readonly ProjectMediaReference[];
}>;''')
replace_once(path,
    '''      ...(lastReferencedAt ? { lastReferencedAt } : {}),
      referenceCount: references.length,''',
    '''      ...(lastReferencedAt ? { lastReferencedAt } : {}),
      originSentToDraft: asset.metadata.contentId ? sentContentIds.has(asset.metadata.contentId) : false,
      referenceCount: references.length,''')

path = "core/media/ImageCostPolicy.ts"
replace_once(path,
    '''  if (block.purpose === "hero") {
    const isHeroAsset = asset.metadata.purpose === "hero" || heroReferences.length > 0;
    return isHeroAsset && !heroReferences.some((reference) => reference.sentToDraft === true);
  }''',
    '''  if (block.purpose === "hero") {
    const isHeroAsset = asset.metadata.purpose === "hero" || heroReferences.length > 0;
    return isHeroAsset
      && asset.originSentToDraft !== true
      && heroReferences.length === 0;
  }''')

path = "app/user-flow/ImageBlockEditor.tsx"
replace_once(path,
    '        ? "같은 Project에서 생성했지만 Tistory 임시저장에 보내지 않은 대표이미지만 표시합니다. 선택해도 파일 복사본은 만들지 않습니다."',
    '        ? "같은 Project에서 생성했지만 Tistory 임시저장에 보내지 않았고 현재 다른 원고에도 연결되지 않은 대표이미지만 표시합니다. 선택해도 파일 복사본은 만들지 않습니다."')

path = "tests/unit/core/media/ImageCostPolicy.test.ts"
replace_once(path,
    '''      purpose: "hero",
      references: [{ blockId: "old-hero", contentId: "old", contentTitle: "미전송 글", purpose: "hero", sentToDraft: false, updatedAt: "2026-07-25T00:00:00.000Z" }],
    });''',
    '''      purpose: "hero",
    });''')
replace_once(path,
    '''    expect(isProjectImageReusableForBlock(unusedHero, hero)).toBe(true);
    expect(isProjectImageReusableForBlock(sentHero, hero)).toBe(false);
    expect(findReusableProjectImage([unusedHero], hero)).toBeUndefined();''',
    '''    const linkedUnsentHero = projectAsset({
      id: "linked-unsent-hero",
      alt: "근력운동 유산소운동 비교 대표 이미지",
      prompt: "근력운동과 유산소운동을 나란히 비교한 장면",
      purpose: "hero",
      references: [{ blockId: "linked-hero", contentId: "linked", contentTitle: "다른 미전송 글", purpose: "hero", sentToDraft: false, updatedAt: "2026-07-25T00:30:00.000Z" }],
    });

    expect(isProjectImageReusableForBlock(unusedHero, hero)).toBe(true);
    expect(isProjectImageReusableForBlock(linkedUnsentHero, hero)).toBe(false);
    expect(isProjectImageReusableForBlock(sentHero, hero)).toBe(false);
    expect(findReusableProjectImage([unusedHero], hero)).toBeUndefined();''')

path = "tests/unit/app/user-flow/ImageWorkspace.test.ts"
replace_once(path,
    '    expect(imageEditorSource).toContain("Tistory 임시저장에 보내지 않은 대표이미지만 표시");',
    '    expect(imageEditorSource).toContain("Tistory 임시저장에 보내지 않았고 현재 다른 원고에도 연결되지 않은 대표이미지만 표시");')

print("detached unsent hero fix applied")
