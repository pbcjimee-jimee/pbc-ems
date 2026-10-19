# PBC EMS 오케스트레이션 규약

Claude Code(팀장)와 Codex 실행 세션(구현 담당)이 **같은 프로젝트 폴더**에서 병렬로 작업할 때의 운영 규칙이다.

- 적용 범위: `C:\Users\kjm12\OneDrive\바탕 화면\Project\PBC EMS`
- 작성일: 2026-10-20 (Australia/Sydney)
- 관련 문서: [TASK-TEMPLATE.md](./TASK-TEMPLATE.md), [OWNERSHIP.md](./OWNERSHIP.md)

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

### 2.1 원칙: 같은 폴더, worktree 없음

> 2026-10-20 갱신: Orca 워크트리(`C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish`, git 브랜치)에서도 같은 규칙을 쓴다.
> Codex는 `--worktree` 없이 이 폴더를 `-C`로 공유하고, Orca 터미널 탭(사이드바에 표시)에서 실행한다.
> 결과 로그는 워크트리 밖 `../logs/<작업ID>.log`, 완료 표시는 `../logs/<작업ID>.done`.

이 프로젝트는 **git 저장소가 아니다**(`.git` 없음). 따라서

- `codex exec --worktree`는 사용하지 않는다. 사용 시 실패하거나 의도와 다른 격리가 발생한다.
- 모든 세션은 `-C "<프로젝트 루트>"`로 **동일 폴더**에서 실행한다.
- 파일 충돌은 git이 막아주지 않는다. **§3 파일 소유권 규칙이 유일한 방어선이다.**
- `--skip-git-repo-check`를 반드시 붙인다.

> 향후 `git init`을 하면 `--worktree` 기반 격리로 전환할 수 있다. 그때는 이 절을 개정한다.

### 2.2 호출 명령 (Claude Code → Codex)

Codex의 `agents/*.toml`은 **Codex 세션 내부 서브에이전트** 정의다. 외부에서 `codex exec`로 호출할 때는 상속되지 않으므로, 모델과 effort를 **매 호출마다 명시**한다.

```bash
PBC="C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS"
TASK="docs/orchestration/tasks/T-001-quote-engine.md"
OUT="docs/orchestration/results/T-001.md"

codex exec \
  -C "$PBC" \
  --skip-git-repo-check \
  -s workspace-write \
  -c model="gpt-6.1-sol" \
  -c model_reasoning_effort="high" \
  -o "$PBC/$OUT" \
  "$(cat "$PBC/$TASK")"
```

역할별 `-c` 값:

| 역할 | `-c model=` | `-c model_reasoning_effort=` | `-s` |
| --- | --- | --- | --- |
| `analyst` | `gpt-6-astra` | `xhigh` | `read-only` |
| `implementer` | `gpt-6.1-sol` | `high` | `workspace-write` |
| `quick_edit` | `gpt-6-luna` | `high` | `workspace-write` |
| `explorer` | `gpt-6-astra` | `high` | `read-only` |

`analyst`와 `explorer`는 `read-only` 샌드박스로 실행한다. 역할 정의상 파일을 수정하지 않으므로, 샌드박스로 강제해 사고를 막는다.

### 2.3 병렬 실행

독립 작업은 한 번에 띄운다. Claude Code는 각 `codex exec`를 **백그라운드**로 실행하고 결과 파일을 수거한다.

```bash
# 예: 3개 작업 동시 실행
codex exec -C "$PBC" --skip-git-repo-check -s workspace-write \
  -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  -o "$PBC/docs/orchestration/results/T-001.md" \
  "$(cat "$PBC/docs/orchestration/tasks/T-001-quote-engine.md")" &

codex exec -C "$PBC" --skip-git-repo-check -s workspace-write \
  -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  -o "$PBC/docs/orchestration/results/T-002.md" \
  "$(cat "$PBC/docs/orchestration/tasks/T-002-timesheet-api.md")" &

codex exec -C "$PBC" --skip-git-repo-check -s read-only \
  -c model="gpt-6-astra" -c model_reasoning_effort="xhigh" \
  -o "$PBC/docs/orchestration/results/T-003.md" \
  "$(cat "$PBC/docs/orchestration/tasks/T-003-invoice-design.md")" &

wait
```

병렬 제약:

- **동시 쓰기 세션은 최대 3개.** 그 이상은 파일 충돌 위험과 검토 부담이 급증한다.
- 같은 파일을 쓰는 작업은 **절대 병렬로 띄우지 않는다.** 순차로 돌린다.
- `read-only` 세션(`analyst`, `explorer`)은 개수 제한 없이 병렬 가능하다.
- 쓰기 세션이 도는 동안 Claude Code는 **해당 작업의 소유 파일을 건드리지 않는다.** UI 작업은 겹치지 않는 파일에서만 진행한다.

### 2.4 이어하기

후속 지시는 새 세션을 띄우지 말고 기존 스레드를 이어간다.

```bash
codex exec resume --last -C "$PBC" --skip-git-repo-check \
  -s workspace-write -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  "추가 지시: <내용>"
```

특정 세션을 이어갈 때는 `--last` 대신 세션 id를 넣는다.

---

## 3. 파일 소유권 (충돌 방지의 핵심)

git 격리가 없으므로 **쓰기 권한은 작업 지시서로 배타 할당된다.**

### 3.1 규칙

1. 모든 작업 지시서는 `담당 파일` 절에 **쓰기 허용 경로를 전부 명시**한다. 목록에 없는 파일은 읽기만 가능하다.
2. 두 개의 동시 실행 작업이 **같은 경로를 쓰기로 가질 수 없다.** Claude Code가 배치 전에 확인한다.
3. Codex가 목록 밖 파일을 수정해야 한다고 판단하면 **수정하지 말고 보고**한다. 범위 확대는 팀장 승인 사항이다.
4. 공유 파일(`package.json`, `tsconfig.json`, `next.config.ts`, 마이그레이션 디렉터리, 공통 타입)은 **Claude Code 전용**이다. Codex가 의존성 추가나 설정 변경이 필요하면 요청만 한다.
5. `app/**`, `components/**`는 원칙적으로 Claude Code 소유다. Codex에 넘기려면 지시서에 **명시적으로 위임한다고 적는다.**

경로별 기본 소유자는 [OWNERSHIP.md](./OWNERSHIP.md)에 정리되어 있다.

### 3.2 충돌 발생 시

1. 즉시 해당 Codex 세션을 중단한다.
2. 어느 쪽 변경이 정답인지 Claude Code가 판정한다.
3. 지시서의 담당 파일 목록을 교정하고 재실행한다.
4. 반복되는 충돌 지점은 OWNERSHIP.md에 기록한다.

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

### 5.1 Codex가 실행 (작업 완료 전)

| 명령 | 적용 |
| --- | --- |
| `npm run typecheck` | 모든 TS 변경 |
| `npm run lint` | 모든 코드 변경 |
| `npm run test:run` | 로직·계산·API 변경 |
| `npm run test:integration` | DB·Supabase 관련 변경 |

`vitest`는 `--no-file-parallelism`으로 설정되어 있다. **여러 Codex 세션이 테스트를 동시에 돌리면 간섭한다.** 테스트 실행이 필요한 작업은 순차 배치하거나, 지시서에 "테스트 실행은 보고만 하고 팀장이 일괄 실행"이라고 적는다.

### 5.2 Claude Code가 실행 (통합 시)

1. 모든 Codex 결과 보고 수거·교차 확인
2. 변경 파일 직접 읽고 검토 — 보고를 액면가로 믿지 않는다
3. 소유권 위반 여부 확인 (목록 밖 파일이 바뀌었는지)
4. 전체 `typecheck` + `lint` + `test:run` 1회 실행
5. UI 영향이 있으면 `npm run dev`로 실제 화면 확인

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
- [ ] 담당 파일 목록이 다른 동시 작업과 겹치지 않음
- [ ] 역할 선택이 §7 기준에 맞음
- [ ] 완료 조건·검증 명령·범위 밖이 지시서에 있음
- [ ] 동시 쓰기 세션 3개 이하
- [ ] 테스트 실행이 겹치지 않음

통합 전:

- [ ] 모든 결과 보고 수거
- [ ] 변경 파일 직접 검토
- [ ] 소유권 위반 없음
- [ ] 전체 검증 1회 통과
- [ ] 보류·미실행 항목을 사용자에게 보고
