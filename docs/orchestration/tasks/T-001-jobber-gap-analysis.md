# T-001: Jobber 기능 기준 백엔드·기능 격차 분석과 구현 작업 분해

## 역할
analyst

## 실행 설정
- 모델: gpt-6-astra
- effort: xhigh
- 샌드박스: read-only
- 작업 폴더: C:/Users/kjm12/orca/workspaces/PBC EMS/sailfish (git worktree, 브랜치 sailfish)

## 배경
PBC EMS는 Paint Buddy & Co.가 Jobber를 대체하려고 만든 사내 업무 시스템이다
(Next.js 16 App Router + Supabase/Postgres, `lib/<domain>/service.ts`가 서버 로직).
이번 업데이트는 Jobber의 기능·업무 흐름을 기준으로 UI/UX와 기능을 끌어올리는 것이다.
UI는 팀장(Claude Code)이 직접 다시 만든다. 이 작업은 **백엔드·기능 측면**에서
무엇이 부족한지 분석하고, 병렬 구현 가능한 작업 단위로 쪼개는 것이다.

팀장이 계획 중인 UI 변경 (이 UI가 필요로 하는 데이터를 반드시 검토할 것):
1. 목록 화면(Clients/Requests/Quotes/Jobs/Invoices/Expenses)에 Jobber식 **상태 탭 + 개수 배지**
   (예: Quotes: All / Draft / Awaiting response / Approved / Converted …) 와 표 형태 목록
   (번호, 고객, 현장, 날짜, 금액, 상태 열). 현재 list 서비스가 상태별 개수나 금액을 주지 않는다.
2. 상세 화면에 **업무 흐름 표시**(Request → Quote → Job → Invoice 연결 레코드)와
   상단 상태 배지 + 주 액션 + "More" 메뉴, 오른쪽 요약 사이드바(금액·잔액·담당자·날짜).
3. 고객 상세: 미수금 잔액, 최근 활동(activity log), 연결된 견적/작업/청구서 요약 표.
4. Home: Jobber식 업무 파이프라인 카드 — Requests(new 수, 평가 예정), Quotes(승인 대기 수·금액,
   승인됨 수·금액), Jobs(진행 중, 청구 필요 수·금액), Invoices(미납 수·금액, 연체).
5. 상세 화면 활동 타임라인(누가 언제 무엇을 바꿨는지). `recordActivity`가 이미 기록 중인지 확인.

## 요구사항
1. `docs/evidence/jobber-and-quote-findings.md`, `PRODUCT.md`, `DESIGN.md`,
   `docs/superpowers/specs/2026-10-16-pbc-ems-design.md`, `supabase/ems-schema-contract.md`,
   `supabase/migrations/**`, `lib/**/service.ts`, `lib/**/schemas.ts`, `lib/workflows/commands.ts`,
   `app/(ems)/**/actions.ts`를 읽고 현재 기능 지도를 만든다.
2. Jobber의 일반적인 핵심 기능(고객·현장, 요청, 견적 생애주기, 작업·방문, 일정/배정,
   청구·수금, 비용, 근무기록, 검색, 활동 기록)과 비교해 **격차 목록**을 만든다.
   각 항목: 현재 상태(파일:줄 근거) / 부족한 점 / 우선순위(P0·P1·P2) / 사용자 가치.
3. 위 "팀장이 계획 중인 UI 변경" 1~5 각각에 대해 **필요한 서비스 함수·반환 타입**을
   구체적으로 설계한다 (함수명, 입력, 반환 TypeScript 타입, SQL 개요, 권한 — supervisor에게
   금액이 새지 않도록 `tx.actor.role` 처리, RLS 고려).
4. 현재 코드의 **버그·위험**(권한 누수, 상태 전이 누락, N+1, 잘못된 집계 등)을 발견하면 근거와 함께 기록한다.
5. 구현을 **Codex implementer 작업 단위**로 분해한다. 각 작업은
   `docs/orchestration/OWNERSHIP.md` §3의 도메인 묶음 경계를 지켜야 하며,
   다음을 포함: 작업 제목 / 쓰기 담당 파일 목록 / 요구사항 / 완료 조건 / 검증 명령 /
   마이그레이션 필요 여부(필요하면 SQL 초안 전문) / 의존 작업 / 동시 실행 가능한 다른 작업.
   서로 같은 파일·같은 테스트 파일을 쓰는 작업은 동시 실행 불가로 표시한다.
   **최대 3개 웨이브**로 정리한다 (웨이브당 쓰기 작업 최대 3개).
6. `lib/domain/types.ts`, `lib/workflows/commands.ts` 등 팀장 전용 공유 파일 변경이 필요하면
   별도 "팀장 요청" 절에 정확한 변경안을 적는다.

## 담당 파일 (쓰기 허용)
- 없음 (read-only). 결과는 최종 메시지로만 반환한다.

## 참고 파일 (읽기만)
- 위 요구사항 1의 문서·코드 전체, `tests/**`

## 완료 조건
- [ ] 격차 목록이 파일:줄 근거와 우선순위를 가진다
- [ ] UI 변경 1~5 각각에 대한 서비스 함수 시그니처와 반환 타입이 있다
- [ ] implementer 작업이 웨이브별로, 담당 파일 충돌 없이 분해되어 있다
- [ ] 마이그레이션이 필요한 작업은 SQL 초안이 있다

## 검증 명령
없음 (분석 전용). 테스트를 실행하지 않는다.

## 범위 밖 (하지 말 것)
- 어떤 파일도 수정하지 않는다
- UI 디자인 결정 (팀장 담당)
- 견적 계산 엔진(`lib/calculator.ts` 등) 동작 변경 제안 — 보존 대상이다

## 보고 요청 사항
한국어로, 아래 순서로:
1. 현재 기능 지도 요약
2. 격차 목록 (P0→P2)
3. 발견한 버그·위험
4. UI 변경 1~5별 서비스 설계
5. implementer 작업 분해 (웨이브 1~3)
6. 팀장 요청 (공유 파일·마이그레이션)
