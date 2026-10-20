# PBC EMS 다음 단계 구현 계획 (2026-10-20 현황 분석 기반)

> **For agentic workers:** 이 문서는 여러 하위 시스템을 묶은 **마스터 로드맵**이다. 단계(Phase)마다 실행 직전에 작업 단위 상세 계획(Codex는 `docs/orchestration/TASK-TEMPLATE.md` 지시서, Claude 서브에이전트는 Agent 프롬프트)을 만들고 superpowers:subagent-driven-development 또는 superpowers:executing-plans로 진행한다. 완료 조건은 체크박스(`- [ ]`)로 추적한다.

**Goal:** 로컬에서 동작하는 현재 EMS를 (1) 숫자·상태가 서로 맞는 신뢰 가능한 상태로 고치고, (2) 실제 직원이 운영 환경에서 쓸 수 있게 출시 준비를 마치고, (3) 승인 설계 §4의 남은 기능을 채운다.

**Architecture:** 기존 구조를 유지한다. 서버 로직은 `lib/<domain>/service.ts`, 화면은 `app/(ems)/**` + `components/ui/**`, DB는 비노출 `ems` 스키마 + RLS + `ems_runtime` 트랜잭션. 새 구조는 직원 관리(`lib/staff/**`)와 인증 보조 라우트만 추가한다.

**Tech Stack:** Next.js 16.3.8, React 19.2.4, TypeScript strict, Supabase(Auth·Postgres·Storage), pg 8.23.1, decimal.js, zod 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-16-pbc-ems-design.md`(2026-10-16 승인). 이전 격차 분석 `docs/orchestration/results/T-001.md`.

---

## 0. 한눈에 보기

- **지금 상태:** 요청한 10개 메뉴, 실제 견적 계산 엔진 이식, Jobber식 UI 개편(2026-10-20)까지 **로컬에서 동작**한다. 권한 분리(supervisor에게 금액 비노출)도 코드상 누출 경로가 발견되지 않았다.
- **바로 고쳐야 할 것:** Home 숫자를 눌렀을 때 나오는 목록과 숫자가 다르다. 취소한 작업의 방문이 일정에 남는다. 타이머 시작·근무 일괄 승인은 응답이 끊긴 뒤 재시도하면 거짓 실패가 난다.
- **출시를 막는 것:** 운영 환경에서 **최초 관리자와 직원 계정을 만들 방법이 없다.** 운영 Supabase·배포 대상·메일 발송·백업·오류 로깅이 정해지지 않았다.
- **순서:** Phase 1(정합성 수정) + Phase 2(DB 보강) → Phase 3(운영 필수 기능) → Phase 5(출시 준비) = **출시 가능**. Phase 4(설계 잔여 기능)는 병렬로 채운다. Phase 6은 범위 확정 후.

## 1. 분석 근거와 현재 검증 상태

| 근거 | 내용 |
| --- | --- |
| 문서 | `PRODUCT.md`, `DESIGN.md`, 승인 설계, `supabase/ems-schema-contract.md`, `supabase/document-contract.md`, `docs/qa/verification-2026-10-16.md`, T-001~T-010 지시서·결과 |
| 코드 감사 | 읽기 전용 탐색 3건(백엔드 도메인 / 화면·Server Action / DB·보안·테스트·출시), 핵심 주장은 원본 코드에서 직접 재확인 |
| 이번 실행 (osprey worktree) | `npm run typecheck` 통과, `npm run lint` 통과, 단위 테스트 **12 passed · 1 skipped (321 tests)** |
| 이전 기록 | 2026-10-16 실제 브라우저 업무 흐름 12단계 QA. 커밋 `d245c46` 메시지에 vitest 434/434·`next build` 통과 기록(메인 저장소, 통합 테스트 포함으로 보임) |

**주의할 검증 상태**

- skip된 1개는 `tests/operating-quote-parity.test.ts`다. 이 worktree에 `.local/operating-cases.json`이 없어 **실제 운영 견적 3건 대조가 빠진 채 초록불**로 보인다. 메인 저장소에서만 의미 있는 통과가 나온다.
- `AGENTS.md`·`TASK-TEMPLATE.md`의 기준값 "12 passed / 192 tests"는 `d245c46` 이전 값이다. 현재는 단위 321개 이상이다(→ P5-6에서 갱신).
- 통합 테스트·pgTAP은 공유 로컬 DB를 리셋하므로 이번 분석에서 실행하지 않았다.

## 2. 현재 구현된 기능

판정: **완료** = 설계 §4 완료 조건을 코드상 충족, **부분** = 핵심은 있으나 일부 조건 미충족.

| 메뉴 | 구현된 기능 | 판정 | 남은 부분 (→ 작업 ID) |
| --- | --- | --- | --- |
| Create | 사이드바·모바일 빠른 생성(Client/Request/Quote/Job/Invoice), Escape 시 포커스 복귀 | 부분 | Cancel이 고정 목록으로 이동, 원래 위치 복귀 안 됨 (P1-5) |
| Home | 오늘·다가오는 방문, Requests/Quotes/Jobs/Invoices 파이프라인 카드(건수·금액), supervisor는 금액 없는 카드 | 부분 | 카드 숫자와 이동 목록 불일치 (P1-1) |
| Schedule | 일/주/월/목록, 날짜 이동, 방문·점검·일반 일정, 종일·여러 날, 다중 배정, 중복 배정 경고, 미배정 작업, Sydney DST, 방문 취소·이동 시 Job 상태 재평가 | 완료 | 방문 이력 화면 (P4-7), 빠른 이동 (P4-10) |
| Clients | 연락처·청구 주소·여러 현장·메모·태그, 보관·복원, 검색·상태 탭, 관리자용 미수·연체 요약, 연결 업무 | 부분 | 관련 업무 100/20건에서 잘림, 태그 필터 없음 (P4-4) |
| Requests | 고객·현장, 희망일, 상태 전이, Quote/Visit/Job 연결, 상태 탭 개수 | 부분 | 점검 일정 기준이 `assessment_at`과 점검 Visit 둘로 나뉨, 점검 담당자 미표시 (P1-1, P4-2) |
| Quotes | 원본 계산 엔진(F1~F5·Roof·옵션·Timber), 고객용 행, 템플릿, 복제, revision 이력, 인쇄/PDF, 발행·승인·변경요청·거절·보관, Job 전환, 상품·단가 설정 | 부분 | 만료 표시 없음, Converted 구분 없음, 보관 복원 없음 (P1-1, P4-1) |
| Jobs | 견적 전환(중복 방지)·직접 생성, 고정 계약, 여러 방문, 상태 전이(서비스 계층), 비용·근무 요약, 청구 연결 | 부분 | 취소 시 방문 잔존, 편집으로 상태 우회, 재개방 사유 없음, 담당자 미표시 (P1-2, P4-3) |
| Invoices | Job 계약 복사·직접 작성, 발행·취소, 부분 수금·수금 취소, 잔액·연체, 중복 전액 청구 방지, 9개 탭 | 부분 | 초안의 인쇄본 잔액이 상세와 다름 (P1-4) |
| Expenses | 작성자 권한, Job 연결, 비공개 영수증(서명 검사·60초 링크·실패 시 정리), 25건 페이지·합계·보관 | 부분 | 작성자 필터·분류 선택 없음 (P4-5) |
| Timesheets | 수동 입력·타이머, 겹침·타이머 1개 DB 제약, 제출·승인·반려(사유 필수)·재개방, 변경 전후 기록 | 부분 | 타이머·일괄 처리 재시도 안전성, 목록 상한, 작업자 필터 (P1-3, P4-6) |
| Search | 고객·현장 주소·요청·작업, 관리자는 견적·청구까지(종류별 10건) | 부분 | 더 보기 없음, 페이지에서 SQL 직접 실행 (P4-8) |
| Settings | 회사 정보(법인명·ABN·주소·연락처·은행) | 부분 | **직원·권한 관리 없음** (P3-1), 저장 활동 기록 없음 (P1-4) |
| 공통 | 트랜잭션·expectedVersion·멱등성 키, 관리자 활동 타임라인, 고객 문서 allowlist, RLS 전 테이블 | 부분 | 감사 기록 불변성·DB 전이 보호 없음 (P2) |

## 3. 앞으로 업데이트할 항목 (우선순위)

P0 = 신뢰·무결성·출시 차단, P1 = 설계 완료 조건 미충족, P2 = 개선·확장.

| ID | P | 항목 | 근거 | 작업 |
| --- | --- | --- | --- | --- |
| U01 | P0 | 운영 환경에서 최초 관리자·직원 생성 경로 없음 (membership 쓰기 코드 0건) | `20261015220541_ems_runtime.sql:7,9`, `scripts/local-db.mjs:18,29-41` | P3-1, P3-3 |
| U02 | P0 | 운영 Auth 설정 미정 (로컬은 signup 허용·최소 6자), 비밀번호 재설정·초대 수락 흐름 없음 | `supabase/config.toml:176,182,221`, `app/login/actions.ts` | P3-2 |
| U03 | P0 | Home 카드 숫자 ≠ 이동 목록 (Requests New·점검 예정/연체·승인 미전환 견적) | `app/(ems)/home/page.tsx:28-32`, `lib/requests/service.ts:66,78-83` | P1-1 |
| U04 | P0 | Job 취소 시 방문이 scheduled로 남음, 편집 폼으로 상태 우회, 재개방 사유 없음 | `lib/jobs/service.ts:48-51,62-70`, `lib/jobs/transitions.ts:6` | P1-2 |
| U05 | P1 | 타이머 시작·근무 일괄 처리에 멱등성 없음 → 응답 유실 후 재시도 시 거짓 실패 | `lib/timesheets/service.ts:42-50,64-72`, `app/(ems)/timesheets/actions.ts:24` | P1-3 |
| U06 | P1 | 감사 기록 누락: 회사 정보 저장, 견적 발행으로 인한 요청 상태 변경, 요청·작업 수정 필드 | `lib/settings/service.ts:17-21`, `lib/quotes/service.ts:121` | P1-1, P1-2, P1-4 |
| U07 | P1 | 초안 청구서 잔액: 상세 0.00 vs 인쇄본 total−paid | `lib/documents/project.ts:20`, `lib/invoices/service.ts:128` | P1-4 |
| U08 | P1 | DB가 감사 기록 수정·삭제와 supervisor 상태 역전이를 막지 않음 (M2/M3 미적용) | `20261015220541_ems_runtime.sql:8,36`, `20261015221406_ems_scope_checks.sql:18-27` | P2-1, P2-2 |
| U09 | P1 | count와 목록을 별도 문장으로 읽어 배지·행 불일치 가능, 조회 인덱스(M1) 없음 | `lib/db/transaction.ts:26`, core migration `:82-88` | P2-3, P2-4 |
| U10 | P1 | 화면 흐름: Cancel 복귀, 저장 성공 알림 누락(견적·비용·근무), 충돌 복구 링크가 입력을 지움, 미저장 경고 없음, 권한 없는 화면 처리 제각각, 사이드바 회사명 하드코딩 | UI 감사 2-1, 3, 5절 | P1-5 |
| U11 | P1 | 접근성: 주·월 일정 카드 상태를 색으로만 표시, select 오류 연결 누락, 현장 버튼 터치 영역 36px | `components/schedule/calendar.tsx:22`, `components/jobs/job-form.tsx:24`, `app/globals.css:97` | P1-6 |
| U12 | P1 | 설계 §4 잔여: 견적 만료·보관 복원, 점검 담당자, Job 담당자, 고객 관련 업무 페이지, 비용 작성자 필터, 근무 작업자 필터, 방문 이력 | 백엔드 감사 5절 | P4-1~P4-7 |
| U13 | P1 | 출시 인프라: 배포 대상, DB 접속명(pooler), 영수증 업로드 크기, 보안 헤더, 오류 로깅, 백업 | `lib/db/transaction.ts:14`, `next.config.ts:3-7` | P5 |
| U14 | P2 | 무제한 조회: 근무 목록 전체 기간, 상세의 연결 목록 | `lib/timesheets/service.ts:90` | P1-3, P4-4 |
| U15 | P2 | 공용 컴포넌트 규칙 위반(전용 Feedback 4종, raw 버튼·Notice, Timesheets 상태 select) | UI 감사 4절 | P4-9 |
| U16 | P2 | 범위 확장 후보: 복수 연락처, 반복 작업, 이메일/SMS 발송, 고객 포털, 분할 청구, 일정 드래그 | T-001 G14~G16 | Phase 6 |

## 4. 사용자 결정이 필요한 사항

결정 전에도 진행할 수 있는 작업은 막지 않는다. 기본값은 이 계획의 권장안이며, 확정 전에는 구현하지 않는 항목에 표시했다.

| ID | 결정 | 권장안 | 막는 작업 |
| --- | --- | --- | --- |
| D1 | 운영 Supabase 프로젝트 생성 (조직·리전·요금제) | 기존 Jimee-PBC 조직에 EMS 전용 프로젝트, 리전 Sydney(ap-southeast-2), 스테이징 별도 | P5-5 |
| D2 | 배포 대상 | 결정 후 P5-1·P5-2 범위가 정해진다. Vercel이면 요청 본문 한도 4.5MB 때문에 영수증 직접 업로드 전환이 필요하다 | P5-1, P5-2 |
| D3 | 최초 관리자 계정과 직원 명단·역할 | 회사 대표 1명 admin, 현장 담당자 supervisor | P3-3, P5-5 |
| D4 | 직원 초대에 서버 전용 Supabase secret key 사용 허용 | 허용하되 `lib/supabase/admin.ts` 한 곳, 초대 함수만 사용 (일반 CRUD 우회 금지 원칙 유지) | P3-1 |
| D5 | Job 취소·보관 규칙 | ① 취소 시 예정(scheduled) 방문 자동 취소, 진행 중 방문이 있으면 거부 ② 완료됐지만 유효 청구서가 없는 Job은 보관 거부 ③ 보관된 견적은 Job 전환 거부 | P1-2 |
| D6 | 인증 메일(초대·비밀번호 재설정) 발송 SMTP | 회사 도메인 SMTP 또는 트랜잭션 메일 서비스. 고객 발송은 별도(Phase 6) | P3-2 |
| D7 | Jobber 기존 데이터 이관 여부·범위·기준일 | 출시 후 신규만 입력하는 안과 고객·현장만 이관하는 안 중 선택 | P5-9 |
| D8 | 실제 견적 대조용 비식별 확정 견적 3건 이상 제공 | 출시 전 필수 (설계 §12) | P5-6 |
| D9 | E2E 자동화 도입(Playwright 의존성 추가) | 출시 전에는 gstack `/qa` 수동 시나리오, 도입은 의존성 정책 확인 후 | P5-7 |
| D10 | Phase 6 확장 범위 | 출시 후 실제 사용 피드백으로 결정 | Phase 6 |

## Global Constraints

모든 작업의 요구사항에 아래가 포함된다.

- Next.js 16.3.8 API는 `node_modules/next/dist/docs/`에서 확인 후 사용한다. 학습된 지식으로 API를 가정하지 않는다.
- `npm install`·의존성 변경 금지 (worktree 간 `node_modules` junction 공유).
- 통합 테스트(`test:integration`, `test:run`)는 팀장이 직렬 실행한다. 구현자는 작성만 하고 단위 검증만 실행한다.
- `supabase/migrations/**`, `supabase/**`, `scripts/**`, `lib/{env,domain,supabase,db,auth}/**`, `lib/workflows/commands.ts`, `app/(ems)/*/actions.ts`는 팀장 전용. 다른 역할은 변경안을 보고한다.
- 견적 계산 엔진(`lib/calculator.ts`, `lib/quote-*.ts`, `lib/quotes/{calculation,commercial-totals,options,snapshots,templates}.ts`) 동작 변경 금지. `tests/operating-quote-parity.test.ts`, `tests/quotes/fixtures/historical-quotes.ts`의 기존 기대값 변경 금지(사례 추가만 허용).
- 금액은 SQL numeric → 문자열 `Money`, 계산은 decimal.js. native number로 금액을 합산하지 않는다.
- supervisor 응답에는 계약·청구 금액, 내부 원가, 다른 직원의 비용·근무를 넣지 않는다. 숨김이 아니라 **필드 자체를 생략**한다.
- 상태 변경은 서버가 허용 전이·권한·expectedVersion·멱등성 키를 검증한다. 버튼 숨김만으로 권한을 처리하지 않는다.
- AUD, Australia/Sydney, WCAG 2.2 AA, 한글·긴 주소. Jobber 상표·코드를 제품에 넣지 않는다.
- 단위 검증 명령: `npm run typecheck && npm run lint && npx vitest run --no-file-parallelism --exclude "tests/integration/**"`. `1 skipped`가 나오면 메인 저장소(`.local` 있음)에서 재확인한다.

## Review Focus

어떤 작업의 테스트도 기본으로 다루지 않지만 사용자를 가장 먼저 다치게 할 조건이다. 각 줄의 테스트는 담당 작업의 완료 조건에 포함했다.

1. **경계 시각의 Home 숫자**: Sydney 자정 직전·직후, 종일 점검의 종료일 당일, 부분 수금 후 수금 취소에서 Home 카드와 목록 탭 총계가 같아야 한다. → P1-1 `home link parity` 테스트.
2. **응답 유실 후 재시도**: 같은 키로 타이머 시작·일괄 승인을 다시 보내면 같은 성공 결과를 받고 활동 기록은 1건이어야 한다. → P1-3.
3. **새 조회 필드의 금액 누출**: 담당자·직원 목록·활동 요약 같은 새 필드가 supervisor 응답에 금액·타인 기록을 싣지 않아야 한다. → P3-1, P4-2, P4-3의 supervisor payload 테스트.
4. **진행 중 방문이 있는 Job 취소·재개방**: 고아 방문이 남지 않고, 재개방 후 상태는 실제 유효 방문으로 계산돼야 한다. → P1-2.
5. **운영 설정 누락**: signup 허용, 잘못된 DB 접속명, 플랫폼 본문 한도보다 큰 업로드가 출시 전에 드러나야 한다. → P5-1, P5-2, P5-5 체크리스트.

---

## 5. 단계별 작업

표기: **담당** — `implementer`(Codex, worktree), `quick_edit`(Codex), `ui-ux`·`test`(Claude, main 공유), `팀장`. 규모 S/M/L은 상대 크기다.

### Phase 1 — 정합성·신뢰성 수정 (마이그레이션 없음)

#### P1-1 Home 숫자와 목록 탭 일치 (U03, U06 일부) · M

**문제:** Home Requests "New"는 직접 Job·발행 견적을 제외한 정의인데 필터 없는 `/requests`로 이동한다. 점검 예정·연체는 해당 필터가 없는 `/schedule?view=list`로 간다. 견적 대표 숫자(승인 후 미전환)에 대응하는 목록 탭이 없다.

**결정:** 도메인마다 **탭 조건식을 한 곳에 정의**하고 목록 counts·필터와 Home 파이프라인이 같은 조건식을 쓴다. 조건이 하나뿐이면 숫자가 어긋날 수 없다.

- Requests 탭: `all | new | assessment_scheduled | assessment_overdue | in_review | quoted | closed`
  - `new` = 저장 상태 new, 보관·종료 아님, 연결 Job 없음, 발행된 견적 revision 없음, **진행 중 점검 Visit 없음**(점검 예약된 요청이 New와 점검 예정에 동시에 집계되던 문제 수정)
  - `assessment_scheduled` = 종료 아닌 요청 중 scheduled/in_progress 점검 Visit 존재
  - `assessment_overdue` = 위 Visit의 종료 시각(종일은 종료일)이 Sydney 오늘 기준 지남
- Quotes 탭에 `approved_unconverted`(승인 revision이 Job으로 전환되지 않음), `converted` 추가.
- Home 링크: New → `/requests?status=new`, 점검 → `/requests?status=assessment_scheduled|assessment_overdue`, 견적 대표 숫자 → `/quotes?status=approved_unconverted`.
- `getHomeSummary`에서 화면이 쓰지 않는 중복 집계(`counts.new_requests`, `counts.active_jobs`, `finance.pending_quotes`)를 제거한다. 사용처가 있으면 남기고 보고한다.

| 하위 작업 | 담당 | 쓰기 파일 |
| --- | --- | --- |
| P1-1a 요청 탭 | implementer | `lib/requests/service.ts`, `lib/requests/schemas.ts`, `lib/requests/tabs.ts`(신규), `tests/integration/clients-requests.test.ts` |
| P1-1b 견적 탭 | implementer | `lib/quotes/service.ts`(목록·파이프라인·`transitionQuote`의 요청 이벤트만), `lib/quotes/service-types.ts`, `tests/integration/quotes.test.ts` |
| P1-1c Home 집계·링크 | implementer → ui-ux | `lib/home/service.ts`, `tests/integration/home.test.ts` → `app/(ems)/home/page.tsx`, `app/(ems)/requests/page.tsx`, `components/requests/request-list.tsx`, `app/(ems)/quotes/page.tsx` |
| 갱신 범위 | 팀장 | `app/(ems)/quotes/actions.ts`(발행 시 `/requests`, `/home` 갱신) |

**Interfaces (Produces):**

```ts
// lib/requests/tabs.ts
export type RequestTab = 'all'|'new'|'assessment_scheduled'|'assessment_overdue'|'in_review'|'quoted'|'closed';
export function requestTabPredicates(todayParam: `$${number}`): Record<Exclude<RequestTab,'all'>, string>; // alias r 기준 SQL boolean 식
// lib/quotes/service-types.ts
export type QuoteTabKey = 'all' | QuoteStatus | 'approved_unconverted' | 'converted';
```

**완료 조건:**

- [ ] `listRequests({status})`가 위 7개 탭을 받고, `counts`의 각 값이 같은 조건식으로 계산된다.
- [ ] 견적 발행으로 요청이 quoted가 될 때 `recordActivity('request', requestId, 'status_changed', { from, to: 'quoted', cause: 'quote_issued', quoteId })`가 1건 기록된다.
- [ ] 테스트 `home link parity`: 아래 데이터를 만든 뒤 Home의 각 카드 값이 링크 대상 목록의 `counts[tab]`과 같다.
  - 직접 Job이 연결된 new 요청 1, 점검 Visit이 예약된 new 요청 1, 어제 끝난 종일 점검 1, Sydney 23:30에 끝나는 시각 점검 1
  - 발행 견적 1, 승인·미전환 1, 승인·전환 1
  - 완료·미청구 Job 1, 부분 수금 청구서 1(수금 1건 취소 포함), 만기 지난 청구서 1
  - 기대: `requests.new.count === listRequests({status:'new'}).counts.new`, 점검·견적·Job·청구 카드도 동일 형태로 전부 대조
- [ ] supervisor의 Home 응답에 `quotes`·`invoices` 키가 없다(기존 테스트 유지).

**의존:** P1-1a·P1-1b 병렬 → P1-1c. **동시 불가:** P1-1a와 P4-2·P4-4(같은 테스트 파일).

#### P1-2 Job 상태·방문 일관성 (U04, D5) · M

**결정 (D5 권장안 기준):**

1. `saveJob`은 기존 Job의 상태를 바꾸지 않는다. 편집 폼에서 상태 선택을 없애고 상태는 `changeJobStatus`·`reopenJob`으로만 바꾼다(편집 경로 우회와 "Job updated"로만 남던 기록 문제 해결).
2. `scheduled`/`unscheduled`는 유효 방문으로 계산되는 상태다. 수동 목표 상태는 `in_progress | completed | cancelled`만 허용한다.
3. Job 취소: 같은 트랜잭션에서 scheduled 방문을 cancelled로 바꾸고 방문마다 활동 1건(`cancelled_with_job`). in_progress 방문이 있으면 `JOB_HAS_ACTIVE_VISIT`로 거부.
4. 재개방: completed/cancelled에서 사유(1~2000자) 필수, 결과 상태는 유효 방문으로 재계산. 취소된 방문은 자동 복원하지 않는다. 방문도 같은 규칙의 `reopenVisit`.
5. 완료·미청구(유효 청구서 없음) Job 보관은 `JOB_REQUIRES_INVOICING`으로 거부. 보관된 견적 전환은 `QUOTE_ARCHIVED`로 거부.
6. 요청·작업·청구 수정 이벤트에 변경 필드명 `fields: string[]`을 기록한다(고객·비용과 같은 방식).

| 담당 | 쓰기 파일 |
| --- | --- |
| implementer (한 작업, schedule → jobs 순) | `lib/schedule/service.ts`, `lib/schedule/transitions.ts`, `lib/jobs/service.ts`, `lib/jobs/schemas.ts`, `lib/jobs/transitions.ts`, `lib/invoices/service.ts`(날짜 수정 이벤트만), `tests/schedule.test.ts`, `tests/job-transitions.test.ts`, `tests/integration/schedule.test.ts`, `tests/integration/jobs-invoices.test.ts` |
| ui-ux (implementer 병합 후) | `components/jobs/job-form.tsx`, `components/jobs/job-detail.tsx`, `app/(ems)/jobs/[id]/page.tsx`, `app/(ems)/schedule/[id]/page.tsx`, `components/schedule/event-form.tsx` — 재개방은 `components/ui/dialog.tsx`(현재 미사용)로 사유 입력 |
| 팀장 | `app/(ems)/jobs/actions.ts`, `app/(ems)/schedule/actions.ts`(`reopen*` 액션, `/home`·`/requests`·`/invoices/new` 갱신) |

**Interfaces (Produces):**

```ts
// lib/schedule/service.ts — 기존 비공개 updateJobSchedule(tx, jobId, status)(:17-23)를 바탕으로
// 유효 방문 유무로 scheduled/unscheduled를 정하는 함수를 export (in_progress/completed는 건드리지 않음)
export async function reconcileJobSchedule(tx: EmsTx, jobId: string): Promise<void>;
export async function reopenVisit(id: unknown, reason: unknown, meta: unknown): Promise<Result<Versioned>>;
// lib/jobs/service.ts
export async function reopenJob(id: unknown, reason: unknown, meta: unknown): Promise<Result<Versioned>>;
```

**완료 조건:**

- [ ] 방문 2건(scheduled)인 Job을 취소하면 두 방문이 cancelled, 활동 3건(Job 1 + 방문 2).
- [ ] in_progress 방문이 있는 Job 취소 → `JOB_HAS_ACTIVE_VISIT`, 아무것도 바뀌지 않음.
- [ ] 방문 없는 Job에 `changeJobStatus(..., 'scheduled')` → `INVALID_TRANSITION`.
- [ ] 완료 Job `reopenJob` 사유 없음 → `REASON_REQUIRED`. 사유 있음 + 유효 방문 1건 → `scheduled`, 활동 `reopened {reason, from:'completed'}`.
- [ ] supervisor `reopenJob` → `FORBIDDEN`. supervisor 전이 표(`tests/job-transitions.test.ts`)는 기존과 동일.
- [ ] 완료·미청구 Job 보관 → `JOB_REQUIRES_INVOICING`. 청구서 발행 후 보관 성공.
- [ ] 보관된 견적의 승인 revision 전환 → `QUOTE_ARCHIVED`. 새 초안 이후 이전 승인 revision 전환 계약(기존 테스트)은 유지.

**동시 불가:** P4-3(같은 파일), P2-1은 이 작업 뒤.

#### P1-3 근무기록 재시도 안전성·목록 상한 (U05, U14) · S

- `startTimer`와 일괄 `submit/approve/reject/reopen`을 `runCommand`로 감싼다. 일괄 처리 payload digest는 `{action, entries:[{id,version}] (id 정렬), reason}`.
- `deleteUnattachedReceipt`는 이미 지워진 파일이면 성공으로 처리한다.
- `listTimeEntries`: from/to가 비면 Sydney 이번 주(월~일), 최대 500행 + `truncated: boolean`.

| 담당 | 쓰기 파일 |
| --- | --- |
| implementer | `lib/timesheets/service.ts`, `lib/timesheets/schemas.ts`, `lib/expenses/receipts.ts`, `tests/integration/expenses-timesheets.test.ts` |
| 팀장 → ui-ux | `app/(ems)/timesheets/actions.ts`(meta 전달) → `components/timesheets/timer.tsx`, `components/timesheets/approval-list.tsx`(키 필드) |

**Interfaces (Produces):** `startTimer(jobId: unknown, meta: unknown)`, `submitTimesheet|approveTimesheet|rejectTimesheet|reopenTimesheet(ids: unknown, meta: unknown, reason?: unknown)` — 모두 `Promise<Result<…>>` 기존 반환형 유지.

**완료 조건:**

- [ ] 같은 키·같은 payload로 `startTimer` 2회 → 두 번 모두 같은 entry id, time_entries 1행, `timer_started` 활동 1건.
- [ ] 같은 키·다른 jobId → `COMMAND_CONFLICT`. 새 키로 열린 타이머가 있을 때 시작 → 기존 오류(`OVERLAPPING_TIME` 또는 `CONFLICT`) 유지.
- [ ] 3건 일괄 승인 재시도 → 같은 versions 배열, 활동 3건(6건 아님). 중간 항목 version 불일치 → 전체 롤백.
- [ ] 필터 없는 `listTimeEntries`는 이번 주 항목만 반환. 501행 → 500행 + `truncated: true`.
- [ ] 기존 "동시 시작 성공 1·실패 1" 테스트 유지.

#### P1-4 감사 기록·문서 잔액 정리 (U06, U07) · S

- `saveCompanySettings`: `recordActivity('organization', orgId, 'company_updated', { fields })`. **값은 기록하지 않고 필드명만**(은행 정보 보호).
- `savePricingSettings`: 빈 'saved' 대신 `{ fields }`(변경 키).
- 문서 잔액: 초안도 취소본처럼 **"DRAFT — not payable" 표시, 잔액 0.00, 송금 안내 제외**. 상세 화면의 규칙(`withBalance`, `lib/invoices/service.ts:128` — 발행본만 total−paid, 그 외 0.00)과 같은 규칙을 `lib/documents/project.ts`에 적용한다.
- 활동 요약: `fields`를 "Changed: title, notes"로 표시, `reopened`·`company_updated`·`cancelled_with_job` 문구 추가, 수금 이벤트를 `payment` 엔티티로 찾는 죽은 코드 정리(`lib/workflows/queries.ts:49-51`).

| 담당 | 쓰기 파일 |
| --- | --- |
| implementer | `lib/documents/project.ts`, `lib/workflows/queries.ts`, `lib/quotes/service.ts`(`savePricingSettings`만, P1-1b 병합 후), `tests/documents.test.ts`, `tests/integration/activity.test.ts` |
| 팀장 | `lib/settings/service.ts`, `tests/integration/workspace.test.ts` |
| ui-ux | `components/documents/customer-document.tsx`(DRAFT 표시) |

**완료 조건:**

- [ ] 초안 청구서 DTO: `balance === '0.00'`, 문서에 not payable 표시, 송금 안내 없음. 발행본은 기존 값 유지.
- [ ] 회사 정보에서 ABN·은행만 바꾸면 활동 `data.fields`가 `['abn','bankDetails']`이고 값 문자열이 data에 없다.
- [ ] supervisor `listActivity` → `[]` 유지.

#### P1-5 화면 흐름 결함 (U10) · M · ui-ux

- **원래 위치 복귀:** 생성 진입점이 `?returnTo=<현재 경로>`를 넘기고 각 폼 Cancel이 그 경로로 간다. `/`로 시작하고 `//`·`\`가 없는 내부 경로만 허용, 아니면 기존 목록.
- **저장 알림:** 견적·비용·근무 저장에 성공 알림 추가. 상태별로 맞는 문구(요청 보관 "Request archived", Job 상태 "Status updated", 수금 "Payment recorded" 등).
- **저장 충돌:** `href=""` 링크를 "Reload latest (unsaved changes will be lost)"로 바꾸고, 옆에 새 탭으로 최신본 열기를 둔다. 견적 편집기의 기존 안내는 유지.
- **미저장 경고:** dirty 상태에서 이동 시 `beforeunload` 경고. 견적 편집기, 상세 화면의 펼침 편집 폼(고객·요청·작업·직접 청구).
- **권한 없는 화면 통일:** `/settings`, 인쇄 페이지, 견적 new/edit/settings의 supervisor 접근을 같은 `EmptyState` 안내로. `app/(ems)/not-found.tsx` 추가.
- **로그인:** `useActionState`로 오류 시 이메일 유지(이메일을 URL에 넣지 않음), 제출 중 표시.
- **기타:** 사이드바·푸터 회사명을 조직명으로(`components/shell/app-shell.tsx:83,119`), 고객 상세 "New invoice"가 clientId를 넘김.

**쓰기 파일:** `components/ui/form.tsx`, `components/ui/return-to.ts`(신규, `safeReturnTo(value: string|undefined, fallback: string): string`), `components/ui/use-unsaved-warning.ts`(신규, `useUnsavedWarning(dirty: boolean): void`), 각 도메인 폼 컴포넌트, `components/shell/app-shell.tsx`, `app/(ems)/not-found.tsx`, `app/login/page.tsx`, 관련 page.tsx. 액션 반환값 변경이 필요하면 팀장에게 보고.

**완료 조건:**

- [ ] `safeReturnTo('//evil.com','/clients') === '/clients'`, `safeReturnTo('/jobs/1','/clients') === '/jobs/1'` 단위 테스트(test 담당).
- [ ] Job 상세 → Create → Client → Cancel 시 Job 상세로 돌아오고 포커스가 Create 버튼에 있다.
- [ ] gstack `/browse`로 390·768·1280px에서 위 흐름과 성공 알림·충돌 문구·미저장 경고를 실제 확인하고 스크린샷을 `docs/qa/`에 남긴다.

#### P1-6 접근성·현장 사용성 (U11) · S · ui-ux

- 주·월 일정 카드에 상태·유형 텍스트(보이는 짧은 라벨 또는 아이콘 + 접근 가능한 이름). 색은 보조.
- 인라인 오류가 없는 select(`job-form.tsx:24`, `request-form.tsx:24,26`, `event-form.tsx:23-26`, `expense-form.tsx:25`)에 오류 문구와 `aria-describedby` 연결.
- 현장 주요 행동(Start/Complete visit, Record time, 타이머)은 모바일에서 최소 44px. 토큰이 필요하면 팀장이 `DESIGN.md`에 추가.
- 홈 카드의 같은 href 중복 링크 정리.

**완료 조건:**

- [ ] 키보드만으로 일정 카드의 상태를 읽을 수 있다(스크린리더 이름에 상태 포함).
- [ ] 390px에서 현장 행동 버튼 높이 ≥ 44px(개발자 도구 측정 기록).

### Phase 2 — DB 무결성·보안 보강 (팀장, 마이그레이션 순차 작성)

T-001 초안(M1~M3, `docs/orchestration/results/T-001.md:760` 이후)을 출발점으로 하되 Phase 1의 최종 규칙에 맞춰 다시 쓴다.

#### P2-1 supervisor 상태 전이 DB 보호 (M3) · S

- 기존 `guard_supervisor_status` 트리거에 추가: 종료 상태(completed/cancelled)에서 변경 금지, 목표는 in_progress/completed만, 보관 Job 변경 금지, `completed_at`은 트리거가 설정.
- **의존:** P1-2 병합 후(서비스 규칙과 일치 확인).
- [ ] pgTAP: supervisor가 직접 SQL로 배정 Job을 cancelled로 바꾸면 실패, in_progress는 성공.

#### P2-2 감사·영수·비용 불변성 (M2 축소판) · S

- `activity_events`, `command_receipts`: authenticated의 UPDATE·DELETE 회수, admin 정책을 SELECT/INSERT로 분리.
- `expenses`: supervisor의 `own_expense FOR ALL`을 SELECT/INSERT/UPDATE로 분리(앱은 비용을 삭제하지 않고 보관만 한다). `attachments` 삭제는 보상 정리에 필요하므로 유지.
- supervisor용 활동 요약 테이블(M2 전체)은 설계 필수 범위가 아니므로 **보류**(Phase 6).
- [ ] pgTAP: admin 세션의 `delete from ems.activity_events` 실패, supervisor의 본인 expense DELETE 실패, 앱 통합 테스트 전체 통과.

#### P2-3 조회 인덱스 (M1) · S

- `payments(organization_id, invoice_id) where voided_at is null`, `quotes(organization_id, client_id)`, `quotes(organization_id, request_id)`, `invoices(organization_id, client_id)`, `visits(organization_id, job_id)`, `visits(organization_id, request_id)`, `expenses(organization_id, occurred_on desc)`.
- [ ] `db lint --local --schema ems` 오류 없음, Home·청구 목록 쿼리 `EXPLAIN`에 해당 인덱스 사용 기록.

#### P2-4 읽기 전용 일관 트랜잭션 (U09) · M

- 팀장: `withEmsReadTransaction<T>(work: (tx: EmsTx) => Promise<T>): Promise<T>` — `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, 나머지 claims·membership·timeout은 `withEmsTransaction`과 공유.
- implementer(도메인별, Phase 1 병합 후): `listClients`, `listRequests`, `listQuotes`, `listInvoices`, `listExpenses`, `getHomeSummary`를 읽기 트랜잭션으로 전환.
- [ ] `tests/integration/transaction.test.ts`(팀장): 읽기 트랜잭션 안 INSERT가 실패하고, 두 SELECT 사이 다른 세션 커밋이 보이지 않는다.

#### P2-5 pgTAP 공백 채우기·계약 문서 · S · 팀장

- 추가: Storage 객체 정책, time_entries 정책, `can_property`, `request_scope`, `org_admin_update`, supervisor의 quotes·invoices·payments 차단, P2-1·P2-2 항목.
- `supabase/ems-schema-contract.md`에 잔액 정의(발행본만 회수 대상), 저장 상태와 표시 탭의 구분, 읽기 트랜잭션 규칙 추가.
- [ ] `npx supabase --profile supabase/local-cli-profile.json test db` 전체 통과(통합 테스트와 동시에 실행하지 않음).

### Phase 3 — 운영 필수 기능 (출시 차단)

#### P3-1 직원·권한 관리 (U01, D4) · L

- **DB (팀장):** memberships에 admin 쓰기 정책 + 보호 트리거(본인 역할·활성 변경 금지, 마지막 활성 admin 제거 금지), `membership_events`(누가·언제·무엇을·사유) 테이블.
- **서버 전용 admin 클라이언트 (팀장):** `lib/supabase/admin.ts`(`server-only`, `SUPABASE_SECRET_KEY`), `lib/env.ts` 검증 추가. 이 클라이언트는 초대 함수 하나만 import한다(lint 규칙 또는 테스트로 고정).
- **서비스 (implementer):** `lib/staff/service.ts`

```ts
export async function listStaff(): Promise<Result<StaffMember[]>>; // admin 전용
export async function inviteStaff(input: unknown /* {email, displayName, role} */, meta: unknown): Promise<Result<StaffMember>>;
export async function changeStaffRole(userId: unknown, role: unknown, meta: unknown): Promise<Result<Versioned>>;
export async function setStaffActive(userId: unknown, active: unknown, reason: unknown, meta: unknown): Promise<Result<Versioned>>;
export type StaffMember = Versioned & { userId: string; displayName: string; email: string; role: Role; active: boolean; invitedAt: string | null };
```

- **화면 (ui-ux):** Settings → Team(목록·초대·역할 변경·비활성/재활성·이력), Settings 탭 분리(Company / Team).
- [ ] 초대 → Auth 초대 메일 발송 요청 + membership(active) 생성이 한 명령으로 처리, 같은 키 재시도 시 중복 초대·중복 membership 없음.
- [ ] 마지막 admin을 supervisor로 바꾸기·비활성화 → `LAST_ADMIN`. 본인 역할 변경 → `FORBIDDEN`.
- [ ] supervisor는 `listStaff` → `FORBIDDEN`(빈 목록으로 위장하지 않음).
- [ ] 비활성화된 사용자의 다음 요청이 즉시 거부된다(기존 `Exactly one active membership` 경로).

#### P3-2 인증 흐름·운영 Auth 설정 (U02, D6) · M

- 비밀번호 재설정: `/login/forgot`(재설정 메일 요청) → 메일 링크 → 확인 route handler(token_hash 검증) → `/account/password`(새 비밀번호). 초대 수락도 같은 확인 경로로 비밀번호 설정.
- 구현 직전 Supabase SSR 공식 문서와 `node_modules/next/dist/docs/`의 route handler 문서를 확인한다.
- 운영 설정 문서화(팀장): signup 비활성, 최소 비밀번호 길이(앱 검증과 일치), 이메일 확인, site_url·redirect 허용 목록, SMTP(D6), 세션 만료. MFA는 선택(D 항목으로 별도 확인).
- [ ] 존재하지 않는 이메일로 재설정 요청 → 같은 안내 문구(계정 존재 여부 비노출).
- [ ] 만료·재사용된 링크 → 다시 요청하는 안내.

#### P3-3 운영 최초 관리자 부트스트랩 (U01, D3) · S · 팀장

- `scripts/bootstrap-production.mjs`: 조직명·관리자 이메일을 받아 조직 1개와 첫 admin membership 생성. **조직이 이미 있으면 거부**, `--dry-run` 지원, 로컬 DB 대상이면 거부(실수 방지), 실행 기록을 출력.
- `scripts/local-db.mjs:71`의 없는 `.superpowers/` 폴더 쓰기 실패도 같이 고친다(새 worktree에서 setup 실패).
- [ ] 스테이징 프로젝트(P5-5)에서 1회 실행 → 로그인 → Settings → Team에서 supervisor 초대까지 성공.

### Phase 4 — 설계 §4 잔여 기능 (Phase 1 병합 후 병렬)

| ID | 기능 | 담당·쓰기 범위 | 완료 조건 (관측 가능) |
| --- | --- | --- | --- |
| P4-1 | 견적 만료 표시(발행 상태 + 유효기간 < Sydney 오늘 → 표시 상태 Expired, 탭 `expired`), 보관 확인 단계 + 복원(승인 revision 있으면 approved, 발행 이력 있으면 issued, 아니면 draft) | implementer `lib/quotes/service.ts`·`service-types.ts`·`tests/integration/quotes.test.ts` → ui-ux 견적 목록·상세·`status-actions.tsx` | 어제 만료된 발행 견적이 `expired` 탭에 1건, 저장 상태는 issued 유지. 복원 후 상태가 규칙대로 |
| P4-2 | 점검 일정 단일화: 요청 폼에서 `assessment_at` 입력 제거, 요청 상세에서 "Schedule assessment"(점검 Visit 생성), 기존 값은 "Legacy assessment time"으로 읽기 전용 표시, 점검 Visit 담당자 표시 | implementer `lib/requests/**`·`tests/integration/clients-requests.test.ts` → ui-ux 요청 폼·상세 | `readRequest` 방문에 `assignees: {userId, displayName}[]`. supervisor 응답에 금액 필드 없음. 컬럼 삭제·자동 Visit 생성 없음 |
| P4-3 | Job 담당자: 상세·목록에 방문 배정자 집계 표시 | implementer `lib/jobs/service.ts`·`tests/integration/jobs-invoices.test.ts` → ui-ux | 방문 2건에 같은 작업자가 배정되면 담당자 1명으로 표시. supervisor payload 테스트 |
| P4-4 | 고객 관련 업무 페이지네이션(견적·작업·청구·요청 각 25건 + 총건수), 목록 태그 칩, 정확 일치 태그 필터 | implementer `lib/clients/**`·`tests/integration/clients-requests.test.ts` → ui-ux 고객 목록·상세 | 작업 101건 고객의 2페이지에서 26~50번째 작업 접근. `tag=interior`가 `interior-old`를 포함하지 않음 |
| P4-5 | 비용 작성자 필터(admin), 분류 선택(기존 분류 목록), 상세 활동 피드 | implementer `lib/expenses/**`·`tests/integration/expenses-timesheets.test.ts` → ui-ux | supervisor가 `userId`에 타인 ID를 넣어도 본인 것만. 분류 목록은 보관 제외 distinct |
| P4-6 | 근무 작업자 필터(admin), 작업자별 주간 합계, 상태 필터를 Tabs로, 페이지 내 직접 SQL(`timesheets/page.tsx:25,27`)을 서비스로 이동 | implementer `lib/timesheets/**` → ui-ux `app/(ems)/timesheets/page.tsx`, `components/timesheets/*` | admin 주간 합계가 작업자별로 분리. P1-3과 동시 불가 |
| P4-7 | 방문 상세 활동 피드(이동·배정 변경 이력) | ui-ux `app/(ems)/schedule/[id]/page.tsx` (`listActivity('visit')` 기존 지원) | 시간 변경 후 피드에 변경 전후 시각 요약 |
| P4-8 | 검색 서비스화(`lib/search/service.ts`), 종류별 "See all" → 해당 목록 `?search=` | implementer(신규 `lib/search/**`, `tests/integration/search.test.ts` 신규 — OWNERSHIP 등록 필요) → ui-ux | supervisor 검색 결과에 견적·청구 그룹 없음. 11번째 결과는 See all 목록에서 보임 |
| P4-9 | 공용 컴포넌트 규칙 정리: 전용 Feedback 4종 → `FormFeedback`/`Notice`, raw 버튼 → `Button`, raw notice → `Notice`, 홈 헤더 → `PageHeader`, 필터 → `FilterBar` | ui-ux, 화면 단위로 나눠 순차 | 동작 변화 없음. 변경 화면을 390·1280px에서 재확인 |
| P4-10 | 일정 빠른 이동: 방문 카드 "Move"(날짜·시각만 바꾸는 작은 폼, 충돌 경고 유지). 드래그는 Phase 6 | ui-ux + 기존 `saveVisit` | 이동 후 Job 상태 재평가·활동 기록이 편집 폼과 동일 |

### Phase 5 — 출시 준비 (D1·D2·D6 확정 후 본격 진행)

| ID | 작업 | 담당 | 완료 조건 |
| --- | --- | --- | --- |
| P5-1 | DB 접속·환경 검증: 접속명 `ems_runtime` 외에 Supabase pooler 형식(`ems_runtime.<project_ref>`) 허용 여부를 공식 문서로 확인 후 반영, `instrumentation.ts`에서 시작 시 `getServerEnv()` 검증, `.env.example`에 `EMS_DATABASE_CA`(+P3-1의 `SUPABASE_SECRET_KEY`) | 팀장 | 잘못된 env로 서버 시작 시 즉시 실패, pooler DSN으로 스테이징 연결 성공 |
| P5-2 | 영수증 업로드 경로: 배포 플랫폼 본문 한도가 12MB 미만이면 서명된 업로드 URL로 Storage 직접 업로드 + 업로드 후 서버의 파일 서명·크기 재검사 + 고아 정리 | implementer `lib/expenses/receipts.ts` → ui-ux `receipt-upload.tsx` | 9MB PDF 업로드 성공, 위조 MIME 거부, 저장 실패 시 객체 삭제 |
| P5-3 | 보안 헤더: CSP(Next 16 문서의 nonce 방식 확인), HSTS, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy | 팀장 `next.config.ts`·`proxy.ts` | 브라우저 콘솔에 CSP 위반 0건으로 전 메뉴 순회 |
| P5-4 | 오류 기록: `instrumentation.ts`의 `onRequestError`로 구조화 로그(digest·경로·사용자 ID, 개인정보·금액 제외). 외부 서비스 도입은 의존성 승인 후 | 팀장 | 일부러 낸 서버 오류가 플랫폼 로그에서 digest로 검색됨 |
| P5-5 | 스테이징 리허설: 프로젝트 생성(D1) → 마이그레이션 적용(`create role ems_runtime`·Storage 버킷·정책의 hosted 동작 확인) → pgTAP → 부트스트랩(P3-3) → gstack `/qa`로 업무 흐름 12단계 재실행 → 백업/PITR 설정 확인 | 팀장 + test | 체크리스트 전 항목 통과, 실패 항목은 수정 후 재실행 기록 |
| P5-6 | 회귀 기준선 강화: 비식별 실제 견적 3건 이상을 **새 사례로 추가**(D8, 기존 기대값 불변), 출시 검사에서 `EMS_REQUIRE_PARITY=1`이면 `.local/operating-cases.json` 부재 시 skip 대신 실패, `AGENTS.md`·`TASK-TEMPLATE.md` 기준값을 실제 수치로 갱신 | 팀장 + test | 출시 검사 명령에서 skip 0, 견적 subtotal·total 전 사례 일치 |
| P5-7 | 남은 수동 검증: PDF A4 다중 페이지·머리말 반복, 영수증 파일 선택부터 저장까지(오류 후 파일 유지), 실제 200% 확대, 실제 휴대폰 터치 | ui-ux + test | 각 항목 결과와 스크린샷을 `docs/qa/verification-<날짜>.md`에 기록, 에뮬레이션과 실기기 구분 |
| P5-8 | 운영 문서: 배포·롤백, 백업 복구, 직원 온보딩·퇴사 처리, 장애 대응, worktree `.env.local` 복사본이 `setup` 후 끊기는 문제 안내 | 팀장 `README.md`·`docs/` | 새 담당자가 문서만으로 스테이징 배포 재현 |
| P5-9 | (D7이 "이관"일 때) Jobber 데이터 이관: 내보내기 → 변환 → dry run → 건수·금액 대조 → 적재. 실데이터는 저장소에 커밋하지 않음 | 팀장 + implementer | dry run 대조표에서 고객·현장 건수 일치, 금액 이관 시 합계 일치 |

### Phase 6 — 범위 확정이 필요한 확장 (D10)

출시 후 실제 사용 피드백으로 우선순위를 정한다. 각 항목은 설계 승인 범위 밖이므로 착수 전 짧은 설계 승인을 받는다.

- 복수 연락처·역할, 중복 고객 탐지·병합 (G14)
- 반복 작업·정기 방문 일정 (G15)
- 견적·청구 이메일/SMS 발송과 발송 이력, 고객 승인 포털·서명 (G16)
- 보증금·진행·분할 청구, 온라인 결제 연동
- supervisor용 안전한 활동 요약(M2 전체), 일정 드래그 앤 드롭, 견적 revision 비교(diff)

## 6. 실행 순서와 병렬 배치

같은 테스트 파일을 쓰는 작업은 동시에 배정하지 않는다(`OWNERSHIP.md`). main을 공유하는 `ui-ux`·`test`·팀장은 파일이 겹치면 순차.

| 웨이브 | implementer (worktree, 최대 3) | ui-ux / test (main) | 팀장 |
| --- | --- | --- | --- |
| W1 | P1-1a 요청 탭 · P1-1b 견적 탭 · P1-3 근무 | P1-5 중 홈·요청·견적 화면 외 부분(로그인, not-found, 회사명, 충돌 문구, 미저장 경고) | D1~D8 결정 요청, P2-3·P2-2 마이그레이션 |
| W2 | P1-1c Home · P1-2 Job/방문 · P1-4 문서·활동 | P1-1 탭 UI, P1-6 접근성 | W1 병합·통합 테스트 직렬 실행, P3-3 스크립트 |
| W3 | P2-4 도메인 전환(여러 도메인 목록을 건드리므로 다른 도메인 작업과 겹치지 않게 이 웨이브에 단독) · P3-1 직원 서비스(신규 `lib/staff/**`) | P1-2 재개방 UI, P3-1 Team 화면 | P2-1(M3), P2-4 공통 함수(선행), P2-5, P3-1 DB·admin 클라이언트, P3-2 |
| W4 | P4-1 견적 · P4-2 요청 · P4-3 Job (도메인·테스트 파일 서로 다름) | P4-7, P4-9, P4-10 | P5-1, P5-3, P5-4 |
| W5 | P4-4 고객 · P4-8 검색 · (P5-2 영수증, D2에 따라) | P4-1~P4-3 화면 | P5-5 스테이징 리허설, P5-6 |
| W6 | P4-5 비용 → P4-6 근무 (같은 묶음·테스트 파일이라 순차) | P5-7 수동 검증 | P5-8, (P5-9) |

**마일스톤**

| 마일스톤 | 포함 | 종료 기준 |
| --- | --- | --- |
| M-A 정합성 확보 | Phase 1, Phase 2 | 팀장 직렬 실행에서 단위+통합 전부 통과, pgTAP 통과, Home link parity 통과 |
| M-B 출시 가능 | Phase 3, Phase 5 | 스테이징 리허설 체크리스트 통과, 실제 견적 대조 skip 0, 남은 수동 검증 기록 |
| M-C 기능 완성 | Phase 4 | 설계 §4 완료 조건 표 전 항목 "완료" |

## 7. 작업별 공통 검증과 보고

- 구현자: Global Constraints의 단위 검증 명령 + 담당 테스트 작성. 통합 테스트는 작성만 한다.
- 팀장 병합 후: `npm run typecheck && npm run lint && npm run test:run`(통합 포함, 1회 직렬) + 필요 시 `next build`, pgTAP.
- UI 작업: gstack `/browse`·`/qa`로 390·768·1280px, 키보드·포커스, 빈·오류·로딩·충돌 상태 확인. 모바일 에뮬레이션과 실기기를 구분해 보고.
- 보고: `docs/orchestration/ORCHESTRATION.md`의 보고 요구(변경 파일, 실행·미실행 검증과 이유, 기존/신규 오류 구분, Codex는 커밋 해시).

## Self-Review

- **설계 대비:** 설계 §4의 10개 메뉴 완료 조건마다 2절 판정과 남은 작업 ID를 연결했다. §7 상태 모델(재개방 사유, 표시 상태 만료)은 P1-2·P4-1, §8 권한(직원 관리)은 P3-1, §11 이력·불변성은 P1-4·P2-2, §12 검증 기준(실제 견적 대조·출력·확대)은 P5-6·P5-7, §13 출시 결정은 4절 D1~D8에 있다.
- **이름 일관성:** `RequestTab`·`requestTabPredicates`(P1-1a)는 P1-1c에서, `reconcileJobSchedule`(P1-2)는 P4-10에서, `withEmsReadTransaction`(P2-4)은 도메인 전환에서 같은 이름으로 쓴다.
- **보류한 것:** M2의 supervisor 활동 요약 테이블, 일정 드래그, revision diff는 설계 필수가 아니어서 Phase 6으로 미뤘다.
- **미확인 사항:** Supabase pooler 접속명 형식, hosted 환경의 `create role` 동작, 배포 플랫폼 본문 한도는 공식 문서·스테이징에서 확인 전까지 추정이다(P5-1·P5-2·P5-5에서 확인).
