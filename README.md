# PBC EMS

Paint Buddy & Co.의 별도 EMS. Next.js 16.3.8 / React 19 / Supabase Auth·Postgres·비공개 Storage를 사용합니다. 기존 PBC Quote cal 및 Jobber 기록을 수정하지 않습니다.

## 로컬 실행

Node 22와 Docker Desktop이 필요합니다. 잠금 파일의 의존성을 설치합니다.

```powershell
npx --yes npm@11.6.2 ci
npx supabase --profile supabase/local-cli-profile.json start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
npx supabase --profile supabase/local-cli-profile.json migration up --local
node scripts/local-db.mjs setup
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
```

앱: http://127.0.0.1:3100. 로컬 계정은 `admin@ems.local`, `supervisor@ems.local`이며 생성된 비밀번호는 ignored `.superpowers/sdd/pbc-ems/local-login.txt`에 있습니다. 운영용 계정이 아닙니다.

별도 로컬 포트는 API 55321, DB 55322, Studio 55323, 메일 55324입니다. 다른 프로젝트의 Supabase 컨테이너와 DB를 중지하거나 초기화하지 마세요. 회사·고객·현장은 화면에 Local sample/Sample로 표시합니다.

`setup`과 `seed`는 **이 EMS의 로컬 샘플 데이터 전체를 초기화**합니다. 실제 업무 데이터를 입력한 후에는 실행하지 마세요. 운영 DB에는 실행을 거부합니다. 테스트도 같은 로컬 샘플 데이터를 초기화합니다.

운영 견적 앱에서 읽은 상품 카탈로그의 로컬 사본 `.local/quote-catalog.json`이 있다면 샘플 초기화 후 아래 명령으로 다시 불러옵니다. 고객·견적·주소의 일괄 이관은 수행하지 않습니다.

```powershell
node scripts/import-local-catalog.mjs
```

2026-10-16 원본 운영 DB의 활성 상품 105개와 계산 설정을 읽었습니다. 소비자 RRP 정책을 그대로 사용하며, 제조사 가격의 최신성을 의미하지는 않습니다. 상품·단가·템플릿은 Quotes → Products, rates & templates에서 관리합니다.

## 업무 흐름

Create → Client와 Site → Request → Quote 작성·발행·승인 → Job 전환 → 방문 배정 → Invoice 작성·발행 → 입금 기록 순으로 연결합니다. 고객용 행과 내부 계산은 독립적으로 검토·저장합니다. Print / Save PDF는 고객용 행·주소·문구만 출력합니다.

관리자는 모든 업무를 관리합니다. 현장 감독자는 배정된 작업·일정을 보고 본인 경비·근무를 기록합니다. 견적 계산, 계약금액, 청구서 및 다른 직원의 경비는 전달하지 않습니다. 역할은 서버의 활성 membership과 DB RLS에서 검증하며 브라우저에서 변경할 수 없습니다.

AUD와 Australia/Sydney 기준입니다. 일정의 날짜·시간과 실제 근무시간은 별개입니다. 종일 일정은 날짜 범위, 시각 일정은 UTC timestamp로 저장합니다. DST의 존재하지 않거나 두 번 나타나는 시간은 입력 시 확인합니다.

## 검증

통합 테스트를 서로 다른 프로세스에서 동시에 실행하지 마세요. fixture가 전체 로컬 업무 데이터를 초기화합니다.

```powershell
node node_modules/vitest/vitest.mjs run --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/next/dist/bin/next build
npx supabase --profile supabase/local-cli-profile.json test db
npx supabase --profile supabase/local-cli-profile.json db lint --local --schema ems
```

`tests/operating-quote-parity.test.ts`는 ignored `.local/operating-cases.json`이 있는 경우에만 원본 운영 견적 3건의 계산 입력과 저장 금액을 대조합니다. 그 파일에는 고객 이름·주소·Jobber payload를 저장하지 않습니다. 이 환경에서 3건의 subtotal/final total 일치를 확인했습니다.

## 운영 연결 전 필요한 설정

현재는 별도 **로컬 Supabase**에 연결되어 있습니다. 회사 운영용 Supabase 프로젝트 생성·이관·인터넷 배포는 아직 수행하지 않았습니다. `.env.example`의 항목으로 운영 환경을 별도 구성하고, 관리자 membership을 신뢰할 수 있는 서버/마이그레이션 경로로 초기 등록해야 합니다. 런타임 DB 연결은 제한된 `ems_runtime` 계정이어야 합니다. 서비스 역할 키와 postgres 계정을 앱 런타임으로 사용하지 않습니다.

회사 문서의 사업자명·ABN·연락처·은행 정보는 Company details에 실제 확인된 값을 입력하세요. 기존 발행 문서와 승인 계약은 당시 snapshot을 유지합니다. 자동 이메일 발송·카드 결제·급여 계산은 포함하지 않습니다.

설계·기술 계약·검증 근거는 `docs/`, `supabase/ems-schema-contract.md`, `supabase/document-contract.md`를 참고하세요.

최종 테스트·실제 화면 검증·남은 도구 제한은 [검증 기록](docs/qa/verification-2026-10-16.md)에 있습니다.
