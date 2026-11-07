# 아이하루 UI 7.4 — 반응형 디자인 및 탐색 개선

작성: 2026-11-07. 기준: 운영 main db066c8. 변경 범위: 화면·탐색·접근성. 가족 연결 API/인증/DB 변경 없음.

## 벤치마킹과 적용

서비스의 인지도나 성공 수치를 임의로 단정하지 않고, 공식 설명에서 확인한 사용 패턴을 참고했다. 상표·전용 스티커 디자인은 복제하지 않는다.

| 공식 자료 | 확인한 패턴 | 아이하루 적용 |
| --- | --- | --- |
| [TimeTree 탐색 개편](https://timetreeapp.com/intl/en/newsroom/2026-01-13/renewal-timetree-newsroom) | 모바일의 간결한 하단 탐색 | 주요 4개 메뉴 + 더 보기. 아이 전용 화면은 3개 메뉴 유지 |
| [TimeTree 라벨·색상](https://support.timetreeapp.com/hc/en-us/articles/360000295961-How-to-customize-events-Labels-and-Colors) | 색상과 이름으로 일정 구분 | 선택 메뉴에 색상·짧은 이름·현재 페이지 표시 병행 |
| [TimeTree 전환 개선](https://timetreeapp.com/intl/en/newsroom/2026-01-21/introduction-restructure-02) | 부드러운 달력 전환 | 페이지 내용 준비 후 짧은 진입 효과, 고정 탐색 유지 |
| [Cozi 기능 안내](https://www.cozi.com/feature-overview/) | 가족 일정·목록을 일관된 탐색으로 제공 | 모든 기능에 공통 화면 골격·버튼·탭·여백 |
| [FamilyWall](https://www.familywall.com/) | 가족 일정·대화 등 기능의 통합 | 상세 메뉴도 전체 메뉴에서 한 번에 접근 |
| [LINE 스티커 안내](https://help.line.me/line/smartphone?contentId=20000182&lang=en) | 감정·인사를 그림으로 표현 | 기존 Twemoji 그림 + 한국어 짧은 설명을 확대하고 선택 상태 강화. 기존 라이선스 표기 유지 |
| [Android 적응형 탐색](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns?hl=en) | 화면에 맞춘 탐색 방식 | PC·태블릿 오른쪽 레일, 모바일 하단 탐색·전체 메뉴 |
| [Motion 접근성](https://motion.dev/docs/react-accessibility) | 시스템의 움직임 줄이기 존중 | OS 설정·앱 조용한 화면 설정 모두 반영 |

## 공통 디자인

- 글꼴: 기존 Pretendard/Noto Sans KR/Manrope의 사용자 선택 유지. 작은 설명보다 본문과 행동을 우선한다.
- 배경: 차분한 회청색 캔버스 + 흰 카드, 선명한 청색 행동 버튼. 어두운 화면은 별도 색상 토큰 사용.
- 카드 16px, 메뉴 12px, 주요 버튼 최소 44px. 선택 상태를 색상 하나에만 의존하지 않는다.
- 화면 전환은 260ms, 8px 진입 + 투명도. 입력 폼을 복제하거나 저장·이동을 지연시키지 않는다.
- 이미 설치된 Motion/Lucide/폰트 패키지 활용. 추가 외부 스크립트나 추적 플러그인 없음.
- 스티커는 실제 전송 전에 사용자의 선택·기존 확인 절차 유지. 메시지 카탈로그 ID/API 계약 유지.

## 레이아웃 규칙

| 환경 | 탐색 | 내용 영역 |
| --- | --- | --- |
| 761px 이상 | 오른쪽 레일, 실제 헤더·배너 높이에 맞춰 배치 | 내부 스크롤, 바깥 브라우저 스크롤 없음 |
| 760px 이하 | 오늘·달력·대화·가족 + 더 보기 | 하단 메뉴는 별도 레이아웃 행. 마지막 버튼을 덮지 않음 |
| 아이 화면 | 내 하루·내 일정·가족 대화 | 기존 기기 로그인·연결 상태 유지 |
| 긴 탭 | 한 줄 가로 탐색, 활성 탭 자동 노출 | 본문 폭을 늘리지 않음 |
| 전체 메뉴 | 네이티브 dialog, Escape·닫기·배경 클릭 지원 | 키보드 초점 유지, 메뉴 이동 후 닫힘 |

## 검증 기준

자동화 대상은 운영 인증 화면 16개(기존 shell 회귀)와 테스트 기능 메뉴 12개 전체다. 테스트 작업실 데이터는 브라우저 내부에만 저장된다. 실사용자 계정·아이 위치를 테스트 데이터로 사용하지 않는다.

- 운영 경로: 오늘, 월간 일정, 반복 일정, 달력 별칭, 학원비, 위치, 대화, 기록, 알림, 가족, 계정, 재인증, 이메일 연결, 전화번호, 가족 초대, 기기 연결.
- 테스트 경로: today/calendar/daily/repeats/chat/family/devices/location/fees/records/notifications/account.
- 테스트 해상도: 320×740, 390×844, 600×960, 768×1024, 820×1180, 1024×768, 1440×900, 1920×1080, 844×390.
- 공통 검증: 탐색 영역 노출·화면 경계, 헤더 버튼과 로고의 비겹침, 본문 유효 높이, 바깥 가로·세로 overflow 없음.
- 행동 검증: 모바일 전체 메뉴의 12개 경로, Tab 초점 순환·Escape 복귀, 상세 메뉴 현재 상태, 큰 글씨·어두운 화면·움직임 줄이기 조합.
- 배포 전 기존 API 단위·실제 PostgreSQL 동시성/권한·브라우저 회귀 검증을 모두 통과해야 한다. 실제 실행 결과는 PR/CI 기록을 기준으로 한다.

## 변경 파일

추가: RouteEffects.tsx(비동기 화면 진입·레일 높이 계산), polish.css(공통 반응형 디자인), adaptive-design.spec.ts(다중 화면 회귀), 본 문서.
수정: WorkspaceNavigation.tsx(하단 주요 메뉴·전체 메뉴), Icon.tsx(격자 아이콘), Experience.tsx(공통 설정 노출·중복 진입 효과 제거), App.tsx(화면 전환 연결), main.tsx(디자인 적용).
삭제: 없음.
