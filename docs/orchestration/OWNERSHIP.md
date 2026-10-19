# 경로별 소유권 맵

병합 충돌을 줄이고 검토 범위를 명확히 하기 위한 기본 소유자 표다.

쓰기 작업은 각자의 worktree에서 실행되므로 **동시 수정이 서로를 깨뜨리지는 않는다.** 이 표의 목적은 사고 방지가 아니라 **병합이 자동으로 끝나게 만드는 것**이다. 단, §9의 전역 자원은 worktree로도 격리되지 않으므로 여전히 엄격하다.

- 규약: [ORCHESTRATION.md](./ORCHESTRATION.md) §3
- 기준일: 2026-10-20 (worktree 전환 반영)

범례:

| 표기 | 의미 |
| --- | --- |
| **팀장** | Claude Code 전용. Codex에 쓰기 위임 금지 |
| **Codex 가능** | 작업 지시서에서 명시 할당하면 Codex가 쓸 수 있음 |
| **팀장 기본** | 기본은 팀장. 지시서에 명시적으로 위임한다고 적으면 Codex 가능 |
| **읽기만** | 누구도 쓰지 않음 (생성물·로컬 데이터) |

---

## 1. 전역 설정·규약 — 팀장 전용

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| `AGENTS.md` | 팀장 | Next.js 블록은 `next dev`가 자동 재생성 |
| `CLAUDE.md` | 팀장 | |
| `PRODUCT.md` | 팀장 | 제품 요구사항의 단일 진실 공급원 |
| `DESIGN.md` | 팀장 | 디자인 시스템 |
| `README.md` | 팀장 | |
| `docs/orchestration/**` | 팀장 | `results/`는 예외 — §5 참조 |
| `package.json` / `package-lock.json` | 팀장 | 의존성 변경은 요청만 받음 |
| `tsconfig.json` | 팀장 | |
| `next.config.ts` | 팀장 | |
| `eslint.config.mjs` | 팀장 | |
| `vitest.config.ts` | 팀장 | 특히 `--no-file-parallelism` 설정 |
| `proxy.ts` | 팀장 | |
| `.env*` | 팀장 | Codex 지시서에 내용 금지. 키 이름만 언급 |
| `.gitignore` | 팀장 | |

---

## 2. UI 레이어 — 팀장 기본

디자인 일관성은 단일 주체가 유지한다. Codex 위임은 예외적으로만 한다.

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| `app/layout.tsx` | 팀장 전용 | 루트 레이아웃 |
| `app/globals.css` | 팀장 전용 | 디자인 토큰 |
| `app/(ems)/layout.tsx` | 팀장 전용 | EMS 셸 |
| `app/(ems)/**/page.tsx` | 팀장 기본 | 도메인 단위로 위임 가능 |
| `app/(ems)/**/error.tsx`, `loading.tsx` | 팀장 기본 | |
| `app/**/*.module.css` | 팀장 전용 | |
| `app/login/**`, `app/setup/**` | 팀장 전용 | 인증 화면 |
| `components/shell/**` | 팀장 전용 | 앱 셸·아이콘·내비게이션 |
| `components/ui/**` | 팀장 전용 | 공통 프리미티브. 여기가 바뀌면 전체가 흔들린다 |
| `components/documents/**` | 팀장 전용 | 고객 문서 출력물 |
| `components/<도메인>/**` | 팀장 기본 | 도메인 단위로 위임 가능 |

### 2.1 Server Actions — 경계 주의

`app/(ems)/*/actions.ts`는 UI와 서비스 레이어의 경계다.

| 경로 | 소유 |
| --- | --- |
| `app/(ems)/clients/actions.ts` | 팀장 기본 |
| `app/(ems)/requests/actions.ts` | 팀장 기본 |
| `app/(ems)/quotes/actions.ts` | 팀장 기본 |
| `app/(ems)/jobs/actions.ts` | 팀장 기본 |
| `app/(ems)/invoices/actions.ts` | 팀장 기본 |
| `app/(ems)/expenses/actions.ts` | 팀장 기본 |
| `app/(ems)/schedule/actions.ts` | 팀장 기본 |
| `app/(ems)/timesheets/actions.ts` | 팀장 기본 |
| `app/(ems)/settings/actions.ts` | 팀장 기본 |
| `app/login/actions.ts` | 팀장 전용 (인증) |

Codex가 서비스 레이어 시그니처를 바꾸면 **actions.ts 수정은 하지 말고 필요한 변경을 보고**한다. 팀장이 반영한다.

---

## 3. 로직 레이어 — Codex 가능

도메인별로 분리되어 있어 **도메인 단위 배타 할당**이 가능하다. 아래 묶음은 서로 겹치지 않으므로 병렬 배치의 기본 단위로 쓴다.

| 묶음 | 경로 | 테스트 |
| --- | --- | --- |
| **clients** | `lib/clients/**` | `tests/integration/clients-requests.test.ts` |
| **requests** | `lib/requests/**` | `tests/integration/clients-requests.test.ts` |
| **quotes** | `lib/quotes/**` | `tests/quotes/**`, `tests/integration/quotes.test.ts` |
| **jobs** | `lib/jobs/**` | `tests/integration/jobs-invoices.test.ts` |
| **invoices** | `lib/invoices/**` | `tests/integration/jobs-invoices.test.ts` |
| **expenses** | `lib/expenses/**` | `tests/integration/expenses-timesheets.test.ts` |
| **timesheets** | `lib/timesheets/**` | `tests/integration/expenses-timesheets.test.ts` |
| **schedule** | `lib/schedule/**` | `tests/schedule.test.ts`, `tests/integration/schedule.test.ts` |
| **documents** | `lib/documents/**` | `tests/documents.test.ts` |
| **home** | `lib/home/**` | — |
| **settings** | `lib/settings/**` | `tests/integration/workspace.test.ts` |

> `clients`와 `requests`는 테스트 파일을 공유한다. 두 묶음을 **동시에 쓰기 배정하지 않는다.**
> `jobs`와 `invoices`, `expenses`와 `timesheets`도 같다.

### 3.1 공유 로직 — 팀장 전용

여러 도메인이 의존하므로 단일 주체가 관리한다.

| 경로 | 소유 | 이유 |
| --- | --- | --- |
| `lib/env.ts` | 팀장 | 환경 변수 계약 |
| `lib/domain/types.ts` | 팀장 | 전역 타입 |
| `lib/domain/format.ts` | 팀장 | 전역 포맷터 |
| `lib/domain/sydney-date-time.ts` | 팀장 | 타임존 기준. 전 도메인 의존 |
| `lib/domain/command-digest.ts` | 팀장 | |
| `lib/supabase/**` | 팀장 | DB 클라이언트 |
| `lib/db/**` | 팀장 | 트랜잭션·SQL 오류 처리 |
| `lib/auth/**` | 팀장 | 인증·권한. `quick_edit` 금지 영역 |
| `lib/workflows/commands.ts` | 팀장 | 도메인 간 워크플로 |

### 3.2 견적 계산 엔진 — implementer 전용

기존 앱의 계산 방식을 보존해야 하는 영역이다. `quick_edit`에 주지 않는다.

```
lib/calculator.ts
lib/quote-calculation-totals.ts
lib/quote-labour.ts
lib/quote-paint-comparison.ts
lib/paint-comparison-types.ts
lib/public-line-money.ts
lib/quotes/calculation.ts
lib/quotes/commercial-totals.ts
lib/quotes/options.ts
lib/quotes/snapshots.ts
lib/quotes/templates.ts
lib/products/**
```

이 파일을 건드리는 작업은 **반드시 대응 테스트를 함께 수정·실행**한다. 특히 `tests/operating-quote-parity.test.ts`와 `tests/quotes/fixtures/historical-quotes.ts`는 과거 견적과의 일치를 검증한다.

| 경로 | 소유 |
| --- | --- |
| `tests/operating-quote-parity.test.ts` | 팀장 전용 — 회귀 기준선 |
| `tests/quotes/fixtures/historical-quotes.ts` | 팀장 전용 — 회귀 기준선 |

---

## 4. 테스트 — Codex 가능 (동시 실행 주의)

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| `tests/helpers/**` | 팀장 전용 | 모든 테스트가 의존 |
| `tests/integration/transaction.test.ts` | 팀장 전용 | 인프라 테스트 |
| `tests/integration/workspace.test.ts` | 팀장 전용 | 전역 설정 |
| `tests/env.test.ts` | 팀장 전용 | |
| `tests/operating-quote-parity.test.ts` | 팀장 전용 | 회귀 기준선 |
| `tests/quotes/fixtures/**` | 팀장 전용 | 회귀 기준선 |
| 그 외 `tests/**` | Codex 가능 | 도메인 묶음에 따라 배정 |

### 4.1 실행 간섭 경고

**단위 테스트는 worktree에서 자유롭게 병렬 실행 가능하다.** DB를 쓰지 않으므로 서로 간섭하지 않는다.

```bash
npx vitest run --no-file-parallelism --exclude "tests/integration/**"
# 정상: Test Files 12 passed (12) / Tests 192 passed
```

**통합 테스트는 worktree로 격리되지 않는다.** `tests/helpers/database.ts`의 `resetFixtures()`가 DB 전체를 리셋하고, 모든 worktree의 `.env.local`이 같은 로컬 Postgres(`127.0.0.1`)를 가리킨다. 두 세션이 동시에 돌리면 서로의 픽스처를 지우고 양쪽 모두 실패한다.

따라서 통합 테스트(`tests/integration/**`, `npm run test:integration`, `npm run test:run`)는 **항상**:

1. 지시서에 "작성만 하고 실행하지 않는다"고 적는다
2. 팀장이 병합 후 main에서 1회 일괄 실행한다

### 4.2 조용히 스킵되는 회귀 테스트

`tests/operating-quote-parity.test.ts`는 `.local/operating-cases.json`이 없으면 `describe.skipIf`로 **조용히 스킵**된다. worktree에 `.local` junction이 없으면 `11 passed | 1 skipped`가 되는데, 초록불이라 통과처럼 보인다.

이 테스트는 과거 실제 견적과의 계산 일치를 검증하는 **회귀 기준선**이다. 스킵되면 견적 엔진 회귀를 놓친다. `scripts/worktree-setup.ps1`이 junction을 연결하고 skip을 감지해 경고한다.

---

## 5. DB·마이그레이션 — 팀장 전용

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| `supabase/migrations/**` | 팀장 전용 | Codex는 SQL 초안만 결과 보고에 담는다 |
| `supabase/seed.sql` | 팀장 전용 | |
| `supabase/config.toml` | 팀장 전용 | |
| `supabase/ems-schema-contract.md` | 팀장 전용 | 스키마 계약 |
| `supabase/document-contract.md` | 팀장 전용 | 문서 계약 |
| `supabase/tests/ems_rls.test.sql` | 팀장 전용 | RLS 보안 테스트 |
| `supabase/README.md` | 팀장 전용 | |
| `supabase/.temp/**`, `.branches/**` | 읽기만 | CLI 생성물 |

마이그레이션은 순서가 있는 불변 이력이다. 병렬 생성 시 타임스탬프 충돌과 적용 순서 붕괴가 발생한다.

---

## 6. 스크립트·로컬 데이터

| 경로 | 소유 | 비고 |
| --- | --- | --- |
| `scripts/**` | Codex 가능 | 지시서에 명시 할당 |
| `.local/**` | 읽기만 | `.gitignore` 대상 로컬 데이터. Codex 쓰기 금지 |
| `.next/**` | 읽기만 | 빌드 산출물 |
| `node_modules/**` | 읽기만 | |
| `.superpowers/**` | 읽기만 | |
| `tsconfig.tsbuildinfo` | 읽기만 | 생성물 |
| `docs/evidence/**` | Codex 가능 | 검증 근거 기록 |
| `docs/qa/**` | Codex 가능 | QA 기록 |
| `docs/orchestration/results/**` | Codex 가능 | `-o` 출력 대상. 자기 작업 ID 파일만 |

---

## 7. 병렬 배치 예시

### 권장 — 경로가 갈려 병합이 자동으로 끝나는 배치

```
세션 A (implementer, wt/T-001) : lib/quotes/**    + tests/quotes/calculator.test.ts
세션 B (implementer, wt/T-002) : lib/schedule/**  + tests/schedule.test.ts
세션 C (analyst, main, RO)     : 읽기만 — 인보이스 설계 분석
동시 진행 (팀장, main)          : components/clients/**, app/(ems)/clients/page.tsx
```

A·B는 경로가 분리되어 `git merge`가 충돌 없이 끝난다. C는 read-only, 팀장은 main에서 UI 작업. worktree가 파일을 격리하므로 팀장 작업과도 섞이지 않는다.

### 허용되지만 비용이 드는 배치

```
세션 A (wt/T-001) : lib/quotes/calculation.ts
세션 B (wt/T-002) : lib/calculator.ts + lib/quotes/calculation.ts   ← 같은 파일
```

worktree 덕분에 **작업 중에는 서로를 깨뜨리지 않는다.** 하지만 병합 시점에 `calculation.ts`에서 충돌이 나고 팀장이 수동 해소해야 한다. 가능하면 순차 배치한다.

```
세션 A (wt/T-001) : lib/jobs/**     + tests/integration/jobs-invoices.test.ts
세션 B (wt/T-002) : lib/invoices/** + tests/integration/jobs-invoices.test.ts
```

같은 테스트 파일을 쓰므로 병합 충돌이 예상된다. 단 **둘 다 테스트를 실행하지 않는 한** 작업 자체는 안전하다.

### 금지 — worktree로 격리되지 않는 것

```
세션 A : npm run test:integration    ← DB 리셋
세션 B : npm run test:integration    ← 서로의 픽스처를 지운다
```

```
세션 A : npm install <pkg>           ← junction 으로 원본 node_modules 변경
세션 B : (아무 작업)                   ← 의존성이 발밑에서 바뀐다
```

```
세션 A : supabase db reset           ← 로컬 DB 스키마 변경, 전체 영향
```

---

## 8. 갱신 규칙

- 새 도메인이나 공유 모듈이 생기면 **배치 전에** 이 표에 추가한다.
- 병합 충돌이 실제로 발생한 경로는 아래에 기록해 다음 배치에서 회피한다.
- 이 문서는 팀장 전용이다. Codex가 수정하지 않는다.

### 충돌 이력

| 날짜 | 경로 | 원인 | 조치 |
| --- | --- | --- | --- |
| — | — | — | — |

---

## 9. 전역 자원 — worktree로 격리되지 않음

파일 소유권과 무관하게, 아래는 **모든 worktree에 즉시 영향**을 준다. 팀장 전용이다.

| 자원 | 공유 방식 | 위험 | 규칙 |
| --- | --- | --- | --- |
| `node_modules` | junction | `npm install`이 전체에 전파 | Codex 지시서 `범위 밖`에 항상 명시 |
| 로컬 Postgres (`127.0.0.1`) | `.env.local` 동일 | 통합 테스트가 DB 리셋 | §4.1 |
| `.local/**` | junction | 쓰면 다른 세션의 테스트 데이터 변경 | 읽기만 |
| 포트 3000 | OS | `npm run dev` 중복 실행 시 충돌 | 팀장만 실행, 또는 포트 분리 |
| Supabase 로컬 스택 | 단일 인스턴스 | `db reset`이 전체 파괴 | 팀장 전용 |

`.next/`는 worktree별로 독립 생성되므로 안전하다.
