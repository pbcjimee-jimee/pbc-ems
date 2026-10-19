# Jobber / 기존 견적 앱 조사 기록

조사일: 2026-10-16 (Australia/Sydney). 조사 범위는 읽기 전용 화면 관찰과 공개 배포물의 정적 분석이다.
Jobber 기록 생성·수정·발송·삭제, 기존 견적 앱 수정, 운영 DB 변경은 하지 않았다.

## 1. 실제 화면에서 관찰한 사실

회사 표시명: Paint Buddy & Co. 고객명·주소·연락처·실제 금액은 이 문서에 복제하지 않는다.

| 메뉴 | 관찰한 구성 | 구현에 활용할 점 |
| --- | --- | --- |
| Create | Client, Request, Quote, Job, Invoice 메뉴 | 독립 페이지 대신 빠른 생성 진입점 |
| Home | Requests/Quotes/Jobs/Invoices 상태 집계, 오늘 일정, 청구 대기·연체 링크 | 같은 원본 레코드에서 집계하고 목록 필터로 연결 |
| Schedule | 월간, 일간 진입, 날짜 이동, 필터, 종일·시간 지정 일정, 미배정 목록 | 현장 방문·작업자·미배정 상태 지원 |
| Clients | 검색, 태그·상태, 생성·정렬, 여러 현장을 가진 고객 | 청구 연락처와 여러 현장을 분리 |
| Requests | New, Assessment complete, Overdue, Unscheduled 등 상태와 날짜·검색 | 접수→현장 점검→견적 연결 |
| Quotes | 견적 번호, 고객, 현장, 날짜, 상태, 금액, 검색·목록 | 견적 생애주기와 고객용 금액 필요 |
| Jobs | 미배정, 지연, 청구 필요, 작업 유형·상태 필터 | 작업과 개별 방문을 분리 |
| Invoices | 초안, 발행, 미납·연체, 청구번호, 만기일, 잔액 | 수금기록으로 잔액을 계산 |
| Expenses | 일자, 이름, 설명, 영수증, 연결 작업, 작성자, 회계 코드, 금액 | 비용을 작업과 연결하되 미연결 비용 허용 |
| Timesheets | 일/주 보기, 작업자별 표, 팀 필터, 승인 메뉴 | 실제 근무와 견적상 인일을 분리 |

근거 화면: 현재 로그인된 secure.getjobber.com의 /home, /calendar,
/clients, /requests, /quotes, /jobs, /invoices, /expenses, /timesheets.
관찰 후 원래 일정 화면으로 복귀했다.

생성·변환·청구·승인 버튼은 실행하지 않았다. 목록에 보이는 상태명은 관찰 사실이지만
상태 전이와 서버 검증 구현은 이 조사로 확인하지 않았다.

## 2. REA 실행과 증거

기존 Chrome에는 REA가 요구하는 loopback CDP endpoint가 열려 있지 않았다.
브라우저를 종료하거나 보안 설정을 바꾸지 않았다.
현재 화면의 script/modulepreload URL을 읽고 해당 공개 정적 JS만 인증 없이 내려받아
REA analyze_javascript_application에 전달했다. 자바스크립트는 실행하지 않았다.

| 분석 | REA parent Evidence ID | 결과 |
| --- | --- | --- |
| index-ByBej6ru.js | ev_08ea8a9ad1b31ffdcab071dc25d353d1beed4c336d251892bad97728e938b67f | 349,015 bytes, 1 JS; 메모리 제한으로 application/semantic coverage partial |
| 상태·견적 query 관련 4개 파일 | ev_86638ba5084679dd3320e5b62835fc99a3b00061fc229050d30c0c0382fd4e84 | 17,554 bytes, 4 JS, parse failure 0; application inventory complete, semantic unknown |
| 상태 표시 asset identity | ev_54d662cfac5994e0db41b87cda0cf57a48e067cf6fa025ba65a48074af301e87 | statusLabel 파일의 SHA-256·정적 파일 정체성 확인 |

두 번째 분석은 큰 index를 다시 돌린 것이 아니라 업무 관련 소형 배포물로 입력 범위를 좁힌 것이다.
REA의 inventory complete는 선택한 4개 파일 범위에 한정된다.
Jobber 전체 코드, 서버 로직, 실제 상태 전이, 모든 함수 실행을 분석했다고 해석하면 안 된다.

상태 표시 파일의 직접 정적 읽기에서는 APPROVED, ARCHIVED, AWAITING_RESPONSE,
CHANGES_REQUESTED, CONVERTED, DRAFT 분기 후보를 확인했다.
이 문구 자체는 파일에서 관찰한 것이며 REA가 실제 업무 상태 전이를 실행해 확인한 결과가 아니다.

공개 JS 출처:
- https://secure.getjobber.com/assets_remix/index-ByBej6ru.js
- https://secure.getjobber.com/assets_remix/status-Nbf_12V8.js
- https://secure.getjobber.com/assets_remix/statusLabel-C2BqFVFL.js
- https://secure.getjobber.com/assets_remix/Quotes.graphql-Dt8_2qKK.js
- https://secure.getjobber.com/assets_remix/ClientStatus-Cld8kzw0.js

증거 JSON: jobber-index-rea-summary.json, jobber-feature-rea-summary.json,
jobber-quote-status-asset.json. 정적 JS는 evidence 디렉터리에만 두며 EMS 제품 코드에 포함하지 않는다.

## 3. 실제 견적 기능 이식 지도

원본 경로: C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC-Quote-cal
commit: f4c97d5b1ae971150294f9b1b1e798c47cb2daa3.
확인한 주요 계산 파일에는 git 미커밋 변경이 없었다.

| 원본 파일 | 보존할 책임 |
| --- | --- |
| lib/calculator.ts | Decimal 기반 F1~F5, 두 공식 평균, GST, Roof |
| lib/quote-labour.ts | 행별 작업일수×인원 합산 |
| lib/quote-calculation-totals.ts | Interior/Exterior/Roof별 공식·합계·미배정 처리 |
| components/quote-form/quote-option-totals.ts | 일반 옵션 독립 계산 |
| lib/quote-paint-comparison.ts | Timber Super Enamel/Aqua 비교 |
| lib/paint-comparison-types.ts | 대안·상속·직접 입력 타입 |
| lib/public-line-money.ts | signed 공개 단가·유효 범위 |
| components/quote-form/types.ts | 내부 재료 및 고객용 행 타입 |
| components/quote-form/quote-save-payload.ts | 계산과 고객용 공개합계 분리·Optional 규칙 |
| lib/actions/quotes.ts | 서버 재계산·트랜잭션·expectedVersion·가격/설정 스냅샷 |
| lib/jobber/quote-line-payload.ts | 고객용 행·설명/총액 방식과 내부 재료 제외 |
| lib/products/dulux-paints.ts | 102개 seed 상품; 운영 최신 카탈로그 여부 미확인 |

## 4. 계산에서 발견한 경계

D=행별 인일 합, M=시장가 스냅샷 합, A=actual 가격 스냅샷 합.
기본 설정 예시에서 F1=500D+M, F2=460D/0.70+M,
F3=(460D+A)/0.70, F4=380D/0.75+M, F5=(380D+A)/0.70.
금액·일당·마진은 실제 pricing settings에서 받아야 하며 예시를 하드코딩하지 않는다.

문서의 F3/F5 설명은 Market이지만 실제 코드와 테스트 기대값은 A를 사용한다.
또한 기존 DECISIONS 문서에는 actual_price_snapshot의 운영 의미가 RRP일 수 있다고 설명되어 있다.
따라서 A를 검증된 실제 비용 장부라고 해석하거나 문서 수식으로 엔진을 다시 작성하면 안 된다.

- 선택한 두 공식은 단순 평균하며 자동 min/max 선택으로 바꾸지 않는다.
- Roof는 별도 일당 설정을 사용한다.
- 영역 합계 화면은 areaBreakdown.finalSubtotal/finalTotal을 사용한다.
- 전체 subtotal은 별도 일괄 공식 결과이므로 혼용하지 않는다.
- 미배정 행은 영역 합계에서 제외한다. 과거 영역 없는 견적의 fallback은 기존 서버 규칙을 따른다.
- 일반 Optional은 기본 금액에서 분리한다.
- Timber 차액은 각 전체 소계를 cents로 반올림한 뒤 Aqua−Super로 계산한다.
- 차액은 음수일 수 있으며 기본 공개 가격을 덮어쓰지 않는다.
- 고객용 Product/Service 행과 내부 계산 총액은 별개다.
- 자체 PDF/print 구현은 app/components/lib 범위 검색에서 발견하지 못했다.
  기존 고객 전달은 내부 저장 + Jobber write-back이므로 독립 EMS에 출력 기능이 필요하다.

## 5. 구현 때 재사용할 회귀 검증

calculator.test.ts, quote-labour.test.ts, quote-calculation-totals.test.ts,
quote-paint-comparison.test.ts, paint-comparison-client.test.ts, public-line-money.test.ts,
quote-actions-supabase.test.ts, quote-lifecycle-concurrency.test.ts,
fixtures/historical-quotes.ts를 기준으로 한다.

historical-quotes.ts는 실제 과거 견적이 아니라 교체 안내가 있는 샘플 1건이다.
기존 테스트 회귀와 실제 운영 견적 대조를 구분하고 출시 전에 비식별 확정 견적으로 별도 대조해야 한다.
이번 조사에서는 테스트를 실행하지 않았다.

