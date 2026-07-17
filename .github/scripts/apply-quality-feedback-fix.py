from pathlib import Path


def replace_one(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    content = file_path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file_path.write_text(content.replace(old, new), encoding="utf-8")


replace_one(
    "app/api/studio/route.ts",
    """      const improvement = evaluateQualityImprovement(currentQuality, quality);\n      if (!improvement.accepted) throw new Error(qualityImprovementRejectionMessage(improvement));\n      return NextResponse.json({ document, basedOnRevisionId: contentRevisionId(content.document), baselineQuality: currentQuality, quality, improvement });""",
    """      const improvement = evaluateQualityImprovement(currentQuality, quality);\n      return NextResponse.json({ document, basedOnRevisionId: contentRevisionId(content.document), baselineQuality: currentQuality, quality, improvement });""",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    """  const [improvementCandidateQuality, setImprovementCandidateQuality] = useState<QualityReport>();\n  const [documentDraft, setDocumentDraft]""",
    """  const [improvementCandidateQuality, setImprovementCandidateQuality] = useState<QualityReport>();\n  const [improvementDecision, setImprovementDecision] = useState<Readonly<{ accepted: boolean; reasons: readonly string[] }>>();\n  const [improvementFeedback, setImprovementFeedback] = useState<Readonly<{ tone: \"info\" | \"warning\" | \"error\" | \"success\"; message: string }>>();\n  const [documentDraft, setDocumentDraft]""",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    """    setWorking(true); setOperation(\"improving\"); setNotice(\"AI가 현재 품질 검토 결과를 바탕으로 개선안을 만들고 있습니다.\"); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined);""",
    """    setWorking(true); setOperation(\"improving\"); setNotice(\"AI가 현재 품질 검토 결과를 바탕으로 개선안을 만들고 있습니다.\"); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setImprovementDecision(undefined); setImprovementFeedback({ tone: \"info\", message: \"AI 개선안을 생성하고 품질 점수를 비교하고 있습니다.\" });""",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    """      const result = await api(\"/api/studio\", { action: \"improve-quality\", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { document?: ContentDocument; basedOnRevisionId?: string; baselineQuality?: QualityReport; quality?: QualityReport; error?: string };\n      if (!result.document || !result.baselineQuality || !result.quality) throw new Error(result.error ?? \"AI 개선안을 만들지 못했습니다.\");\n      setImprovementPreview(result.document); setImprovementBaseRevision(result.basedOnRevisionId ?? \"\"); setImprovementBaselineQuality(result.baselineQuality); setImprovementCandidateQuality(result.quality); setNotice(result.quality.approved ? \"품질 승인 기준을 충족한 개선안을 확인했습니다.\" : \"개선안 점수는 올랐지만 품질 승인 기준에는 미달합니다. 현재 원고에는 적용되지 않습니다.\");\n    } catch (error) { setNotice(message(error)); } finally { setWorking(false); setOperation(\"idle\"); }""",
    """      const result = await api(\"/api/studio\", { action: \"improve-quality\", input: { workspaceId: project.workspaceId, contentId: content.id } }) as { document?: ContentDocument; basedOnRevisionId?: string; baselineQuality?: QualityReport; quality?: QualityReport; improvement?: Readonly<{ accepted: boolean; reasons: readonly string[] }>; error?: string };\n      if (!result.document || !result.baselineQuality || !result.quality || !result.improvement) throw new Error(result.error ?? \"AI 개선안을 만들지 못했습니다.\");\n      const feedback = result.improvement.accepted\n        ? result.quality.approved ? \"품질 승인 기준을 충족한 개선안을 확인했습니다.\" : \"개선안 점수는 올랐지만 품질 승인 기준에는 미달합니다. 현재 원고에는 적용되지 않습니다.\"\n        : `AI 후보를 생성했지만 현재 원고보다 좋아지지 않아 적용할 수 없습니다. ${result.improvement.reasons.join(\" \")}`;\n      setImprovementPreview(result.document); setImprovementBaseRevision(result.basedOnRevisionId ?? \"\"); setImprovementBaselineQuality(result.baselineQuality); setImprovementCandidateQuality(result.quality); setImprovementDecision(result.improvement); setImprovementFeedback({ tone: result.improvement.accepted ? result.quality.approved ? \"success\" : \"warning\" : \"warning\", message: feedback }); setNotice(feedback);\n    } catch (error) { const detail = message(error); setImprovementFeedback({ tone: \"error\", message: `AI 개선안 생성에 실패했습니다. ${detail}` }); setNotice(detail); } finally { setWorking(false); setOperation(\"idle\"); }""",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    """    if (!improvementPreview || !improvementCandidateQuality?.approved) return; setWorking(true); setOperation(\"applying\");""",
    """    if (!improvementPreview || !improvementCandidateQuality?.approved || !improvementDecision?.accepted) return; setWorking(true); setOperation(\"applying\");""",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    """      await onPersist(result.data); setDocumentDraft(result.document); setTitle(result.document.title); setQualityReport(result.quality); setPreviewHtml(\"\"); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setNotice(\"개선안을 새 Revision으로 적용했습니다. 현재 Revision의 품질 승인이 자동 완료되었습니다.\");""",
    """      await onPersist(result.data); setDocumentDraft(result.document); setTitle(result.document.title); setQualityReport(result.quality); setPreviewHtml(\"\"); setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setImprovementDecision(undefined); setImprovementFeedback({ tone: \"success\", message: \"개선안을 새 Revision으로 적용했습니다. 현재 Revision의 품질 승인이 자동 완료되었습니다.\" }); setNotice(\"개선안을 새 Revision으로 적용했습니다. 현재 Revision의 품질 승인이 자동 완료되었습니다.\");""",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    ">AI 개선안 만들기</button>",
    ">{operation === \"improving\" ? \"개선안 생성 중…\" : \"AI 개선안 만들기\"}</button>",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    """<QualityStatus review={normalizedQuality} />{improvementPreview && improvementBaselineQuality && improvementCandidateQuality ? <QualityImprovementPreview baseline={improvementBaselineQuality} candidate={improvementCandidateQuality} disabled={working} document={improvementPreview} onApply={() => void approveQualityImprovement()} onCancel={() => { setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); }} /> : null}""",
    """<QualityStatus review={normalizedQuality} />{improvementFeedback ? <p aria-live=\"polite\" className={`mt-4 rounded-xl px-4 py-3 text-sm ${improvementFeedback.tone === \"error\" ? \"bg-red-50 text-red-800\" : improvementFeedback.tone === \"success\" ? \"bg-emerald-50 text-emerald-800\" : improvementFeedback.tone === \"warning\" ? \"bg-amber-50 text-amber-900\" : \"bg-blue-50 text-blue-800\"}`}>{improvementFeedback.message}</p> : null}{improvementPreview && improvementBaselineQuality && improvementCandidateQuality && improvementDecision ? <QualityImprovementPreview baseline={improvementBaselineQuality} candidate={improvementCandidateQuality} disabled={working} document={improvementPreview} improvementAccepted={improvementDecision.accepted} rejectionReasons={improvementDecision.reasons} onApply={() => void approveQualityImprovement()} onCancel={() => { setImprovementPreview(undefined); setImprovementBaselineQuality(undefined); setImprovementCandidateQuality(undefined); setImprovementDecision(undefined); setImprovementFeedback(undefined); }} /> : null}""",
)

replace_one(
    "app/user-flow/EditorWorkspace.tsx",
    """className=\"mt-5 rounded-xl border border-[#ffb3b3] bg-[#fff7f7] p-4\"""",
    """className=\"bright-operation-notice rounded-xl border border-[#ffb3b3] bg-[#fff7f7] p-4\"""",
)

replace_one(
    "app/user-flow/QualityImprovementPreview.tsx",
    """  disabled?: boolean;\n  onApply: () => void;""",
    """  disabled?: boolean;\n  improvementAccepted: boolean;\n  rejectionReasons?: readonly string[];\n  onApply: () => void;""",
)

replace_one(
    "app/user-flow/QualityImprovementPreview.tsx",
    """export function QualityImprovementPreview({ baseline, candidate, document, disabled = false, onApply, onCancel }: Props) {""",
    """export function QualityImprovementPreview({ baseline, candidate, document, disabled = false, improvementAccepted, rejectionReasons = [], onApply, onCancel }: Props) {""",
)

replace_one(
    "app/user-flow/QualityImprovementPreview.tsx",
    """  const canApply = candidate.approved && !disabled;""",
    """  const canApply = improvementAccepted && candidate.approved && !disabled;""",
)

replace_one(
    "app/user-flow/QualityImprovementPreview.tsx",
    """      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${candidate.approved ? \"bg-emerald-50 text-emerald-800\" : \"bg-amber-50 text-amber-800\"}`}>\n        {candidate.approved ? \"품질 승인 기준 충족\" : \"품질 승인 기준 미달\"}\n      </span>""",
    """      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${improvementAccepted && candidate.approved ? \"bg-emerald-50 text-emerald-800\" : \"bg-amber-50 text-amber-800\"}`}>\n        {!improvementAccepted ? \"현재 원고보다 개선되지 않음\" : candidate.approved ? \"품질 승인 기준 충족\" : \"품질 승인 기준 미달\"}\n      </span>""",
)

replace_one(
    "app/user-flow/QualityImprovementPreview.tsx",
    """    {!candidate.approved ? <p className=\"mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900\">전체 95점 이상이며 검색 의도·SEO·가독성·정보 완성도는 각각 95점 이상이어야 합니다. 기준 미달 개선안은 현재 원고에 적용되지 않습니다.</p> : null}""",
    """    {!improvementAccepted ? <p className=\"mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900\">{rejectionReasons.join(\" \") || \"현재 원고보다 품질이 좋아지지 않아 적용할 수 없습니다.\"}</p> : !candidate.approved ? <p className=\"mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900\">전체 95점 이상이며 검색 의도·SEO·가독성·정보 완성도는 각각 95점 이상이어야 합니다. 기준 미달 개선안은 현재 원고에 적용되지 않습니다.</p> : null}""",
)

replace_one(
    "tests/unit/app/user-flow/QualityImprovementPreview.test.tsx",
    """<QualityImprovementPreview baseline={report(92, false, { seo: 55, readability: 77 })} candidate={report(95, false, { seo: 65, readability: 96 })} document={document} onApply={vi.fn()} onCancel={vi.fn()} />""",
    """<QualityImprovementPreview baseline={report(92, false, { seo: 55, readability: 77 })} candidate={report(95, false, { seo: 65, readability: 96 })} document={document} improvementAccepted onApply={vi.fn()} onCancel={vi.fn()} />""",
)

replace_one(
    "tests/unit/app/user-flow/QualityImprovementPreview.test.tsx",
    """<QualityImprovementPreview baseline={report(92, false, { seo: 55 })} candidate={report(98, true, { seo: 95 })} document={document} onApply={vi.fn()} onCancel={vi.fn()} />""",
    """<QualityImprovementPreview baseline={report(92, false, { seo: 55 })} candidate={report(98, true, { seo: 95 })} document={document} improvementAccepted onApply={vi.fn()} onCancel={vi.fn()} />""",
)

replace_one(
    "tests/unit/app/user-flow/QualityImprovementPreview.test.tsx",
    """  it(\"enables applying an approved candidate\", () => {\n    const html = renderToStaticMarkup(<QualityImprovementPreview baseline={report(92, false, { seo: 55 })} candidate={report(98, true, { seo: 95 })} document={document} improvementAccepted onApply={vi.fn()} onCancel={vi.fn()} />);\n    expect(html).toContain(\"품질 승인 기준 충족\");\n    expect(html).toContain(\">개선안 적용</button>\");\n    expect(html).not.toContain('disabled=\"\">개선안 적용');\n  });""",
    """  it(\"enables applying an approved candidate\", () => {\n    const html = renderToStaticMarkup(<QualityImprovementPreview baseline={report(92, false, { seo: 55 })} candidate={report(98, true, { seo: 95 })} document={document} improvementAccepted onApply={vi.fn()} onCancel={vi.fn()} />);\n    expect(html).toContain(\"품질 승인 기준 충족\");\n    expect(html).toContain(\">개선안 적용</button>\");\n    expect(html).not.toContain('disabled=\"\">개선안 적용');\n  });\n\n  it(\"shows and blocks a generated candidate that did not improve the current document\", () => {\n    const html = renderToStaticMarkup(<QualityImprovementPreview baseline={report(95, false, { seo: 65 })} candidate={report(95, false, { seo: 65 })} document={document} improvementAccepted={false} rejectionReasons={[\"전체 점수가 상승하지 않았습니다. 95 → 95\"]} onApply={vi.fn()} onCancel={vi.fn()} />);\n    expect(html).toContain(\"현재 원고보다 개선되지 않음\");\n    expect(html).toContain(\"전체 점수가 상승하지 않았습니다\");\n    expect(html).toContain('disabled=\"\"');\n  });""",
)

css = Path("app/globals.css")
css_content = css.read_text(encoding="utf-8")
css_content = css_content.replace('[aria-busy="true"][aria-live="polite"]', '.bright-operation-notice')
old_position = """  position: sticky;\n  top: 0.75rem;\n  z-index: 60;\n  overflow: hidden;"""
new_position = """  position: fixed;\n  top: max(0.75rem, env(safe-area-inset-top));\n  left: 50%;\n  z-index: 100;\n  width: min(calc(100vw - 2rem), 52rem);\n  margin: 0;\n  overflow: hidden;\n  transform: translateX(-50%);\n  pointer-events: none;"""
if css_content.count(old_position) != 1:
    raise RuntimeError("Expected one operation notice position block")
css.write_text(css_content.replace(old_position, new_position), encoding="utf-8")
