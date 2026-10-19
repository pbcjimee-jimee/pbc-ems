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
- 작업 폴더: C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS

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
npm run test:run
```
<!-- 테스트를 팀장이 일괄 실행할 경우: "테스트는 실행하지 않고 작성만 한다"로 교체 -->

## 범위 밖 (하지 말 것)
- UI 컴포넌트 수정 (`app/**`, `components/**`) — 팀장이 담당
- `package.json` 의존성 추가 — 필요하면 요청만
- `supabase/migrations/**` 작성 — SQL 초안만 보고
- 리팩터링·정리 작업 — 요구사항에 없으면 하지 않는다

## 보고 요청 사항
1. 변경한 파일 경로와 변경 내용
2. 실행한 검증 명령과 결과
3. 실행하지 못한 검증과 이유
4. 기존 오류와 새 오류의 구분
5. 범위 밖이라 보류한 항목
6. 남은 제한·후속 필요 사항
```

---

## 역할별 실행 설정 (복사용)

### analyst — 설계·분석·리뷰·QA

```markdown
## 역할
analyst

## 실행 설정
- 모델: gpt-6-astra
- effort: xhigh
- 샌드박스: read-only
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
```

### quick_edit — 명확·저위험 수정

```markdown
## 역할
quick_edit

## 실행 설정
- 모델: gpt-6-luna
- effort: high
- 샌드박스: workspace-write

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

## 질문
1. <구체적인 질문>
2. <...>

## 산출물
파일 경로·줄 번호·근거를 명시해 답한다. 파일을 수정하지 않는다.
```

---

## 실행 명령 생성

지시서를 작성한 뒤 Claude Code가 실행한다.

```bash
PBC="C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS"
ID="T-001"
TASK="$PBC/docs/orchestration/tasks/${ID}-<slug>.md"
OUT="$PBC/docs/orchestration/results/${ID}.md"

# implementer
codex exec -C "$PBC" --skip-git-repo-check -s workspace-write \
  -c model="gpt-6.1-sol" -c model_reasoning_effort="high" \
  -o "$OUT" "$(cat "$TASK")"

# analyst / explorer (read-only)
codex exec -C "$PBC" --skip-git-repo-check -s read-only \
  -c model="gpt-6-astra" -c model_reasoning_effort="xhigh" \
  -o "$OUT" "$(cat "$TASK")"

# quick_edit
codex exec -C "$PBC" --skip-git-repo-check -s workspace-write \
  -c model="gpt-6-luna" -c model_reasoning_effort="high" \
  -o "$OUT" "$(cat "$TASK")"
```

---

## 작성 시 흔한 실수

| 실수 | 결과 | 교정 |
| --- | --- | --- |
| 담당 파일을 "해당 모듈" 식으로 뭉갠다 | 다른 작업과 충돌 | 경로를 전부 나열 |
| 완료 조건이 "정상 동작" | 검증 불가, 재작업 | "X 입력 → Y 반환" 형태로 |
| 범위 밖을 안 적는다 | 요청 안 한 리팩터링이 섞인다 | 금지 항목을 명시 |
| 테스트 실행을 모든 병렬 작업에 요구 | `--no-file-parallelism` 간섭 | 순차 배치 또는 팀장 일괄 실행 |
| quick_edit에 설계 판단을 맡긴다 | 중도 인계로 왕복 | implementer로 바로 보낸다 |
| UI 작업을 Codex에 넘긴다 | 디자인 일관성 붕괴 | 팀장이 직접 구현 |
