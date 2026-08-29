# WordPress 발행 코드 지도

「워드프레스 예약」을 누른 뒤 실제로 무슨 일이 벌어지는가.
`app/application/publishing` 5,397줄 중 WordPress 부분과 `apps/wordpress` 1,990줄.

앵커는 **식별자**다. 찾을 때는 `grep -rn '<식별자>' app apps`.
**지도는 색인이지 진실이 아니다.** 고치기 직전에 그 파일을 실제로 읽는다.

Tistory 는 이 지도에 없다. 지금 쓰지 않기 때문이다.

---

## 1. 한 번의 발행이 지나는 길

`WordPressDraftApplicationService.execute` (984줄 중 `execute` 가 약 410줄)

```
1. 실행 신원 두 개를 만든다        identity(input) / identity(input, "draft.update")
2. 중복 기록을 먼저 본다           네트워크·비밀 접근 전에 기록만으로 답한다
3. 덮어쓸 Post 가 있나             publishedPostToRewrite
4. 준비                            prepare → readiness 18개 검사
5. 기록 선점                       records.claim / replaceStale
6. HTML 무결성 예비 검사           evaluateHtmlIntegrity
7. 이미지 업로드                   mediaPlan 순회 → uploadMedia → storeAlt → readMedia → verifyMedia
8. 카테고리 재검증                 revalidateAfterMedia   (이미지가 있을 때만)
9. 본문 조립                       applyWordPressMediaReplacements → projectWordPressBodyDocument → render
10. 생성 또는 갱신                 drafts.publish
11. 되읽어 검증                    verifyDraft 9~10개 항목
12. 기록 저장                      persist
```

### create 와 update 가 갈리는 지점

`publishedPostToRewrite` 가 정한다.

- 이 Content 로 이미 발행된 Post 가 **기록에 있고**, WordPress 에 **아직 살아 있으면**
  → 그 Post 를 덮어쓴다 (`draft.update`)
- 없거나 사용자가 지웠으면 → 새 Post (`draft.create`)
- **예약은 언제나 새 Post** (`if (input.schedule) return undefined`)

> 주석에 적힌 배경: 예전에는 실행 신원이 원고 리비전을 담아서, 고친 원고가 첫
> 발행처럼 보였다. 2026-08-14 실측으로 한 원고가 Post 92·95·98·101 이 됐고 색인된
> 것을 손으로 휴지통에 옮겨야 했다. 저장된 기록에도 그 흔적이 남아 있다 —
> 「생활비 예산 배분」이 92 → 95 → 98.

---

## 2. 발행 전 검사 18개

`calculateWordPressDraftReadiness` (`WordPressDraftReadiness.ts`)

소유·설정 | `workspace_project_content_ownership` · `wordpress_enabled` ·
`connection` · `selected_target`
분류 | `category_catalog` · `category_read_permission` · `category_select_permission`
원고 | `planning_identity` · `quality_revision` · `generated_claim_verification` ·
`approval_article_integrity` · `review_first`
안전 | `draft_only` · `public_publish_off`
권한 | `draft_create_permission` · `draft_verify_permission` · `media_upload_permission`
미디어 | `local_media`

하나라도 실패하면 `readiness.executable` 이 거짓이 되어 실행이 시작되지 않는다.

---

## 3. 발행 뒤 검증 (되읽기)

`WordPressDraftPublishingAdapter.verifyDraft`

| 항목 | 실제로 보는 것 |
| --- | --- |
| `external_id` | 돌아온 Post ID 가 기대한 것과 같은가 |
| `draft_status` | 상태가 기대값(`draft` 또는 `future`)인가 |
| `scheduled_time` | 예약일 때만. `dateGmt` 가 요청과 같은가 |
| `title` | 정규화 후 제목이 같은가 |
| `meaningful_content` | 기대 본문의 의미 있는 조각이 들어 있는가 |
| `categories` | 카테고리 ID 집합이 같은가 |
| `tags_unused` | 태그가 **하나도 없는가** |
| `media_urls` | 업로드한 URL 이 본문에 다 들어 있는가 |
| `featured_media` | **기대와 실제가 일치하는가** |
| `seo_metadata` | 기대와 실제가 일치하는가 |

**`featured_media` 는 존재를 요구하지 않는다.**

```ts
check("featured_media", expected.featuredMediaId === undefined
  ? draft.featuredMediaId === undefined
  : draft.featuredMediaId === expected.featuredMediaId)
```

대표 이미지를 넣을 생각이 없었고 실제로도 없으면 **통과**다. 2026-08-28 근로장려금
초안 3784 가 `featuredImageAssigned: false` 로 이 검사를 통과하고 나간 이유다.
그래서 대표 이미지는 발행이 아니라 **생성 단계에서 보장**한다 (D-048).

---

## 4. 이미지가 매번 다시 올라가는 이유 (todo #31 원인 확정)

`prepareWordPressLocalMedia` (`WordPressMediaPreparation.ts`) 는 문서에서
`isLocalImageBlock` 인 블록을 **전부** 모은다. 즉 `source` 가 아직 로컬
`/api/media/...` 인 이미지다. **이미 WordPress 에 올라간 적이 있는지는 보지 않는다.**

그리고 업로드 뒤 URL 치환은 임시 문서에만 적용된다:

```ts
const renderedDocument = applyWordPressMediaReplacements(prepared.content.document, uploadedMedia);
```

`renderedDocument` 는 HTML 을 만들려고 그 자리에서 만든 값이고, 저장된 canonical
문서는 **로컬 source 그대로** 남는다. 그래서 같은 원고를 다시 발행하면 조건이 그대로
참이 되어 **또 올린다.**

저장된 기록으로 확인했다 — 같은 Post 에 두 번 발행한 세 건 모두 새 미디어가 생겼다.

| 원고 | 1차 | 2차 | 결과 |
| --- | --- | --- | --- |
| 전입신고 확정일자 | post 3710 ← media **3709** | post 3710 ← media **3716** | 3709 고아 |
| 청년내일저축계좌 | post 3713 ← media **3712** | post 3713 ← media **3718** | 3712 고아 |
| 근로장려금 | post 3784 ← 없음 | post 3784 ← media 3785 | — |

todo 에 적힌 "orphan media 3709/3712" 가 정확히 이것이다.

고치는 방향은 둘 중 하나다. **아직 고르지 않았다.**
- 업로드 결과를 canonical 문서에 반영해 저장한다 (다음 발행에서 로컬 블록이 아니게 된다)
- 발행 기록의 `uploadedMedia` 를 보고 이미 올라간 자산을 건너뛴다

---

## 5. 파일명이 한글을 못 쓰는 이유

`WordPressMediaAdapter` 의 업로드 경로:

```ts
const fileName = value.trim().replace(/[^\x20-\x7e]|[\r\n"\\/]/g, "-");
```

ASCII 출력 가능 문자 외에는 전부 `-` 가 된다. 한글 파일명은 구조적으로 불가능하다.
그래서 파일명은 생성 시점에 ASCII 로 만든다 — `hero-20260828-oesz46.png` 형식
(`generatedImageFileName`, `app/api/media/route.ts`).

---

## 6. HTML 로 나가는 모양

`WordPressHtmlRenderer.render(document)` — 단일 진입점. 다루는 블록은
`paragraph` · `heading` · `table` · `list` · `image` · `button` 여섯 가지.

본문에 넣기 전 `projectWordPressBodyDocument` 가 대표 이미지 블록을 본문에서 빼낸다
(대표 이미지는 `featured_media` 로 따로 가므로 본문에 두 번 나오면 안 된다).

`evaluateHtmlIntegrity` (`core/quality/HtmlIntegrity`) 가 렌더 결과를 원본 문서와
대조한다. 업로드 **전에** 한 번 예비로 돌려서, 이미지를 올린 뒤에 HTML 이 깨진 걸
발견하는 낭비를 막는다.

---

## 7. 사이트 감사 (승인 준비용)

`WordPressSiteReadinessAudit` (585줄) — 원고가 아니라 **사이트 전체**를 본다.
`about` · `contact` · `privacy` · `navigation` · `sitemap` · `robots` ·
`crawler_access` · `https` · `mobile_viewport` · `site_identity` · `site_url` ·
`public_access` · `page_content` · `placeholder_free` · `category_archive` ·
`trust_page_indexable` · `recommended`

승인 준비 검사(`site_readiness`)가 이것을 쓴다.

---

## 8. 아직 모르는 것

- **공개 Post 갱신 시 `draft_status` 검증 실패** (todo). 공개된 글은 상태가
  `publish` 인데 기대값이 `draft` 라서 어긋나는 것으로 보이지만 **확인하지 않았다.**
- **제목이 잘려 발행된 2편** (「대출 상환내역」「할부 결제 취소」). `title` 검증은
  정규화 후 비교라 통과했을 텐데, 어디서 잘렸는지 추적하지 않았다.
- `ScheduledPublishingApplicationService` (319줄) 예약 경로 전체.
- `WordPressPostCatalogAdapter` (241줄) — 내부 링크용 공개 글 목록.

### 자기 자신 제외 (D-052)

공개 글 목록에는 **이 원고가 이미 발행된 Post 도 들어 있다.** 그래서 후보를 고를
때 반드시 제외해야 한다. 제외하지 않으면 같은 카테고리·최신이라 자기 자신이 1등
후보가 되어 글이 자기 링크를 단다 (2026-08-29 실측, 원고 2건).

제외 판정은 한 군데에서만 한다.

- `ownPublishedExternalPostIds(data, content)` — `InternalLinkCatalogPolicy`.
  `publishingRecords` 에서 이 원고의 `externalPostId` 를 모은다.
- `rankPublishingPostCandidates(document, candidates, content, ownExternalPostIds)`
  — 네 번째 인자는 **필수**다. 호출자가 조용히 빠뜨리지 못하게 하려는 것이다.
- `rankRelatedPosts` 의 `context.excludeExternalPostIds` 로 내려가 후보 루프에서
  걸러진다.

호출자는 네 곳이다. 새 호출자를 만들면 여기도 늘려야 한다.

- `app/api/publishing/posts/route.ts`
- `app/api/studio/route.ts`
- `InternalLinkCatalogEvaluationService.evaluate` → `ApprovalReadinessApplicationServiceBase`
- `EditorWorkspaceImplementation.tsx`

`UserContent.publishedUrl` 은 **읽지 않는다.** 타입에만 있고 한 번도 저장된 적이
없어(160개 중 0개) 이 필드를 읽던 예전 필터는 아무것도 걸러내지 못했다.

---

## 9. 파일 지도

**실행** `WordPressDraftApplicationService`(984) ·
`WordPressPublishingRecordRepository`(191) · `ScheduledPublishingApplicationService`(319)

**준비·판정** `WordPressDraftReadiness`(288) · `WordPressPublishingPreparation`(297) ·
`WordPressMediaPreparation` · `WordPressDraftProjection` · `InternalLinkCatalogPolicy`(264)

**어댑터** `WordPressDraftPublishingAdapter`(567) · `WordPressMediaAdapter`(169) ·
`WordPressCategoryAdapter`(150) · `WordPressPostCatalogAdapter`(241) ·
`WordPressConnectionAdapter`(30)

**렌더·감사** `WordPressHtmlRenderer`(242) · `WordPressSiteReadinessAudit`(585)

---

## 10. 확인 명령

```bash
# 같은 Content 를 두 번 발행했을 때 미디어가 새로 생겼는지
python3 -c "
import json,collections
d=json.load(open('.bright-studio/studio-data.json'))
u=d['data']['application']['user-data']
by=collections.defaultdict(list)
for r in u['publishingRecords']: by[r['contentId']].append(r)
for cid,rs in by.items():
    if len(rs)<2: continue
    for r in sorted(rs,key=lambda x:x['createdAt']):
        print(r['workflow'], r.get('externalPostId'), [m.get('externalMediaId') for m in (r.get('uploadedMedia') or [])])
"

# 자기 자신을 가리키는 링크가 있는 원고 (D-052)
node -e '
const d=JSON.parse(require("fs").readFileSync(".bright-studio/studio-data.json","utf8"));
const cs=[];const w=(o)=>{if(!o||typeof o!=="object")return;if(Array.isArray(o)){o.forEach(w);return;}
 if(typeof o.id==="string"&&o.id.startsWith("content-")&&o.document)cs.push(o);Object.values(o).forEach(w);};w(d);
for(const c of cs)for(const b of c.document.blocks)
 if(b.type==="button"&&(b.purpose==="internal_link"||b.purpose==="related_post")&&b.label===c.document.title)
  console.log(b.purpose,"|",c.document.title);'

# 검증 항목이 실제로 무엇을 보는지
grep -n 'check("' apps/wordpress/WordPressDraftPublishingAdapter.ts

# 발행 전 검사 18개
grep -o 'check("[a-z_]*"' app/application/publishing/WordPressDraftReadiness.ts
```
