# 아이하루 TimeTree 메뉴 복원

기준은 운영 UI144 커밋 `b07fa3b`이다. UI150~153에서 확인한 TimeTree 구도와 이후 메뉴별 보정 중 화면 복원에 필요한 변경을 옮겼다.

| 메뉴 | 복원 내용 |
| --- | --- |
| 달력 | 한 줄 연월·보기 선택, 가로 스크롤 구성원 칩, 월·주·일 전환, 주별 가로선, 음력, 공휴일 막대, 날짜 상세와 등록 화면 |
| 대화 | 대화방 도구 행, 간격과 말풍선, 하단 입력창, 메시지 내부 스크롤 |
| AI 브리핑 | 큰 사진, 좌우 스와이프와 키보드 전환, 보관과 원문, 구분된 샘플, 더보기의 브리핑 설정·보관 링크 |
| 가계부 | 달력·내역·통계, 전체·수입·지출, 예산을 한 줄에 배치. 합계는 텍스트, 달력은 가로 구분선으로 표시. 기존 내역에서 복사 가능 |
| 더보기 | 안내 배너, 3열 메뉴, 계정·개인정보 행 |
| 시간표 | 현재 화면과 구성원 선택 흐름 유지. 복원된 CSS는 대상 경로에만 적용 |

AI 브리핑에는 기존 인증·동의와 수집 계약을 연결한다. 예시 카드는 가상 자료로 표시하고 저장·공유·출처 링크를 제공하지 않는다. SQL 적용 없이 기존 API에서 화면을 사용할 수 있다.

## 적용 방법

UI144 위에 패치 ZIP을 원래 경로대로 덮어쓰고 `npm ci`, `npm run check`로 확인한다. 웹 배포 전에는 현재 브랜치와 서비스에서 달력·대화·가계부·더보기, 일반사용자 AI 브리핑, 시간표를 각각 확인한다. 최근 인트로 작업과 함께 적용할 때 각 패치에 포함된 파일을 동일한 저장소 루트에 적용한다.

삭제 파일은 없다.

## 파일 목록

| 구분 | 경로 | 변경 내용 |
| --- | --- | --- |
| 추가 | `docs/TimeTree-menu-restore.md` | 적용 안내와 검증 |
| 추가 | `shared/calendar-day-badge.ts` | 음력·공휴일 표시 또는 로그인 후 복귀 경로 |
| 추가 | `shared/lunar-calendar.ts` | 음력·공휴일 표시 또는 로그인 후 복귀 경로 |
| 추가 | `tests/briefing-carousel.test.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 추가 | `tests/calendar-day-badge.test.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 추가 | `tests/helpers/workspace-ui.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 추가 | `tests/lunar-calendar.test.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 추가 | `tests/pull-refresh.test.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 추가 | `web/public/briefing/food.jpg` | 브리핑 주제 사진과 출처 |
| 추가 | `web/src/briefing-poster.ts` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 추가 | `web/src/briefing-preview.ts` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 추가 | `web/src/components/CalendarMemberPreferenceFilter.tsx` | 달력 보기, 일정과 구성원 표시 |
| 추가 | `web/src/components/horizontal-carousel-physics.ts` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 추가 | `web/src/components/pull-refresh-physics.ts` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 추가 | `web/src/components/useHorizontalCarousel.ts` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 추가 | `web/src/components/usePullToRefresh.ts` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 추가 | `web/src/timetree-layout.css` | 대상 메뉴에 공통 화면 규격 적용 |
| 수정 | `shared/entry-intent.ts` | 음력·공휴일 표시 또는 로그인 후 복귀 경로 |
| 수정 | `tests/e2e/briefing.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/calendar-holidays-layout.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/calendar-merged-events.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/continuous-workspace.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/daily-calendar.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/entry-input.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/guest-entry.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/jade-paging.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/ledger.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/member-filters.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/timetable-gestures.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/tuition-touch.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/e2e/usability.spec.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/entry-intent.test.ts` | 복원된 메뉴 및 기존 기능 검증 |
| 수정 | `tests/store/store-screenshots.spec.ts` | 현재 진입 경로와 복원된 가계부 화면에서 가상 가족 예시 확인 |
| 수정 | `web/public/briefing/ATTRIBUTION.txt` | 브리핑 주제 사진과 출처 |
| 수정 | `web/src/briefing.css` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 수정 | `web/src/components/AuthLayout.tsx` | 대상 메뉴에 공통 화면 규격 적용 |
| 수정 | `web/src/components/CalendarDaySheet.tsx` | 달력 보기, 일정과 구성원 표시 |
| 수정 | `web/src/components/CalendarWeekRow.tsx` | 달력 보기, 일정과 구성원 표시 |
| 수정 | `web/src/components/EntryAccess.tsx` | 브리핑 설정과 보관 화면 복귀 |
| 수정 | `web/src/components/LedgerBudget.tsx` | 가계부 도구, 합계, 예산 배치 |
| 수정 | `web/src/components/PersonalCalendar.tsx` | 달력 보기, 일정과 구성원 표시 |
| 수정 | `web/src/components/PersonalFees.tsx` | 가계부 도구, 합계, 예산 배치 |
| 수정 | `web/src/components/WorkspaceMore.tsx` | 더보기 안내 배너와 설정·계정 메뉴 |
| 수정 | `web/src/components/WorkspaceToolbar.tsx` | 대상 메뉴에 공통 화면 규격 적용 |
| 수정 | `web/src/components/workspaceGuides.ts` | 복원된 메뉴 흐름과 안내 연결 |
| 수정 | `web/src/ledger.css` | 가계부 도구, 합계, 예산 배치 |
| 수정 | `web/src/main.tsx` | 대상 메뉴에 공통 화면 규격 적용 |
| 수정 | `web/src/pages/Briefing.tsx` | 브리핑 카드, 예시, 제스처 또는 화면 표시 |
| 수정 | `web/src/pages/PersonalWorkspace.tsx` | 복원된 메뉴 흐름과 안내 연결 |

## 검증 범위

- TypeScript 검사와 운영 빌드를 실행했다. Vitest의 39개 파일, 335개 검사를 통과했다.
- 브라우저에서 달력·대화·AI 브리핑·가계부·더보기의 주요 동작과 시간표로 복귀했을 때의 화면 크기를 확인했다. 운영의 알림·사용 가이드 바로가기와 가상 가족 화면 검사도 통과했다.
- 격리 Chromium에서 Google 로그인 뒤로가기의 페이지 캐시 복원 검사는 브라우저가 해당 페이지를 캐시에 보존하지 않아 재현하지 못했다. 운영 기준 UI144도 같은 결과였다.
