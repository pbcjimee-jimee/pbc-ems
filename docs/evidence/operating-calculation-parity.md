# Operating source comparison — 2026-10-16

원본 Supabase 프로젝트 PBC Quote cal에 SELECT만 실행했다. 원본 DB·상품·고객·견적·Jobber 기록은 변경하지 않았다.

- 활성 상품: 105개. 새 선택 상품은 원본 `resolveTrustedProductRowPrice`와 동일한 `coalesce(rrp_price,market_price,price)` 소비자 가격 정책을 적용한다.
- 운영 pricing settings 10개를 원본 snake_case에서 엔진 camelCase로 변환했다. 기존 원본 기본 설정과 일치한다.
- 최근 저장된 실제 견적 3건의 계산 입력만 가져와 EMS 엔진에 넣었다. 고객 이름·주소·Jobber payload를 제외했다.
- 재료 행 수 5 / 5 / 3. 저장된 subtotal·final_total과 EMS `main.subtotal`·`main.finalTotal`이 3건 모두 소수점 2자리까지 일치했다.
- 검증 명령: `node node_modules/vitest/vitest.mjs run tests/operating-quote-parity.test.ts` — 3/3 PASS.
- 캡처 데이터는 ignored `.local/`에 보관하며 제품의 public asset, 배포 소스 또는 공개 문서에 포함하지 않는다.

이 검증은 캡처 시점 3건의 주 계산 일치 근거이다. 모든 과거 견적이나 모든 optional/Timber 조합을 운영 데이터로 검증했다는 의미는 아니다. 해당 조합은 이식한 원본 회귀·경계 테스트에서 별도 검증한다. 제조사 가격의 최신성도 보증하지 않는다.
