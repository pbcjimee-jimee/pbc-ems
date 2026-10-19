# T-004: 방문 상태 전이 검증과 방문 취소·이동 후 Job 예약 상태 재평가

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 다른 도메인을 수정 중이다)

## 배경
PBC EMS는 Jobber를 대체하는 사내 업무 시스템이다. Job(작업)과 Visit(방문)은 분리되어 있고
일정 화면의 "Unscheduled work"는 `status='unscheduled'` Job을 보여준다.
분석 보고서 `docs/orchestration/results/T-001.md` §3 **B01(방문 부분), B02**, 작업 S를 참고한다.
**마이그레이션(M3)은 이번 범위가 아니다.** 서비스 레이어 검증만 구현한다.

## 요구사항
1. 신규 `lib/schedule/transitions.ts`: 순수 함수
   `assertVisitTransition({ role, from, to }): void` — 위반 시 `WorkflowError('INVALID_TRANSITION', <사람이 읽을 메시지>)`.
   - supervisor: 비종료(`scheduled`, `in_progress`) 방문을 `in_progress` 또는 `completed`로만 변경. `cancelled`·종료 상태 역전이 금지.
   - admin: 모든 전이 허용하되, `completed`/`cancelled` → 다른 상태(재개방)는 허용(사유 입력은 이번 범위 아님). 같은 상태로의 변경은 no-op 허용.
   - `scheduled → completed` 직접 완료는 허용(기존 테스트 계약).
   실제 상태 enum은 `lib/schedule/schemas.ts`의 `visitStatuses`를 확인해 맞춘다.
2. `changeVisitStatus`가 현재 상태를 `for update`로 읽고 위 검증을 적용한다.
   `saveVisit`(편집) 경로에서 상태가 바뀌는 경우에도 같은 검증을 적용한다.
3. **B02**: admin의 `saveVisit`/`changeVisitStatus`가 방문을 취소하거나 다른 Job으로 옮기거나 Job 연결을 해제할 때,
   **이전 Job**에 취소되지 않은 방문이 하나도 남지 않고 그 Job 상태가 `scheduled`이면 `unscheduled`로 되돌린다.
   `in_progress`/`completed`/`cancelled` Job은 자동 변경하지 않는다. 새 Job은 기존 규칙(`unscheduled → scheduled`) 유지.
   Job 상태를 자동 변경할 때 `recordActivity(tx,'job',jobId,'status_changed',{status, reason:'visit_rescheduled'})`를 남긴다
   (`lib/workflows/commands.ts`의 기존 함수 호출만, 해당 파일 수정 금지). Job 행의 `version`도 증가시킨다.
4. 테스트 추가(기존 테스트 수정 금지):
   - `tests/schedule.test.ts`: `assertVisitTransition` 단위 테스트(허용/거부 표)
   - `tests/integration/schedule.test.ts`: 마지막 방문 취소 → Job unscheduled 복귀 / 다른 유효 방문 있으면 scheduled 유지 /
     in_progress Job은 유지 / supervisor가 completed 방문을 scheduled로 되돌리면 거부 / supervisor 취소 거부

## 담당 파일 (쓰기 허용)
- `lib/schedule/service.ts`
- `lib/schedule/schemas.ts`
- `lib/schedule/types.ts`
- `lib/schedule/transitions.ts` (신규)
- `tests/schedule.test.ts`
- `tests/integration/schedule.test.ts`

**이 목록에 없는 파일은 읽기만 가능하다.** `app/**`, `components/**`, `lib/jobs/**`, `lib/workflows/**`, `lib/db/**`,
`lib/domain/**`, `supabase/**`는 수정 금지. Server Action 시그니처 변경이 필요하면 하지 말고 보고.

## 완료 조건
- [ ] supervisor의 금지 전이가 `INVALID_TRANSITION` 결과(`{ok:false}`)로 반환된다(예외 누출 없이)
- [ ] 마지막 유효 방문 취소 시 scheduled Job이 unscheduled가 되어 `unscheduledJobs()`에 나타난다
- [ ] 기존 공개 함수 시그니처 유지
- [ ] `npm run typecheck`, `npm run lint` 통과

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**테스트(vitest)는 실행하지 않는다.** 팀장이 일괄 실행한다. (단위 테스트 `tests/schedule.test.ts`는 DB 불필요하므로
`npx vitest run tests/schedule.test.ts`만 실행해도 된다.)

## 범위 밖 (하지 말 것)
- 마이그레이션, UI, Job 상태 전이(별도 작업), 재개방 사유 입력, 리팩터링

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 실행하지 못한 검증과 이유 4) 기존/신규 오류 구분 5) 보류한 범위 밖 항목 6) 남은 제한
