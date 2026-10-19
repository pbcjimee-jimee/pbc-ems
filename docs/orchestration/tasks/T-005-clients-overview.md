# T-005: Clients 목록 개수와 고객 상세의 미수금·견적·청구서 요약

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 jobs·expenses 도메인을 수정 중)

## 배경
PBC EMS는 Jobber를 대체하는 사내 업무 시스템(Next.js 16 + Postgres `ems` 스키마)이다.
팀장이 Clients UI를 Jobber식으로 바꿨다: 목록은 Active/Archived/All 탭 + 개수 배지,
상세는 오른쪽 사이드바(연락처·청구 요약)와 연결 업무 카드. UI는 `listClients()`의 `counts?`를 읽는다.
분석 보고서 `docs/orchestration/results/T-001.md` §4-3, 작업 C 참고. **아래 축소 범위만** 구현한다.
청구 잔액 계약(T-003 완료): 회수 대상 잔액은 `status='issued'`인 청구서의 `total - 유효수금(voided_at is null)`만. draft/void는 0.

## 요구사항
1. `listClients(input)` 반환에 `counts: { active: number; archived: number; all: number }` 추가(기존 필드 유지).
   검색 조건은 적용, archive 조건은 제외. 단일 SQL `count(*) filter`.
2. `readClient(id)`의 `ClientDetail`을 **하위호환 확장**:
   ```ts
   quotes?: { id: string; number: string; title: string; status: string; total: string }[];   // admin만, 최근 updated 순 최대 20
   invoices?: { id: string; number: string; title: string; status: string; dueOn: string|null; total: string; balance: string; overdue: boolean }[]; // admin만, 최대 20
   receivables?: { outstandingCount: number; outstandingAmount: string; overdueCount: number; overdueAmount: string }; // admin만
   jobs: { id: string; title: string; status: string; number: string }[]; // 기존 jobs에 number 추가
   ```
   - supervisor에게는 `quotes`/`invoices`/`receivables` 키 자체를 넣지 않는다(금액 비노출).
   - 견적 total은 현재 revision total. 청구서 balance는 위 잔액 계약, overdue는 issued·잔액>0·`due_on < Sydney today`(`sydneyToday()` from `lib/domain/format`).
   - 수금 합계는 청구서별 lateral/서브쿼리로 집계해 JOIN 중복 합산이 없게 한다.
3. 고객·현장 수정 시 `recordActivity`의 data에 변경 필드명 목록 `{ changed: string[] }`을 남긴다(값은 넣지 않음). 기존 호출 형태 유지.
4. `tests/integration/clients-requests.test.ts`에 테스트 **추가**(기존 수정 금지):
   - counts가 archive 필터와 무관, 검색 시 감소
   - 고객의 발행 청구서 2건(하나 void) → receivables에 void 제외, 부분 수금 반영
   - supervisor의 readClient 결과에 quotes/invoices/receivables 키가 없음
   - 테스트에서 jobs/visits 등 RLS·트리거 보호 테이블은 `adminQuery`로 직접 UPDATE 하지 말고 서비스 함수를 쓸 것
     (raw 연결은 `auth.uid()`가 없어 supervisor 가드 트리거에 막힌다).

## 담당 파일 (쓰기 허용)
- `lib/clients/service.ts`
- `lib/clients/schemas.ts`
- `tests/integration/clients-requests.test.ts`

**이 목록에 없는 파일은 읽기만 가능하다.** `app/**`, `components/**`, `lib/invoices/**`, `lib/jobs/**`, `lib/requests/**`,
`lib/domain/**`, `lib/workflows/**`, `lib/db/**`, `supabase/**` 수정 금지.

## 완료 조건
- [ ] counts 3개 키, archive 필터와 무관
- [ ] admin readClient에 quotes/invoices/receivables, supervisor에는 해당 키 없음
- [ ] void 청구서가 receivables에서 제외
- [ ] `npm run typecheck`, `npm run lint` 통과 (Windows에서 `npm`이 막히면 `npm.cmd`)

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**vitest는 실행하지 않는다.** 팀장이 일괄 실행한다.

## 범위 밖
- UI, 마이그레이션, 의존성, 활동 타임라인 조회, 리팩터링

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 미실행 검증과 이유 4) 기존/신규 오류 구분 5) 보류 항목 6) 남은 제한
