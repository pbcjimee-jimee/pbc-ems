# 오케스트레이션

실행은 **Orca `/orchestration`** 이 맡는다. 이 문서는 그 위에 얹는 프로젝트 규약 — 누가 무엇을 소유하고, 무엇이 금지되며, 무엇이 완료 증거인지.

공통 지침은 전역 `~/.claude/CLAUDE.md`. 금지·검증은 `AGENTS.md`. 경로 소유는 [OWNERSHIP.md](./OWNERSHIP.md).

## 역할

| 주체 | 모델 / effort | 담당 | 배치 |
| --- | --- | --- | --- |
| 팀장 | Fable 5.1 / high | 분석·계획·설계·분배·검토·통합 | 코디네이터 |
| `ui-ux` | Opus 5.5 / high | `app/**`, `components/**` | Claude 서브에이전트 (main) |
| `test` | Opus 5.5 / high | `tests/**` | Claude 서브에이전트 (main) |
| `analyst` | `gpt-6-astra` / xhigh | 설계·분석·리뷰 (수정 안 함) | Orca worker |
| `explorer` | `gpt-6-astra` / high | 탐색 (수정 안 함) | Orca worker |
| `implementer` | `gpt-6.1-sol` / high | `lib/**` 로직·API·DB | Orca worker |
| `quick_edit` | `gpt-6-luna` / high | 명확·저위험 수정 | Orca worker |

설정: `.claude/settings.json`, `.claude/agents/*.md`, `~/.codex/agents/*.toml`.

UI·테스트는 Claude 서브에이전트로 직접 호출한다(Agent 도구). Orca를 거치지 않는다 — 감독할 외부 프로세스가 없고 메인 저장소 작업이다.

## 라우팅

UI→`ui-ux` / 테스트→`test` / 탐색→`explorer` / 설계·리뷰→`analyst` / 로직·DB·보안→`implementer` / 한 파일 저위험→`quick_edit`. 줄 수가 아니라 난도·영향 범위로 가른다.

애매한 경우: UI+서비스 양쪽이면 레이어로 분할. 컴포넌트 테스트는 `test`. 테스트가 찾은 버그는 `test`가 보고하고 팀장이 배정.

## Orca 실행

전체 절차는 `ORCA skills get orchestration`으로 버전에 맞는 가이드를 불러 따른다. 아래는 이 프로젝트에 고정된 값만.

```text
ORCA orchestration run-create --objective "<목표>" --json
ORCA orchestration worker-start --run <run_id> --spec "<Task spec>" \
  --task-title "<제목>" --worktree current --agent codex \
  --model "gpt-6.1-sol" --effort high --json
ORCA orchestration check --run <run_id> --wait \
  --types "worker_done,escalation,question" --timeout-ms 900000 --json
```

`ORCA`는 `orca skills get orchestration`에서 해석한 실행 파일로 치환한다. 이 머신: `C:\Users\kjm12\AppData\Local\Programs\orca\resources\bin\orca`.

역할별 `--agent` / `--model` / `--effort`:

| 역할 | `--agent` | `--model` | `--effort` |
| --- | --- | --- | --- |
| `analyst` | `codex` | `gpt-6-astra` | `xhigh` |
| `explorer` | `codex` | `gpt-6-astra` | `high` |
| `implementer` | `codex` | `gpt-6.1-sol` | `high` |
| `quick_edit` | `codex` | `gpt-6-luna` | `high` |

`--effort`는 `--model`을 요구하고 `--terminal`과 함께 쓸 수 없다. 영수증의 `launch.effective`로 적용값을 확인한다 — worker 자신은 모델 ID를 모르므로 자기보고를 근거로 쓰지 않는다.

### 배치 선택

- `--worktree current` — 메인 저장소 재사용. **읽기 전용 역할**(`analyst`, `explorer`)에 쓴다.
- `--worktree new-child --name T-001` — 새 worktree. **쓰기 역할**에 쓴다. 단 §비추적 자산을 먼저 처리한다.

### 비추적 자산 (새 worktree의 필수 선행 작업)

git worktree에는 추적 파일만 들어온다. `node_modules`(694MB)·`.env.local`·`.local/`이 없어 **검증이 전부 실패하거나, 더 나쁘게 조용히 스킵된다.** Orca도 이것을 채워주지 않는다.

```powershell
.\scripts\worktree-setup.ps1 -Name T-001   # junction + 복사 + 검증. -List, -Remove
```

`-Remove`는 junction만 끊어 원본을 보존한다. 스크립트가 만든 worktree를 Orca에 넘길 때는 `--worktree path:C:\Users\kjm12\pbc-ems-worktrees\T-001`로 지정한다.

## Task spec (Orca 요구 형식)

worker는 대화 맥락이 없다. 다섯 항목을 모두 채운다 — 하나라도 빠지면 띄우지 않는다.

| 항목 | 이 프로젝트에서 |
| --- | --- |
| **Target** | 담당 파일 경로 전체. [OWNERSHIP.md](./OWNERSHIP.md) 도메인 묶음 기준 |
| **Change** | 만들어낼 구체적 결과 |
| **Constraints** | `AGENTS.md` 금지 항목 전체 + 이번 작업 제약 |
| **Ownership** | 목록 밖은 읽기만. 필요하면 수정하지 말고 보고 |
| **Observable acceptance** | **스킵 0**이 판정 기준(숫자는 테스트가 늘면 바뀐다). `skipped`가 있으면 회귀 미검증이므로 멈추고 보고 |

작업 완료 시 커밋을 명시한다. 커밋하지 않으면 병합할 수 없다.

## 병렬 제약

- Orca 쓰기 worker 5개까지. worktree 격리라 같은 파일도 가능(병합 비용만).
- 읽기 전용은 무제한.
- **`ui-ux`·`test`·팀장은 main 공유 — git 격리 없음.** 겹치면 순차.
- 통합 테스트 동시 실행 금지 (공유 로컬 DB).
- 의존성 변경 금지 (`node_modules` junction 공유).

의존성이 있는 fan-out은 `task-create` + `worker-start --task`에 `--deps`를 쓴다. 3~4단계보다 깊은 체인보다 병렬 웨이브를 택한다.

## 수거와 병합

`check`로 받은 메시지는 **ack 전에** 처리한다. 질문엔 `reply`, `worker_done`은 기대한 Dispatch와 대조한다.

```bash
git diff main..<브랜치> --name-only   # 소유권 위반 확인
git diff main..<브랜치>               # 직접 검토 — 보고를 액면가로 믿지 않는다
git merge <브랜치>
npm run typecheck && npm run lint && npm run test:run   # 통합 테스트는 여기서 1회
```

`worker_done`이 Task·Dispatch를 자동 정산한다. 뒤이어 `task-update --status completed`를 보내지 않는다. 정산 후 재사용·`worker-retain`·`worker-release` 중 하나를 즉시 택한다.

```text
ORCA orchestration worker-list --run <run_id> --terminal-state reclaimable --json
```

이게 빈 결과가 될 때까지 코디네이터 턴을 끝내지 않는다. worktree는 `worktree-setup.ps1 -Name <ID> -Remove`로 정리한다.

## 보고 요구

공통 — 변경 파일, 실행한 검증과 결과, **미실행 검증과 이유**, 기존/신규 오류 구분, 보류 항목.
추가 — 쓰기 worker: 커밋 해시 / `ui-ux`: 확인한 폭·상태·입력 방식 / `test`: 파일·통과·**스킵** 수 / `analyst`·`explorer`: 사실과 추정 구분, 경로·줄 번호.

Orca worker는 `worker_done`에 `--outcome succeeded|failed`를 명시한다. 실패를 산문에만 담지 않는다.

## 이력

| 날짜 | 변경 |
| --- | --- |
| 2026-10-20 | 초판(공유 폴더) → worktree 격리 → UI/테스트를 Claude 서브에이전트로 분리 → 전역 중복 제거 → **실행 레이어를 `codex exec` 직접 호출에서 Orca `/orchestration`으로 교체** |
