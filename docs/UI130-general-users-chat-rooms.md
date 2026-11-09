# UI130 — 일반사용자·어린이와 선택 구성원 대화방

기준: UI129-F01 `2dc72b18653c00a9d1d8722270d1087e1359860c`, 2026-11-10 KST.

## 변경

- 작업 화면 상단 여백을 24px 늘린다. 가로 모드의 낮은 화면은 12px로 조절하며 기기 안전 영역과 하단 메뉴·입력창 공간을 함께 계산한다.
- 화면의 학부모·부모·보호자 계정 명칭은 일반사용자, 자녀는 어린이, 가족 연결·관리는 그룹 연결·관리로 정리한다. 법정대리인 동의, 기존 계정 역할·권한·연결 관계는 유지한다. 기존 게시된 약관·처리방침과 운영자가 작성한 문서는 자동으로 바꾸지 않는다.
- 기본 대화방은 단체 대화다. 대화방 만들기에서 같은 그룹의 다른 구성원 한 명을 고르면 1:1 대화, 여러 명을 고르면 선택 구성원 단체 대화를 연다. 같은 두 사람의 대화는 기존 방으로 연결한다.
- 대화방을 바꾸면 미전송 문구·그림 선택·검색을 초기화한다. 방별 기록과 재시도 키를 분리한다. 비회원의 방 생성은 로그인 시트로 연결한다.
- 현재 방의 참여자만 목록·검색·개별 메시지·푸시를 조회한다. 그룹 호스트와 시스템 관리자도 해당 방의 참여자가 아니면 업무 대화 API로 접근할 수 없다. 탈퇴·제외 시 접근과 대기 중 알림이 차단되며 재참여해도 이전 개인 방에 자동 복귀하지 않는다. 1:1 상대가 나가면 남은 사용자는 기록을 읽기만 할 수 있다.
- 기존 대화와 자료는 그대로 보존한다. 메뉴의 새 소식 표시는 기존 메뉴 단위 정책을 유지한다.

## 적용

1. 운영 DB에 `20261109231449_workspace_chat_rooms.sql`을 한 번 적용한다. 일반 브라우저에서 새 테이블을 직접 읽을 수 없다.
2. 추가·수정 파일을 반영하고 `npm ci`, `npm run build` 후 배포한다.
3. 대화 → 대화방 만들기 → 구성원 선택 → 대화 시작하기로 이용한다.

운영 반영과 CI 결과는 아래 검증 항목에 기록한다. 이전 버전으로 UI를 되돌릴 때도 대화방 DB와 메시지의 권한 검증 함수는 유지해야 개인 대화가 기본 단체 대화로 섞이지 않는다.

## 검증

- 대화방·기존 대화·푸시 관련 SQL/API 검사 통과. 전체 단위 검사와 실제 PostgreSQL·브라우저 검증은 전용 CI에서 확인한다.
- 로컬 브라우저는 실행 환경의 소켓 제한으로 시작하지 못했으므로 로컬 E2E 통과로 표현하지 않는다.

## 파일 목록

추가 8개, 수정 89개, 삭제 0개. ZIP은 아래 파일만 원래 구조로 포함한다.

|구분|파일|변경 내용|
|---|---|---|
|추가|`.github/workflows/chat-rooms.yml`|단위·실제 PostgreSQL·브라우저 전용 CI|
|추가|`db/migrations/20261109231449_workspace_chat_rooms.sql`|대화방·참여자 스냅샷, 메시지·알림 권한, 탈퇴·재참여 차단|
|추가|`docs/UI130-general-users-chat-rooms.md`|검증·변경·적용·파일 목록|
|수정|`server/admin/routes.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`server/child-accounts/routes.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`server/daily/routes.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`server/family/routes.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`server/guardian/routes.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`server/messages/routes.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`server/schedules/routes.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`server/workspace/routes.ts`|대화방 API·입력 검증·오류 안내·요청 제한|
|수정|`shared/guest-samples.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`shared/public-content.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`shared/workspace.ts`|대화방 타입·생성 입력 검증|
|추가|`supabase/migrations/20261109231449_workspace_chat_rooms.sql`|운영 적용용 동일 SQL|
|추가|`tests/chat-rooms.test.ts`|개별·선택 단체 대화, 조회·수정·알림 격리, 탈퇴·재참여 검사|
|수정|`tests/e2e/app.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/auth-flow.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/calendar-holidays-layout.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/calendar-merged-events.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|추가|`tests/e2e/chat-rooms.spec.ts`|브라우저 방 생성·전환·저장·모바일·명칭·로그인 유도 검증|
|수정|`tests/e2e/child-account-onboarding.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/compact-actions.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/conversation-stickers.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/daily-calendar.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/daily.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/devices.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/direct-workspace.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/entry-input.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/family.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/guest-entry.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/legal-content-save.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/login-landing.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/marketing.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/messages.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/month-gestures.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/navigation-updates.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/privacy-operations.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/public-legal-navigation.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/schedules.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/system-admin.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/test-workspace.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/timetable-gestures.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/timetable-now.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/timetable-preference.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/timetable-visible-hours.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/tuition-touch.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/usability.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/e2e/workspace-shell.spec.ts`|변경된 화면 명칭에 맞춘 기존 검증|
|수정|`tests/integration/postgres.ts`|PostgreSQL 동시 방 생성·전송 재시도·ACL 검사|
|수정|`tests/workspace-push.test.ts`|비참여자 푸시 제외·발송 직전 탈퇴 권한 재검사|
|수정|`web/src/App.tsx`|일반사용자·어린이·그룹 명칭 반영|
|추가|`web/src/chat-rooms.css`|상단 24px 여백·대화방 UI·모바일 배치|
|수정|`web/src/components/AuthLayout.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/Calendar.tsx`|일반사용자·어린이·그룹 명칭 반영|
|추가|`web/src/components/ChatRooms.tsx`|대화방 목록·구성원 선택·방 생성|
|수정|`web/src/components/Common.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/DailyForms.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/EntryAccess.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/Experience.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/GuestSampleViews.tsx`|단체 대화 샘플·비회원 대화방 생성 로그인 유도|
|수정|`web/src/components/GuestWorkspace.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/MemberFilter.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/MemberPreferenceFilter.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/PersonalChat.tsx`|방 전환·대화 분리·입력 초안 초기화·방별 캐시|
|수정|`web/src/components/PersonalEditor.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/PublicFrame.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/PublicStories.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/PublicUserGuide.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/ScheduleForms.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/ScheduleMemberPicker.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/WorkspaceMore.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/WorkspaceNavigation.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/WorkspaceTabs.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/components/workspaceGuides.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/copy.ts`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/main.tsx`|새 스타일 연결|
|수정|`web/src/pages/Account.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/AdminConsole.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Chat.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/ChildAccount.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Daily.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Device.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Family.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Guardian.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/GuardianVerification.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Home.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Login.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Marketing.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/NotificationSettings.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Notifications.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/ParentFamily.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/PersonalWorkspace.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Schedules.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/pages/Upcoming.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/testing/TestWorkspace.tsx`|일반사용자·어린이·그룹 명칭 반영|
|수정|`web/src/testing/store.ts`|일반사용자·어린이·그룹 명칭 반영|
