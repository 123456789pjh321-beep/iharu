# UI118 · 상단 타이틀바와 시간표 정리

사용 안내를 본문 배너/버튼에서 맨 위 타이틀바 버튼으로 옮긴다. 처음 사용하는 계정은 작은 점으로 안내를 표시하고, 완료 기록·전체메뉴에서 다시 보기·자녀용 안내는 유지한다. 사용 안내를 닫으면 상단 버튼으로 초점을 돌린다.

타이틀바의 브랜드는 해 아이콘만 표시하며 링크의 접근 가능한 이름은 아이하루로 유지한다. 주간 시간표의 현재 시간 버튼을 같은 타이틀바로 옮기며 실시간 갱신과 현재 시간으로 이동을 유지한다. 좁은 화면에서는 밝기 버튼을 아이콘으로 표시하되 접근 가능한 이름과 테마 전환을 유지한다.

시간표 본문의 주간 시간표 제목, 여러 명 선택 가능 안내, 매주 반복·일정 수 문구를 제거한다. 현재 진행 일정과 시간 눈금은 유지한다. 공통 인원 필터는 접기/펼치기 화살표를 제거하고 이름 버튼을 자동 줄바꿈해 모두 표시한다. 다중 선택과 계정별 첫 화면 저장은 유지한다. 달력 일간 보기의 시간 버튼은 해당 보기에 유지한다.

## 파일 변경

- 추가 `web/src/components/WorkspaceHeaderAction.tsx`: 화면 상태를 그대로 사용하는 상단 버튼 배치 경로.
- 수정 `web/src/components/AuthLayout.tsx`: 상단 버튼 영역과 아이콘 로고.
- 수정 `web/src/components/WorkspaceNavigation.tsx`: 브랜드 아이콘 단독 표시 옵션.
- 수정 `web/src/components/WorkspaceTutorial.tsx`: 상단 사용 안내 버튼과 첫 사용 표시.
- 수정 `web/src/components/PersonalTimetable.tsx`: 현재 시간 이동·중복 제목과 문구 제거.
- 수정 `web/src/components/MemberFilter.tsx`: 화살표 없는 줄바꿈 옵션.
- 수정 `web/src/components/MemberPreferenceFilter.tsx`: 공통 저장 필터에 줄바꿈 옵션 적용.
- 수정 `web/src/usability.css`: 상단 버튼 배치·작은 화면·필터 줄바꿈.
- 수정 `tests/e2e/usability.spec.ts`: 상단 안내 시작/완료/다시 보기/초점 복구.
- 수정 `tests/e2e/timetable-visible-hours.spec.ts`: 다양한 화면의 상단 버튼 경계와 문구 제거, 밤 10시 눈금 유지 검사.
- 수정 `tests/e2e/timetable-preference.spec.ts`: 네 명 필터의 줄바꿈·선택·저장 검사.
- 수정 `tests/e2e/member-filters.spec.ts`, `tests/e2e/conversation-stickers.spec.ts`: 제거한 본문 배너의 기존 닫기 동작 갱신.
- 추가 `docs/UI118-compact-workspace-titlebar.md`: 동작과 파일 변경 목록.

삭제 파일 없음. DB 변경 없음.
