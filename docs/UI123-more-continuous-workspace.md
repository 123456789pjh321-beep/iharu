# UI123 — 더보기와 연속 화면 전환

- 작업실 상단 바, 현재 시간 버튼, 사용 안내 팝업을 제거했습니다. 시간표 안의 현재 시각 선은 유지합니다.
- 하단 메뉴를 ‘더보기’로 변경하고 기본 메뉴와 중복되지 않는 가족 관리·알림설정·설정·가이드·공지·블로그·계정 메뉴를 제공합니다.
- 밝게/어둡게 및 움직임 줄이기를 설정 화면으로 옮겼습니다. 공개 홈페이지 /guide에 메뉴별 안내를 제공합니다.
- 달력·학원비·날짜별 일정은 실제 이전/현재/다음 화면을 렌더링합니다. 주변 기간 데이터와 공휴일을 미리 준비하고 손가락 위치·속도에 따라 이동/복귀합니다.
- 화면 밖의 페이지는 inert/aria-hidden으로 터치·키보드·보조기술에서 제외했습니다. 네이티브 클릭 우선 및 Android 호환 클릭 복구를 유지합니다.
- 최근 조회 결과를 로그인한 사용자/가족 범위의 메모리에 보관하고 갱신합니다. 계정·가족 변경과 오류 시 폐기하며 기기에 가족 데이터는 저장하지 않습니다.
- 저장/수정/삭제는 서버 응답과 목록 갱신 후 편집창을 닫습니다. 실패 시 입력을 유지하고 중복 제출을 차단합니다.
- 조회 중 기존 대화를 보존하고 공휴일 중복 요청을 합쳤습니다. 메뉴 이동·목록 추가·대화에 짧은 전환 효과를 적용하며 동작 줄이기 설정을 따릅니다.
- DB와 인증·수정 권한 정책 변경 없음.

검증: 단위 테스트 226개 및 프로덕션 빌드 통과. 브라우저 검증 결과는 PR의 CI에서 확인합니다.

## 파일 변경 목록

- 수정: `.github/workflows/usability.yml`
- 추가: `tests/e2e/continuous-workspace.spec.ts`
- 수정: `tests/e2e/conversation-stickers.spec.ts`
- 수정: `tests/e2e/entry-input.spec.ts`
- 수정: `tests/e2e/jade-paging.spec.ts`
- 수정: `tests/e2e/member-filters.spec.ts`
- 수정: `tests/e2e/navigation-updates.spec.ts`
- 수정: `tests/e2e/notification-calendar.spec.ts`
- 수정: `tests/e2e/timetable-now.spec.ts`
- 수정: `tests/e2e/timetable-preference.spec.ts`
- 수정: `tests/e2e/timetable-visible-hours.spec.ts`
- 수정: `tests/e2e/tuition-touch.spec.ts`
- 수정: `tests/e2e/usability.spec.ts`
- 수정: `web/src/App.tsx`
- 수정: `web/src/api.ts`
- 수정: `web/src/components/AuthLayout.tsx`
- 수정: `web/src/components/Common.tsx`
- 수정: `web/src/components/MonthSwipeArea.tsx`
- 추가: `web/src/components/PeriodPager.tsx`
- 수정: `web/src/components/PersonalCalendar.tsx`
- 수정: `web/src/components/PersonalChat.tsx`
- 수정: `web/src/components/PersonalEditor.tsx`
- 수정: `web/src/components/PersonalFees.tsx`
- 수정: `web/src/components/PersonalTimetable.tsx`
- 추가: `web/src/components/PublicUserGuide.tsx`
- 삭제: `web/src/components/WorkspaceHeaderAction.tsx`
- 추가: `web/src/components/WorkspaceMore.tsx`
- 수정: `web/src/components/WorkspaceNavigation.tsx`
- 삭제: `web/src/components/WorkspaceTutorial.tsx`
- 수정: `web/src/components/useCalendarPager.ts`
- 수정: `web/src/components/useHolidays.ts`
- 수정: `web/src/components/useSlidingDialog.ts`
- 수정: `web/src/components/workspaceGuides.ts`
- 추가: `web/src/continuous-workspace.css`
- 수정: `web/src/main.tsx`
- 수정: `web/src/pages/Account.tsx`
- 수정: `web/src/pages/Marketing.tsx`
- 수정: `web/src/pages/NotificationSettings.tsx`
- 수정: `web/src/pages/PersonalWorkspace.tsx`
