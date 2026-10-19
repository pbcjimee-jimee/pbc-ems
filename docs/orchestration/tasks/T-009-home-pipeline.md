# T-009: Home 업무 파이프라인 통합 (견적·작업·청구 금액 집계)

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 requests·workflows를 수정 중)

## 배경
PBC EMS Home은 Jobber식 파이프라인 카드(Requests / Quotes / Jobs / Invoices)를 보여준다(`app/(ems)/home/page.tsx`, 팀장 소유).
도메인 집계 함수가 이미 구현되어 있다(모두 호출자 `tx`를 받음):
- `readQuotePipeline(tx)` — `lib/quotes/service.ts` (admin 전용, 아니면 FORBIDDEN)
- `readInvoicePipeline(tx, today)` — `lib/invoices/service.ts` (admin 전용)
- `readJobPipeline(tx)` — `lib/jobs/service.ts` (supervisor면 requiresInvoicing 키 없음)
- `readRequestPipeline(tx, today)` — `lib/requests/service.ts` (**T-008이 동시에 구현 중**. 이 작업에서는 import하지 않는다)
분석 보고서 `docs/orchestration/results/T-001.md` §4-4, 작업 H 참고.

## 요구사항
1. `getHomeSummary()` 반환에 **하위호환으로** `pipeline` 필드 추가(기존 `counts`, `finance`, `visits` 등 유지):
   ```ts
   pipeline: {
     jobs: JobPipeline;                        // readJobPipeline 결과
     quotes?: QuotePipeline;                   // admin만
     invoices?: InvoicePipeline;               // admin만
   }
   ```
   - 같은 `withEmsTransaction` 안에서 호출해 같은 시점 기준으로 집계한다. `today = sydneyToday()` 1회 계산 공유.
   - supervisor는 quotes/invoices 함수를 **호출하지 않고** 키도 넣지 않는다.
2. 기존 `finance.to_invoice`는 completed·미보관·non-void invoice 없음 기준이어야 한다(현재 `archived_at is null` 포함 여부 확인 후 `readJobPipeline`과 일치시킴).
   기존 `finance.overdue`/`outstanding` 의미가 `readInvoicePipeline`과 같은지 확인하고 다르면 보고만 한다(수정 금지).
3. 신규 `tests/integration/home.test.ts`:
   - admin: pipeline.quotes/invoices/jobs 존재, `pipeline.invoices.outstanding.amount`가 `listInvoices({status:'outstanding'})` 결과 balance 합과 일치
   - supervisor: pipeline에 quotes/invoices 키 없음, jobs.requiresInvoicing 없음
   - 테스트 작성 패턴은 `tests/integration/*.test.ts`와 `tests/helpers/**`(수정 금지)를 따른다. 보호 테이블은 `adminQuery`로 직접 UPDATE 금지, 서비스 함수 사용.

## 담당 파일 (쓰기 허용)
- `lib/home/service.ts`
- `tests/integration/home.test.ts` (신규)

**이 목록에 없는 파일은 읽기만 가능하다.** `app/**`, `components/**`, `lib/quotes/**`, `lib/invoices/**`, `lib/jobs/**`, `lib/requests/**`,
`lib/workflows/**`, `lib/domain/**`, `lib/db/**`, `supabase/**` 수정 금지.

## 완료 조건
- [ ] admin/supervisor별 pipeline 구조가 위와 일치
- [ ] 기존 반환 필드 하위호환
- [ ] `npm run typecheck`, `npm run lint` 통과 (Windows에서 `npm`이 막히면 `npm.cmd`)

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**vitest는 실행하지 않는다.** 팀장이 일괄 실행한다.

## 범위 밖
- UI, 마이그레이션, 도메인 집계 함수 수정, 리팩터링

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 미실행 검증과 이유 4) 기존/신규 오류 구분 5) 보류 항목 6) 남은 제한
