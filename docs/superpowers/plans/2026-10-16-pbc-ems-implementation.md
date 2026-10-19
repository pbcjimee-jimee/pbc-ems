# PBC EMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 요청한 10개 메뉴와 실제 PBC 견적 기능을 갖춘 독립 EMS를 구현하고 로컬 실동작·권한·금액을 검증한다.

**Execution record (2026-10-16):** 구현 및 로컬 통합 검증을 수행했다. 최종251개 테스트·SQL19개·production build와 실제 브라우저 업무 흐름 결과, PDF 저장/브라우저 파일 선택/실제200%확대의 환경 제한은 `docs/qa/verification-2026-10-16.md`에 기록했다. 아래 체크리스트는 승인 당시 작업 정의이며 현재 판정은 해당 검증 기록과 SDD ledger를 따른다.

**Architecture:** Next.js Node 서버와 별도 Supabase Auth/Postgres/비공개 Storage를 사용한다. 업무 데이터는 Data API 비노출 `ems` schema에 보관하고, 인증된 요청마다 RLS가 적용된 서버 트랜잭션으로 처리한다. 계산은 기존 TypeScript Decimal 엔진을 이식한다.

**Tech Stack:** Next.js 16.3.8, React 19, TypeScript strict, Supabase JS/SSR, decimal.js, zod, pg, Vitest. npm lockfile과 정확한 버전을 고정한다.

**Spec:** `docs/superpowers/specs/2026-10-16-pbc-ems-design.md` (2026-10-16 사용자 승인).

## Global Constraints

- 독립 EMS, Next.js + Supabase, 기존 견적 앱과 EMS 데이터 분리.
- 메뉴: Create, Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices, Expenses, Timesheets.
- 기존 견적 프로젝트·환경변수·운영 DB·Jobber 기록을 변경하지 않는다.
- 원본 commit `f4c97d5b1ae971150294f9b1b1e798c47cb2daa3`의 실제 계산 코드와 테스트를 기준으로 한다.
- 금액은 Decimal/DB numeric, 전송은 소수 문자열. native number로 금액을 합산하지 않는다.
- F3/F5의 materialActual, 영역별 실제 합계, Roof, Optional, signed Timber 차액, snapshot과 expectedVersion을 보존한다.
- 고객용 견적 행과 내부 계산을 분리하고, supervisor에게 계약금액·원가·다른 직원의 비용을 노출하지 않는다.
- 회사 한 개, admin/supervisor, AUD와 Australia/Sydney. payroll·카드결제·자동발송·일괄이관·배포는 포함하지 않는다.
- 기존 PBC 파랑 #0b66d8·본문 #0f2440과 Jobber의 익숙한 메뉴 순서를 사용한다. Jobber 코드를 제품에 포함하지 않는다.
- WCAG 2.2 AA, 한글/영문·긴 주소, 모바일·중간·데스크톱·확대·키보드·실패 상태를 검증한다.
- Git 저장소가 없는 현재 경로에서 작업한다. 별도 worktree·commit·push는 이 계획의 필수 작업이 아니다.
- 이번 계획 검토와 실행 방식 선택 후 구현을 시작한다. 원격 프로젝트 생성은 조직·비용 확인을 별도로 거친다.

## Review Focus

1. 사용자가 수정 가능한 사용자/회사 ID를 보내도 서버 검증 identity와 활성 membership으로 인가한다. Task 3의 타회사·자가승격·REST 우회 테스트로 고정한다.
2. 승인 후 가격·설정·고객 주소가 바뀌어도 기존 문서 금액과 내용은 보존한다. Task 5/6의 snapshot 테스트로 고정한다.
3. 재시도·동시 저장·중복 클릭은 전체 성공 또는 전체 취소이며 중복 문서를 만들지 않는다. Task 3/5/6의 transaction·version·idempotency 테스트로 고정한다.
4. 종일 일정·DST·자정·진행 중 타이머는 실제 현지 날짜와 시간을 보존한다. Task 7/8의 경계 테스트로 고정한다.
5. 긴 한글 현장명·빈 목록·오류·옵션 할인·여러 출력 페이지에서도 정보와 다음 행동을 잃지 않는다. Task 9/10의 실제 렌더링·출력 검증으로 고정한다.

## 공통 계약과 작업 순서

Task 1 → Task 2/3 → Task 4/5/6 → Task 7/8 → Task 9 → Task 10.
Task 2와 3은 파일 소유 범위를 나눠 병렬로 진행할 수 있다.
각 구현 작업은 관련 검증이 통과한 뒤 의존 작업으로 넘긴다. 같은 파일 편집은 순차로 한다.

```ts
type Result<T> = { ok: true; data: T } | {
  ok: false; error: { code: string; message: string; fields?: Record<string, string> }
}
type Role = 'admin' | 'supervisor'
type Money = string
type Versioned = { id: string; version: number }
type CommandMeta = { expectedVersion: number; idempotencyKey: string }
type EmsTx = { query<T>(sql: string, values?: readonly unknown[]): Promise<T[]> }
```

`Result/Role/Money/Versioned/CommandMeta`는 Task 1의 `lib/domain/types.ts`에서 제공한다.
`EmsTx`는 Task 3의 server-only 모듈 내부 계약이며 클라이언트로 내보내지 않는다.
모든 Server Action 입력은 unknown으로 받아 zod 검증 후 업무 서비스에 전달한다.
idempotency는 actor+작업종류+key와 canonical payload digest를 저장하며, 같은 key의 다른 입력은 거부한다.

### Task 1: 실행 기반·환경 검사·공통 UI 기반

**Files:** `package.json`, lockfile, tsconfig, next/eslint/vitest config, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/page.tsx`, `app/setup/page.tsx`, `app/globals.css`, `lib/env.ts`, `lib/domain/types.ts`, `components/ui/{button,field,dialog,status,empty-state}.tsx`, `tests/env.test.ts`.

**Consumes:** 승인 spec, PRODUCT.md, implementation-preflight.md. **Produces:** 위 공통 타입, `getServerEnv(env?: NodeJS.ProcessEnv): ServerEnv`, 환경 미구성 안내와 접근 가능한 UI primitive.

- [ ] 현재 설치 문서를 확인해 Node 22/Next 16의 async cookies·proxy 규칙을 적용하고, 원본과 격리된 package/lockfile을 작성·설치한다.
- [ ] 필요한 기본 의존성만 추가한다. pg/@types/pg는 원본 Decimal을 서버 transaction 안에서 실행하기 위한 추가 의존성이다.
- [ ] 환경 검증 테스트를 먼저 작성해 미구성 상태의 업무 접근이 막히는지 확인한다.
```ts
expect(() => getServerEnv({})).toThrow('EMS_NOT_CONFIGURED')
```
- [ ] 실제 구현은 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, 비공개 `EMS_DATABASE_URL`을 구분한다. `getServerEnv(env = process.env)`는 누락된 키 이름만 오류로 반환하고 값은 로그에 남기지 않는다.
- [ ] 미구성 앱은 setup 안내를 렌더링한다. 운영 데이터·저장 성공·로그인 사용자로 위장하는 fallback은 만들지 않는다.
- [ ] 기본 버튼·입력·모달에 이름, 오류 연결, focus-visible, Escape/포커스 복귀를 제공한다.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test:run -- tests/env.test.ts`, `npm run build`를 통과시킨다.

### Task 2: 실제 견적 엔진·옵션·상품·공개 금액 이식

**Files:** `lib/calculator.ts`, `lib/quote-labour.ts`, `lib/quote-calculation-totals.ts`, `lib/quote-paint-comparison.ts`, `lib/paint-comparison-types.ts`, `lib/public-line-money.ts`, `lib/quotes/{types,options,calculation,commercial-totals}.ts`, `lib/products/{types,dulux-paints}.ts`, `tests/quotes/*`, `docs/evidence/quote-port-manifest.json`.

**Consumes:** 원본 파일 맵. **Produces:** 원본 export를 보존한 계산 모듈, `calculateQuoteSnapshot(input, settings): QuoteCalculationSnapshot`, `calculateCommercialTotals(lines): CommercialTotals`. snapshot/합계의 금액은 문자열이다.

- [ ] 원본 계산·옵션·Timber 테스트를 새 경로로 이식하고 엔진 부재 상태의 실패를 확인한다. 과거 견적 fixture는 샘플임을 표시한다.
```ts
const totals = calculateAllFormulas({
  workingDays: 5, labourPerDay: 1, materialMarket: 342.5, materialActual: 245,
}, DEFAULT_PRICING_SETTINGS)
expect(totals[2].total.toFixed(2)).toBe('3635.71')
```
- [ ] 원본 순수 모듈을 복사하고 type-only UI 의존성을 `lib/quotes/types.ts`로 옮긴다. source 해시와 의도한 변경을 manifest에 기록한다.
- [ ] `MaterialItem`, `QuoteOptionItem`, `AreaFormulaSelections`, `PublicLineDraft`를 정의한다. PublicLineDraft는 kind/name/description/quantity/unitPrice/taxable/clientVisible/optional/selected를 보존한다.
- [ ] 영역 합계는 `areaBreakdown.finalSubtotal/finalTotal`, 영역 없는 과거 입력은 원본 서버 fallback을 따른다. 미배정 경고를 별도 결과에 담는다.
- [ ] 공개합계는 text·비공개 행과 미선택 Optional을 제외하고 signed Decimal로 계산한다. taxable 합계의 GST와 최종 합계를 cents 단위로 확정하며, 표시 전 반올림 위치를 테스트로 고정한다.
```ts
const included = lines.filter(x => x.kind === 'line_item'
  && x.clientVisible && (!x.optional || x.selected))
```
- [ ] Roof·서로 다른 행별 노무·같은 공식 선택·음수 Optional·Timber 반올림 차액·NaN/Infinity/범위 초과·빈 입력을 검사한다.
- [ ] `npm run test:run -- tests/quotes`와 typecheck를 통과시킨다. seed 상품을 실제 최신 가격으로 표시하지 않는다.

### Task 3: 인증·비노출 DB·RLS·원자 저장 어댑터

**Files:** `lib/supabase/{server,client,proxy}.ts`, `proxy.ts`, `lib/auth/{verify-user,permissions}.ts`, `lib/db/{transaction,sql-errors}.ts`, `supabase/config.toml`, CLI로 생성하는 `supabase/migrations/*_ems_core.sql`, `*_ems_runtime.sql`, `supabase/tests/ems_rls.test.sql`, `tests/helpers/{database,fixtures}.ts`, `tests/integration/transaction.test.ts`, `app/login/page.tsx`, `app/login/actions.ts`.

**Produces:** `verifyRequestUser(): Promise<{id:string}>`, `withEmsTransaction<T>(work:(tx:EmsTx)=>Promise<T>):Promise<T>`, `requireAdmin(tx):Promise<void>`; 테스트 전용 `resetFixtures()`, `asLocalUser(userId, work)`, `fixtures` (PBC/타회사 admin·supervisor, client/property/job ID). `asLocalUser`는 테스트 안에서만 verifyRequestUser를 mock하고 실제 로컬 제한 DB 역할/RLS를 사용한다. production에 identity 주입 API를 노출하지 않는다.

- [ ] 설치된 Docker Desktop을 숨김으로 시작하고 Linux engine readiness를 확인한다. Supabase CLI 도움말 확인 후 로컬 전용 프로젝트를 초기화한다. 원격 프로젝트에 연결하지 않는다.
- [ ] `supabase migration new ems_core`, `supabase migration new ems_runtime`으로 실제 파일명을 생성한다. ems schema는 Data API에 노출하지 않는다.
- [ ] organizations/memberships/clients/properties/requests/quotes/quote_revisions/quote_lines/quote_calculations/products/pricing_settings/quote_templates/jobs/job_contracts/visits/visit_assignments/invoices/invoice_lines/payments/expenses/time_entries/activity_events/attachments/command_receipts를 만든다.
- [ ] 회사 FK, numeric/check, version, 중복 변환 UNIQUE, 단일 열린 타이머 UNIQUE, 필요한 정렬/조회 인덱스와 RLS를 정의한다. jobs/visits에는 금액을 넣지 않고 job_contracts는 admin 전용으로 둔다.
```sql
create schema ems;
-- 모든 부모 참조는 같은 회사의 (organization_id, id)를 참조한다.
alter table ems.clients enable row level security;
```
- [ ] migration 관리자와 별도인 비소유자 runtime 로그인 역할을 만든다. NOSUPERUSER/NOBYPASSRLS/NOINHERIT/NOCREATEDB/NOCREATEROLE이며 authenticated로 SET ROLE할 권한만 부여한다.
- [ ] adapter는 고정 EMS 프로젝트의 getUser 검증 후 같은 client에서 BEGIN→LOCAL role/claims→활성 membership 검사→work→COMMIT한다. 호출자가 user/role/claims/pool을 주입하는 API는 만들지 않는다.
```ts
const user = await verifyRequestUser()
await client.query('BEGIN')
await client.query('SET LOCAL ROLE authenticated')
await client.query("select set_config('request.jwt.claims', $1, true)",
  [JSON.stringify({ sub: user.id, role: 'authenticated' })])
```
- [ ] server-only·Node runtime·TLS 검증·작은 pool·parameter SQL·고정 식별자·statement timeout을 적용한다. 예외는 rollback, rollback 실패 연결은 폐기한다. 외부 API는 transaction 안에서 호출하지 않는다.
- [ ] getClaims/getUser, SSR 쿠키와 응답 cache header, 비활성 membership, supervisor 배정/본인 기록, 역할 자가 변경 금지, Storage 비공개 정책을 구현한다.
- [ ] 테스트 전용 로컬 auth/회사/사용자 fixture를 만든다. production에 테스트 로그인·demo bypass를 추가하지 않는다.
- [ ] SQL RLS allow/deny, 직접 REST/RPC 우회, 중간 실패 전량 rollback, 다음 요청의 claims 초기화, 미인증 거부를 실제 로컬 DB에서 검증한다.
```ts
await expect(asLocalUser(fixtures.otherCompanyAdmin,
  () => withEmsTransaction(tx => tx.query(
    'select id from ems.clients where id = $1', [fixtures.pbcClientId])))).resolves.toEqual([])
```
- [ ] `npx supabase test db`, `npm run test:integration -- transaction`, typecheck를 통과시킨다.

### Task 4: Clients·Requests의 실제 CRUD와 연결

**Files:** `lib/clients/{schemas,service}.ts`, `lib/requests/{schemas,service}.ts`, `app/(ems)/clients/page.tsx`, `clients/[id]/page.tsx`, `clients/new/page.tsx`, `clients/actions.ts` (같은 app/(ems) 아래), 대응 requests 네 경로, `components/clients/{client-form,client-list,property-form}.tsx`, `components/requests/{request-form,request-list}.tsx`, `tests/integration/clients-requests.test.ts`.

**Produces:** `saveClient(input,meta):Promise<Result<Versioned>>`, `saveRequest(input,meta):Promise<Result<Versioned>>`, `readClient(id)`, 검색/상태/날짜·pagination 조회 DTO.

- [ ] 고객 하나·여러 현장, 청구 주소와 현장 주소 분리, 타회사 property ID 차단, 수정 충돌 테스트를 먼저 작성한다.
```ts
const result = await saveRequest({ clientId: fixtures.pbcClientId,
  propertyId: fixtures.otherCompanyPropertyId, title: 'Site inspection' }, meta)
expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_PROPERTY' } })
```
- [ ] zod 검증과 server transaction으로 저장·보관·이력을 구현한다. 업데이트는 version을 비교한다.
```sql
update ems.clients set version = version + 1, display_name = $1
where id = $2 and organization_id = $3 and version = $4 returning id, version
```
- [ ] 검색·필터·정렬은 allowlist, 상태는 request의 접수/점검/견적 연결 규칙을 따른다.
- [ ] 목록·생성·수정·상세·관련 업무 링크·현장점검 Schedule 진입을 구현하고 실패 시 입력을 유지한다.
- [ ] integration 테스트와 실제 브라우저에서 고객→현장→요청의 저장·새로고침·편집·보관을 확인한다.

### Task 5: Quotes 저장·승인·템플릿·편집 화면

**Files:** `lib/quotes/{schemas,service,snapshots,templates}.ts`, `app/(ems)/quotes/page.tsx`, `quotes/new/page.tsx`, `quotes/[id]/page.tsx`, `quotes/[id]/edit/page.tsx`, `quotes/actions.ts` (같은 app/(ems) 아래), `components/quotes/{quote-editor,materials,formula-selection,options,timber-comparison,public-lines,summary,settings}.tsx`, `tests/helpers/quotes.ts`, `tests/integration/quotes.test.ts`.

**Produces:** `saveQuote(input,meta):Promise<Result<Versioned>>`, `transitionQuote(id,next,meta):Promise<Result<Versioned>>`, `getQuoteEditor(id)`, 확정 QuoteRevision DTO.

테스트 helper `approveFixtureQuote():Promise<{id:string;total:Money}>`, `changeFixtureProductPrice(price:Money):Promise<void>`, `getApprovedRevision(id):Promise<{total:Money}>`도 이 작업에서 작성한다. fixture setup은 로컬 migration 관리자 연결에서만 실행하며 앱의 인가 우회 경로로 제공하지 않는다.

- [ ] 동시 expectedVersion, 가격표 변경 후 편집, 승인 revision 불변, 내부/공개 금액 차이, 미선택 옵션 제외, 실패 rollback 테스트를 작성한다.
```ts
const approved = await approveFixtureQuote()
await changeFixtureProductPrice('999.99')
expect((await getApprovedRevision(approved.id)).total).toBe(approved.total)
```
- [ ] transaction에서 현재 설정/가격 또는 기존 snapshot을 읽고 부모 행을 잠근 후 Task 2 엔진으로 재계산한다. revision·계산·공개 행·이력·command receipt를 함께 저장한다.
```sql
select id, version from ems.quotes where id = $1 for update
```
- [ ] 고객/현장·Interior/Exterior/Roof·상품/직접 입력·행별 노무·공식 선택·일반 옵션·Timber·고객용 Product/Service·내부 메모를 편집할 수 있게 한다.
- [ ] Quotes 내부에서 단가·상품·템플릿을 관리하고 미배정 행/공개 차액/미저장/충돌을 표시한다. 승인 문서 수정은 새 revision으로 처리한다.
- [ ] 목록·검색·상태·복제·발행/승인/변경요청/거절 기록과 다음 Job 전환을 연결한다.
- [ ] 기존 계산 회귀+integration 테스트를 통과시키고 실제 화면에서 저장·재열기·옵션 전환·템플릿 적용을 확인한다.

### Task 6: Jobs·Invoices·수금의 금액 보존

**Files:** `lib/jobs/{schemas,service}.ts`, `lib/invoices/{schemas,service,totals}.ts`, `app/(ems)/jobs/page.tsx`, `jobs/new/page.tsx`, `jobs/[id]/page.tsx`, `jobs/actions.ts` 및 대응 invoices 네 경로, `components/jobs/{job-form,job-list,job-detail}.tsx`, `components/invoices/{invoice-form,invoice-list,payment-form}.tsx`, `tests/integration/jobs-invoices.test.ts`.

**Produces:** `convertQuoteToJob(quoteId,meta)`, `saveJob(input,meta)`, `createInvoiceFromJob(jobId,meta)`, `issueInvoice(id,meta)`, `recordPayment(input,meta)` (모두 Promise<Result<Versioned>>), `invoiceBalance(invoice,payments):Money`.

- [ ] 동일 승인 revision의 동시 변환·재시도, 동일 작업의 전액 중복 청구, 부분 수금/연체, snapshot 금액·주소 불변, supervisor 금융 DTO 미포함을 테스트한다.
```ts
const results = await Promise.all([convertQuoteToJob(id, meta), convertQuoteToJob(id, meta)])
expect(new Set(results.filter(x => x.ok).map(x => x.data.id)).size).toBe(1)
```
- [ ] 승인 QuoteRevision→jobs + admin-only job_contracts를 같은 transaction에서 만든다. 직접 Job 생성은 명시적인 범위·고객용 행을 확정한다.
- [ ] Invoice는 확정 job_contracts에서 행·주소·문구·세금을 복사한다. job lock과 유효 전액 청구 UNIQUE로 중복 청구를 막는다.
```ts
const balance = new Decimal(invoice.total).sub(
  payments.filter(p => !p.voided).reduce((sum, p) => sum.add(p.amount), new Decimal(0)))
```
- [ ] 수금은 실제 입금의 기록으로 처리하고 금액·일자·방법·취소 이력을 저장한다. 외부 결제 실행은 연결하지 않는다.
- [ ] Job 범위·상태·여러 방문·연결 문서·비용/근무와 Invoice 작성·발행·잔액·연체 화면을 구현한다.
- [ ] integration 테스트와 실제 Quote→Job→Invoice→부분/완료 수금 흐름을 검증한다.

### Task 7: Schedule과 현장 방문

**Files:** `lib/schedule/{types,dates,schemas,service}.ts`, `app/(ems)/schedule/page.tsx`, `app/(ems)/schedule/actions.ts`, `components/schedule/{calendar,event-form,unscheduled,filters}.tsx`, `tests/schedule.test.ts`, `tests/integration/schedule.test.ts`.

**Produces:** `resolveSydneyDateTime(date,time,disambiguation?)`, `saveVisit(input,meta):Promise<Result<Versioned>>`, `querySchedule(range,filters)`. disambiguation은 earlier/later이고 없으면 애매한 시각을 거부한다.

- [ ] Sydney DST·자정·종일·여러 날·미배정·중복 인원 경고 테스트를 먼저 작성한다.
```ts
expect(resolveSydneyDateTime('2026-10-04', '02:30')).toMatchObject({
  ok: false, error: { code: 'NONEXISTENT_LOCAL_TIME' },
})
```
- [ ] Intl의 IANA timezone 검증을 사용한다. 시각 일정은 ISO offset+timestamptz, 종일 일정은 date 범위로 보관한다.
- [ ] Visit/점검/일반 일정과 인원 배정을 저장하고 충돌 경고를 반환한다. 일정 이동이 진행/완료 작업 상태를 초기화하지 않게 한다.
```sql
select id from ems.visits where starts_at < $2 and ends_at > $1
```
- [ ] 월/주/일/목록, 날짜 이동, 작업자 필터, 미배정 목록과 모바일 일자 중심 보기를 구현한다.
- [ ] 드래그 없이 키보드/폼으로도 날짜·인원을 수정할 수 있게 한다. 브라우저 시간대와 회사 시간대가 달라도 같은 방문을 표시한다.
- [ ] unit/integration 테스트와 실제 방문 생성·이동·배정·완료·새로고침을 확인한다.

### Task 8: Expenses·Timesheets·영수증·타이머

**Files:** `lib/expenses/{schemas,service,receipts}.ts`, `lib/timesheets/{schemas,service,duration}.ts`, `app/(ems)/expenses/page.tsx`, `expenses/actions.ts`, `app/(ems)/timesheets/page.tsx`, `timesheets/actions.ts`, `components/expenses/{expense-form,expense-list,receipt-upload}.tsx`, `components/timesheets/{time-form,weekly-grid,timer,approval-list}.tsx`, `tests/helpers/time.ts`, `tests/integration/expenses-timesheets.test.ts`.

**Produces:** `saveExpense(input,meta)`, `saveTimeEntry(input,meta)`, `startTimer(jobId)`, `stopTimer(entryId,meta)`, `submitTimesheet(ids)`, `approveTimesheet(ids)` (Promise<Result>), `durationMinutes(start,end,breakMinutes):number`.

테스트 helper `countOpenTimers(userId):Promise<number>`는 tests/helpers/time.ts에서 로컬 fixture DB만 조회한다. 공통 Result의 data를 생략하지 않고 해당 명령의 Versioned 또는 처리한 Versioned[]를 명시한다.

- [ ] 타인 영수증 접근·타회사 작업 연결·중복 타이머 동시 요청·음수/겹친 시간·휴게 초과·승인 후 수정 거부를 테스트한다.
```ts
await Promise.allSettled([startTimer(jobId), startTimer(jobId)])
expect(await countOpenTimers(fixtures.supervisorId)).toBe(1)
```
- [ ] Expense 금액은 Decimal, 근무시간은 실제 elapsed minutes로 계산한다. 견적 인일을 임의로 8시간으로 변환하지 않는다.
- [ ] worker별 transaction advisory lock + 열린 타이머 UNIQUE + 겹친 범위 조회로 동시 입력을 보호한다.
```sql
select pg_advisory_xact_lock(hashtextextended($1, 0))
```
- [ ] 타이머는 서버 시작시각을 저장해 재접속 후 복원한다. 제출/승인/반려/재개방과 이력을 구현한다.
- [ ] 영수증은 비공개 Storage에 크기/형식 제한·소유자/회사 경로·인가를 적용한다. 업로드·저장 실패를 구분하고 고아 파일을 정리한다.
- [ ] 비용 목록/입력/필터/합계와 근무 일/주·개인/관리자 승인 화면을 구현한다.
- [ ] integration 테스트, 실제 타이머 재접속·휴게·수동 시간·영수증·승인 흐름을 검증한다.

### Task 9: Home·Create·공통 탐색·고객 문서 출력

**Files:** `components/shell/{app-shell,sidebar,header,quick-create,mobile-nav}.tsx`, `app/(ems)/layout.tsx`, `app/(ems)/home/page.tsx`, `lib/home/service.ts`, `lib/documents/{quote,invoice}.ts`, `app/(ems)/quotes/[id]/print/page.tsx`, 대응 invoices print 경로, `app/print.css`, `tests/documents.test.ts`, `tests/integration/home.test.ts`.

**Produces:** `getHomeSummary(filters)`, `getQuoteDocument(id)`, `getInvoiceDocument(id)`; 문서 DTO는 고객용 명시 필드만 포함한다.

- [ ] 집계와 실제 필터 목록 일치, 고객 문서 내부 금액/메모 제외, Optional/세금/총액 보존 테스트를 작성한다.
```ts
const document = await getQuoteDocument(approvedQuoteId)
expect(JSON.stringify(document)).not.toMatch(/actualPrice|materialActual|internalMemo/)
```
- [ ] 10개 메뉴를 연결하고 Create에서 고객/요청/견적/작업/청구 생성으로 이동한다. 검색은 권한 있는 고객/업무 범위만 조회한다.
- [ ] Home에 오늘 방문·요청·견적·작업·청구 필요·미수/연체를 실제 조회에서 집계한다. 임의 숫자·실제처럼 보이는 샘플을 넣지 않는다.
- [ ] admin/supervisor 탐색·개인 설정·회사 설정을 연결한다. 회사 법인/ABN/은행 정보는 입력된 실제 값만 출력한다.
- [ ] 출력은 승인 revision/발행 snapshot의 allowlist DTO로 만들고 print CSS·페이지 나눔·Optional·총액·조건을 구현한다.
```ts
return { number: revision.number, client: revision.clientSnapshot,
  lines: revision.publicLines, totals: revision.commercialTotals, terms: revision.terms }
```
- [ ] 인쇄 버튼은 브라우저 print dialog/PDF 저장을 사용한다. 실제 이메일/SMS나 공개 고객 포털을 추가하지 않는다.
- [ ] Home integration, 문서 unit 테스트와 다페이지 견적·청구의 실제 print preview를 확인한다.

### Task 10: 전체 업무·권한·반응형 검증과 사용 안내

**Files:** `README.md`, `docs/verification.md`, `docs/operations.md`, `DESIGN.md`, 실제 결함이 있는 해당 모듈, `.impeccable/review/*`.

**Consumes:** Tasks 1–9. **Produces:** 실행 가능한 앱, 검증 기록, 연결/출시 준비 사항과 알려진 제한.

- [ ] `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run test:integration`, `npx supabase test db`, `npm run build`를 실행한다. 실패 원인을 수정하고 영향받은 검사만 다시 수행한다.
- [ ] 로컬 auth 사용자로 관리자와 supervisor를 실제 로그인해 고객→요청→견적→Job→방문→Invoice→수금, 비용·영수증·근무·승인을 확인한다.
- [ ] 권한 거부·입력 유실·version 충돌·다른 작업 접근·새로고침·다중 클릭·빈 목록을 확인한다. setup notice만 보인 상태를 업무 UI 검증으로 간주하지 않는다.
- [ ] 데스크톱 1440, 중간 1024, 모바일 390 폭과 실제 사용자 뷰포트, 200% 확대를 묶어 확인한다. 키보드/포커스/대비/한글/긴주소/터치 emulation을 검사하고 실제 기기 검증과 구분한다.
- [ ] 스크린샷을 저장·직접 확인하고 결함을 한 번에 수정한 뒤 영향 화면을 재확인한다. Impeccable detector는 완성 UI에 한 번 실행하고 기능·접근성 결함과 취향 경고를 구분한다.
- [ ] 고객 출력에서 내부정보가 없는지와 실제 합계를 다시 대조한다. 실제 확정 견적 대조 자료가 없으면 운영 검증 미완료로 기록한다.
- [ ] 실행/로컬 DB/환경변수 이름/초기 관리자/검증 명령/백업·복구/별도 Supabase 연결 절차를 문서화한다. 값·비밀·기존 앱 연결은 복사하지 않는다.
- [ ] 새 원격 Supabase는 조직 선택→get_cost→비용 확인 후 생성하며, 실제 회사정보·최신 가격·초기 관리자·이관·발송·배포는 구체적인 대상이 정해질 때 진행한다.
- [ ] 최종 보고는 구현 범위, 실제 통과한 검사, 확인한 화면·폭·입력, 미실행 검증, 별도 연결/출시 제한을 명시한다.

## Self-Review

- [x] 승인 spec의 10개 메뉴는 Tasks 4–9, 계산 계약은 Task 2/5, 권한·transaction은 Task 3, 운영 검증은 Task 10에 배정했다.
- [x] Review Focus 다섯 항목에 각각 소유 task와 의미 있는 테스트가 있다.
- [x] 실제 고객 문서와 내부 계산, jobs와 job_contracts, 예상 인일과 실제 근무를 분리했다.
- [x] quote 저장→승인→Job→Invoice의 snapshot·version·중복 방지를 포함했다.
- [x] 미확정 원격 프로젝트/실데이터/발송·출시를 완료된 것으로 표현하지 않는다.
- [x] 역사 fixture가 실제 자료라는 잘못된 전제를 제거했다.
- [x] 제품 scaffold·설치·DB 변경을 실행하지 않은 계획임을 확인했다.

## Execution Handoff

사용자가 이 계획을 검토하고 실행 방식을 선택한 후 구현을 시작한다.
권장 방식은 역할별 서브에이전트 실행이다. 계산·DB·UI의 파일 경계를 나누고,
금액·권한·업무 연결은 analyst가 검토하며 구현·테스트는 implementer가 맡는다.
주 에이전트는 결과를 통합하고 승인 범위 안에서 전체 검증까지 이어간다.

