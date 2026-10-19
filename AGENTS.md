<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 오케스트레이션

Claude Code(팀장)와 Codex 실행 세션이 같은 폴더에서 병렬 작업한다.
작업을 배치하거나 수행하기 전에 아래를 읽는다.

- `docs/orchestration/ORCHESTRATION.md` — 역할·실행 명령·병렬 제약·검증 게이트
- `docs/orchestration/OWNERSHIP.md` — 경로별 쓰기 소유권 (충돌 방지)
- `docs/orchestration/TASK-TEMPLATE.md` — 작업 지시서 템플릿

핵심 제약:

- 쓰기 작업은 `scripts/worktree-setup.ps1`로 준비한 **worktree**에서 실행한다
  (`C:\Users\kjm12\pbc-ems-worktrees\<ID>`). 읽기 전용 역할은 main에서 바로 실행한다.
- **`codex exec --worktree`를 쓰지 않는다.** Codex 자체 worktree에는 `node_modules`와
  `.env.local`이 없어 검증이 전부 실패한다.
- 작업 지시서의 `담당 파일` 목록에 없는 파일은 읽기만 가능하다. 범위 확대가 필요하면
  수정하지 말고 보고한다.
- UI/UX(`app/**`, `components/**`)와 공유 설정·마이그레이션은 팀장 전용이다.
- **`npm install` 금지.** `node_modules`가 junction으로 공유되어 모든 worktree에 전파된다.
- **통합 테스트 실행 금지.** 로컬 DB가 worktree 간 공유되고 `resetFixtures()`가 DB를
  리셋하므로 동시 실행 시 서로를 깨뜨린다. 단위 테스트만 실행한다:
  `npx vitest run --no-file-parallelism --exclude "tests/integration/**"` (정상: 12 passed).
  `1 skipped`가 보이면 worktree 설정 문제이므로 멈추고 보고한다 — 견적 회귀 기준선이
  검증되지 않은 상태다.
