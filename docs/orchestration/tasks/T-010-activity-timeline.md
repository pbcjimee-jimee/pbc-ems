# T-010: 관리자용 활동 타임라인 조회 서비스

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 requests·home을 수정 중)

## 배경
PBC EMS의 변경 명령은 `lib/workflows/commands.ts`의 `recordActivity(tx, entityType, entityId, action, data)`로
`ems.activity_events`에 기록된다. 이 테이블은 RLS상 **admin만 읽을 수 있다**(마이그레이션 `20261015220541_ems_runtime.sql` 확인).
팀장이 상세 화면(Client/Request/Quote/Job/Invoice)에 Jobber식 "Activity" 타임라인 카드를 추가하려 한다.
분석 보고서 `docs/orchestration/results/T-001.md` §4-5 참고. **supervisor용 요약 테이블(M2 마이그레이션)은 이번 범위가 아니다.**
팀장이 이 작업에 한해 `lib/workflows/queries.ts`(신규) 쓰기를 **명시적으로 위임**한다. `lib/workflows/commands.ts`는 수정 금지.

## 요구사항
1. 신규 `lib/workflows/queries.ts` (`import 'server-only'`):
   ```ts
   export type ActivityEntity = 'client'|'property'|'request'|'quote'|'job'|'invoice'|'visit'|'expense'|'time_entry';
   export type ActivityItem = { id: string; createdAt: string; actorName: string; entityType: string; entityId: string; action: string; summary: string };
   export async function listActivity(input: { entityType: ActivityEntity; entityId: string; includeRelated?: boolean; limit?: number }): Promise<ActivityItem[]>;
   ```
   - 실제 저장된 `entity_type` 문자열을 먼저 코드에서 확인한다(`recordActivity` 호출부 전수 grep: 'job','visit','time_entry' 등). 정규화가 필요하면 매핑한다.
   - **admin만** 결과 반환. supervisor/비회원은 빈 배열 `[]`(예외 아님). `withEmsTransaction` 사용, `organization_id` 명시 조건.
   - `includeRelated: true`면 관련 레코드 이벤트도 포함:
     client → 그 고객의 properties·requests·quotes·jobs·invoices / request → 연결 quotes·jobs·visits /
     job → 그 job의 visits·invoices / quote → 해당 quote만 / invoice → 해당 invoice와 그 payments가 있으면 포함.
     관계 대상 id 집합을 먼저 만들고 `entity_id = any($ids)`로 조회(중복 없음).
   - 정렬 `created_at desc, id desc`, `limit` 기본 20, 최대 50.
   - `summary`: 사람이 읽는 영어 한 줄(예: "Status changed to Completed", "Job created from quote", "Payment recorded").
     `data`의 금액·메모·스냅샷 원문을 summary에 그대로 넣지 않는다. 상태값은 허용(`data.status`).
   - `actorName`: `ems.memberships.display_name`.
2. 신규 `tests/integration/activity.test.ts`:
   - admin: job 상태 변경 후 job 타임라인에 이벤트가 최신순으로 나타남, summary에 금액 원문 없음
   - client includeRelated에 해당 고객 job 이벤트 포함, 다른 고객 이벤트 미포함
   - supervisor 호출 시 `[]`
   - 기존 `tests/helpers/**` 사용(수정 금지). 보호 테이블은 `adminQuery`로 직접 UPDATE 금지, 서비스 함수 사용.

## 담당 파일 (쓰기 허용)
- `lib/workflows/queries.ts` (신규)
- `tests/integration/activity.test.ts` (신규)

**이 목록에 없는 파일은 읽기만 가능하다.** `lib/workflows/commands.ts`, `app/**`, `components/**`, 다른 `lib/**`, `supabase/**` 수정 금지.

## 완료 조건
- [ ] admin은 최신순 이벤트, supervisor는 []
- [ ] includeRelated 관계 범위가 위와 일치하고 타 고객 이벤트 미포함
- [ ] `npm run typecheck`, `npm run lint` 통과 (Windows에서 `npm`이 막히면 `npm.cmd`)

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**vitest는 실행하지 않는다.** 팀장이 일괄 실행한다.

## 범위 밖
- 마이그레이션(요약 테이블), commands.ts 변경, UI, 리팩터링

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 미실행 검증과 이유 4) 기존/신규 오류 구분 5) 보류 항목 6) 남은 제한
