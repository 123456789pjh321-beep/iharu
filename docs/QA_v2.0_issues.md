# 아이하루 v2.0 오류·예외 점검 목록

상태: **55개 점검 항목 조치·재검증 완료**. 기준 소스는 로딩 중앙 배치 패치 커밋 `d7e9ee5141f875d8988c37d441c0f2c9b5926dc7`입니다.

초기 전체 브라우저 검사: 199건 중 155건 통과, 44건 실패. 실패한 검사가 곧 서로 다른 제품 오류를 뜻하지는 않으며, 실제 오류·테스트 대기 문제·변경된 UI 기준을 구분합니다.

초기 실행: https://github.com/123456789pjh321-beep/iharu/actions/runs/43606668473

| ID | 검사 | 처음 관찰한 문제 | 원인·조치 | 상태 |
|---|---|---|---|---|
| V2-001 | tests/e2e/adaptive-design.spec.ts:20:1 › mobile More exposes every destination, traps focus and closes on navigation or Escape | Test timeout of 30000ms exceeded. | 테스트 기준 · 더보기 버튼명 및 4개 기본+8개 추가 메뉴, 포커스 순환 검증 | 최종 통과 |
| V2-002 | tests/e2e/adaptive-design.spec.ts:28:1 › large type, dark theme and reduced motion preserve mobile menu access | Test timeout of 30000ms exceeded. | 테스트 기준 · 현재 더보기 및 화면 설정 제어로 어두운 테마·동작 축소 검증 | 최종 통과 |
| V2-003 | tests/e2e/app.spec.ts:30:1 › child actions show a truthful dialog, close with Escape and return focus | Error: expect(page).toHaveURL(expected) failed | 테스트 기준 · 일반/어린이 공용 로그인 주소 검증 | 최종 통과 |
| V2-004 | tests/e2e/auth-flow.spec.ts:4:1 › browser signup → mail proof → login → timetable → account → logout persists through the real API and SQL | Error: expect(page).toHaveURL(expected) failed | 테스트 대기·기준 · 시작 완료 후 입력, 현재 7개 메뉴와 로그아웃 후 방문자 화면 검증 | 최종 통과 |
| V2-005 | tests/e2e/auth.spec.ts:3:1 › production account routes show truthful readiness and do not expose sample children | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 기존 아이디 로그인은 활성, 미설정 소셜 공급자는 비활성 유지 | 최종 통과 |
| V2-006 | tests/e2e/app.spec.ts:45:1 › mobile navigation and content order remain usable without horizontal overflow | Test timeout of 30000ms exceeded. | 테스트 기준 · 현재 하단 더보기 링크와 위치 메뉴 비노출 검증 | 최종 통과 |
| V2-007 | tests/e2e/compact-actions.spec.ts:10:1 › labeled registration actions, modal entry/exit, dirty cancellation, save and reduced motion | Error: expect(locator).toHaveAccessibleName(expected) failed | 테스트 기준 · 가계부 날짜 상세의 등록 버튼으로 팝업·취소·저장·애니메이션 검증 | 최종 통과 |
| V2-008 | tests/e2e/compact-actions.spec.ts:52:1 › fixed seven-day timetable and aligned composer with emoji choices above input | TypeError: Cannot read properties of null (reading 'y') | 테스트 기준 · 접힌 그림 메시지를 연 후 입력창·전송 버튼 배치 및 선택 검증 | 최종 통과 |
| V2-009 | tests/e2e/daily.spec.ts:16:1 › P05 guardian and child share checkins, tasks, learning and pickup with persisted state | Error: expect(locator).toBeVisible() failed | 기능 호환 · 명시적 legacy=1 오늘 화면 주소 복원, 현재 기본 화면은 시간표 유지 | 최종 통과 |
| V2-010 | tests/e2e/daily.spec.ts:38:1 › P05 changes calendar month without changing the selected day, and clears data when child changes | Error: expect(locator).toBeVisible() failed | 기능 호환 · 기존 등하원 화면의 날짜/아이 변경 시 이전 자료 제거 검증 | 최종 통과 |
| V2-011 | tests/e2e/direct-workspace.spec.ts:32:1 › direct calendar CRUD, general-event copy, title editing, stable menu shell and edge-to-edge swipe | Error: expect(locator).toBeVisible() failed | 테스트 대기·기준 · 로그인 시작 대기, 반복 일정 선택과 현재 가계부 제어로 CRUD 검증 | 최종 통과 |
| V2-012 | tests/e2e/direct-workspace.spec.ts:51:1 › parent B joins while signed in and group conversation has shared history, search and safe edits | Error: expect(locator).toBeVisible() failed | 테스트 대기 · 두 브라우저의 시작 완료 후 대화 입력, 공유 이력·작성자 권한 검증 | 최종 통과 |
| V2-013 | tests/e2e/direct-workspace.spec.ts:64:1 › tuition recurrence, designated payer, parent-only home, navigation and fixed appearance work together | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 월말 반복 가계부·담당자·일반사용자 메뉴·기존 제한 계정 권한 검증 | 최종 통과 |
| V2-014 | tests/e2e/direct-workspace.spec.ts:85:1 › today schedule and tuition member filters stay independent with collapsed totals and narrow screens | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 현재 달력/가계부의 독립적 구성원 기본 필터 저장·복원 검증 | 최종 통과 |
| V2-015 | tests/e2e/direct-workspace.spec.ts:118:35 › all functional canvases and calendar editor fit 320px | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 현재 고정 시간표와 날짜별 등록, 320px 본문/하단바 경계 검증 | 최종 통과 |
| V2-016 | tests/e2e/direct-workspace.spec.ts:118:35 › all functional canvases and calendar editor fit 768px | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 현재 고정 시간표와 날짜별 등록, 768px 본문/하단바 경계 검증 | 최종 통과 |
| V2-017 | tests/e2e/direct-workspace.spec.ts:118:35 › all functional canvases and calendar editor fit 1440px | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 현재 고정 시간표와 날짜별 등록, 1440px 본문/하단바 경계 검증 | 최종 통과 |
| V2-018 | tests/e2e/direct-workspace.spec.ts:158:1 › weekly repeat timetable and event calendar have independent CRUD and preserve family visibility | Error: expect(locator).toBeVisible() failed | 테스트 대기·기준 · 로그인 대기 및 일정과 겹치지 않는 날짜 숫자 클릭, 일정 종류별 CRUD 유지 | 최종 통과 |
| V2-019 | tests/e2e/family.spec.ts:9:1 › family creation → verified fixture consent → child → separate device pairing → immediate revocation | Error: expect(locator).toBeVisible() failed | 테스트 대기 · 모든 문서 이동 후 inert 해제 대기, 기존 연결/해제 호환 검사 유지 | 최종 통과 |
| V2-020 | tests/e2e/family.spec.ts:25:1 › unverified guardian sees preparation state without forms for child personal data | Error: expect(locator).toBeVisible() failed | 테스트 대기 · 시작 완료 후 로그인, 확인 전 민감정보 입력 제한 유지 | 최종 통과 |
| V2-021 | tests/e2e/family.spec.ts:32:1 › F01 distinguishes unavailable email, database failure and expired login without sending users in circles | Error: expect(locator).toBeVisible() failed | 테스트 대기 · 시작 완료 후 로그인, 공급자/DB/세션 실패 구분 검증 유지 | 최종 통과 |
| V2-022 | tests/e2e/family.spec.ts:61:1 › F03 applicant submits before family readiness and sees human-review result on mobile | Error: expect(locator).toBeVisible() failed | 테스트 대기 · 시작 완료 후 로그인, 기존 심사 결과 흐름의 회귀 검증 유지 | 최종 통과 |
| V2-023 | tests/e2e/family.spec.ts:78:1 › F04 approval → family → bound consent → invite → approval → scoped sharing | Error: expect(locator).toBeVisible() failed | 테스트 대기 · 신청 입력 전 시작 완료 및 다중 기기 흐름 대기 보완 | 최종 통과 |
| V2-024 | tests/e2e/login-landing.spec.ts:36:1 › LOW session keeps additional verification and explicit social reauthentication reachable | Error: expect(page).toHaveURL(expected) failed | 테스트 기준 · 낮은 인증 수준은 시간표 계정 확인 안내→추가 인증, 자료 접근 차단 유지 | 최종 통과 |
| V2-025 | tests/e2e/login-landing.spec.ts:17:1 › email-less Kakao session enters the live home without demo or protected-data requests | Error: expect(page).toHaveURL(expected) failed | 테스트 기준 · 세션 만료는 시간표 방문자 화면, 이전 계정 정보 제거 검증 | 최종 통과 |
| V2-026 | tests/e2e/marketing.spec.ts:41:1 › visitors can explore examples, use mobile navigation and reach signup/login/legal pages | Test timeout of 30000ms exceeded. | 테스트 기준 · 현재 사용 가이드 목차·시작 링크 및 공개 페이지 이동 검증 | 최종 통과 |
| V2-027 | tests/e2e/marketing.spec.ts:60:35 › public header and footer stay fixed through entry navigation at 320px | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 14세 이상 선택 후 가입 입력, 320px 상하단 고정 검사 | 최종 통과 |
| V2-028 | tests/e2e/marketing.spec.ts:60:35 › public header and footer stay fixed through entry navigation at 820px | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 14세 이상 선택 후 가입 입력, 820px 상하단 고정 검사 | 최종 통과 |
| V2-029 | tests/e2e/marketing.spec.ts:60:35 › public header and footer stay fixed through entry navigation at 1440px | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 14세 이상 선택 후 가입 입력, 1440px 상하단 고정 검사 | 최종 통과 |
| V2-030 | tests/e2e/messages.spec.ts:16:1 › P06 picture conversation saves once after a lost response, preserves delete and child scope | Error: expect(locator).toBeVisible() failed | 기능 호환 · 명시적 기존 오늘 화면에서 선택 아이 변경 및 대화 범위 검사 | 최종 통과 |
| V2-031 | tests/e2e/marketing.spec.ts:19:1 › public service and usage pages work across phone, tablet and desktop without account navigation | Test timeout of 90000ms exceeded. | 테스트 기준 · 현재 사용 가이드 구획/목차, 서비스 소개 FAQ 분리 검증 | 최종 통과 |
| V2-032 | tests/e2e/month-gestures.spec.ts:6:1 › tuition and notes swipe across months while filters, taps, scrolling and registration stay independent | Error: expect(locator).toContainText(expected) failed | 테스트 기준 · 현재 페이지의 가계부 합계와 연속 월 이동 영역으로 제스처 검증 | 최종 통과 |
| V2-033 | tests/e2e/messages.spec.ts:39:1 › P07 another device sees new messages, read state and deletions without refresh | Error: expect(locator).toBeVisible() failed | 기능 호환 · legacy=1 기존 알림함 주소 연결, 일반 알림 주소는 알림 설정 유지 | 최종 통과 |
| V2-034 | tests/e2e/privacy-operations.spec.ts:5:1 › the public account deletion link leads to a signed-in deletion request | Error: expect(page).toHaveURL(expected) failed | 기능 수정 · 로그인 완료 시 허용된 개인정보 삭제 요청 화면으로 복귀, 제출은 별도 사용자 동작 | 최종 통과 |
| V2-035 | tests/e2e/privacy-operations.spec.ts:23:1 › login copy is concise and location is absent from production navigation and Today | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 시간표·더보기 개인정보 링크, 위치 주소의 시간표 복귀와 지도 요청 없음 검증 | 최종 통과 |
| V2-036 | tests/e2e/privacy-operations.spec.ts:48:1 › monthly family filters keep their full height and remain clickable on short and narrow screens | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 현재 구성원 설정 팝업·다중 선택·좁은 화면에서 버튼 가림 검사 | 최종 통과 |
| V2-037 | tests/e2e/public-legal-navigation.spec.ts:3:1 › signed-out public documents never show workspace navigation, including session loading and logout | Error: expect(locator).toBeVisible() failed | 테스트 기준 · 3개 공개 약관과 비공개 개인정보 관리 구분, 로그인 전 요청 양식 없음 검증 | 최종 통과 |
| V2-038 | tests/e2e/public-stories.spec.ts:29:1 › all introduction menus and article layouts remain usable on small screens | Error: expect(received).toBe(expected) // Object.is equality | UI 수정 · 블로그 상세 그림의 비율 기반 가로 팽창 방지, 부모 너비 100% 적용 | 최종 통과 |
| V2-039 | tests/e2e/test-workspace.spec.ts:209:1 › content pane scrolls by keyboard while shell stays fixed | Error: expect(locator).toBeFocused() failed | 접근성 수정 · 시작 레이어 제거 뒤 본문 키보드 초점 복원, 활성 입력 초점 보호 | 최종 통과 |
| V2-040 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 320px | Error: expect(locator).toBeVisible() failed | 테스트 대기·기준 · 320px 로그인 및 모든 메뉴 하단바 고정/문서 넘침 검증 | 최종 통과 |
| V2-041 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 390px | Error: expect(locator).toBeVisible() failed | 테스트 대기·기준 · 390px 로그인 및 모든 메뉴 하단바 고정/문서 넘침 검증 | 최종 통과 |
| V2-042 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 768px | Error: expect(locator).toBeVisible() failed | 테스트 대기·기준 · 768px 로그인 및 모든 메뉴 하단바 고정/문서 넘침 검증 | 최종 통과 |
| V2-043 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 1024px | Error: expect(locator).toBeVisible() failed | 테스트 대기·기준 · 1024px 로그인 및 모든 메뉴 하단바 고정/문서 넘침 검증 | 최종 통과 |
| V2-044 | tests/e2e/workspace-shell.spec.ts:25:44 › workspace shell remains visible on all menus at 1440px | Error: expect(locator).toBeVisible() failed | 테스트 대기·기준 · 1440px 로그인 및 모든 메뉴 하단바 고정/문서 넘침 검증 | 최종 통과 |

## 1차 확인 및 수정

- 시작 화면이 본문을 inert 상태로 잠근 동안 테스트가 로그인 필드에 입력하는 경합: 시작 완료를 기다린 후 입력하도록 보완하고 실제 요청·결과를 다시 확인합니다.
- 로그인 경로가 next 값을 무시하는 흐름: 이미 로그인한 계정, 이메일·소셜·휴대폰 로그인에서 허용된 앱 내부 복귀 경로만 사용하도록 수정했습니다. 외부 URL은 기존 허용 목록으로 차단합니다.
- 첫 화면 표시 전에 시도한 본문 초점이 무시되는 문제: 시작 레이어 제거 후 사용자 초점을 빼앗지 않는 조건으로 키보드 본문 접근을 복원합니다.
- 이후 실패 검사에서 스크린샷과 트레이스를 보관하도록 검사 구성을 보완했습니다.

최종 실행 코드와 검사 결과는 아래에 기록했습니다.

## 추가 발견 및 예외 보강

| ID | 유형 | 원인·조치 | 검증 |
|---|---|---|---|
| V2-045 | 검사 데이터 | 실시간 23:59 시작/23:59 종료가 되어 입력 검증 실패. 15분 계획 창 안의 과거 두 시각과 날짜별 요일을 사용하고 당일 종료 가능한 범위로 제한 | workspace-push 13건 로컬 통과, 전체 단위/API 358건 및 PostgreSQL 48건 2차 통과 · 최종 통과 |
| V2-046 | 복귀 경로 | 이메일 인증 후 초대와 암호 복구 후 삭제 요청이 시간표로 빠짐. 정확한 허용 경로만 복귀하며 자동 수락/제출하지 않음 | group-invite, guest-entry, privacy-operations · 최종 통과 |
| V2-047 | 예외 처리 | 저장소 읽기 실패 처리 중 삭제도 거절되면 예외 재발생. 삭제 실패도 처리하고 소비하지 못한 입력 위치는 복구하지 않음 | entry-intent 추가 단위 검사 통과 · 최종 통과 |
| V2-048 | 비동기 검사 | 관리자 탭 변경 직후 이전 검색칸에 입력할 수 있는 경합. 새 탭 준비 대기, 이전 검색 응답을 늦게 전달해 최신 검색을 덮지 않는지 확인 | system-admin · 최종 통과 |
| V2-049 | 인증 오류 검사 | 소셜 로그인 복귀 URL 허용 목록, 공급자 실패 후 재시도·입력 보존·공급자 내부 오류 숨김 추가 검증 | baseline-exceptions · 최종 통과 |
| V2-050 | 버전·접근성 검사 | 시작 완료 후 본문 키보드 초점 및 방문자 화면, 더보기 버전/상태 API 버전 일치 확인 | baseline-exceptions, api · 최종 통과 |

현재 일반사용자 UI에는 승인번호·어린이 가입·관리자 승인 절차를 다시 노출하지 않습니다. 과거 계정/기기 API는 기존 자료 접근 권한과 해제 동작의 호환 검사를 유지합니다. `legacy=1` 경로의 복원은 이 범위에 한정됩니다.

| 추가 ID | 유형 | 원인·조치 | 검증 |
|---|---|---|---|
| V2-051 | Android 재진입 | API 36에서 오프라인 안내를 닫고 즉시 재실행하면 이전 LauncherActivity의 파괴 지연을 ABH가 실행 중인 TWA로 판단해 새 화면도 닫음. 오프라인에서만 자체 시작 URL을 명시하고 온라인의 기존 화면 복귀는 유지 | 종료 중 이전 Activity를 둔 Robolectric 회귀 검사 및 API 28/36 반복 실행 검사 통과 · 최종 통과 |
| V2-052 | 달력 이벤트 | 세로 마우스 드래그 뒤 호환 click이 인접 월 날짜를 선택하여 달력 월 변경. 스크롤 동작을 방해하지 않으면서 드래그의 후속 click만 억제 | direct-workspace의 세로 드래그 월/팝업 유지, 전체 월 이동·터치 검사 통과 · 최종 통과 |
| V2-053 | 구성원 검사 | 선택된 버튼 집합을 순회하며 선택을 해제하여 다음 nth 선택자가 이동·소멸. 전체 버튼의 안정된 집합을 순회하고 현재 상태를 확인 | 메뉴별 독립 필터 저장·복원 검사 통과 · 최종 통과 |

| 추가 ID | 유형 | 원인·조치 | 검증 |
|---|---|---|---|
| V2-054 | 검색 이벤트 경합 | 분류를 전체로 변경한 직후 검색하면 Router의 이전 쿼리 상태에서 검색을 구성해 이전 분류가 복원됨. 공개/앱 내부 읽기 화면에서 미반영 검색 조건을 즉시 합쳐 반영하고 URL 변경 시 동기화 | 같은 브라우저 턴에서 분류 변경+검색 입력, 새로고침 유지 회귀 검사 추가 · 최종 통과 |
| V2-055 | 공통 화면 검사 | 제거된 auth-header를 고정 셸 대상으로 찾던 검사. 실제 유지되는 auth-app.workspace-page를 표시해 메뉴 이동 후 동일 DOM인지와 문서/세션 재요청 없음을 확인 | direct-workspace · 최종 통과 |

## 최종 판정

- 실행 코드: `8332d2aae1e89dbf9b5738e8964f1df24e2b9dbc`
- 단위/API 358건, 실제 PostgreSQL 48건, 일반 브라우저 202건, 별도 약관 브라우저 4건 모두 통과.
- Android 28/36의 오프라인 재진입·회전·온라인 복귀 검사와 미서명 2.0 빌드/정적 검사 통과.
- 최초 실패 44건과 추가 점검 11건을 조치했습니다. UI 정책 변경에 맞춘 검사 보완과 실제 기능 수정은 유형/조치 열로 구분했습니다.
- 최종 자동화 실행에서 미해결 실패 없음. 실제 외부 공급자·실기기/스토어 검증 범위는 `BASELINE_v2.0.md`의 경계 항목을 따릅니다.
- 증거: [전체 검사](https://github.com/123456789pjh321-beep/iharu/actions/runs/43611406192), [약관](https://github.com/123456789pjh321-beep/iharu/actions/runs/43611406286), [Android](https://github.com/123456789pjh321-beep/iharu/actions/runs/43611406198).
