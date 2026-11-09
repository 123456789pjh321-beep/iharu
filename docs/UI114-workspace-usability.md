# UI114 · 첫 사용 안내와 생활 화면 개선

1. **튜토리얼**: 처음 이용할 때 사용 안내 배너를 표시한다. 가족 연결·시간표·달력·대화·학원비를 단계별로 안내하며 자녀에게는 학원비 단계를 표시하지 않는다. 완료하거나 나중에 보기를 선택하면 해당 브라우저의 계정별로 기억한다. 화면의 사용 안내 버튼과 전체메뉴의 사용 안내 다시 보기로 재실행한다. 저장소 접근이 차단돼도 기본 사용은 유지한다.
2. **주간 시간표**: 표시 범위를 08:00~22:00으로 줄인다. 범위와 겹치는 일정은 경계에서 잘라 배치하고 원래 등록 시간은 보존한다. 달력 일간 보기는 하루 전체를 유지한다. 다중 구성원 선택·계정별 조합 저장을 유지한다.
3. **대화**: 그림 선택창은 기본 접힘 상태이며 입력창 옆 웃는 얼굴 버튼으로 연다. 선택 목록은 약 50px, 전송된 그림은 약 72~76px로 축소한다. 전송에 성공하면 목록을 접고, 실패하면 선택과 입력을 유지한다. 말풍선과 입력창의 여백·모서리를 정돈한다.
4. **학원비**: 월 납부 달력을 기본으로 하고 날짜별 금액·건수를 표시한다. 날짜를 누르면 그날의 가계부 내역과 합계를 표시하며, 내역 보기에서는 월 전체를 확인한다. 선택 날짜의 추가 버튼은 해당 납부일로 편집기를 연다. 기존 구성원 필터·월 이동·매월 납부·결제자·읽기 권한을 유지한다. 집계는 서버가 계산한 해당 월 납부일 기준이며 실제 결제 실행은 포함하지 않는다.
5. **메뉴명**: 하단 더보기 버튼을 전체메뉴로 바꾸고 관련 활용 안내 문구를 맞춘다.

## 추가 파일

- `web/src/components/WorkspaceTutorial.tsx`: 단계별 안내, 계정별 브라우저 완료 상태, 다시 보기.
- `web/src/usability.css`: 안내·대화·학원비 달력과 가계부 반응형 스타일.
- `shared/tuition-calendar.ts`: 월·구성원별 납부일 집계와 가계부 정렬.
- `tests/tuition-calendar.test.ts`: 월말·윤년·구성원별 합계와 원본 보존 검사.
- `tests/e2e/usability.spec.ts`: 안내 완료·다시 보기, 달력·일별 내역·월말·선택일 등록 검사.
- `.github/workflows/usability.yml`: 변경 화면에 대한 브라우저 회귀 검사와 화면 캡처.
- `docs/UI114-workspace-usability.md`: 동작과 파일 변경 목록.

## 수정 파일

- `web/src/components/PersonalFees.tsx`: 달력 기본 보기, 월·일 합계, 가계부 목록.
- `web/src/components/PersonalChat.tsx`: 그림 선택창 열기·접기와 전송 상태 유지.
- `web/src/components/PersonalTimetable.tsx`, `shared/workspace-schedules.ts`: 주간 표시 범위와 달력 일간 범위 분리.
- `web/src/components/WorkspaceNavigation.tsx`: 전체메뉴 명칭과 안내 재실행 링크.
- `web/src/pages/PersonalWorkspace.tsx`: 안내 진입점과 학원비 선택일 등록 연결.
- `web/src/pages/Marketing.tsx`, `shared/public-content.ts`: 실제 사용 방법에 맞춘 안내 문구.
- `web/src/main.tsx`: 개선 스타일 연결.
- `tests/workspace-schedules.test.ts`: 시간표 경계 잘림과 원본 시간 보존.
- `tests/e2e/{adaptive-design,app,auth-flow,calendar-holidays-layout,direct-workspace,navigation-updates,notification-calendar,privacy-operations,system-admin}.spec.ts`: 전체메뉴 명칭 검사 갱신.
- `tests/e2e/{conversation-stickers,timetable-now,timetable-visible-hours}.spec.ts`: 접히는 그림 선택창·축소 크기·08~22시 범위 검사 갱신.

삭제 파일 없음. DB 스키마 변경 없음.

## 검증

타입 검사·빌드, 단위/API 검사, 관련 브라우저 회귀 검사로 확인한다. 로컬 실행 환경은 Chromium 시작에 필요한 소켓을 허용하지 않아 브라우저 검사는 GitHub Actions에서 실행한다.
