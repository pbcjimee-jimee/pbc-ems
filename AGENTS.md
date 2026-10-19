<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 오케스트레이션

메인 Claude(팀장)가 분석·계획·설계·분배·검토·통합을 맡고, 구현은 Claude 서브에이전트와
Codex 세션에 병렬로 위임한다. 작업을 배치하거나 수행하기 전에 아래를 읽는다.

- `docs/orchestration/ORCHESTRATION.md` — 역할·실행 명령·병렬 제약·검증 게이트
- `docs/orchestration/OWNERSHIP.md` — 경로별 쓰기 소유권
- `docs/orchestration/TASK-TEMPLATE.md` — Codex 작업 지시서 템플릿

## 역할과 모델

| 주체 | 모델 / effort | 담당 | 실행 위치 |
| --- | --- | --- | --- |
| 메인 Claude | Fable 5.1 / high | 분석·계획·설계·분배·검토·통합 | main |
| `ui-ux` | Opus 5.5 / high | `app/**`, `components/**` 구현 | main |
| `test` | Opus 5.5 / high | `tests/**` 작성·실행·판정 | main |
| Codex `analyst` | GPT-6 Astra / xhigh | 설계·분석·리뷰 (수정 안 함) | main, read-only |
| Codex `explorer` | GPT-6 Astra / high | 탐색 (수정 안 함) | main, read-only |
| Codex `implementer` | GPT-6.1 Sol / high | `lib/**` 로직·API·DB | **worktree** |
| Codex `quick_edit` | GPT-6 Luna / high | 명확·저위험 수정 | **worktree** |

설정 위치: `.claude/settings.json`(메인), `.claude/agents/*.md`(서브에이전트),
`~/.codex/agents/*.toml`(Codex). 지정 모델을 쓸 수 없으면 임의로 대체하지 않고 보고한다.

## 핵심 제약

- **Codex 쓰기 세션은 worktree에서 실행한다.** `scripts/worktree-setup.ps1 -Name <ID>`로
  준비한다(`C:\Users\kjm12\pbc-ems-worktrees\<ID>`). **`codex exec --worktree`를 쓰지 않는다** —
  `node_modules`와 `.env.local`이 없어 검증이 전부 실패한다.
- **`ui-ux`·`test`·팀장은 메인 저장소를 공유한다.** git 격리가 없으므로 같은 파일을 동시에
  쓰면 서로의 변경을 덮어쓴다. 파일 범위가 겹치면 순차 실행한다.
- 담당 파일 범위 밖은 읽기만 가능하다. 수정이 필요하면 **수정하지 말고 보고**한다.
- **`npm install` 금지.** `node_modules`가 junction으로 공유되어 모든 worktree에 전파된다.
- **통합 테스트 실행 금지** (`test` 역할이 팀장 승인을 받은 경우만 예외).
  `resetFixtures()`가 로컬 DB를 리셋하고 모든 worktree가 같은 DB를 공유하므로, 동시 실행 시
  서로의 픽스처를 지운다. 단위 테스트만 실행한다:

  ```bash
  npx vitest run --no-file-parallelism --exclude "tests/integration/**"
  ```

  정상 결과는 `Test Files 12 passed (12)` / `Tests 192 passed`다. **`1 skipped`가 보이면
  멈추고 보고한다** — `.local/operating-cases.json` 부재로 견적 회귀 기준선이 검증되지 않은
  상태이며, 초록불이라 통과처럼 보인다.
- `supabase/migrations/**` 작성, `supabase db reset`, 의존성 변경, 설정 파일 수정은 팀장 전용이다.
