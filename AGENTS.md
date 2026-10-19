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

- 이 프로젝트는 git 저장소가 아니다. `--worktree`를 쓰지 않고 같은 폴더를 공유하므로,
  **파일 소유권 규칙이 유일한 충돌 방어선이다.**
- 작업 지시서의 `담당 파일` 목록에 없는 파일은 읽기만 가능하다. 범위 확대가 필요하면
  수정하지 말고 보고한다.
- UI/UX(`app/**`, `components/**`)와 공유 설정·마이그레이션은 팀장 전용이다.
- `vitest`는 `--no-file-parallelism`이다. 여러 세션이 테스트를 동시 실행하면 간섭한다.
