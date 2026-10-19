# 오케스트레이션

공통 지침은 전역 `~/.claude/CLAUDE.md`. 금지·검증은 `AGENTS.md`. 경로 소유는 [OWNERSHIP.md](./OWNERSHIP.md).

## 역할

| 주체 | 모델/effort | 담당 | 위치 |
| --- | --- | --- | --- |
| 팀장 | Fable 5.1 / high | 분석·계획·설계·분배·검토·통합 | main |
| `ui-ux` | Opus 5.5 / high | `app/**`, `components/**` | main |
| `test` | Opus 5.5 / high | `tests/**` | main |
| `analyst` | Astra / xhigh | 설계·분석·리뷰 (수정 안 함) | main, RO |
| `explorer` | Astra / high | 탐색 (수정 안 함) | main, RO |
| `implementer` | Sol / high | `lib/**` 로직·API·DB | **worktree** |
| `quick_edit` | Luna / high | 명확·저위험 수정 | **worktree** |

설정: `.claude/settings.json`, `.claude/agents/*.md`, `~/.codex/agents/*.toml`(단일 진실).

## 라우팅

UI→`ui-ux` / 테스트→`test` / 탐색→`explorer` / 설계·리뷰→`analyst` / 로직·DB·보안→`implementer` / 한 파일 저위험→`quick_edit`. 줄 수가 아니라 난도·영향 범위로 가른다.

애매한 경우: UI+서비스 양쪽이면 레이어로 분할. 컴포넌트 테스트는 `test`. 테스트가 찾은 버그는 `test`가 보고하고 팀장이 배정.

## worktree (Codex 쓰기 전용)

```powershell
.\scripts\worktree-setup.ps1 -Name T-001   # 생성+검증. -List, -Remove
```

`node_modules`·`.local` junction, `.env.local` 복사까지 처리한다. **`codex exec --worktree`는 쓰지 않는다** — 이 자산이 없어 검증이 전부 실패한다.

## 호출

```bash
PBC="C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS"
codex exec -C "<worktree 또는 $PBC>" -s <workspace-write|read-only> \
  -c model="<모델>" -c model_reasoning_effort="<effort>" \
  -o "$PBC/docs/orchestration/results/T-001.md" \
  "$(cat "$PBC/docs/orchestration/tasks/T-001-<slug>.md")"
```

`agents/*.toml`은 Codex 내부용이라 상속되지 않는다. 모델·effort를 매번 명시한다. 쓰기는 worktree+`workspace-write`, 읽기는 main+`read-only`.

Claude 서브에이전트는 Agent 도구로 호출하며 지시서 파일이 필요 없다. 독립 작업은 한 메시지에 묶어 동시 실행한다.

## 병렬 제약

- Codex 쓰기 5개까지. worktree 격리라 같은 파일도 가능(병합 비용만).
- `read-only`는 무제한.
- **`ui-ux`·`test`·팀장은 main 공유 — git 격리 없음.** 겹치면 순차.
- 통합 테스트 동시 실행 금지.

## 병합

```bash
git diff main..wt/T-001 --name-only   # 소유권 위반 확인
git diff main..wt/T-001               # 직접 검토 — 보고를 믿지 않는다
git merge wt/T-001
npm run typecheck && npm run lint && npm run test:run   # 통합 테스트는 여기서 1회
.\scripts\worktree-setup.ps1 -Name T-001 -Remove
```

Codex가 커밋하지 않으면 병합할 수 없다. 지시서에 커밋을 명시한다.

이어하기: `codex exec resume --last -C "<같은 worktree>" ...`

## 보고 요구

공통 — 변경 파일, 실행한 검증과 결과, **미실행 검증과 이유**, 기존/신규 오류 구분, 보류 항목.
추가 — Codex 쓰기: 커밋 해시 / `ui-ux`: 확인한 폭·상태·입력 방식 / `test`: 파일·통과·**스킵** 수 / `analyst`·`explorer`: 사실과 추정 구분, 경로·줄 번호.

## 이력

| 날짜 | 변경 |
| --- | --- |
| 2026-10-20 | 초판(공유 폴더) → worktree 격리 → UI/테스트를 Claude 서브에이전트로 분리 → 전역 중복 제거·압축 |
