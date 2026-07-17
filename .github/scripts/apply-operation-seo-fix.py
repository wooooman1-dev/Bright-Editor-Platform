from pathlib import Path
import re


def replace_exact(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"expected source not found: {path}\n{old[:200]}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"expected regex source not found: {path}\n{pattern[:200]}")
    target.write_text(updated, encoding="utf-8")


replace_exact(
    "app/api/studio/route.ts",
    'import { placeRecommendedPosts, rankRelatedPosts, restoreVerifiedEditorialLinks, type ContentDocument } from "../../../core/content";',
    'import { ensureSeoKeywordPlacement, placeRecommendedPosts, rankRelatedPosts, restoreVerifiedEditorialLinks, type ContentDocument } from "../../../core/content";',
)

replace_exact(
    "app/api/studio/route.ts",
    '      const currentQuality = new QualityEngine().review(content.document, qualityContext(content));\n      if (!currentQuality.tasks.length) throw new Error("현재 원고에는 AI로 개선할 품질 항목이 없습니다.");\n      const response = await new OpenAIProvider().generate({',
    '      const currentQuality = new QualityEngine().review(content.document, qualityContext(content));\n      if (!currentQuality.tasks.length) throw new Error("현재 원고에는 AI로 개선할 품질 항목이 없습니다.");\n      const primaryKeyword = content.primaryKeyword?.trim() ?? "";\n      const seoTask = currentQuality.tasks.some((task) => task.category === "seo");\n      const seoEvidence = currentQuality.dimensions.find((dimension) => dimension.category === "seo");\n      const response = await new OpenAIProvider().generate({',
)

replace_regex(
    "app/api/studio/route.ts",
    r'        instruction: `Improve this complete canonical ContentDocument.*?Current document: \$\{JSON\.stringify\(content\.document\)\}`,',
    '''        instruction: `Improve this complete canonical ContentDocument using only the Quality Review tasks below. Preserve every unaffected block ID and the user's existing block order. Do not create, remove, replace, or edit internal_link or related_post blocks; verified links are protected and restored by the server. Never return an empty internal-link placeholder. Do not add monetization links. Preserve existing metadata exactly unless the SEO or search-intent task requires a change. The confirmed primary keyword is the exact string "${primaryKeyword || "not configured"}". When an SEO task exists, rewrite the title when necessary so that exact string appears once naturally, include it naturally in the introduction, and include it in a truthful 60–180 character meta description. Do not leave the title unchanged when the SEO evidence says the exact primary keyword is missing. Return the complete revised document as JSON only in {"title":"...","metaDescription":"...","primarySearchIntent":"...","secondaryIntent":"...","secondaryKeywords":["..."],"relatedTerms":["..."],"blocks":[...]} form. Do not return commentary.\\nQuality tasks: ${JSON.stringify(currentQuality.tasks)}\\nCurrent SEO evidence: ${JSON.stringify(seoEvidence)}\\nCurrent document: ${JSON.stringify(content.document)}`,''',
)

replace_exact(
    "app/api/studio/route.ts",
    '      let document = restoreVerifiedEditorialLinks(content.document, parsed);\n      document = await placeAvailableTistoryPosts(data, content, document);',
    '      let document = restoreVerifiedEditorialLinks(content.document, parsed);\n      if (!document.metadata && content.document.metadata) document = Object.freeze({ ...document, metadata: content.document.metadata });\n      if (seoTask && primaryKeyword) document = ensureSeoKeywordPlacement(document, primaryKeyword);\n      document = await placeAvailableTistoryPosts(data, content, document);',
)

replace_exact(
    "app/user-flow/EditorWorkspace.tsx",
    '  const normalizedQuality = useMemo(() => normalizeQualityReview(qualityReport, { currentRevisionId, requestState: qualityRequestState, errorMessage: qualityError }), [currentRevisionId, qualityError, qualityReport, qualityRequestState]);',
    '  const normalizedQuality = useMemo(() => normalizeQualityReview(qualityReport, { currentRevisionId, requestState: qualityRequestState, errorMessage: qualityError }), [currentRevisionId, qualityError, qualityReport, qualityRequestState]);\n  const finishOperation = (expected: Operation) => setOperation((current) => current === expected ? "idle" : current);',
)

replacements = {
    'if (active) setOperation("idle")': 'if (active) finishOperation("preview")',
    'finally { setWorking(false); setOperation("idle"); }\n  };\n  const revise': 'finally { setWorking(false); finishOperation("quality"); }\n  };\n  const revise',
    'finally { setWorking(false); setOperation("idle"); }\n  };\n  const approveQualityImprovement': 'finally { setWorking(false); finishOperation("improving"); }\n  };\n  const approveQualityImprovement',
    'finally { setWorking(false); setOperation("idle"); }\n  };\n  const refreshPreview': 'finally { setWorking(false); finishOperation("applying"); }\n  };\n  const refreshPreview',
    'catch (error) { setNotice(message(error)); } finally { setOperation("idle"); }\n  };\n  const saveTistory': 'catch (error) { setNotice(message(error)); } finally { finishOperation("preview"); }\n  };\n  const saveTistory',
    'catch (error) { setNotice(message(error)); } finally { setWorking(false); setOperation("idle"); }\n  };\n\n  async function loadReadiness': 'catch (error) { setNotice(message(error)); } finally { setWorking(false); finishOperation("draft-save"); }\n  };\n\n  async function loadReadiness',
    '} finally { setOperation("idle"); }\n  }\n  async function selectCategory': '} finally { finishOperation("categories"); }\n  }\n  async function selectCategory',
    '} finally { setOperation("idle"); }\n  }\n  async function loadPostCandidates': '} finally { finishOperation("category-save"); }\n  }\n  async function loadPostCandidates',
}

for old, new in replacements.items():
    replace_exact("app/user-flow/EditorWorkspace.tsx", old, new)
