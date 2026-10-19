# T-006: Jobs 목록 개수, 작업 상태 전이 검증, Home용 작업 파이프라인

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 clients·expenses 도메인을 수정 중)

## 배경
PBC EMS는 Jobber를 대체하는 사내 업무 시스템이다. 팀장이 Jobs 목록 UI를 상태 탭 + 개수 배지로 바꿨다
(`app/(ems)/jobs/page.tsx`가 `listJobs()`의 `counts?`를 읽음). 분석 보고서 `docs/orchestration/results/T-001.md`
§3 **B01(Job 부분)**, §4-1, §4-4, 작업 J 참고. **M3 마이그레이션은 범위 밖**, 서비스 검증만 구현.
방문 전이 검증은 T-004에서 `lib/schedule/transitions.ts`에 구현됨(패턴 참고, 수정 금지).
청구 잔액 계약(T-003): 청구 필요 = `completed`·미보관·non-void invoice 없음.

## 요구사항
1. `listJobs(input)` 반환에 `counts` 추가(기존 필드 유지). 키:
   `all, active, unscheduled, scheduled, in_progress, completed, cancelled` + **admin일 때만** `requires_invoicing`.
   검색·archive 조건은 적용, status 조건은 제외. 단일 SQL. supervisor 응답에는 `requires_invoicing` 키 자체가 없어야 한다.
2. 신규 `lib/jobs/transitions.ts`: `assertJobTransition({ role, from, to, archived }): void`
   (`WorkflowError('INVALID_TRANSITION', 사람이 읽을 메시지)`):
   - 같은 상태 → 허용(no-op)
   - supervisor: 보관된 Job 변경 금지. 비종료(`unscheduled|scheduled|in_progress`) → `in_progress|completed`만 허용.
     `completed|cancelled`에서 다른 상태로 금지, `cancelled`로 변경 금지.
   - admin: 모두 허용.
3. `changeJobStatus`가 현재 status·archived_at을 `for update`로 읽고 검증. `saveJob` 편집 경로에서 status가 바뀌면 동일 검증.
   검증 실패는 `{ok:false, error:{code:'INVALID_TRANSITION', message}}`로 반환(예외 누출 금지).
4. Home용 집계: `export async function readJobPipeline(tx: EmsTx): Promise<JobPipeline>`
   ```ts
   export type JobPipeline = {
     active: { count: number };        // 미보관, status not in (completed,cancelled)
     inProgress: { count: number };    // 미보관, in_progress
     requiresInvoicing?: { count: number; amount: string; missingAmountCount: number }; // admin만. amount=job_contracts.total 합, 계약 없는 job 수는 missingAmountCount
   };
   ```
   호출자의 `tx` 사용. supervisor면 `requiresInvoicing` 키를 넣지 않고 job_contracts/invoices를 조회하지 않는다.
5. 테스트 추가(기존 수정 금지): `tests/integration/jobs-invoices.test.ts`
   - counts가 status 필터와 무관, supervisor 응답에 requires_invoicing 없음
   - 청구 초안 생성 시 requires_invoicing에서 빠지고 그 청구서 void 시 다시 포함
   - supervisor: completed → in_progress 거부, cancelled 지정 거부, 보관 Job 변경 거부, scheduled → completed 허용
   - DB 보호 테이블을 `adminQuery`로 직접 UPDATE 하지 말 것(raw 연결은 supervisor 가드 트리거에 막힘). 서비스 함수 사용.
   - `tests/` 아래 순수 단위 테스트 파일 `tests/job-transitions.test.ts`(신규)에 전이 표 테스트

## 담당 파일 (쓰기 허용)
- `lib/jobs/service.ts`
- `lib/jobs/schemas.ts`
- `lib/jobs/transitions.ts` (신규)
- `tests/integration/jobs-invoices.test.ts`
- `tests/job-transitions.test.ts` (신규)

**이 목록에 없는 파일은 읽기만 가능하다.** `app/**`, `components/**`, `lib/invoices/**`, `lib/schedule/**`, `lib/clients/**`,
`lib/domain/**`, `lib/workflows/**`, `lib/db/**`, `supabase/**` 수정 금지.

## 완료 조건
- [ ] counts 키가 위와 일치, supervisor에 requires_invoicing 없음
- [ ] supervisor 금지 전이가 INVALID_TRANSITION 결과로 반환
- [ ] readJobPipeline 타입대로 반환
- [ ] `npm run typecheck`, `npm run lint` 통과 (Windows에서 `npm`이 막히면 `npm.cmd`)

## 검증 명령
```bash
npm run typecheck
npm run lint
npx vitest run tests/job-transitions.test.ts
```
DB가 필요한 통합 테스트는 실행하지 않는다(팀장이 일괄 실행). 순수 단위 테스트 1개만 실행 가능.

## 범위 밖
- UI, 마이그레이션, 재개방 사유 입력, 의존성, 리팩터링

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 미실행 검증과 이유 4) 기존/신규 오류 구분 5) 보류 항목 6) 남은 제한
