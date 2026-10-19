# T-008: Requests 목록 상태별 개수와 Home용 요청 파이프라인

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 home·workflows를 수정 중)

## 배경
PBC EMS는 Jobber를 대체하는 사내 업무 시스템이다. 팀장이 Requests 목록을 상태 탭 + 개수 배지로 바꿨다
(`app/(ems)/requests/page.tsx`가 `listRequests()`의 `counts?`를 읽음, 탭 키: `all,new,in_review,quoted,closed`).
분석 보고서 `docs/orchestration/results/T-001.md` §3 B03, §4-4, 작업 R 참고. 기존 저장 상태(`requests.status`)의 의미는 바꾸지 않는다.
비슷한 패턴의 완료 예: `lib/quotes/service.ts`의 `listQuotes` counts, `readQuotePipeline`.

## 요구사항
1. `listRequests(input)` 반환에 `counts: Record<'all'|'new'|'in_review'|'quoted'|'closed', number>` 추가(기존 필드 유지).
   검색·archive·날짜·clientId 조건은 적용, status 조건만 제외. 단일 SQL.
2. `export async function readRequestPipeline(tx: EmsTx, today: string): Promise<RequestPipeline>` 추가:
   ```ts
   export type RequestPipeline = {
     new: { count: number };                 // 미보관, status='new' 이고 연결된 job이 없고 issued 이상 견적 이력이 없는 요청
     assessmentScheduled: { count: number }; // 미보관·status<>'closed', type='assessment' 이고 status in (scheduled,in_progress) 방문이 있는 요청 수(요청당 1)
     assessmentOverdue: { count: number };   // 위 방문 중 종료가 지난 것: 시간 지정은 ends_at < now(), 종일은 end_date < today(Sydney)
   };
   ```
   호출자의 `tx` 사용. 권한: admin·supervisor 모두 호출 가능(금액 없음). RLS 범위 그대로.
3. 테스트 추가(기존 수정 금지) `tests/integration/clients-requests.test.ts`:
   - counts가 status 필터와 무관, 검색 시 감소
   - 직접 Job이 연결된 new 요청은 pipeline.new에서 제외
   - assessment 방문 2건이어도 assessmentScheduled는 1
   - 지난 시간의 scheduled assessment는 assessmentOverdue에 포함
   - 방문 생성은 `saveVisit`(lib/schedule/service) 등 서비스 함수 사용. RLS·트리거 보호 테이블을 `adminQuery`로 직접 UPDATE 하지 말 것.

## 담당 파일 (쓰기 허용)
- `lib/requests/service.ts`
- `lib/requests/schemas.ts`
- `tests/integration/clients-requests.test.ts`

**이 목록에 없는 파일은 읽기만 가능하다.** `app/**`, `components/**`, `lib/home/**`, `lib/schedule/**`, `lib/clients/**`,
`lib/workflows/**`, `lib/domain/**`, `lib/db/**`, `supabase/**` 수정 금지.

## 완료 조건
- [ ] counts 5개 키, status 필터와 무관
- [ ] readRequestPipeline 타입대로 반환
- [ ] `npm run typecheck`, `npm run lint` 통과 (Windows에서 `npm`이 막히면 `npm.cmd`)

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**vitest는 실행하지 않는다.** 팀장이 일괄 실행한다.

## 범위 밖
- UI, 마이그레이션, 요청 상태 자동 전이, assessment_at 삭제, 리팩터링

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 미실행 검증과 이유 4) 기존/신규 오류 구분 5) 보류 항목 6) 남은 제한
