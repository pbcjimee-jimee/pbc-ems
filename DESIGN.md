# PBC EMS Design

<!-- impeccable:design-schema 1 -->

일반 UI/UX 기준은 전역 `~/.claude/CLAUDE.md` §4. 아래는 이 제품 고유값만.
근거: `PRODUCT.md`, `docs/superpowers/specs/2026-10-16-pbc-ems-design.md`.

사무실과 현장 휴대폰에서 쓰는 사내 업무 시스템. 조용한 밝은 표면, 조밀하고 읽기 쉬운 작업 목록, 명확한 다음 행동. Jobber 메뉴 순서와 PBC 용어는 보존하되 Jobber 브랜딩·코드는 복사하지 않는다.

## 토큰

- Primary `#0b66d8` · 전경 `#0f2440` · 보조 전경 `#536477`
- 경계 `#d8e0e9` · 배경 `#f5f7fa` · 표면 `#ffffff`
- 포커스 링은 primary, 주변 대비 확보. 상태는 텍스트 + 절제된 의미색.
- System sans: Aptos, Segoe UI, Noto Sans KR, Malgun Gothic, sans-serif
- 본문 14–16px · 제목 24–30px(고정 rem) · 메타 12–13px
- 표의 수치는 tabular numerals + 우측 정렬
- 간격 4/8/12/16/24/32px. 레이블·입력은 붙이고 작업 단위는 분리.
- 작은 radius, 절제된 경계. 장식 그라디언트·글래스·히어로·아이콘 카드 금지.

## 프레임

데스크톱: 사이드바 224px, 상단 컨텍스트 헤더 64px, 가변 작업 영역.
사이드바 순서: PBC 마크/회사 → Create 디스클로저 → Home, Schedule, Clients, Requests, Quotes, Jobs, Invoices → Expenses, Timesheets.
헤더: 페이지 컨텍스트, 권한 범위 검색, 로그인 사용자·로그아웃.
본문: 제목+주 액션 → 의미 있는 상태/필터 행 → 실제 목록 또는 작업 폼.

태블릿: 공간에 따라 사이드바를 좁히거나 디스클로저로. 페이지 전체를 비례 축소하지 않는다.
모바일: 접근 가능한 dialog 내비게이션, 페이지 컨텍스트 상시 노출, 액션 수직 배치, 핵심 필드만 보이는 조밀한 목록 + 탭 시 상세.
Schedule은 좁은 화면에서 일/목록 뷰, 넓은 화면에서 월 그리드 유지.

## 레코드·편집 표면

목록은 검색/필터와 빈·오류·로딩 상태를 공유한다.
표의 주 행 콘텐츠는 실제 링크로 — 키보드 접근을 숨기는 행 클릭 핸들러를 쓰지 않는다.
긴 고객·현장명은 줄바꿈하고, 주소 전체는 상세 페이지에 유지한다.
폼은 상시 레이블, 연결된 오류 텍스트, 필수 안내, 보이는 저장 상태를 쓴다.
금액 입력은 AUD와 Ex GST/Inc GST 맥락을 표시한다. 선택 가능과 선택됨을 구분한다.
견적 편집기는 내부 계산과 고객 노출 범위·가격을 분리한다. 인쇄 출력은 별도 allowlist 문서 표면이다.

## 인터랙션

디스클로저 링크는 네이티브 키보드 동작, 모달은 네이티브 dialog의 포커스·Escape 복귀를 쓴다.
페이지 로드 연출과 장식 모션은 넣지 않는다. 동작 줄이기에서는 즉시 정적 피드백을 남긴다.
Supervisor UI는 배정된 작업과 본인 기록을 우선하며, 데이터 페이로드에 숨은 재무 정보를 담지 않는다.

## 공용 컴포넌트 (2026-10-20 Jobber 기반 개편)

모든 화면은 `components/ui/**`를 조합한다. 화면마다 아래 패턴을 직접 만들지 않는다.

- `PageHeader`: 뒤로가기, eyebrow(레코드 번호), 제목, meta 행(상태·고객·금액), actions(보조 → `MoreMenu` → 주 액션 순).
- `Tabs`(개수 배지가 있는 상태 필터, 실제 URL)와 `Segmented`(Day/Week/Month/List 같은 보기 전환).
- `FilterBar` + `SelectFilter`: 검색 → 필터 → Apply/Reset. 상태는 탭에 두고 중복 select를 만들지 않는다.
- `DataTable`: 주 셀에 실제 레코드 링크. 40rem 이하에서 `data-label`을 쓰는 카드형 행으로 전환.
- `Card`(title·count·action·flush), `DetailList`, `Metric`, `Notice`(info/success/warning/danger), `EmptyState`(아이콘 + 다음 행동), `Pagination`, `ActivityFeed`.
- `StatusBadge`: 모든 레코드 종류에 공통인 상태 색·문구 맵. 점 + 텍스트, 색만으로 전달하지 않는다.
- `WorkflowTrail`: 상세 화면의 Request → Quote → Job → Invoice 연결. Supervisor에게는 Quote/Invoice 단계를 보여주지 않는다.
- 상세 화면은 `.detail-layout`: 본문 열 + sticky 요약 사이드바(1100px 미만에서는 본문 위로 이동).
- 현장 행동(Start/Complete visit, Record time)은 헤더 바로 아래에 두어 휴대폰에서 스크롤 없이 누를 수 있게 한다.
- 모바일 셸: 상단 바 + 하단 탭바(Home, Schedule, Jobs, Time, More). 데스크톱 생성 진입점은 사이드바 Create 하나, `/`는 전역 검색 포커스.
