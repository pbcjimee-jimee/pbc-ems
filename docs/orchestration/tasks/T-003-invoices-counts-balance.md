# T-003: Invoices 목록 상태별 개수, void 잔액 계약, Home용 청구 파이프라인

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 다른 도메인을 수정 중이다)

## 배경
PBC EMS(Next.js 16 + Postgres, `ems` 스키마)는 Jobber를 대체하는 사내 업무 시스템이다.
팀장이 Invoices 목록 UI를 Jobber식 **상태 탭 + 개수 배지**로 바꿨다(`app/(ems)/invoices/page.tsx`).
UI는 `listInvoices()` 반환값의 `counts?: Record<string, number>`를 읽는다.
분석 보고서 `docs/orchestration/results/T-001.md` §3 B04, §4-1, §4-4, 작업 I를 참고하되 **아래 범위만** 구현한다.

## 요구사항
1. `listInvoices(input)` 반환에 `counts: Record<InvoiceTabKey, number>`를 **추가**(기존 필드 유지).
   - 키: `all, draft, issued, outstanding, overdue, unpaid, partial, paid, void` — 기존 status 필터 정의와 동일한 판정을 재사용.
   - 검색 조건은 적용하고 선택된 status 조건은 제외한다. 탭끼리 겹칠 수 있다(정상).
   - 단일 SQL로 계산(`count(*) filter (where ...)`), payment 합계 lateral 재사용.
2. **B04 잔액 계약 수정**: `listInvoices`와 `readInvoice`의 `balance`는 `status='issued'`일 때만 `total - 유효수금`,
   `draft`/`void`는 `"0.00"`. `paid`는 그대로. `paymentStatus`·`overdue` 판정이 바뀌지 않도록 확인
   (`lib/invoices/totals.ts`의 `invoicePaymentStatus` 동작과 기존 테스트 기대값을 먼저 읽을 것).
   기존 테스트가 void balance에 다른 값을 기대한다면 **수정하지 말고 보고**한다.
3. Home용 집계 함수 추가:
   `export async function readInvoicePipeline(tx: EmsTx, today: string): Promise<InvoicePipeline>`
   ```ts
   export type InvoicePipeline = {
     draft: { count: number };
     outstanding: { count: number; amount: string }; // issued, 잔액>0, 금액=잔액 합
     overdue: { count: number; amount: string };     // outstanding 중 due_on < today, 금액=잔액 합
   };
   ```
   - 호출자의 `tx` 사용, admin 아니면 `WorkflowError('FORBIDDEN', ...)`. 금액은 2자리 문자열.
4. 타입은 `lib/invoices/service.ts`(또는 신규 `lib/invoices/read-types.ts`)에서 export.
5. `tests/integration/jobs-invoices.test.ts`에 테스트 **추가**(기존 테스트 수정 금지):
   - 100.00 청구 발행 → 30.00, 20.00 수금 → 20.00 수금 취소 시 balance 70.00, outstanding amount 70.00
   - void 청구서 balance "0.00", total 유지, outstanding에서 제외
   - counts가 status 필터와 무관, 검색 시 감소
   - overdue 경계일(due_on = today는 overdue 아님)
   - supervisor의 `readInvoicePipeline` FORBIDDEN

## 담당 파일 (쓰기 허용)
- `lib/invoices/service.ts`
- `lib/invoices/schemas.ts`
- `lib/invoices/totals.ts`
- `lib/invoices/read-types.ts` (신규, 필요 시)
- `tests/integration/jobs-invoices.test.ts`

**이 목록에 없는 파일은 읽기만 가능하다.** `app/**`, `components/**`, `lib/documents/**`, `lib/jobs/**`, `lib/domain/**`,
`lib/workflows/**`, `lib/db/**`, `supabase/**`, 견적 계산 엔진은 수정 금지. 다른 파일 변경이 필요하면 보고.

## 완료 조건
- [ ] counts 키 9개가 정확히 위와 일치, status 필터와 무관
- [ ] draft/void balance가 "0.00"
- [ ] `readInvoicePipeline`이 admin에게 타입대로, supervisor에게 FORBIDDEN
- [ ] `npm run typecheck`, `npm run lint` 통과

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**테스트(vitest)는 실행하지 않는다.** 팀장이 일괄 실행한다.

## 범위 밖 (하지 말 것)
- UI, 마이그레이션(인덱스 포함 — 필요하면 SQL 초안만 보고), 의존성, 리팩터링
- `lib/home/**` 수정

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 실행하지 못한 검증과 이유 4) 기존/신규 오류 구분 5) 보류한 범위 밖 항목 6) 남은 제한
