# 03_AI_DEVELOPMENT_RULE.md

**세션을 시작할 때 읽는 문서는 이것 하나다.**

다른 문서는 필요할 때만 편다. 무엇이 어디 있는지는 5장에 적었다.

---

## 1. 사장님 지시 (변경 불가)

**추측 금지.** 확인된 사실, 실제 코드, 실제 로그, 실제 화면만 근거로 말한다.
데이터가 부족하면 명령을 한 번 더 친다. 못 확인했으면 "확인 못 했다"고 말한다.
빈칸을 메우지 않는다.

**원인을 100% 파악한 뒤에 코드를 고친다.** "코드를 읽어보니 여기가 끊긴 것 같다"
는 파악이 아니다. 그 구조가 실제로 무엇을 만들어냈는지 저장된 데이터로 세어보고,
원고를 직접 읽고, 그다음에 고친다.

> 이 규칙이 생긴 이유 (2026-08-27): 숫자 문제로 다섯 번 연속 고쳤는데 매번
> "원인을 찾았다"고 하고 한 칸씩 밀렸다. 첫날 한 번만 세어봤으면 — 전 기간
> Claim 49개 중 수치값 0개, normalizedValue 는 eligibility 23 · legal 13 뿐 —
> 사슬을 순서대로 고치는 대신 설계 얘기부터 했을 것이다.

**코딩 전에 물어본다.** 원인과 고칠 방향을 말하고 "시작할까요"를 물은 뒤 시작한다.

**A/B/C 로 고르라고 하지 않는다.** 원인을 100% 찾았으면 방법도 정해서 제시한다.
사장님이 결정할 것은 방향이지 선택지가 아니다.

**원고를 고치는 게 아니라 원인을 고친다.** 같은 문제가 다시 나지 않게 만든다.

**화면도 본다.** JSON 만 보면 놓친다. 실제 화면에서 확인한다.

---

## 2. 상태를 말하기 전에 실행할 것

### 커밋 여부

```bash
tail -12 .git/logs/HEAD | sed 's/.*\t//'
```

`.git/COMMIT_EDITMSG` 는 **마지막 커밋 메시지 하나뿐**이다. 그것만 보고 그 앞
커밋의 유무를 판단하면 틀린다.

> 2026-08-29 실제로 그렇게 틀렸다. D-050 이 이미 커밋돼 있는데 안 올라갔다고
> 말했다. logs/HEAD 를 읽고도 해시만 보이는 형식이라 명령을 한 번 더 치지 않고
> 메운 것이 원인이다.

### 작업 트리가 깨끗한지

`git status` 는 `.git/index.lock` 을 만들 수 있고, device_bash 는 파일을 지울 수
없어 잠금이 남으면 복구가 어렵다. 잠금을 만들지 않는 방법으로 본다.

```bash
LAST=$(tail -1 .git/logs/HEAD | awk '{for(i=1;i<=NF;i++) if($i ~ /^17[0-9]{8}$/){print $i; exit}}')
# 건드린 파일의 stat -c %Y 가 $LAST 보다 크면 미커밋
```

### 실행 중인 dev 서버가 어느 코드인지

브라우저에서 결과가 안 바뀌면 **먼저 이것을 의심한다.** Next dev 서버는 세션
중에 고친 코드를 자동으로 못 읽는 경우가 있다. 저장된 결과의 모양(예: 품질 차원
개수)으로 확인하고, 다르면 재시작을 요청한다.

---

## 3. 이 환경의 제약

- **git 명령을 직접 실행하지 않는다.** 커밋은 PowerShell 명령으로 사장님께 드린다.
  `git add -A` 는 쓰지 않는다 — CRLF 때문에 손대지 않은 파일 87개가 딸려 온다.
  파일을 명시해서 add 한다.
- **device_bash 는 파일을 지울 수 없다.** 삭제가 필요하면 `_to_delete/` 로 옮기고
  사장님께 알린다.
- **`.bright-studio/` 는 git 대상이 아니다.** 이 기계의 밝은재테크 Project 실측
  데이터가 들어 있고, 진단은 대부분 이 데이터로 한다.
- **웹 요청은 WebFetch/WebSearch 로만 한다.** 막히면 curl·python 으로 우회하지
  않는다.

### 테스트 실행 (AI 비용 없음)

```bash
# 1) 저장소 사본 만들기 (device_bash 는 호출마다 끊기므로 timeout 안에서)
mkdir -p /tmp/bep && cd "$HOME/mnt/bright-editor-platform"
timeout 40 rsync -a --delete --exclude node_modules --exclude .git \
  --exclude .next --exclude .bright-studio --exclude test-results ./ /tmp/bep/
ln -sfn "$HOME/mnt/bright-editor-platform/node_modules" /tmp/bep/node_modules

# 2) 실행 (파일은 절대경로, 한 번에 10개 이하로 나눠야 40초를 안 넘긴다)
cd /tmp/bep && REPO=/tmp/bep STUB_GOOGLEAPIS=1 \
  timeout 40 node --import $HOME/hook2.mjs $HOME/runtests2.mjs /tmp/bep/tests/unit/...
```

`tsc` 는 `--incremental false` 를 붙인다. 캐시가 남아 통과한 것처럼 보인 적이 있다.

```bash
timeout 42 ./node_modules/.bin/tsc --noEmit --incremental false -p tsconfig.json
```

**초록 스위트가 완료 기준이 아니다.** `core/ai/index.ts` 에 AIWorkflow 를 값으로
export 했을 때 tsc·eslint·vitest 가 전부 통과한 상태에서 앱이 죽었다. 서버 전용
모듈이 클라이언트 번들로 끌려 들어가는 것은 앱을 띄워야 드러난다.
**원고 1편 생성까지 확인해야 완료다.**

---

## 4. 반복해서 틀린 것

| 틀린 것 | 실제 |
| --- | --- |
| "재생성 버튼이 없다" | 있다. `ContentCreationFlow.tsx:609` 「이 기획으로 원고 만들기」가 같은 Content 를 덮어쓴다. 막힌 것은 Planning 재실행뿐(`user-data.ts:298`) |
| "D-050 이 커밋 안 됐다" | 돼 있었다. `COMMIT_EDITMSG` 만 보고 판단했다 |
| 버튼이 안 보이면 서버가 막는 것 | 다르다. `Retry generation` 은 `generationError` 가 있을 때만 렌더링될 뿐 서버는 허용한다 |
| 측정값을 그대로 믿기 | 2026-08-28 미사용 수치 49개 중 10개가 내 측정 버그였다(표를 안 셈, `2,200만 원` vs `2,200만원`) |
| 발췌가 있으면 원고가 쓴다 | 안 쓴다. 옛 국민연금 원고는 발췌 1,216자를 들고 본문 수치가 1개였다 |

---

## 5. 어느 문서를 보나

| 알고 싶은 것 | 문서 |
| --- | --- |
| 왜 이렇게 결정했나 | `00_FOUNDATION/08_DECISION_LOG.md` (D-001~) |
| 버튼이 무엇을 부르나, AI 를 몇 번 쓰나 | `02_ARCHITECTURE/03_CONTENT_LIFECYCLE.md` |
| 품질 채점 기준 | `02_ARCHITECTURE/09_QUALITY_SYSTEM.md` |
| AI 호출 구조 | `02_ARCHITECTURE/07_AI_ARCHITECTURE.md` |
| 남은 할 일 | 저장소 루트 `todo.txt` |
| 지난 세션에 무엇을 했나 | `04_DEVELOPMENT/14_WORK_LOG_2026_08.md` |

**새 규칙이나 재발 방지 항목은 이 문서에 적는다.** todo.txt 에 적지 않는다 —
그렇게 흩어져서 서로 못 찾는 일이 2026-08-29 에 문제가 됐다.

---

## 6. 설계 원칙 (프로젝트 지침)

- 구현 전에 아키텍처를 논의한다.
- 승인 전에 코드를 쓰지 않는다.
- 작게 나눠 만든다.
- 기존 기능을 보호한다.
- 모듈을 독립적으로 유지한다.
- 가능하면 Core 를 재사용한다.
- AI 호출을 최적화한다.
- 코딩 전에 문서를 읽는다.
- Platform First Architecture 를 따른다.
- 길게 보고 구현한다.

개발 순서: Mission → Vision → Product Principles → PRD → Architecture →
Development → Testing → Release
