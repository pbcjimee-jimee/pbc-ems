# PBC EMS

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

사용자 확인: 기존 PBC-Quote-cal과 같은 Next.js + Supabase를 사용한다.
EMS 데이터 저장소는 기존 견적 앱과 분리한다. 원본은 Next.js 16.3.8, React 19.2.4,
TypeScript strict, decimal.js를 사용한다. 새 앱의 정확한 패키지 버전은 구현 시 공식 문서와
호환성을 확인해 고정한다.

## Users

Paint Buddy & Co.의 사무실 관리자와 현장 담당자가 사용하는 사내 업무 시스템.
회사의 표시명은 현재 로그인된 Jobber 화면에서 확인했다. 법인명·ABN·새 시스템의
최초 관리자 계정은 아직 확인하지 않았다.

## Product Purpose

Jobber를 대체하는 독립 EMS를 만든다. 고객 접수부터 견적, 작업 배정, 청구, 비용,
근무시간을 연결하고 현재 실제 사용하는 견적 계산·견적 생성 방식을 보존한다.

## Operating Context

- 원본 견적 프로젝트: C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC-Quote-cal
- 신규 EMS: C:/Users/kjm12/OneDrive/바탕 화면/Project/PBC EMS
- 사용자 확인일: 2026-10-16, Australia/Sydney.
- Jobber 회사 계정에는 여러 현장, 현장 방문, 여러 작업자, 종일 일정, 비용, 주별 근무기록이 존재한다.
- 제안 기본값: AUD와 Australia/Sydney. 기존 앱의 GST 계산을 보존한다.

## Capabilities and Constraints

사용자가 요청한 메뉴는 Create, Home, Schedule, Clients, Requests, Quotes, Jobs,
Invoices, Expenses, Timesheets이다. Create는 빠른 생성 메뉴다.

Quotes는 기존 앱의 실제 계산 엔진, 영역별 계산, 옵션, Timber 대안 비교,
고객용 견적 행, 가격·설정 스냅샷과 충돌 검사를 보존한다.
기존 고객용 견적 금액은 내부 원가 계산 결과와 별도로 작성된다.

상세 구조는 사용자가 2026-10-16 승인한
docs/superpowers/specs/2026-10-16-pbc-ems-design.md를 따른다.

기존 운영 DB·Jobber 기록의 일괄 이전, 새 외부 프로젝트 개설, 실제 고객 발송,
배포는 이번 조사에서 수행하지 않았다. 작업 목적에 필요한 연결·출시 준비는 구현 때
구체적인 대상과 권한을 확인한다.

## Brand Commitments

회사 표기는 Paint Buddy & Co. / PBC.
기존 견적 앱의 브랜드와 실제 업무 용어를 보존한다.
Jobber의 메뉴와 업무 흐름을 참고하되 Jobber 상표·로고·배포 코드를 제품에 복제하지 않는다.

## Evidence on Hand

- 사용자 요청과 독립 EMS / Next.js + Supabase / 데이터 분리 답변.
- 기존 견적 소스 기준 commit: f4c97d5b1ae971150294f9b1b1e798c47cb2daa3.
- Jobber의 요청 메뉴 전체 화면 읽기 관찰. 개별 생성·변환·저장 동작은 실행하지 않았다.
- 공개 배포 자바스크립트 일부에 대한 REA 정적 분석.
- docs/evidence/jobber-and-quote-findings.md 및 REA JSON 요약.
- 기존 로컬 102개 상품은 seed이며 운영 최신 가격표와 동일하다고 확인하지 않았다.

## Product Principles

- 원본 견적의 실제 결과를 회귀 검증으로 보존한다.
- 입력한 정보를 다음 업무 단계에서 재입력하지 않게 한다.
- 확정 견적·작업·청구 금액과 과거 가격을 보존한다.
- 현장에서 일정·현장 정보·근무기록을 좁은 화면에서도 처리할 수 있게 한다.
- 실제 데이터와 샘플을 구분하고 관찰·제안·미확인 사항을 구분한다.

## Accessibility & Inclusion

WCAG 2.2 AA를 기본 목표로 한다. 한글·영문·숫자·주소와 긴 현장명을 지원한다.
키보드 조작, 보이는 포커스, 색 외 상태 표시, 화면 확대와 모바일 브라우저를 검증한다.

