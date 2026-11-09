# UI124 — 앱 안에서 글 읽기와 달력 행 높이 수정

## 변경 내용

- 더보기와 설정의 사용 가이드는 `/help`, 공지사항과 블로그는 `/more/notices`, `/more/blog`로 연결합니다. 앱의 하단 메뉴와 돌아가기 동작을 유지하며 홈페이지의 로그인·시작하기·장식 이미지 없이 안내와 글 목록·본문을 보여줍니다.
- 공지사항과 블로그는 검색·분류·상세 읽기를 지원합니다. 목록의 검색 조건을 상세 화면과 목록 복귀 시 유지하고 관련 사용 가이드도 앱 안에서 엽니다. 공개 홈페이지의 기존 주소는 유지합니다.
- 가이드 내용은 공개 홈페이지와 공유하며 자녀 계정에서는 자녀용 설명을 사용합니다.
- 월별 달력의 행을 같은 높이의 그리드로 배치하고 공휴일과 일정에 필요한 공간을 월 전체에 동일하게 예약합니다. 작은 화면과 일정이 많은 달은 날짜 영역 안에서 세로로 스크롤할 수 있어 마지막 주가 잘리지 않습니다.
- 각 기간의 날짜 영역을 새로 구성하여 이전 달의 스크롤 위치가 다음 달로 남지 않게 합니다. 주간·일간 전환, 기간 슬라이딩과 날짜별 일정 편집은 유지합니다.

## 검증

- 수정 전 브라우저 검사에서 앱 전용 읽기 화면 부재와 390px·820px 달력의 행 높이 차이 20px를 재현했습니다.
- 회귀 검사: 실제 터치로 6개월 전진·후진, 일요일·공휴일 색상, 날짜 중복, 4주/6주 달력, 작은 화면에서 마지막 날짜 접근, 공지·블로그 검색/상세/목록 복귀와 가이드 앵커를 확인합니다.
- 최종 검사 결과는 PR #55의 마지막 커밋에 연결된 CI를 기준으로 확인합니다. 기존 전체 E2E 묶음과 기능별 검사는 구분합니다.
- DB·인증·권한 정책 변경 없음.

## 파일 목록

| 구분 | 파일 | 주요 변경 |
| --- | --- | --- |
| 추가 | `.github/workflows/reading-calendar.yml` | 앱 읽기와 반복 달력 이동 회귀 검사 |
| 추가 | `tests/e2e/workspace-reading-calendar.spec.ts` | 글 읽기·목록 복귀·실제 터치·행 높이·마지막 날짜 검증 |
| 수정 | `tests/e2e/usability.spec.ts` | 앱 내부 가이드 경로 검증 |
| 수정 | `web/src/App.tsx` | 앱 가이드·공지·블로그 경로 |
| 수정 | `web/src/components/AuthLayout.tsx` | 읽기 화면 제목 |
| 수정 | `web/src/components/CalendarWeekRow.tsx` | 주별 일정 배치 결과 재사용 |
| 수정 | `web/src/components/PersonalCalendar.tsx` | 동일 행 높이·밀집 일정·기간별 스크롤 초기화 |
| 수정 | `web/src/components/PublicUserGuide.tsx` | 공개/앱 가이드 본문 공유와 자녀 설명 |
| 수정 | `web/src/components/WorkspaceMore.tsx` | 앱 내부 읽기 화면으로 연결 |
| 추가 | `web/src/components/WorkspaceReader.tsx` | 가이드·공지·블로그의 본문 중심 읽기 |
| 수정 | `web/src/continuous-workspace.css` | 달력 그리드와 내부 스크롤 |
| 수정 | `web/src/pages/PersonalWorkspace.tsx` | 읽기 화면을 기존 앱 틀에 연결 |
| 추가 | `web/src/workspace-reader.css` | 반응형 글 목록과 본문, 밝게/어둡게 표시 |
| 추가 | `docs/UI124-app-reading-calendar-rows.md` | 패치 내용·검증·변경 파일 목록 |

삭제 파일: 없음.
