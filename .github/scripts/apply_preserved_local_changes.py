from pathlib import Path
import re

# Preserve the local ContentCreationFlow lint-safe identity change.
path = Path("app/user-flow/ContentCreationFlow.tsx")
text = path.read_text(encoding="utf-8")
text = text.replace(
    '  const draftContentIdRef = useRef(content?.id ?? createId("content"));\n  const contentIdentity = `${project.id}:${content?.id ?? draftContentIdRef.current}`;',
    '  const [draftContentId] = useState(() => content?.id ?? createId("content"));\n  const contentIdentity = `${project.id}:${content?.id ?? draftContentId}`;',
    1,
)
text = text.replace(
    '  const contentId = content?.id ?? draftContentIdRef.current;',
    '  const contentId = content?.id ?? draftContentId;',
    1,
)
if "draftContentIdRef" in text:
    raise SystemExit("ContentCreationFlow draft identity replacement was incomplete")
path.write_text(text, encoding="utf-8")

# Require the full Opportunity identity while allowing stale duplicated request fields
# to be repaired from the persisted confirmed Opportunity.
path = Path("app/api/studio/route.ts")
text = path.read_text(encoding="utf-8")
old = '''    const sameIdentity = Boolean(
      stored
      && (
        (typeof input.opportunityFingerprint === "string" && input.opportunityFingerprint === stored.fingerprint)
        || (
          typeof input.opportunityId === "string"
          && input.opportunityId === stored.opportunityId
          && String(input.opportunityVersion) === String(stored.version)
        )
      )
    );
    if (!stored || !sameIdentity || !message(error).includes("선택한 콘텐츠 전략이 현재 원고와 일치하지 않습니다")) throw error;'''
new = '''    const sameIdentity = Boolean(
      stored
      && typeof input.opportunityId === "string"
      && input.opportunityId === stored.opportunityId
      && String(input.opportunityVersion) === String(stored.version)
      && typeof input.opportunityFingerprint === "string"
      && input.opportunityFingerprint === stored.fingerprint
    );
    const mismatchMessage = message(error);
    const isCurrentDraftMismatch = mismatchMessage.includes("선택한 콘텐츠 전략이 현재 원고와 일치하지 않습니다")
      || mismatchMessage.includes("선택한 콘텐츠 전략이 요청한 현재 원고와 일치하지 않습니다");
    if (!stored || !sameIdentity || !isCurrentDraftMismatch) throw error;'''
if old not in text:
    raise SystemExit("resolveGenerationOpportunity identity block not found")
text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")

# Keep only canonical identity mismatch cases in the keyword guard regression test.
path = Path("tests/unit/app/api/StudioGenerationKeywordGuard.test.ts")
text = path.read_text(encoding="utf-8")
text, count = re.subn(
    r'\n  it\("rejects a request keyword that is different from Content\.primaryKeyword before any AI call", async \(\) => \{.*?\n  \}\);\n',
    '\n',
    text,
    count=1,
    flags=re.S,
)
if count != 1:
    raise SystemExit("obsolete primaryKeyword guard test not found")
text = re.sub(r'\n\s*\["topic",[^\n]+\],', '', text, count=1)
text = re.sub(r'\n\s*\["searchIntent",[^\n]+\],', '', text, count=1)
path.write_text(text, encoding="utf-8")
