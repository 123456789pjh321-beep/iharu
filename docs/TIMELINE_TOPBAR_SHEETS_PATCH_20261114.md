# 타임라인 상단바·상세창·등록창 패치

기준: 43b5ee2e6c9c0347c0013e89a72cc403454de0e4 (2026-11-14)

## 변경 내용

- 상단바: 타임라인 전용 너비·여백 덮어쓰기를 제거하고 시간표·달력·가계부와 같은 구성원 필터를 사용합니다. 월 제목, 초대 버튼, 구성원 버튼, 이중 화살표 위치가 같아집니다. 조회할 작성자는 타임라인에만 적용됩니다.
- 게시글: 별도 더보기 버튼을 제거했습니다. 카드 전체를 누르거나 키보드 Enter/Space를 누르면 상세창이 화면 아래에서 올라옵니다. 닫기·Escape·바깥 영역 선택으로 닫을 수 있습니다.
- 상세창: 사진·위치·전체 글은 안에서 스크롤하고 즐겨찾기·수정·삭제 동작은 하단에 유지됩니다.
- 등록·수정: 아래에서 올라오는 전체 화면 입력창으로 변경했습니다. 상단 제목·닫기와 하단 취소·저장은 고정하고, 입력 영역만 스크롤합니다. 휴대전화 안전 영역과 동적 화면 높이를 반영하고, 넓은 화면의 입력 폭은 1040px까지 사용합니다.
- 동작 줄이기 설정에서는 이동 애니메이션을 생략합니다. 기존 사진·위치·저장·임시 보관 동작은 유지됩니다.

## 파일 목록

| 구분 | 경로 | 주요 변경 |
| --- | --- | --- |
| 수정 | web/src/components/CalendarMemberPreferenceFilter.tsx | 저장 기능 없는 타임라인 선택 상태도 공통 필터로 표시 |
| 수정 | web/src/components/workspace-topbar.css | 타임라인 전용 상단바 너비·여백 규칙 제거 |
| 수정 | web/src/components/MemoEditor.tsx | 입력 초기 포커스 및 닫은 뒤 포커스 복원 |
| 수정 | web/src/pages/Timeline.tsx | 공통 필터, 카드 전체 상세 열기, 더보기 제거 |
| 수정 | web/src/pages/timeline.css | 하단 상세 시트, 전체 화면 등록창, 애니메이션·반응형 배치 |
| 수정 | tests/e2e/timeline.spec.ts | 카드 터치, 실제 월 슬라이드, 모션·키보드·입력창 크기·스크롤 검증 |
| 수정 | tests/e2e/workspace-topbar.spec.ts | 4개 메뉴 상단 요소 위치·크기와 독립 필터 검증 |
| 추가 | docs/TIMELINE_TOPBAR_SHEETS_PATCH_20261114.md | 변경·적용·검증 안내 |

삭제 파일: 없음. DB/API 변경: 없음.

## 적용 및 검증

ZIP은 수정·추가 파일만 원래 경로로 포함합니다. 기존 프로젝트 루트에 덮어씁니다.

- 빌드/타입 검사: `npm run build`
- 단위/서버 검사: `npm test`
- 타임라인 및 알림: `npx playwright test tests/e2e/timeline.spec.ts tests/e2e/notification-calendar.spec.ts --workers=1`
- 공통 상단바 및 관련 회귀: `npx playwright test tests/e2e/workspace-topbar.spec.ts tests/e2e/group-ledger-recovery.spec.ts tests/e2e/continuous-workspace.spec.ts --workers=1`
- 브라우저 검증 범위: 폭 320/520/820/1440px, 짧은 높이 500px, 다크 모드, 동작 줄이기, 실제 터치, 사진·위치 저장 및 수정·삭제.
