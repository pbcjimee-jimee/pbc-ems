# 작업 지시서 템플릿

Claude Code가 Codex에 작업을 넘길 때 사용한다. `docs/orchestration/tasks/T-<번호>-<slug>.md`로 복사해 채운다.

작성 원칙: **Codex는 이 문서 하나만 읽고 작업을 시작한다.** 프로젝트 맥락을 모른다고 가정하고 쓴다.

---

## 템플릿 (아래를 복사)

```markdown
# T-000: <한 줄 제목>

## 역할
implementer   <!-- analyst | implementer | quick_edit | explorer 중 하나 -->

## 실행 설정
- 모델: gpt-6.1-sol
- effort: high
- 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/pbc-ems-worktrees/T-000   <!-- worktree. 쓰기 역할은 main 이 아니다 -->
- 브랜치: wt/T-000

## 배경
<이 작업이 왜 필요한지 2~4줄. 제품 맥락 포함.>

## 요구사항
1. <검증 가능한 단위로>
2. <...>

## 담당 파일 (쓰기 허용)
- `lib/<path>.ts`
- `tests/<path>.test.ts`

**이 목록에 없는 파일은 읽기만 가능하다.** 다른 파일을 수정해야 한다면
수정하지 말고 근거와 함께 보고한다.

## 참고 파일 (읽기만)
- `PRODUCT.md` — 제품 요구사항
- `lib/<path>.ts` — 기존 패턴 참고

## 완료 조건
- [ ] <관측 가능한 상태로. "동작한다"가 아니라 "X 입력에 Y를 반환한다">
- [ ] <...>

## 검증 명령
```bash
npm run typecheck
npm run lint
npx vitest run --no-file-parallelism --exclude "tests/integration/**"
```
정상 결과: `Test Files 12 passed (12)` / `Tests 192 passed`.
`1 skipped` 가 보이면 worktree 설정 문제이므로 **작업을 멈추고 보고**한다.

## 범위 밖 (하지 말 것)
- **`npm install` 및 의존성 변경** — node_modules 가 다른 worktree 와 공유되므로
  실행하면 전체에 영향을 준다. 필요하면 요청만 한다.
- **`npm run test:integration` 및 `npm run test:run` 실행** — 로컬 DB 를 리셋해
  다른 세션을 깨뜨린다. 통합 테스트는 작성만 하고 실행하지 않는다.
- **`supabase db reset` 등 DB 스키마 변경** — 팀장 전용
- UI 컴포넌트 수정 (`app/**`, `components/**`) — 팀장이 담당
- `supabase/migrations/**` 작성 — SQL 초안만 보고
- 리팩터링·정리 작업 — 요구사항에 없으면 하지 않는다

## 완료 후
변경을 커밋한다. 커밋하지 않으면 팀장이 병합할 수 없다.
```bash
git add <담당 파일>
git commit -m "T-000: <요약>"
```

## 보고 요청 사항
1. 변경한 파일 경로와 변경 내용
2. 커밋 해시
3. 실행한 검증 명령과 결과
4. 실행하지 못한 검증과 이유
5. 기존 오류와 새 오류의 구분
6. 범위 밖이라 보류한 항목
7. 남은 제한·후속 필요 사항
```

---

## 역할별 실행 설정 (복사용)

쓰기 역할은 **worktree**에서, 읽기 역할은 **main**에서 실행한다.

| 역할 | 작업 폴더 | worktree 필요 |
| --- | --- | --- |
| `analyst` | main (`.../Project/PBC EMS`) | ❌ |
| `explorer` | main (`.../Project/PBC EMS`) | ❌ |
| `implementer` | `C:/Users/kjm12/pbc-ems-worktrees/<ID>` | ✅ |
| `quick_edit` | `C:/Users/kjm12/pbc-ems-worktrees/<ID>` | ✅ |

### analyst — 설계·분석·리뷰·QA

```markdown
## 역할
analyst

## 실행 설정
- 모델: gpt-6-astra
- effort: xhigh
- 샌드박스: read-only
- 작업 폴더: C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS   <!-- main. 최신 상태를 읽는다 -->
```

**담당 파일 절을 쓰지 않는다.** 대신:

```markdown
## 산출물
분석 결과만 보고한다. 제품 코드를 수정하지 않는다.
확인한 사실과 추정을 구분하고, 영향·위험·검증 기준을 제시한다.
구현이 필요하면 구현 범위와 완료 조건을 제안한다.
```

### implementer — 로직·API·DB·테스트

```markdown
## 역할
implementer

## 실행 설정
- 모델: gpt-6.1-sol
- effort: high
- 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/pbc-ems-worktrees/T-000
- 브랜치: wt/T-000
```

### quick_edit — 명확·저위험 수정

```markdown
## 역할
quick_edit

## 실행 설정
- 모델: gpt-6-luna
- effort: high
- 샌드박스: workspace-write
- 작업 폴더: C:/Users/kjm12/pbc-ems-worktrees/T-000
- 브랜치: wt/T-000

## 제약
인증·권한·결제·데이터 무결성·보안·다중 모듈 영향 작업은 맡지 않는다.
복잡성이 드러나면 범위를 확대하지 말고, 현재까지의 변경과 근거를 보고해
implementer 인계를 요청한다.
```

### explorer — 읽기 전용 탐색

```markdown
## 역할
explorer

## 실행 설정
- 모델: gpt-6-astra
- effort: high
- 샌드박스: read-only
- 작업 폴더: C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS   <!-- main -->

## 질문
1. <구체적인 질문>
2. <...>

## 산출물
파일 경로·줄 번호·근거를 명시해 답한다. 파일을 수정하지 않는다.
```

---

## 실행 명령 생성

지시서를 작성한 뒤 Claude Code가 실행한다. 지시서와 결과는 항상 **main 쪽 경로**에 둔다(이력을 한곳에 모으기 위해).

```bash
PBC="C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS"
ID="T-001"
TASK="$PBC/docs/orchestration/tasks/${ID}-<slug>.md"
OUT="$PBC/docs/orchestration/results/${ID}.md"
WT="C:/Users/kjm12/pbc-ems-worktrees/${ID}"
```

**쓰기 역할 — worktree 준비가 선행된다.**

```powershell
# 1단계: worktree 생성 (PowerShell). 검증이 12 passed 로 끝나야 한다
.\scripts\worktree-setup.ps1 -Name T-001
```

```bash
# 2단계: implementer
codex exec -C "$WT" -s workspace-write \
  -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  -o "$OUT" "$(cat "$TASK")"

# 2단계: quick_edit
codex exec -C "$WT" -s workspace-write \
  -c model="gpt-6-luna" -c model_reasoning_effort="high" \
  -o "$OUT" "$(cat "$TASK")"
```

**읽기 역할 — worktree 없이 main에서 바로.**

```bash
# analyst
codex exec -C "$PBC" -s read-only \
  -c model="gpt-6-astra" -c model_reasoning_effort="xhigh" \
  -o "$OUT" "$(cat "$TASK")"

# explorer
codex exec -C "$PBC" -s read-only \
  -c model="gpt-6-astra" -c model_reasoning_effort="high" \
  -o "$OUT" "$(cat "$TASK")"
```

작업 완료 후 병합과 정리는 [ORCHESTRATION.md](./ORCHESTRATION.md) §2.6을 따른다.

---

## 작성 시 흔한 실수

| 실수 | 결과 | 교정 |
| --- | --- | --- |
| worktree를 만들지 않고 쓰기 작업을 main에 띄운다 | 팀장 작업과 섞여 격리 실패 | `worktree-setup.ps1` 선행 |
| `codex exec --worktree`를 쓴다 | `node_modules`·`.env.local` 부재로 검증 전부 실패 | 스크립트로 준비한 worktree를 `-C`로 지정 |
| 검증 명령에 `npm run test:run`을 넣는다 | 통합 테스트가 로컬 DB를 리셋해 다른 세션 파괴 | `--exclude "tests/integration/**"` 형태로 |
| `1 skipped`를 통과로 본다 | 견적 회귀 기준선이 검증되지 않음 | 12 passed 가 정상. skip이면 멈추고 보고 |
| 범위 밖에 의존성 금지를 안 적는다 | `npm install`이 모든 worktree에 전파 | 항상 명시 |
| 완료 후 커밋을 요구하지 않는다 | 팀장이 병합할 수 없다 | `완료 후` 절 포함 |
| 담당 파일을 "해당 모듈" 식으로 뭉갠다 | 병합 충돌 비용 증가 | 경로를 전부 나열 |
| 완료 조건이 "정상 동작" | 검증 불가, 재작업 | "X 입력 → Y 반환" 형태로 |
| 범위 밖을 안 적는다 | 요청 안 한 리팩터링이 섞인다 | 금지 항목을 명시 |
| quick_edit에 설계 판단을 맡긴다 | 중도 인계로 왕복 | implementer로 바로 보낸다 |
| UI 작업을 Codex에 넘긴다 | 디자인 일관성 붕괴 | 팀장이 직접 구현 |
