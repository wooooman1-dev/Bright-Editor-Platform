from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return text.replace(old, new, 1)

editor_path = Path("app/user-flow/EditorWorkspace.tsx")
editor = editor_path.read_text(encoding="utf-8")

editor = replace_once(
    editor,
    'import { ContentDocumentEditor } from "./ContentDocumentEditor";',
    'import { ContentDocumentEditor } from "./ContentDocumentEditor";\nimport { QualityImprovementPreview } from "./QualityImprovementPreview";',
    "preview import",
)
editor = replace_once(
    editor,
    '  const [improvementBaseRevision, setImprovementBaseRevision] = useState("");',
    '  const [improvementBaseRevision, setImprovementBaseRevision] = useState("");\n  const [improvementBaselineQuality, setImprovementBaselineQuality] = useState<QualityReport>();\n  const [improvementCandidateQuality, setImprovementCandidateQuality] = useState<QualityReport>();',
    "preview state",
)
editor = replace_once(
    editor,
    '    setWorking(true); setOperation("improving"); setNotice("AI가 현재 품질 검토 결과를 바탕으로 개선안을 만들고 있습니다.");',
    '    setWorking(true); setOperation("improving"); setNotice("AI가 현재 품질 검토 결과를 바탕으로 개선안을 만들고 있습니다."); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined);',
    "preview reset",
)
editor = replace_once(
    editor,
    '      const result = await api("/api/studio", { action: "improve-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { document?: ContentDocument; basedOnRevisionId?: string; error?: string };\n      if (!result.document) throw new Error(result.error ?? "AI 개선안을 만들지 못했습니다.");\n      setImprovementPreview(result.document); setImprovementBaseRevision(result.basedOnRevisionId ?? ""); setNotice("개선안을 확인했습니다. 승인 전에는 현재 문서에 적용되지 않습니다.");',
    '      const result = await api("/api/studio", { action: "improve-quality", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { document?: ContentDocument; basedOnRevisionId?: string; baselineQuality?: QualityReport; quality?: QualityReport; error?: string };\n      if (!result.document || !result.baselineQuality || !result.quality) throw new Error(result.error ?? "AI 개선안을 만들지 못했습니다.");\n      setImprovementPreview(result.document); setImprovementBaseRevision(result.basedOnRevisionId ?? ""); setImprovementBaselineQuality(result.baselineQuality); setImprovementCandidateQuality(result.quality); setNotice(result.quality.approved ? "품질 승인 기준을 충족한 개선안을 확인했습니다." : "개선안 점수는 올랐지만 품질 승인 기준에는 미달합니다. 현재 원고에는 적용되지 않습니다.");',
    "preview response",
)
editor = replace_once(
    editor,
    '    if (!improvementPreview) return; setWorking(true); setOperation("applying");',
    '    if (!improvementPreview || !improvementCandidateQuality?.approved) return; setWorking(true); setOperation("applying");',
    "apply guard",
)
editor = replace_once(
    editor,
    '      await onPersist(result.data); setDocumentDraft(result.document); setTitle(result.document.title); setQualityReport(result.quality); setPreviewHtml(""); setImprovementPreview(undefined); setNotice("개선안을 새 Revision으로 적용하고 품질을 다시 검토했습니다.");',
    '      await onPersist(result.data); setDocumentDraft(result.document); setTitle(result.document.title); setQualityReport(result.quality); setPreviewHtml(""); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setNotice("개선안을 새 Revision으로 적용했습니다. 현재 Revision의 품질 승인이 자동 완료되었습니다.");',
    "apply success",
)
editor = replace_once(editor, '>AI로 개선</button>', '>AI 개선안 만들기</button>', "button label")

start_marker = '{improvementPreview ? <div className="mt-5 rounded-xl border border-[#ffb3b3] bg-[#fffafa] p-4">'
end_marker = '{normalizedQuality.dimensions.length ?'
start = editor.find(start_marker)
end = editor.find(end_marker, start)
if start < 0 or end < 0:
    raise RuntimeError("inline preview block was not found")
segment = editor[start:end]
if not segment.endswith(': null}'):
    raise RuntimeError("inline preview block end was not recognized")
replacement = '{improvementPreview && improvementBaselineQuality && improvementCandidateQuality ? <QualityImprovementPreview baseline={improvementBaselineQuality} candidate={improvementCandidateQuality} disabled={working} document={improvementPreview} onApply={() => void approveQualityImprovement()} onCancel={() => { setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); }} /> : null}'
editor = editor[:start] + replacement + editor[end:]

editor = replace_once(
    editor,
    '<p className="font-semibold">티스토리 임시저장 준비</p>',
    '<p className="font-semibold">티스토리 임시저장 준비</p><p className="mt-1 text-xs opacity-80">품질 승인은 현재 Revision이 기준을 통과하면 자동 완료됩니다. 최종 확인은 아래 임시저장 버튼을 누른 뒤 사용자가 직접 체크합니다.</p>',
    "readiness explanation",
)
editor = replace_once(
    editor,
    '<h2 className="text-lg font-semibold">외부 임시저장 최종 확인</h2>',
    '<h2 className="text-lg font-semibold">외부 임시저장 최종 확인 · 사용자 확인 필요</h2>',
    "confirmation heading",
)
editor_path.write_text(editor, encoding="utf-8")

route_path = Path("app/api/studio/route.ts")
route = route_path.read_text(encoding="utf-8")
route = replace_once(
    route,
    '      const improvement = evaluateQualityImprovement(baselineQuality, quality);\n      if (!improvement.accepted) throw new Error(qualityImprovementRejectionMessage(improvement));\n      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", appliedAt);',
    '      const improvement = evaluateQualityImprovement(baselineQuality, quality);\n      if (!improvement.accepted) throw new Error(qualityImprovementRejectionMessage(improvement));\n      if (!quality.approved) throw new Error(`개선안이 품질 승인 기준을 충족하지 못했습니다. 전체 ${quality.overallScore}점이며 모든 필수 항목이 기준을 충족해야 합니다.`);\n      let next = applyCanonicalDocument(data, contentId, document, "ai_revision", appliedAt);',
    "server approval gate",
)
route_path.write_text(route, encoding="utf-8")

test_path = Path("tests/unit/app/user-flow/UsableContentFlow.test.tsx")
test = test_path.read_text(encoding="utf-8")
test = replace_once(
    test,
    'expect(html).toContain("자동 추천 변경"); expect(html).toContain("Tistory 임시저장"); expect(html).toContain("Tistory 카테고리");',
    'expect(html).toContain("자동 추천 변경"); expect(html).toContain("AI 개선안 만들기"); expect(html).toContain("Tistory 임시저장"); expect(html).toContain("Tistory 카테고리"); expect(html).toContain("품질 승인은 현재 Revision이 기준을 통과하면 자동 완료됩니다.");',
    "editor UI assertions",
)
test_path.write_text(test, encoding="utf-8")
