# Codex 작업 지시서 템플릿

Codex는 별도 프로세스라 대화 맥락이 없다. **이 파일 하나로 완결되게** 쓴다. `tasks/T-<번호>-<slug>.md`로 복사.

Claude 서브에이전트(`ui-ux`·`test`)는 역할 정의에 원칙·금지·검증이 이미 있으므로 지시서 파일이 필요 없다. Agent 프롬프트에 요구사항·담당 파일·완료 조건·이번 작업 제약만 담는다.

## 템플릿

```markdown
# T-000: <제목>

## 역할 / 실행
implementer · gpt-6.1-sol · high · workspace-write
작업 폴더: C:/Users/kjm12/pbc-ems-worktrees/T-000 (브랜치 wt/T-000)

## 배경
<왜 필요한지 2~4줄>

## 요구사항
1. <검증 가능한 단위>

## 담당 파일 (쓰기 허용)
- `lib/<path>.ts`
- `tests/<path>.test.ts`

목록 밖은 읽기만. 수정이 필요하면 **수정하지 말고 근거와 함께 보고**한다.

## 참고 (읽기만)
- `PRODUCT.md`, `lib/<유사 모듈>.ts`

## 완료 조건
- [ ] <"X 입력에 Y 반환" 형태. "동작한다"는 쓰지 않는다>

## 검증
`AGENTS.md`의 검증 명령을 따른다. 정상은 12 passed / 192 tests.
`1 skipped`면 작업을 멈추고 보고한다.

## 범위 밖
`AGENTS.md`의 금지 항목 전체. 추가로 UI(`app/**`, `components/**`)는 `ui-ux` 담당,
요구사항에 없는 리팩터링 금지.

## 완료 후
`git add <담당 파일> && git commit -m "T-000: <요약>"`
커밋하지 않으면 팀장이 병합할 수 없다.

## 보고
`ORCHESTRATION.md`의 보고 요구를 따른다. 커밋 해시를 포함한다.
```

## 역할별 실행값

| 역할 | 모델 | effort | 샌드박스 | 폴더 |
| --- | --- | --- | --- | --- |
| `analyst` | `gpt-6-astra` | xhigh | read-only | main |
| `explorer` | `gpt-6-astra` | high | read-only | main |
| `implementer` | `gpt-6.1-sol` | high | workspace-write | worktree |
| `quick_edit` | `gpt-6-luna` | high | workspace-write | worktree |

`analyst`·`explorer`는 담당 파일 절 대신 **산출물**(분석 결과만, 사실과 추정 구분, 경로·줄 번호)을 쓴다.
`quick_edit`에는 인증·권한·결제·데이터 무결성·보안·다중 모듈 작업을 맡기지 않는다. 복잡성이 드러나면 `implementer` 인계를 요청하게 한다.

실행 명령은 [ORCHESTRATION.md](./ORCHESTRATION.md) 참조. 쓰기 역할은 `worktree-setup.ps1`이 선행된다.

## 흔한 실수

| 실수 | 교정 |
| --- | --- |
| UI·테스트를 Codex 지시서로 만든다 | `ui-ux`·`test`에 위임 |
| `ui-ux`와 `test`를 같은 파일에 동시 투입 | main 공유 — 범위 분리 또는 순차 |
| 서브에이전트 작업 중 팀장이 같은 파일 수정 | 담당 파일을 건드리지 않는다 |
| `codex exec --worktree` 사용 | 스크립트로 준비한 worktree를 `-C`로 |
| 검증에 `test:run` 포함 | `--exclude "tests/integration/**"` |
| `1 skipped`를 통과로 본다 | 회귀 기준선 미검증 — 멈추고 보고 |
| 담당 파일을 "해당 모듈"로 뭉갠다 | 경로를 전부 나열 |
| 완료 조건이 "정상 동작" | 관측 가능한 입출력으로 |
| 완료 후 커밋 요구 누락 | 병합 불가 |
