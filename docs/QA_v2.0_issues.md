# 아이하루 v2.0 오류·예외 점검 목록

상태: 분석·수정 중. 기준 소스는 로딩 중앙 배치 패치 커밋 `d7e9ee5141f875d8988c37d441c0f2c9b5926dc7`입니다.

초기 전체 브라우저 검사: 199건 중 155건 통과, 44건 실패. 실패한 검사가 곧 서로 다른 제품 오류를 뜻하지는 않으며, 실제 오류·테스트 대기 문제·변경된 UI 기준을 구분합니다.

초기 실행: https://github.com/123456789pjh321-beep/iharu/actions/runs/43606668473

| ID | 검사 | 처음 관찰한 문제 | 상태 |
|---|---|---|---|
| V2-001 | tests/e2e/adaptive-design.spec.ts:20:1 › mobile More exposes every destination, traps focus and closes on navigation or Escape | Test timeout of 30000ms exceeded. | 분석 중 |
| V2-002 | tests/e2e/adaptive-design.spec.ts:28:1 › large type, dark theme and reduced motion preserve mobile menu access | Test timeout of 30000ms exceeded. | 분석 중 |
| V2-003 | tests/e2e/app.spec.ts:30:1 › child actions show a truthful dialog, close with Escape and return focus | Error: expect(page).toHaveURL(expected) failed | 분석 중 |
| V2-004 | tests/e2e/auth-flow.spec.ts:4:1 › browser signup → mail proof → login → timetable → account → logout persists through the real API and SQL | Error: expect(page).toHaveURL(expected) failed | 분석 중 |
| V2-005 | tests/e2e/auth.spec.ts:3:1 › production account routes show truthful readiness and do not expose sample children | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-006 | tests/e2e/app.spec.ts:45:1 › mobile navigation and content order remain usable without horizontal overflow | Test timeout of 30000ms exceeded. | 분석 중 |
| V2-007 | tests/e2e/compact-actions.spec.ts:10:1 › labeled registration actions, modal entry/exit, dirty cancellation, save and reduced motion | Error: expect(locator).toHaveAccessibleName(expected) failed | 분석 중 |
| V2-008 | tests/e2e/compact-actions.spec.ts:52:1 › fixed seven-day timetable and aligned composer with emoji choices above input | TypeError: Cannot read properties of null (reading 'y') | 분석 중 |
| V2-009 | tests/e2e/daily.spec.ts:16:1 › P05 guardian and child share checkins, tasks, learning and pickup with persisted state | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-010 | tests/e2e/daily.spec.ts:38:1 › P05 changes calendar month without changing the selected day, and clears data when child changes | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-011 | tests/e2e/direct-workspace.spec.ts:32:1 › direct calendar CRUD, general-event copy, title editing, stable menu shell and edge-to-edge swipe | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-012 | tests/e2e/direct-workspace.spec.ts:51:1 › parent B joins while signed in and group conversation has shared history, search and safe edits | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-013 | tests/e2e/direct-workspace.spec.ts:64:1 › tuition recurrence, designated payer, parent-only home, navigation and fixed appearance work together | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-014 | tests/e2e/direct-workspace.spec.ts:85:1 › today schedule and tuition member filters stay independent with collapsed totals and narrow screens | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-015 | tests/e2e/direct-workspace.spec.ts:118:35 › all functional canvases and calendar editor fit 320px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-016 | tests/e2e/direct-workspace.spec.ts:118:35 › all functional canvases and calendar editor fit 768px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-017 | tests/e2e/direct-workspace.spec.ts:118:35 › all functional canvases and calendar editor fit 1440px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-018 | tests/e2e/direct-workspace.spec.ts:158:1 › weekly repeat timetable and event calendar have independent CRUD and preserve family visibility | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-019 | tests/e2e/family.spec.ts:9:1 › family creation → verified fixture consent → child → separate device pairing → immediate revocation | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-020 | tests/e2e/family.spec.ts:25:1 › unverified guardian sees preparation state without forms for child personal data | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-021 | tests/e2e/family.spec.ts:32:1 › F01 distinguishes unavailable email, database failure and expired login without sending users in circles | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-022 | tests/e2e/family.spec.ts:61:1 › F03 applicant submits before family readiness and sees human-review result on mobile | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-023 | tests/e2e/family.spec.ts:78:1 › F04 approval → family → bound consent → invite → approval → scoped sharing | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-024 | tests/e2e/login-landing.spec.ts:36:1 › LOW session keeps additional verification and explicit social reauthentication reachable | Error: expect(page).toHaveURL(expected) failed | 분석 중 |
| V2-025 | tests/e2e/login-landing.spec.ts:17:1 › email-less Kakao session enters the live home without demo or protected-data requests | Error: expect(page).toHaveURL(expected) failed | 분석 중 |
| V2-026 | tests/e2e/marketing.spec.ts:41:1 › visitors can explore examples, use mobile navigation and reach signup/login/legal pages | Test timeout of 30000ms exceeded. | 분석 중 |
| V2-027 | tests/e2e/marketing.spec.ts:60:35 › public header and footer stay fixed through entry navigation at 320px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-028 | tests/e2e/marketing.spec.ts:60:35 › public header and footer stay fixed through entry navigation at 820px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-029 | tests/e2e/marketing.spec.ts:60:35 › public header and footer stay fixed through entry navigation at 1440px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-030 | tests/e2e/messages.spec.ts:16:1 › P06 picture conversation saves once after a lost response, preserves delete and child scope | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-031 | tests/e2e/marketing.spec.ts:19:1 › public service and usage pages work across phone, tablet and desktop without account navigation | Test timeout of 90000ms exceeded. | 분석 중 |
| V2-032 | tests/e2e/month-gestures.spec.ts:6:1 › tuition and notes swipe across months while filters, taps, scrolling and registration stay independent | Error: expect(locator).toContainText(expected) failed | 분석 중 |
| V2-033 | tests/e2e/messages.spec.ts:39:1 › P07 another device sees new messages, read state and deletions without refresh | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-034 | tests/e2e/privacy-operations.spec.ts:5:1 › the public account deletion link leads to a signed-in deletion request | Error: expect(page).toHaveURL(expected) failed | 분석 중 |
| V2-035 | tests/e2e/privacy-operations.spec.ts:23:1 › login copy is concise and location is absent from production navigation and Today | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-036 | tests/e2e/privacy-operations.spec.ts:48:1 › monthly family filters keep their full height and remain clickable on short and narrow screens | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-037 | tests/e2e/public-legal-navigation.spec.ts:3:1 › signed-out public documents never show workspace navigation, including session loading and logout | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-038 | tests/e2e/public-stories.spec.ts:29:1 › all introduction menus and article layouts remain usable on small screens | Error: expect(received).toBe(expected) // Object.is equality | 분석 중 |
| V2-039 | tests/e2e/test-workspace.spec.ts:209:1 › content pane scrolls by keyboard while shell stays fixed | Error: expect(locator).toBeFocused() failed | 분석 중 |
| V2-040 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 320px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-041 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 390px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-042 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 768px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-043 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 1024px | Error: expect(locator).toBeVisible() failed | 분석 중 |
| V2-044 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 1440px | Error: expect(locator).toBeVisible() failed | 분석 중 |

## 1차 확인 및 수정

- 시작 화면이 본문을 inert 상태로 잠근 동안 테스트가 로그인 필드에 입력하는 경합: 시작 완료를 기다린 후 입력하도록 보완하고 실제 요청·결과를 다시 확인합니다.
- 로그인 경로가 next 값을 무시하는 흐름: 이미 로그인한 계정, 이메일·소셜·휴대폰 로그인에서 허용된 앱 내부 복귀 경로만 사용하도록 수정했습니다. 외부 URL은 기존 허용 목록으로 차단합니다.
- 첫 화면 표시 전에 시도한 본문 초점이 무시되는 문제: 시작 레이어 제거 후 사용자 초점을 빼앗지 않는 조건으로 키보드 본문 접근을 복원합니다.
- 이후 실패 검사에서 스크린샷과 트레이스를 보관하도록 검사 구성을 보완했습니다.

최종 결과는 모든 수정 및 재검증 후 갱신합니다.
