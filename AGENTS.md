<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PBC EMS

공통 지침은 전역 `~/.claude/CLAUDE.md`. 아래는 이 프로젝트 고유 사실만.

Next.js 16.3.8 / React 19 / TS strict / Supabase. 제품 정의는 `PRODUCT.md`, 디자인 토큰은 `DESIGN.md`, 스키마는 `supabase/ems-schema-contract.md`.

## 검증

```bash
npm run typecheck && npm run lint
npx vitest run --no-file-parallelism --exclude "tests/integration/**"
```

판정 기준은 **스킵 0**이다(2026-10-20 기준 13 passed / 324 tests — 테스트가 늘면 숫자는 바뀐다). `skipped`가 1개라도 있으면 멈추고 보고한다 — `.local/operating-cases.json` 부재로 견적 회귀 기준선이 검증되지 않은 상태인데 초록불로 보인다.

## 금지 (전역 자원)

- **`npm install`·의존성 변경** — `node_modules`가 worktree 간 junction 공유라 전체 전파.
- **통합 테스트 실행**(`test:integration`, `test:run`) — `resetFixtures()`가 공유 로컬 DB를 리셋해 병렬 세션을 깨뜨린다. `test` 역할이 팀장 승인을 받은 경우만 예외.
- `supabase/migrations/**` 작성, `supabase db reset`, 설정 파일 수정 — 팀장 전용.
- 담당 범위 밖 수정 — 필요하면 수정하지 말고 보고.

## 오케스트레이션

팀장(Fable 5.1)이 분석·계획·분배·검토·통합. UI·테스트는 `ui-ux`·`test` Claude 서브에이전트(Opus 5.5, 메인 저장소), 로직·분석은 Orca `/orchestration` worker(Codex 4역할)에 위임한다.

`ui-ux`·`test`·팀장은 **메인 저장소를 공유해 git 격리가 없다.** 파일 범위가 겹치면 순차 실행한다.

새 worktree는 `scripts/worktree-setup.ps1`이 선행된다 — git worktree에는 `node_modules`·`.env.local`·`.local/`이 없어 검증이 실패하거나 조용히 스킵된다.

상세: `docs/orchestration/ORCHESTRATION.md`(역할·Orca 실행·병렬), `OWNERSHIP.md`(경로별 소유), `TASK-TEMPLATE.md`(Task spec).
