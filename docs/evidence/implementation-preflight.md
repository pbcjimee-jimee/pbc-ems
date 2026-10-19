# 구현 사전 확인

확인일: 2026-10-16 (Australia/Sydney).
제품 코드 작성·의존성 설치·DB 생성·원격 변경은 아직 수행하지 않았다.

## 승인

- 설계안: docs/superpowers/specs/2026-10-16-pbc-ems-design.md
- 사용자 응답: 설계 승인 — 이 안으로 진행.
- Next.js + Supabase, 독립 EMS, 기존 견적 앱과 데이터 분리.
- 구현계획 검토와 실행 방식 선택은 Writing Plans 스킬의 다음 단계다.

## 작업 디렉터리

PBC EMS는 문서와 조사 자료만 있고 package.json, 앱 코드, .git이 없다.
기존 견적 앱을 수정하거나 해당 앱의 .env/토큰/서버 설정을 복사하지 않는다.
새 프로젝트 의존성은 새 package.json과 lockfile로 관리한다.
docs/evidence의 Jobber 배포물은 분석 자료이며 제품 코드/public 자산으로 포함하지 않는다.

## 런타임과 버전

Node.js v22.14.0/npm 10.9.2, rg, Git, Docker CLI가 설치되어 있다.
원본 Next.js 16.3.8의 설치된 docs에서 최소 Node 20.9, proxy.ts 규칙을 확인했다.

npm registry의 읽기 전용 조회 결과:
- next@16.3.8: 존재.
- @supabase/ssr: 0.12.7.
- @supabase/supabase-js: 2.118.0.
- pg: 8.23.1.

실제 사용할 버전은 구현 시 호환성·공식 문서를 확인해 정확히 고정한다.
이번 조회는 패키지를 설치하거나 원본 lockfile을 바꾸지 않았다.

## Supabase와 DB 검증

연결된 Supabase 도구의 list_projects, list_organizations, search_docs 호출이 성공했다.
Jimee-PBC 조직에는 PBC Quote cal과 PBC Quote cal Preview만 있고 EMS 프로젝트는 없다.
프로젝트 생성·키 조회·스키마 변경·테이블 데이터 조회는 하지 않았다.

Supabase 도구 계약상 새 원격 프로젝트 생성은 조직 확인과 비용 안내/확인이 필요하다.
이를 일반 설계 승인이나 기존 프로젝트 목록 조회로 대체하지 않는다.

Docker CLI는 설치됐으나 현재 Docker Desktop Linux engine이 실행 중이지 않다.
따라서 현 시점에 로컬 Supabase/RLS 통합 검증을 실행했다고 주장할 수 없다.
구현 시 설치된 Docker Desktop을 기동하고 로컬 격리 DB로 migration/RLS/transaction을 검증한다.
새 원격 프로젝트 연결은 이와 구분한다.

## 문서 확인

Supabase search_docs에서 현재 Next.js SSR 가이드를 읽었다.
- 세션은 검증된 getClaims/getUser 결과로 식별한다.
- 권한은 활성 회사 membership과 업무별 RLS로 별도 검사한다.
- SSR setAll의 쿠키와 응답 헤더를 함께 전달한다.
- 사용자 세션이 있는 응답이 다른 사용자에게 캐시되지 않게 한다.
- publishable key와 서버 전용 비밀 값을 구분한다.

공식 문서:
- https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs
- https://supabase.com/docs/guides/database/postgres/row-level-security

## 실제 견적 대조 한계

원본 tests/fixtures/historical-quotes.ts는 실제 과거 견적 3건이 아니라 교체 안내가 있는 샘플 1건이다.
원본 코드/테스트 보존 회귀와 실제 운영 견적 대조를 별도 검증으로 둔다.
실제 확정 견적 사례 대조는 운영 출시 전에 수행해야 한다.

## 원자 저장 구현 결정

설계의 서버 Decimal 재계산과 다중 테이블 원자 저장을 만족시키는 pg transaction 어댑터를 검토했다.
DB 트랜잭션 안에서 원본 TypeScript 엔진을 호출하기 위해 필요한 제한된 서버 전용 의존성이다.

- 업무 테이블은 Data API에 노출하지 않는 ems schema에 두고 RLS도 활성화한다.
- 업무 CRUD는 서버 어댑터로 통일해 브라우저가 계산/상태 검증을 직접 우회하지 못하게 한다.
- migration 관리자와 별도의 NOSUPERUSER/NOBYPASSRLS/NOINHERIT 비소유자 runtime 역할을 사용한다.
- 고정 EMS Supabase getUser로 검증한 user.id로만 최소 claims를 구성한다.
- 같은 pg client에서 BEGIN, LOCAL role/claims, 활성 membership, snapshot/row lock,
  Decimal 재계산, version 검사, 행/이력 저장, COMMIT을 수행한다.
- SQL 값 parameterization, 고정 식별자, TLS 검증, timeout, rollback 및 연결 초기화를 검사한다.
- 원본의 RPC 저장 payload 신뢰 경계는 그대로 복제하지 않는다.

이는 analyst의 읽기 전용 설계 검토 결과이며 실제 DB 실행 검증 결과가 아니다.
구현계획에 사용자 검토 대상으로 포함한다.

공식 근거:
- https://www.postgresql.org/docs/current/sql-set-role.html
- https://node-postgres.com/features/transactions
- https://supabase.com/docs/guides/api/using-custom-schemas

