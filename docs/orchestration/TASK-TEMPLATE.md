# Task spec 템플릿

Orca worker는 대화 맥락이 없다. `--spec` 하나로 완결되게 쓴다. 실행 절차는 [ORCHESTRATION.md](./ORCHESTRATION.md).

Claude 서브에이전트(`ui-ux`·`test`)는 역할 정의에 원칙·금지·검증이 이미 있으므로 Agent 프롬프트에 요구사항·담당 파일·완료 조건만 담는다.

## Orca worker (--spec)

Orca가 요구하는 5개 항목을 모두 채운다.

```text
Target: lib/schedule/dates.ts, lib/schedule/service.ts

Change: 주차 계산이 월요일 시작 기준으로 동작하게 수정한다.
  현재 일요일 시작으로 계산되어 주간 근무기록 집계가 하루 밀린다.

Constraints:
  - AGENTS.md 의 금지 항목 전체를 지킨다. 특히 npm install 과
    통합 테스트 실행(test:integration, test:run)은 금지.
  - 금액은 decimal.js, 시간대는 Australia/Sydney
    (lib/domain/sydney-date-time.ts 사용).
  - 요구사항에 없는 리팩터링은 하지 않는다.

Ownership:
  위 Target 만 쓰기 가능. 목록 밖은 읽기만.
  수정이 필요하다고 판단하면 수정하지 말고 근거와 함께 보고한다.
  UI(app/**, components/**)는 ui-ux 담당이므로 건드리지 않는다.

Observable acceptance:
  - npm run typecheck && npm run lint 통과
  - npx vitest run --no-file-parallelism --exclude "tests/integration/**"
    결과에 skipped 가 0. 하나라도 있으면 작업을 멈추고 보고한다
    (회귀 기준선 미검증 상태인데 초록불로 보인다).
  - 2026-03-02(일) 입력이 2026-02-23 시작 주차로 계산된다.
  - 완료 후 커밋: git add <Target> && git commit -m "<요약>"
    커밋하지 않으면 병합할 수 없다.
```

읽기 전용 역할(`analyst`·`explorer`)은 Ownership 대신 **산출물**을 쓴다 — 분석 결과만 보고, 제품 코드 수정 금지, 확인한 사실과 추정 구분, 파일 경로·줄 번호 명시.

## Claude 서브에이전트 (Agent 프롬프트)

```text
요구사항: Clients 목록에 상태 필터를 추가한다.
배경: 현재 전체 목록만 보여 활성/비활성 구분이 안 된다.
담당 파일:
  - components/clients/client-list.tsx
  - app/(ems)/clients/page.tsx
완료 조건:
  - 상태 필터(전체/활성/비활성)가 URL 쿼리에 반영된다
  - 필터 변경 시 목록이 갱신되고 빈 결과에 빈 상태가 표시된다
  - 키보드로 조작 가능하고 포커스가 보인다
제약: lib/clients/** 는 읽기만. 서비스 변경이 필요하면 보고.
```

독립 작업은 한 메시지에 여러 Agent 호출을 묶어 동시 실행한다. 단 `ui-ux`와 `test`는 main을 공유하므로 **파일 범위가 겹치지 않을 때만**.

## 흔한 실수

| 실수 | 교정 |
| --- | --- |
| UI·테스트를 Orca worker 로 띄운다 | `ui-ux`·`test` 서브에이전트에 위임 |
| `ui-ux`와 `test`를 같은 파일에 동시 투입 | main 공유 — 범위 분리 또는 순차 |
| 서브에이전트 작업 중 팀장이 같은 파일 수정 | 담당 파일을 건드리지 않는다 |
| 새 worktree에 `worktree-setup.ps1` 생략 | `node_modules`·`.env.local` 부재로 검증 실패 |
| Observable acceptance 에 `test:run` 포함 | 공유 DB 리셋 — `--exclude` 형태로 |
| `1 skipped`를 통과로 본다 | 회귀 기준선 미검증 — 멈추고 보고 |
| Target 을 "해당 모듈"로 뭉갠다 | 경로를 전부 나열 |
| acceptance 가 "정상 동작" | 관측 가능한 입출력으로 |
| 커밋 요구 누락 | 병합 불가 |
| worker 의 모델 자기보고를 근거로 쓴다 | 영수증 `launch.effective` 확인 |
