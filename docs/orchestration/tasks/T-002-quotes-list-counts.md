# T-002: Quotes 목록 상태별 개수와 Home용 견적 파이프라인 집계

## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol / effort: high / 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree. 다른 Codex 세션 2개가 동시에 다른 도메인을 수정 중이다)

## 배경
PBC EMS(Next.js 16 + Postgres, `ems` 스키마)는 Jobber를 대체하는 사내 업무 시스템이다.
팀장이 Quotes 목록 UI를 Jobber식 **상태 탭 + 개수 배지**로 바꿨다(`app/(ems)/quotes/page.tsx`).
UI는 이미 `listQuotes()` 반환값의 `counts?: Record<string, number>`를 읽도록 작성되어 있다.
분석 보고서 `docs/orchestration/results/T-001.md` §4-1, §4-4, 작업 Q를 참고하되, **아래 축소 범위만** 구현한다.

## 요구사항
1. `listQuotes(input)` 반환에 `counts: Record<QuoteTabKey, number>`를 **추가**한다(기존 필드 `items,total,filter` 유지, 하위호환).
   - 키: `all, draft, issued, changes_requested, approved, declined, archived` (UI 탭 키와 정확히 일치).
   - 검색 조건(`search`)은 적용하고, **선택된 status 조건은 제외**하고 계산한다.
   - `all`은 검색 조건의 전체 건수.
   - 단일 SQL(`count(*) filter (where ...)`)로 계산하고 별도 왕복을 늘리지 않는다.
2. Home용 집계 함수를 `lib/quotes/service.ts`에 추가한다:
   `export async function readQuotePipeline(tx: EmsTx): Promise<QuotePipeline>`
   ```ts
   export type QuotePipeline = {
     draft: { count: number };
     awaitingResponse: { count: number; amount: string };   // status='issued', 현재 revision total 합
     changesRequested: { count: number };
     approvedUnconverted: { count: number; amount: string }; // 승인 revision에 연결된 job이 없는 approved 견적, 승인 revision total 합
   };
   ```
   - 호출자가 넘긴 `tx`를 사용(새 트랜잭션 금지). admin이 아니면 `WorkflowError('FORBIDDEN', ...)`를 던진다.
   - 금액은 SQL numeric → `::text`, 소수 2자리 문자열. 없으면 `"0.00"`.
   - "전환됨" 판정: `exists(select 1 from ems.jobs j where j.quote_revision_id = q.approved_revision_id and j.organization_id = q.organization_id)`.
3. 위 타입을 `lib/quotes/service-types.ts`에 export 한다.
4. `tests/integration/quotes.test.ts`에 테스트를 **추가**한다(기존 테스트 수정 금지):
   - 상태가 다른 견적 여러 건에서 `counts`가 status 필터와 무관하게 동일하고, 검색 시 줄어든다.
   - 26건 이상(페이지 2개)에서도 counts가 페이지와 무관하다(가능하면; 비용이 크면 소수 건으로 충분).
   - `readQuotePipeline`: 승인 후 job 전환 전/후 `approvedUnconverted` 변화, supervisor 호출 시 FORBIDDEN.
   - 기존 helper(`tests/helpers/**`)만 사용한다. helper 수정이 필요하면 하지 말고 보고.

## 담당 파일 (쓰기 허용)
- `lib/quotes/service.ts`
- `lib/quotes/service-types.ts`
- `lib/quotes/schemas.ts` (필요 시)
- `tests/integration/quotes.test.ts`

**이 목록에 없는 파일은 읽기만 가능하다.** 특히 `app/**`, `components/**`, `lib/domain/**`, `lib/workflows/**`,
`lib/db/**`, `supabase/**`, 견적 계산 엔진(`lib/calculator.ts`, `lib/quotes/calculation.ts`, `lib/quotes/commercial-totals.ts` 등)은 수정 금지.

## 참고 파일 (읽기만)
- `docs/orchestration/results/T-001.md`, `lib/quotes/service.ts`, `lib/db/transaction.ts`, `lib/workflows/commands.ts`, `tests/helpers/**`, `tests/integration/quotes.test.ts`

## 완료 조건
- [ ] `listQuotes({status:'draft'})`와 `listQuotes({status:'all'})`의 `counts`가 같다
- [ ] `counts` 키가 위 7개와 정확히 일치한다
- [ ] `readQuotePipeline`이 admin에게 위 타입을, supervisor에게 FORBIDDEN을 반환한다
- [ ] `npm run typecheck`, `npm run lint` 통과

## 검증 명령
```bash
npm run typecheck
npm run lint
```
**테스트(vitest)는 실행하지 않는다.** 다른 세션과 DB 간섭이 생긴다. 팀장이 일괄 실행한다.

## 범위 밖 (하지 말 것)
- UI 수정, 마이그레이션 작성, 의존성 추가, 리팩터링, 계산 엔진 변경
- `getHomeSummary` 수정 (Home 통합은 별도 작업)

## 보고 요청 사항
한국어로: 1) 변경 파일·내용 2) 실행한 검증과 결과 3) 실행하지 못한 검증과 이유 4) 기존/신규 오류 구분 5) 보류한 범위 밖 항목 6) 남은 제한
