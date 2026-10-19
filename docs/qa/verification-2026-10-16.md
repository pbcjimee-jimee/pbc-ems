# PBC EMS 최종 검증 — 2026-10-16

별도 로컬 Supabase와 프로덕션 Next.js 서버 `http://127.0.0.1:3100`에서 확인했다. 운영 DB 연결·이관·배포 완료 보고서가 아니다. 브라우저 시나리오의 고객·주소·계약·입금은 모두 **Sample QA** 개발 자료이며 실제 거래가 아니다.

## 자동 검증

| 검사 | 실제 결과 |
|---|---|
| `node node_modules/vitest/vitest.mjs run --no-file-parallelism` | 19 files / **251 tests PASS**, 52.10초 |
| Supabase pgTAP `test db` | **19/19 PASS** |
| 원본 운영 견적 계산 대조 | 실제 비식별 3건 **3/3 PASS**, subtotal/final_total 일치 |
| TypeScript / 전체 ESLint | PASS |
| `next build` | PASS, 요청한 모든 업무 경로 생성 |
| `db lint --local --schema ems --fail-on error` | No schema errors |
| DB security advisors | No issues |
| 클라이언트 번들 환경변수 검사 | `.next/static` 32개 파일에서 비공개 DB DSN·local service key·test password 미발견 |

251개 테스트 후 화면에서 발견한 React 19 폼 reset과 Next 16.3.8 오류 재시도를 보완했다. 이 UI 변경은 실제 동일 조건의 브라우저 재현, 담당/전체 lint·타입 검사와 production 재빌드로 확인했다. 금액·RLS 서비스가 바뀌지 않은 뒤 같은 전체 DB suite를 반복하여 QA 자료를 초기화하지 않았다.

## 실제 브라우저 업무 흐름

Chrome에서 다음 과정을 실제 입력·저장·새로고침으로 확인했다.

1. Create → 고객 생성 → 청구 주소와 별도 현장 주소 저장. 긴 한글 이름·주소 유지.
2. 고객에서 Request 생성. 잘못된 Quoted 전이에 오류 표시. 수정 후 고객·현장·상태·문구를 다시 입력하지 않고 복구.
3. Request에서 Quote 생성 시 고객·현장·제목 자동 연결. 운영 활성 상품 105개 선택 가능. 상품 한 행, 작업일2 × 인원2, Interior F3/F5 선택 시 내부 subtotal **2676.42**, GST 포함 **2944.06**.
4. 고객 행 3000, 미선택 옵션500, 할인-100을 입력. 고객 subtotal **2900.00**, GST **290.00**, total **3190.00**. 내부 합계와 독립적으로 보존.
5. 견적 템플릿 저장 후 새 견적에 재적용하여 계산·고객 행·조건·합계 일치 확인.
6. 견적 저장 → 발행 → 승인 → 확정 Job 생성. 계약 금액·고객/현장·원래 Request 링크 확인.
7. Job에서 Visit 생성, Sydney 09:00–12:00와 관리자·감독자 2명 배정. 저장 상세의 날짜·시각·인원 유지. 방문과 Job 완료 상태 변경.
8. Job 계약에서 Invoice 복사 → 발행 → 입금1000 기록 시 balance **2190.00** → 입금2190 기록 시 paid / balance **0.00**.
9. Expense 저장 오류에서 입력값과 Job 선택 유지. 수정 후 **45.75** 비용 저장 및 상세 재열기.
10. Timer 시작 → 새로고침 후 같은 서버 시작시각 복원 → 종료. 수동 09:00–10:00/휴게15분/Visit 연결은 **45분**으로 저장, 제출·승인 후 일반 편집 링크 제거.
11. 헤더 Search에서 고객·Job 검색 후 실제 상세 링크 확인.
12. 별도 localhost 세션에서 실제 supervisor 로그인. Quotes/Invoices 메뉴와 계약금액·다른 직원 비용이 없는 Job 화면 확인. `/quotes` 직접 접근도 관리자 전용 안내로 제한.

일정 DST·종일·중복 배정·다중일, 동시 저장·변환·입금, 가격/주소 snapshot, 역할 위조·타회사 접근, 실제 private Storage 업로드·다운로드·관리자 교체·재시도, 승인 후 수정 이력은 자동 통합 검증에 포함되어 있다.

## 화면·접근성

- 실제 렌더링 폭: 데스크톱1278px, 중간768×1024, 모바일390×844. 모바일은 viewport 에뮬레이션이다. 합성 touch나 실기기로 검증했다는 의미가 아니다.
- Home, 고객·요청, 견적 입력·출력, 월 일정, 비용, 근무 화면을 확인했다. 확인한 좁은 화면에서 문서 전체의 가로 넘침이 없었고, 표는 필요한 경우 자체 영역 안에서 스크롤한다.
- 한글·영문 폴백, 긴 주소 줄바꿈, 포커스 테두리, native label/required/error 상태 확인. 모바일 내비게이션 Escape 닫기 후 Open navigation 버튼으로 포커스 복귀 확인.
- 기본 대비 계산: primary/white **5.38:1**, text/white **15.59:1**, muted/white **6.13:1**. 입력 테두리를3:1 이상인 **3.51:1**로 보완했다. 모든 화면·상태를 전수 WCAG 인증한 것은 아니다.
- 생성/조회 중 loading, 빈 목록, 저장 pending/disabled, 잘못된 상태의 오류와 입력 유지, 일시적인 서버 오류의 Try again 복구를 확인했다.
- 서버 오류 복구는 로컬 테스트 설정으로 오류를 재현한 뒤 원래 값을 복원하고 Try again만 눌러 정상 견적 화면으로 돌아오는 것으로 확인했다. 원래 운영 설정은 그대로 복원했다.

## 고객 출력

견적·청구 고객 HTML 미리보기와 표·금액·한글·조건을 실제 화면에서 확인했다. 견적은 미선택 옵션을 Excluded from total로 표시하고 청구는 제외한다. 출력 DTO/DOM에 내부 actual materials·formula·PRIVATE QA MEMO가 없는 것을 확인했다. 청구 출력의 paid3190 / balance0도 확인했다. 취소본은 별도 NOT PAYABLE 표시·잔액0·송금 안내 제외로 구현했고 DTO 회귀 테스트를 통과했다.

Print / Save PDF 호출 후 브라우저 인쇄 처리가 시작되어 자동화 입력이 대기했고 Escape로 원래 문서에 복귀했다. **PDF 파일 저장, 실제 A4 다중 페이지 나눔·머리말 반복은 자동화에서 확인하지 못했다.** 관련 print CSS는 구현되어 있으며 실제 저장 후 마지막 수동 확인이 필요하다.

## 남은 환경 제한

- 브라우저 확장의 `Allow access to file URLs`가 비활성이라 CUA 파일 선택에 실패했다. 이 설정을 변경하지 않았다. 영수증의 실제 Auth/Storage 업로드·권한·signed link·교체·재시도는 통합 테스트로 검증했지만 **브라우저 파일 선택부터 저장까지의 전 과정과 오류 후 File 객체 유지**는 미검증이다.
- 브라우저 zoom 단축키를 보냈지만 DPR/viewport가 변하지 않아 **실제200% 확대를 검증했다고 주장하지 않는다**. 좁은 viewport 검증과 구분한다.
- 운영용 Supabase 프로젝트·최초 실제 직원·법인/ABN/은행 정보·공개 배포는 아직 구성하지 않았다. 현재 샘플 계정과 별도 로컬 DB로 실행된다. 실제 데이터를 넣은 뒤 seed나 통합 테스트를 실행하면 안 된다.
- DB와 Storage 사이에는 보상 삭제를 사용한다. 프로세스 강제 종료까지 단일 원자 transaction으로 처리하지는 않는다.

## 화면 증빙

- [Home](desktop-home.jpg)
- [모바일 요청 오류 복구](mobile-request-error.jpg)
- [모바일 일정](mobile-schedule.jpg)
- [중간 폭 근무 화면](tablet-timesheets.jpg)
- [견적 고객 미리보기](quote-preview.jpg)
- [감독자 작업 화면](supervisor-job.jpg)

독립 검토의12개 P2는 코드 수정 재검토에서 종료되었고, 추가 구체적 P1/P2가 남지 않았다. 상세 검토·수정 근거는 `.superpowers/sdd/pbc-ems/integration-review.md`에 있다. 이 문서의 브라우저/자동 검증 범위와 위 미실행 검증을 함께 읽어야 한다.
