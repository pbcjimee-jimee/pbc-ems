# T-007: Expenses 목록 페이지네이션·개수와 상세 직접 조회

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 clients·jobs 도메인을 수정 중)

## 배경
PBC EMS는 Jobber를 대체하는 사내 업무 시스템이다. 팀장이 Expenses 목록을 Active/Archived/All 탭 + 표로 바꿨다
(`app/(ems)/expenses/page.tsx`가 `listExpenses()`의 `counts?`를 읽음). 분석 보고서 `docs/orchestration/results/T-001.md`
§3 **B05**, 작업 E 참고. 현재 `listExpenses`는 LIMIT이 없고 `readExpense(id)`는 전체 목록을 읽어 메모리에서 찾는다.

## 요구사항
1. `expenseFilterSchema`에 `page`(정수 ≥1, 기본 1) 추가. `listExpenses`가 SQL `LIMIT 25 OFFSET`으로 페이지를 나눈다.
   반환에 `page`, `pageSize: 25`, `count`(필터 결과 전체 건수), `counts: { active; archived; all }`(archive 조건만 제외) 추가.
   기존 `total`(필터 결과 전체 **금액** 합, 문자열)과 `items`, `filter`는 의미 그대로 유지(하위호환). 금액 합은 페이지와 무관.
2. `readExpense(id)`를 ID 직접 조회로 변경. 권한 범위는 기존과 동일(supervisor는 본인 것만, admin은 전체).
   Job 접근을 잃은 본인 과거 비용도 조회 가능해야 한다(LEFT JOIN).
3. 비용 수정 시 `recordActivity` data에 변경 필드명 목록 `{ changed: string[] }` 추가(값 미포함). 기존 호출 형태 유지.
4. `personalMutation`, `validatePersonalJob`, `personalJobOptions`의 기존 계약 유지.
5. `tests/integration/expenses-timesheets.test.ts`에 테스트 추가(기존 수정 금지):
   - 51건 → page 1/2/3이 25/25/1건, count·total 금액 고정
   - 2페이지 이후 항목도 readExpense로 조회됨
   - supervisor 합계·counts는 본인 범위
   - DB 보호 테이블을 `adminQuery`로 직접 UPDATE 하지 말 것(raw 연결은 가드 트리거에 막힐 수 있음). 대량 생성은 서비스 함수 또는 INSERT로.

## 담당 파일 (쓰기 허용)
- `lib/expenses/service.ts`
- `lib/expenses/schemas.ts`
- `tests/integration/expenses-timesheets.test.ts`

**이 목록에 없는 파일은 읽기만 가능하다.** `app/**`, `components/**`, `lib/timesheets/**`, `lib/jobs/**`, `lib/domain/**`,
`lib/workflows/**`, `lib/db/**`, `supabase/**` 수정 금지. 페이지 UI의 Pagination 연결은 팀장이 한다.

## 완료 조건
- [ ] 페이지당 최대 25건, `count`/`counts`/`total` 반환
- [ ] readExpense가 단건 SQL
- [ ] `npm run typecheck`, `npm run lint` 통과 (Windows에서 `npm`이 막히면 `npm.cmd`)

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**vitest는 실행하지 않는다.** 팀장이 일괄 실행한다.

## 범위 밖
- UI, 마이그레이션, 타임시트 변경, 의존성, 리팩터링

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 미실행 검증과 이유 4) 기존/신규 오류 구분 5) 보류 항목 6) 남은 제한
