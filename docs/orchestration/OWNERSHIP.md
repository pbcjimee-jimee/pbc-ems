# 경로별 소유권

목적은 사고 방지가 아니라 **병합 비용 최소화와 검토 범위 명확화**다. Codex는 worktree로 격리되지만 `ui-ux`·`test`·팀장은 main을 공유해 **같은 파일 동시 수정 시 복구 불가**하다.

## 팀장 전용

`AGENTS.md`, `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `README.md`, `docs/orchestration/**`, `.claude/**`, `scripts/**`, `package*.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `proxy.ts`, `.env*`, `.gitignore`, `supabase/**`.

마이그레이션은 순서 있는 불변 이력이라 병렬 생성 시 타임스탬프가 충돌한다. 타 역할은 SQL 초안만 보고한다.

## ui-ux

`app/**`(레이아웃·페이지·CSS Modules·`globals.css`), `components/**`.

제외: `app/(ems)/*/actions.ts`·`app/login/actions.ts`(팀장, UI 흐름 중심이면 위임 가능).
주의: `components/ui/**`, `components/shell/**`, `app/globals.css`는 전역 영향 — 변경 시 영향 화면 점검.

## test

`tests/**`.

제외: `tests/env.test.ts`, `tests/integration/{transaction,workspace}.test.ts`(팀장).
회귀 기준선: `tests/operating-quote-parity.test.ts`, `tests/quotes/fixtures/historical-quotes.ts` — **기대값 변경 금지**.
`tests/helpers/**`는 전체가 의존하므로 변경 시 영향 확인.

## Codex (implementer / quick_edit)

도메인 단위 배타 할당. 아래가 병렬 배치의 기본 단위다.

| 묶음 | 경로 | 대응 테스트 |
| --- | --- | --- |
| clients·requests | `lib/{clients,requests}/**` | `integration/clients-requests` |
| quotes | `lib/quotes/**` | `quotes/**`, `integration/quotes` |
| jobs·invoices | `lib/{jobs,invoices}/**` | `integration/jobs-invoices` |
| expenses·timesheets | `lib/{expenses,timesheets}/**` | `integration/expenses-timesheets` |
| schedule | `lib/schedule/**` | `schedule`, `integration/schedule` |
| documents·home·settings | `lib/{documents,home,settings}/**` | `documents`, `integration/workspace` |

같은 행의 두 도메인은 테스트를 공유하므로 동시 쓰기 배정하지 않는다.

팀장 전용 공유 로직: `lib/{env,domain,supabase,db,auth}/**`, `lib/workflows/commands.ts`.

견적 계산 엔진은 `implementer` 전용(`quick_edit` 금지): `lib/calculator.ts`, `lib/quote-*.ts`, `lib/public-line-money.ts`, `lib/paint-comparison-types.ts`, `lib/quotes/{calculation,commercial-totals,options,snapshots,templates}.ts`, `lib/products/**`. 수정 시 대응 테스트를 함께 다룬다.

## 읽기만

`.local/**`(junction 공유), `.next/**`, `node_modules/**`, `.superpowers/**`, `*.tsbuildinfo`, `supabase/.temp/**`.
Codex 가능: `docs/{evidence,qa}/**`, `docs/orchestration/results/**`(자기 ID 파일만).

## 격리되지 않는 자원

| 자원 | 공유 | 규칙 |
| --- | --- | --- |
| main 작업 공간 | `ui-ux`·`test`·팀장 | 범위 겹치면 순차 |
| `node_modules` | junction, 전 worktree | `npm install` 금지 |
| 로컬 Postgres | `.env.local` 동일 | 통합 테스트 동시 실행 금지 |
| `.local/**` | junction | 읽기만 |
| 포트 3000 | OS | 팀장만 `npm run dev` |

`.next/`는 worktree별 독립이라 안전하다.

## 충돌 이력

| 날짜 | 경로 | 원인 | 조치 |
| --- | --- | --- | --- |
| 2026-10-20 | `tests/integration/*` | 새 테스트가 `adminQuery`(raw postgres)로 jobs를 직접 UPDATE → supervisor 가드 트리거(`auth.uid()` 없음)에 막힘 | 지시서에 "보호 테이블은 서비스 함수로 변경" 명시 |
| 2026-10-20 | `eslint .` | gstack browse가 워크트리에 만든 `.gstack/` 접근 EPERM | `eslint.config.mjs`·`.gitignore`에 `.gstack/` 추가 |
