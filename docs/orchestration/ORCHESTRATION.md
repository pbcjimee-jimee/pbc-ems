# PBC EMS 오케스트레이션 규약

Claude Code(팀장)와 Codex 실행 세션(구현 담당)이 **같은 프로젝트 폴더**에서 병렬로 작업할 때의 운영 규칙이다.

- 적용 범위: `C:\Users\kjm12\OneDrive\바탕 화면\Project\PBC EMS`
- 작성일: 2026-10-20 (Australia/Sydney)
- 개정: 2026-10-20 — git 저장소 전환에 따라 worktree 격리 방식으로 변경 (§2)
- 관련 문서: [TASK-TEMPLATE.md](./TASK-TEMPLATE.md), [OWNERSHIP.md](./OWNERSHIP.md)
- 도구: `scripts/worktree-setup.ps1`

---

## 1. 조직 구조

```
사용자 요구사항·작업 지시
  ▼
Claude Code — 팀장
  ├─ 전체 분석·계획·설계·작업 분배
  ├─ UI/UX 직접 구현
  ├─ 진행 상황 확인·추가 지시
  └─ 코드 검토·최종 통합 확인
       │
       │ 작업 전달 ↕ 진행 상황·결과 반환
       ▼
Codex 실행 세션 — 구현 담당
  ├─ analyst     : GPT-6 Astra   / xhigh
  ├─ implementer : GPT-6.1 Sol   / high
  ├─ quick_edit  : GPT-6 Luna    / high
  └─ explorer    : GPT-6 Astra   / high
```

### 1.1 Claude Code가 직접 하는 일 (위임 금지)

| 영역 | 이유 |
| --- | --- |
| 요구사항 확정·범위 결정 | 사용자와의 유일한 접점 |
| 작업 분해·의존성 판단·병렬 배치 | 전역 맥락 보유 |
| **UI/UX 구현** (`app/**`, `components/**`, 디자인 토큰) | 디자인 일관성은 단일 주체가 유지 |
| 최종 코드 검토·통합 확인 | 품질 게이트 |
| `AGENTS.md`, `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `docs/orchestration/**` 수정 | 규약 문서는 팀장 전용 |

### 1.2 Codex에 위임하는 일

| 역할 | 모델 / effort | 담당 |
| --- | --- | --- |
| `analyst` | `gpt-6-astra` / `xhigh` | 설계·원인 분석·아키텍처·리뷰·QA·테스트 분석. **제품 코드 수정 금지**, 결과만 반환 |
| `implementer` | `gpt-6.1-sol` / `high` | 서버 로직·DB·계산 엔진·API·테스트 작성 및 실행 |
| `quick_edit` | `gpt-6-luna` / `high` | 명확·저위험 수정(상수, 숫자, 문구, 단순 분기). 인증·권한·결제·데이터 무결성·보안·다중 모듈 작업 금지 |
| `explorer` | `gpt-6-astra` / `high` | **읽기 전용** 코드·문서 탐색. 파일 경로·줄 번호·근거 보고 |

모델과 effort의 단일 진실 공급원은 `C:\Users\kjm12\.codex\agents\*.toml`이다.
이 문서의 표는 그 사본이며, 불일치 시 **toml이 우선**한다.

---

## 2. 실행 방식

### 2.1 원칙: worktree로 파일 격리, DB는 공유

이 프로젝트는 git 저장소다(`main`, origin: `pbcjimee-jimee/pbc-ems`). 쓰기 작업은 **각자의 worktree**에서 실행해 파일 충돌을 git 수준에서 차단한다.

```
C:\Users\kjm12\OneDrive\바탕 화면\Project\PBC EMS    ← main. 팀장 작업 공간
C:\Users\kjm12\pbc-ems-worktrees\T-001              ← 브랜치 wt/T-001. Codex 세션 A
C:\Users\kjm12\pbc-ems-worktrees\T-002              ← 브랜치 wt/T-002. Codex 세션 B
```

worktree 위치는 **OneDrive 밖**이다. OneDrive 안에 두면 동기화가 `node_modules` junction과 빌드 산출물을 긁어 충돌 파일을 만들고 느려진다.

격리되는 것과 되지 않는 것을 구분해야 한다.

| 자원 | 격리 | 결과 |
| --- | --- | --- |
| 소스 파일 | ✅ worktree별 독립 | 같은 파일 동시 수정 가능 |
| git 브랜치·커밋 | ✅ 브랜치별 독립 | 병합 시점에 충돌 확인 |
| **로컬 Postgres** | ❌ **공유** | 통합 테스트 동시 실행 불가 — §2.5 |
| `node_modules` | ❌ 공유 (junction) | 읽기 전용이라 안전. 의존성 변경은 팀장 전용 |
| `.local/` | ❌ 공유 (junction) | 읽기 전용 데이터 |
| `.next/` | ✅ worktree별 | `npm run dev` 동시 실행 시 포트만 분리 |

**`--worktree` 플래그는 쓰지 않는다.** Codex가 자체 관리하는 worktree에는 `node_modules`와 `.env.local`이 없어 검증이 전부 실패한다. 대신 `scripts/worktree-setup.ps1`로 준비한 worktree를 `-C`로 지정한다.

### 2.2 worktree 준비

```powershell
# 생성 — junction 연결, .env.local 복사, 검증까지 자동
.\scripts\worktree-setup.ps1 -Name T-001

# 목록
.\scripts\worktree-setup.ps1 -List

# 정리 (커밋되지 않은 변경이 있으면 확인을 요구한다)
.\scripts\worktree-setup.ps1 -Name T-001 -Remove
```

스크립트가 하는 일:

1. `C:\Users\kjm12\pbc-ems-worktrees\<Name>`에 `wt/<Name>` 브랜치로 worktree 생성
2. `node_modules`, `.local` → **junction** (694MB 복사 회피, 관리자 권한 불필요)
3. `.env.local` → **복사** (worktree별로 수정될 수 있어 링크하지 않음)
4. `typecheck` + 단위 테스트를 즉시 실행해 설정이 올바른지 확인

4번이 중요하다. 아래 함정을 잡기 위한 것이다.

> **함정: 조용히 스킵되는 회귀 테스트**
>
> `tests/operating-quote-parity.test.ts`는 `.local/operating-cases.json`을 읽고, 파일이 없으면
> `describe.skipIf`로 **조용히 스킵**된다. 이 테스트는 과거 실제 견적과의 계산 일치를 검증하는
> 회귀 기준선이다.
>
> `.local` junction 없이 worktree를 만들면 테스트가 **11 passed | 1 skipped**가 되는데
> 초록불이라 통과한 것처럼 보인다. 정상은 **12 passed**다. 견적 엔진을 바꿨는데 회귀를
> 놓칠 수 있다. 스크립트가 skip을 감지하면 경고한다.

### 2.3 호출 명령 (Claude Code → Codex)

Codex의 `agents/*.toml`은 **Codex 세션 내부 서브에이전트** 정의다. 외부에서 `codex exec`로 호출할 때는 상속되지 않으므로, 모델과 effort를 **매 호출마다 명시**한다.

```bash
PBC="C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS"
WT="C:/Users/kjm12/pbc-ems-worktrees/T-001"

codex exec \
  -C "$WT" \
  -s workspace-write \
  -c model="gpt-6.1-sol" \
  -c model_reasoning_effort="high" \
  -o "$PBC/docs/orchestration/results/T-001.md" \
  "$(cat "$PBC/docs/orchestration/tasks/T-001-quote-engine.md")"
```

- `-C`는 **worktree 경로**. 지시서와 결과는 `$PBC`(main) 쪽에 두어 이력을 한곳에 모은다.
- `--skip-git-repo-check`는 더 이상 필요 없다(git 저장소가 되었으므로).

역할별 값:

| 역할 | `-c model=` | `-c model_reasoning_effort=` | `-s` | 실행 위치 |
| --- | --- | --- | --- | --- |
| `analyst` | `gpt-6-astra` | `xhigh` | `read-only` | main 직접 (worktree 불필요) |
| `implementer` | `gpt-6.1-sol` | `high` | `workspace-write` | **worktree** |
| `quick_edit` | `gpt-6-luna` | `high` | `workspace-write` | **worktree** |
| `explorer` | `gpt-6-astra` | `high` | `read-only` | main 직접 (worktree 불필요) |

`analyst`와 `explorer`는 파일을 수정하지 않으므로 worktree를 만들지 않고 main에서 `read-only`로 실행한다. worktree 생성 비용(약 20초)을 아끼고, 읽는 대상이 최신 상태라는 이점도 있다.

### 2.4 병렬 실행

쓰기 세션은 각자의 worktree에서, 읽기 세션은 main에서 동시에 띄운다.

```bash
PBC="C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS"
R="$PBC/docs/orchestration/results"
T="$PBC/docs/orchestration/tasks"

# 쓰기 2개 — 각자 worktree (미리 worktree-setup.ps1 로 준비)
codex exec -C "C:/Users/kjm12/pbc-ems-worktrees/T-001" -s workspace-write \
  -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  -o "$R/T-001.md" "$(cat "$T/T-001-quote-engine.md")" &

codex exec -C "C:/Users/kjm12/pbc-ems-worktrees/T-002" -s workspace-write \
  -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  -o "$R/T-002.md" "$(cat "$T/T-002-timesheet-api.md")" &

# 읽기 1개 — main 에서 직접
codex exec -C "$PBC" -s read-only \
  -c model="gpt-6-astra" -c model_reasoning_effort="xhigh" \
  -o "$R/T-003.md" "$(cat "$T/T-003-invoice-design.md")" &

wait
```

병렬 제약 (worktree 전환으로 완화됨):

- **동시 쓰기 세션 최대 5개.** 이전 3개 제한은 파일 충돌 위험 때문이었고, worktree가 그걸 제거했다. 상한은 이제 검토 부담과 머신 자원이 결정한다.
- **같은 파일을 쓰는 작업도 병렬 가능하다.** 충돌은 병합 시점에 git이 알려준다. 단 병합 비용이 들므로, 소유권이 명확히 갈리는 작업을 우선 배치한다(§3).
- `read-only` 세션은 개수 제한 없이 병렬 가능하다.
- **통합 테스트는 절대 동시 실행하지 않는다** — §2.5.
- 팀장은 main에서 UI 작업을 계속한다. worktree와 파일이 격리되므로 제약이 없다.

### 2.5 통합 테스트: worktree로 해결되지 않는 유일한 문제

`tests/helpers/database.ts`의 `resetFixtures()`는 **DB 전체를 리셋**한다. 그리고 모든 worktree의 `.env.local`이 같은 로컬 Postgres(`127.0.0.1`)를 가리킨다.

즉 worktree 두 개가 `npm run test:integration`을 동시에 돌리면 **서로의 픽스처를 지우고 양쪽 모두 알 수 없는 이유로 실패한다.** git worktree는 파일을 격리하지만 DB는 격리하지 못한다.

규칙:

1. 통합 테스트가 필요한 작업의 지시서에는 **"통합 테스트는 작성만 하고 실행하지 않는다"**고 적는다.
2. 팀장이 병합 후 main에서 `npm run test:integration`을 **1회 일괄 실행**한다.
3. 단위 테스트(`tests/integration/**` 제외)는 DB를 쓰지 않으므로 worktree에서 자유롭게 병렬 실행 가능하다.

```bash
# worktree 안에서 Codex가 실행해도 안전한 범위
npx vitest run --no-file-parallelism --exclude "tests/integration/**"
# 정상 결과: Test Files 12 passed (12) / Tests 192 passed
# 1 skipped 가 보이면 .local junction 문제 — §2.2 함정 참조
```

### 2.6 결과 회수와 병합

Codex가 worktree에서 작업을 마치면 팀장이 병합한다.

```bash
PBC="C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS"
cd "$PBC"

# 1. 변경 내용 확인 — 보고를 액면가로 믿지 않는다
git diff main..wt/T-001 --stat
git diff main..wt/T-001

# 2. 소유권 위반 확인 (지시서 담당 파일 목록 밖이 바뀌었는지)
git diff main..wt/T-001 --name-only

# 3. 병합
git merge wt/T-001

# 4. 전체 검증 (통합 테스트 포함 — 여기서 1회만)
npm run typecheck && npm run lint && npm run test:run

# 5. worktree 정리
.\scripts\worktree-setup.ps1 -Name T-001 -Remove
git branch -d wt/T-001
```

Codex가 worktree에서 커밋하지 않았다면 변경이 커밋되지 않은 상태로 남는다. 지시서에 **"작업 완료 후 커밋한다"**를 명시하거나, 팀장이 worktree에서 직접 커밋한다.

### 2.7 이어하기

후속 지시는 새 세션을 띄우지 말고 기존 스레드를 이어간다. **같은 worktree를 지정**해야 한다.

```bash
codex exec resume --last \
  -C "C:/Users/kjm12/pbc-ems-worktrees/T-001" \
  -s workspace-write -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  "추가 지시: <내용>"
```

특정 세션을 이어갈 때는 `--last` 대신 세션 id를 넣는다.

---

## 3. 파일 소유권 (병합 비용 최소화)

worktree가 파일 충돌을 막아주므로 소유권은 **안전 장치가 아니라 효율 장치**다. 역할이 바뀌었다.

- **이전(공유 폴더)**: 소유권 위반 = 즉시 데이터 손실
- **현재(worktree)**: 소유권 위반 = 병합 충돌 + 수동 해소 비용

따라서 규칙은 유지하되, 위반의 긴급도는 낮다. 목적은 **병합이 자동으로 끝나게 만드는 것**이다.

### 3.1 규칙

1. 모든 작업 지시서는 `담당 파일` 절에 **쓰기 허용 경로를 전부 명시**한다. 목록에 없는 파일은 읽기만 가능하다.
2. 동시 실행 작업끼리 **같은 경로를 쓰기로 갖지 않도록** 배치한다. 겹치면 병합 충돌이 생기지만 복구 가능하다 — 금지가 아니라 회피 대상이다.
3. Codex가 목록 밖 파일을 수정해야 한다고 판단하면 **수정하지 말고 보고**한다. 범위 확대는 팀장 승인 사항이다. (worktree 안이라 수정해도 사고는 아니지만, 팀장이 예상하지 못한 변경은 검토에서 누락된다.)
4. 공유 파일(`package.json`, `tsconfig.json`, `next.config.ts`, 마이그레이션 디렉터리, 공통 타입)은 **Claude Code 전용**이다. Codex가 의존성 추가나 설정 변경이 필요하면 요청만 한다.

   > `package.json`은 특히 엄격하다. `node_modules`가 junction으로 공유되므로, worktree에서
   > `npm install`을 실행하면 **원본 `node_modules`가 변경되어 다른 모든 worktree에 즉시 영향**을 준다.
   > 지시서의 `범위 밖`에 항상 "의존성 설치·변경 금지"를 넣는다.

5. `app/**`, `components/**`는 원칙적으로 Claude Code 소유다. Codex에 넘기려면 지시서에 **명시적으로 위임한다고 적는다.**

경로별 기본 소유자는 [OWNERSHIP.md](./OWNERSHIP.md)에 정리되어 있다.

### 3.2 병합 충돌 발생 시

worktree 방식에서는 충돌이 **병합 시점에 git이 알려준다.** 작업 중에는 서로를 깨뜨리지 않는다.

```bash
git merge wt/T-001
# CONFLICT (content): Merge conflict in lib/quotes/calculation.ts
```

1. 양쪽 의도를 확인한다: `git log main..wt/T-001`, `git log wt/T-001..main`
2. 팀장이 해소한다. 판단이 어려우면 `analyst`에 양쪽 diff를 주고 검토를 요청한다.
3. 반복되는 충돌 지점은 OWNERSHIP.md의 충돌 이력에 기록해 다음 배치에서 회피한다.
4. 병합을 포기하려면 `git merge --abort`. worktree는 그대로 남아 재작업할 수 있다.

### 3.3 worktree로도 막지 못하는 것

파일 격리와 무관하게 **전역 상태를 건드리는 작업**은 여전히 위험하다.

| 작업 | 영향 | 규칙 |
| --- | --- | --- |
| `npm install` / 의존성 변경 | junction으로 모든 worktree에 전파 | 팀장 전용 |
| `npm run test:integration` | 로컬 DB 리셋 — 동시 실행 시 상호 파괴 | §2.5 |
| `supabase db reset` / 마이그레이션 적용 | 로컬 DB 스키마 변경 | 팀장 전용 |
| `.local/**` 쓰기 | junction으로 공유 | 읽기만 |
| `npm run dev` | 포트 3000 점유 | 포트를 분리하거나 팀장만 실행 |

---

## 4. 작업 전달 프로토콜

### 4.1 디렉터리

```
docs/orchestration/
├── ORCHESTRATION.md      # 이 문서 (규약)
├── TASK-TEMPLATE.md      # 작업 지시서 템플릿
├── OWNERSHIP.md          # 경로별 소유자 맵
├── tasks/                # 작업 지시서 (Claude Code 작성)
│   └── T-001-<slug>.md
└── results/              # 결과 보고 (Codex가 -o로 기록)
    └── T-001.md
```

`tasks/`와 `results/`는 작업 이력이다. 커밋 대상에 포함한다(향후 git 도입 시).

### 4.2 작업 ID

`T-<3자리 순번>-<slug>` 형식. 순번은 재사용하지 않는다. 같은 작업의 재시도는 `T-001-r2`처럼 접미사를 붙인다.

### 4.3 지시서 작성 규칙

지시서는 **Codex가 프로젝트 맥락 없이 읽어도 완결되게** 쓴다. 필수 항목은 [TASK-TEMPLATE.md](./TASK-TEMPLATE.md)를 따른다. 특히 아래 4개가 빠지면 작업을 띄우지 않는다.

- **담당 파일** — 쓰기 허용 경로 전체
- **완료 조건** — 검증 가능한 형태로
- **검증 명령** — 실제로 실행할 커맨드
- **범위 밖** — 하지 말아야 할 것

### 4.4 결과 보고 형식

Codex는 역할 정의에 따라 **한국어로 간결하게** 아래를 보고한다.

1. 수행한 변경과 파일 경로
2. 실행한 검증 명령과 결과
3. **실행하지 못한 검증과 그 이유**
4. 기존 오류와 새로 생긴 오류의 구분
5. 남은 제한·후속 필요 사항
6. 범위 밖이라 판단해 보류한 항목

---

## 5. 검증 게이트

### 5.1 Codex가 실행 (worktree 안, 작업 완료 전)

| 명령 | 적용 | worktree 병렬 |
| --- | --- | --- |
| `npm run typecheck` | 모든 TS 변경 | ✅ 안전 |
| `npm run lint` | 모든 코드 변경 | ✅ 안전 |
| `npx vitest run --no-file-parallelism --exclude "tests/integration/**"` | 로직·계산 변경 | ✅ 안전 |
| `npm run test:run` | — | ⚠️ 통합 테스트 포함. **쓰지 않는다** |
| `npm run test:integration` | — | ❌ **금지** — DB 리셋 |

Codex가 worktree에서 실행할 단위 테스트 명령은 위의 `--exclude` 형태다. 정상 결과는 **12 passed / 192 tests**이고, `1 skipped`가 보이면 `.local` junction 문제다(§2.2).

통합 테스트는 지시서에 **"작성만 하고 실행하지 않는다"**고 명시한다. 이유는 §2.5.

### 5.2 Claude Code가 실행 (병합 후, main에서)

1. 모든 Codex 결과 보고 수거·교차 확인
2. `git diff main..wt/<ID>`로 변경 파일 직접 읽고 검토 — 보고를 액면가로 믿지 않는다
3. 소유권 위반 여부 확인 (`--name-only`로 목록 밖 파일이 바뀌었는지)
4. 병합: `git merge wt/<ID>`
5. **전체 검증 1회** — 통합 테스트는 여기서만 실행한다

   ```bash
   npm run typecheck && npm run lint && npm run test:run
   ```

6. UI 영향이 있으면 `npm run dev`로 실제 화면 확인
7. worktree 정리: `.\scripts\worktree-setup.ps1 -Name <ID> -Remove`

---

## 6. 안전 규칙

1. **`--dangerously-bypass-approvals-and-sandbox` 금지.** `-s` 플래그로 역할에 맞는 샌드박스를 지정한다.
2. `.env.local`, `.env*`는 Codex 지시서에 내용을 붙여넣지 않는다. 필요한 키 이름만 언급한다.
3. Supabase 마이그레이션(`supabase/migrations/**`)은 Claude Code가 작성한다. Codex는 SQL 초안만 결과 보고에 담는다.
4. `.local/**`은 `.gitignore` 대상 로컬 데이터다. Codex에 쓰기 권한을 주지 않는다.
5. 파괴적 작업(파일 삭제, 대량 리팩터링, 의존성 제거)은 Codex에 위임하지 않는다.
6. `AGENTS.md`의 Next.js 블록은 `next dev`가 자동 재생성한다. Codex가 지우더라도 되돌리지 말고 그대로 둔다.

---

## 7. 라우팅 판단 기준

작업을 어느 역할에 줄지는 **줄 수가 아니라 난도와 영향 범위**로 판단한다.

```
요청 도착
  │
  ├─ 요구사항이 불명확하다 → Claude Code가 사용자에게 확인
  │
  ├─ UI/UX·디자인 결정이 포함된다 → Claude Code 직접 구현
  │
  ├─ "어디에 무엇이 있는지" 알아야 한다 → explorer (read-only)
  │
  ├─ 설계·원인 분석·리뷰·QA 판단이 필요하다 → analyst (read-only)
  │
  ├─ 인증·권한·결제·데이터 무결성·보안·다중 모듈에 닿는다 → implementer
  │
  ├─ 로직·API·DB·테스트 구현이다 → implementer
  │
  └─ 수정 위치가 명확하고 영향이 한 파일에 갇힌다 → quick_edit
```

금지 패턴:

- 작은 작업에 analyst → implementer → 리뷰 전체 체인을 돌리는 것. 역할 하나로 끝낸다.
- `quick_edit`에 설계 판단을 요구하는 것. 복잡성이 드러나면 `implementer`로 인계된다.
- `analyst`에 코드 수정을 기대하는 것. 분석 결과만 나온다.

---

## 8. 운영 체크리스트

작업 배치 전:

- [ ] 작업 ID 발급, 지시서 작성 완료
- [ ] 역할 선택이 §7 기준에 맞음
- [ ] 완료 조건·검증 명령·범위 밖이 지시서에 있음
- [ ] 쓰기 역할이면 **worktree 준비 완료** (`worktree-setup.ps1 -Name <ID>`)
- [ ] worktree 생성 시 검증이 **12 passed**로 통과 (skip 없음)
- [ ] 담당 파일 목록이 다른 동시 작업과 겹치지 않음 (병합 비용 회피)
- [ ] 동시 쓰기 세션 5개 이하
- [ ] 지시서 `범위 밖`에 **의존성 설치 금지**와 **통합 테스트 실행 금지** 포함

병합 전:

- [ ] 모든 결과 보고 수거
- [ ] `git diff main..wt/<ID>` 직접 검토
- [ ] 소유권 위반 없음
- [ ] worktree 변경이 커밋됨 (안 되어 있으면 커밋)

병합 후:

- [ ] `git merge` 충돌 없이 완료 (또는 해소)
- [ ] main에서 전체 검증 1회 통과 (통합 테스트 포함)
- [ ] UI 영향 시 실제 화면 확인
- [ ] worktree·브랜치 정리
- [ ] 보류·미실행 항목을 사용자에게 보고

---

## 9. 변경 이력

| 날짜 | 변경 |
| --- | --- |
| 2026-10-20 | 초판. git 저장소가 아니어서 공유 폴더 + 파일 소유권 방식 |
| 2026-10-20 | `git init` 및 origin 연결(`pbcjimee-jimee/pbc-ems`) 후 worktree 격리 방식으로 개정. §2 전면 교체, §3 소유권 역할 재정의, §5 검증 분리, `scripts/worktree-setup.ps1` 추가 |
