# UI78 — 전체 메뉴 여백 정리 · 달력 직접 편집 · 가족 대화

기준: UI77 (`ffdb155`). 공통 프레임을 유지해 메뉴 이동마다 헤더·내비게이션과 진입 애니메이션이 다시 만들어지는 현상을 제거했다. 상태 확인은 프레임에서 공유하며 개인 데이터는 서버 권한을 계속 확인한다.

- 전체 운영 메뉴의 외부 카드·상하좌우 여백·반복 안내·중복 탭을 제거했다. PC는 오른쪽 메뉴 영역만 확보하고 모바일은 기능 영역을 화면 폭으로 제공한다.
- 오늘: 오늘 일정 → 위치 → 대화. 빈 일정 영역을 눌러 등록한다. 별도 환영·권한 설명은 제거한다.
- 달력: 날짜/빈 칸으로 등록, 일정 제목으로 편집·삭제·복사. 종일, 매주 반복, 구성원·색상 지정, 월/주 보기, 현재 월 검색과 구성원 필터. 좌우 스와이프/드래그와 가로 트랙패드로 기간 이동, 세로 스크롤은 유지한다. 반복 수정·삭제는 전체 반복에 적용됨을 편집기에 표시한다.
- 학원비·메모·반복 일정: 제목/내용 영역에서 바로 편집한다. 삭제는 편집기 안에서 재확인한다. 다른 작성자의 자료는 읽기 전용이다.
- 부모B: 로그인 후 관리 → 승인번호로 합류. 현재 가족에서 이동할 경우 사용자가 연결 종료에 동의해야 하며, 기존 연결 해제와 새 합류는 하나의 트랜잭션이다. 유효하지 않은 번호/경합은 기존 가족을 유지한다. 다른 구성원이 있는 호스트 가족은 자동 해체하지 않는다.
- 대화: 날짜 구분·보낸 시각·작성자·말풍선·참여자·대화 본문 검색·이전 대화·하단 입력기·이모티콘·한글 조합 중 Enter 보호. 요청 결과 유실 시 동일 메시지 키 재전송으로 중복 저장을 방지한다. 현재 5초 전경 갱신이며 실제 수신/읽음 확인을 표시하지 않는다.
- 내 계정의 중복 메뉴·환영 설명·오늘 화면으로 버튼, 관리의 내 일정 관리하기 버튼 제거.

## 참고한 공개 UX

TimeTree의 날짜/일정 선택 후 편집·복사·삭제 흐름, 구성원별 색상, 월/주 보기와 검색을 참고했다. 외형이나 자산을 그대로 복제하지 않았다.
- https://support.timetreeapp.com/hc/en-us/articles/205198555-How-to-copy-edit-delete-events
- https://support.timetreeapp.com/hc/ko/articles/207641106
- https://support.timetreeapp.com/hc/ko/articles/206212261

## 검증

타입 검사·운영 빌드, 단위/API 142개, 실제 PostgreSQL 28개 시나리오, Chromium 브라우저 69개 검사를 통과했다. 320·390·768·1024·1440px 화면 및 직접 등록·수정·복사·삭제·스와이프·가족 합류·대화·작성자 권한을 검증한다. 원격 검증: https://github.com/123456789pjh321-beep/iharu/actions/runs/42378520386

운영 데이터에 가상 가족이나 테스트 메시지를 생성하지 않는다. 새 SQL은 기존 경로를 유지하는 확장 마이그레이션이다. 카카오 지도 공급자의 활성화 상태 및 실제 GPS 공유는 이번 변경 범위에 포함하지 않는다.

## 변경 파일

| 구분 | 파일 | 변경 |
|---|---|---|
| 추가 | `db/migrations/20261107132531_direct_family_chat.sql` | 가족 전환 트랜잭션, 대화 조회·전송과 중복 방지 |
| 추가 | `web/src/components/WorkspaceGate.tsx` | 메뉴 간 상태 확인 공유 |
| 추가 | `web/src/components/PersonalCalendar.tsx` | 직접 조작 달력·검색·기간 이동 |
| 추가 | `web/src/components/PersonalChat.tsx` | 가족 단체 대화·이전 대화·검색 |
| 추가 | `web/src/direct-workspace.css` | 전체 메뉴 공통 여백 제거·반응형 화면 |
| 추가 | `tests/e2e/direct-workspace.spec.ts` | 직접 편집·가족 합류·대화·화면 폭 회귀 |
| 추가 | `docs/UI78-direct-workspace.md` | 변경 내역과 검증 기록 |
| 수정 | `web/src/App.tsx` | 공통 프레임과 인증 분기 |
| 수정 | `web/src/api.ts` | 공유 세션 사용 시 중복 요청 생략 |
| 수정 | `web/src/components/AuthLayout.tsx` | 프레임 유지·중복 안내와 탭 제거 |
| 수정 | `web/src/components/RouteEffects.tsx` | 메뉴마다 화면이 깜박이는 전환 제거 |
| 수정 | `web/src/components/WorkspaceNavigation.tsx` | 달력으로 직접 이동·전체 메뉴 설명 정리 |
| 수정 | `web/src/components/Icon.tsx` | 검색·복사·전송 등 기능 아이콘 |
| 수정 | `web/src/main.tsx` | 공통 화면 스타일 연결 |
| 수정 | `web/src/pages/PersonalWorkspace.tsx` | 오늘·달력·학원비·메모·관리와 직접 편집기 |
| 수정 | `web/src/pages/Account.tsx` | 계정 중복 설명·탭·오늘 이동 제거 |
| 수정 | `shared/workspace.ts` | 종일·색상·대화 커서 계약 |
| 수정 | `server/workspace/routes.ts` | 부모 전환·대화 API 입력 검증 |
| 수정 | `tests/workspace.test.ts` | 권한·대화·부모 전환·일정 API 검사 |
| 수정 | `tests/integration/postgres.ts` | 실제 DB 동시 전송·전환 실패 롤백 검사 |
| 수정 | `tests/e2e/auth-flow.spec.ts` | 정리된 오늘 화면 검증 |
| 수정 | `tests/e2e/child-account-onboarding.spec.ts` | 자녀 가입·직접 일정 등록·읽기 전용 검사 |
| 수정 | `tests/e2e/family.spec.ts` | 새 오늘 화면 진입 기준 |
| 수정 | `tests/e2e/login-landing.spec.ts` | 새 오늘 화면과 기존 로그인 분기 검사 |
| 수정 | `tests/e2e/workspace-shell.spec.ts` | 전체 메뉴 프레임과 넘침 검사 |
| 수정 | `.github/workflows/check.yml` | 성공한 화면도 검증 자료로 보관 |

삭제 파일: 없음.
