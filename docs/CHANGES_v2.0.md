# 아이하루 v2.0 파일 변경 목록

적용 기준: 로딩 중앙 배치가 반영된 `d7e9ee5141f875d8988c37d441c0f2c9b5926dc7` 이후 패치입니다. 그룹 목록·초대·상하단 고정·로딩 중앙 배치가 포함된 소스 위에 적용합니다.

- 추가: 6개
- 수정: 41개
- 삭제: 없음
- DB 마이그레이션 및 의존성 교체: 없음

ZIP은 추가·수정 파일만 기존 경로대로 포함합니다. 전체 소스가 필요할 때는 `baseline/v2.0.0` 기준 브랜치를 사용합니다.

| 구분 | 파일 | 주요 변경 |
|---|---|---|
| 추가 | `docs/BASELINE_v2.0.md` | 기준 버전 범위·검증 환경·결과·운영 및 롤백 기준 |
| 추가 | `docs/CHANGES_v2.0.md` | 추가·수정·삭제 파일 목록 및 적용 기준 |
| 추가 | `docs/QA_v2.0_issues.md` | 발견 항목별 원인·조치·재검증 결과 |
| 추가 | `shared/version.ts` | 공통 버전 2.0.0 및 아이하루 v2.0 명칭 |
| 추가 | `tests/e2e/baseline-exceptions.spec.ts` | 소셜 공급자 오류·재시도·안전한 복귀·본문 초점·버전 검사 |
| 수정 | `android/app/build.gradle` | Android 기준 버전 2.0.0, versionCode 5 |
| 수정 | `android/app/src/main/java/com/myiharu/app/MainActivity.java` | 오프라인 안내를 닫은 직후 재실행 시 새 화면 종료 방지 |
| 수정 | `android/app/src/test/java/com/myiharu/app/RuntimeRecoveryTest.java` | 종료 중인 이전 Activity와 새 오프라인 화면의 경합 회귀 검사 |
| 수정 | `package-lock.json` | 잠금 파일의 루트 버전 일치; 의존성 버전 변경 없음 |
| 수정 | `package.json` | 웹/API 패키지 버전 2.0.0 |
| 수정 | `playwright.config.ts` | 실패 시 화면과 트레이스 보존 |
| 수정 | `server/app.ts` | 상태 API에 릴리스 버전 표시 |
| 수정 | `shared/contracts.ts` | 하위 호환 상태 API 버전 필드 |
| 수정 | `shared/entry-intent.ts` | 저장소 읽기와 삭제가 함께 실패할 때 안전한 복구 |
| 수정 | `tests/api.test.ts` | 상태 API 릴리스 버전 검사 |
| 수정 | `tests/e2e/adaptive-design.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/ai-settings.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/app.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/auth-flow.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/auth.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/compact-actions.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/direct-workspace.spec.ts` | 현재 메뉴 CRUD·권한·필터 저장·반응형 및 세로 드래그 회귀 검사 |
| 수정 | `tests/e2e/family.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/group-invite.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/guest-entry.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/login-landing.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/marketing.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/messages.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/month-gestures.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/privacy-operations.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/public-legal-navigation.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/public-stories.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/e2e/system-admin.spec.ts` | 탭 준비 대기와 뒤늦은 검색 응답의 최신 결과 덮어쓰기 방지 검증 |
| 수정 | `tests/e2e/workspace-shell.spec.ts` | 현재 화면·정책에 맞춘 회귀 검사 및 시작 완료 대기 보완; 권한·저장·실패 검증 유지 |
| 수정 | `tests/entry-intent.test.ts` | 허용 경로·외부 URL 거절·저장소 실패 예외 검사 |
| 수정 | `tests/helpers/workspace-ui.ts` | 시작 레이어 제거와 inert 해제 후 사용자 입력 보장 |
| 수정 | `tests/workspace-push.test.ts` | 자정 경계에서도 유효한 일정·알림 검사 데이터 |
| 수정 | `web/index.html` | 시작 레이어 종료 후 본문 키보드 초점 복원 |
| 수정 | `web/src/App.tsx` | 시작 상태 확정 대기, 명시적인 기존 화면 주소 호환 |
| 수정 | `web/src/auth.ts` | 소셜 인증 후 허용된 내부 복귀 경로 보존 |
| 수정 | `web/src/components/WorkspaceMore.tsx` | 더보기 하단 아이하루 v2.0 표시 |
| 수정 | `web/src/components/useCalendarPager.ts` | 세로 드래그 뒤 날짜 클릭·월 변경 방지 |
| 수정 | `web/src/marketing.css` | 좁은 화면에서 블로그 그림의 가로 넘침 수정 |
| 수정 | `web/src/pages/Login.tsx` | 이메일·휴대폰·로그인 상태별 안전한 복귀 경로 연결 |
| 추가 | `web/src/components/useStoryFilters.ts` | 빠른 분류·검색 입력을 최신 URL 조건에 합치는 공통 훅 |
| 수정 | `web/src/components/PublicStories.tsx` | 공개 글 검색의 분류 복원 경합 수정 |
| 수정 | `web/src/components/WorkspaceReader.tsx` | 앱 내부 글 검색에도 동일한 경합 수정 |
