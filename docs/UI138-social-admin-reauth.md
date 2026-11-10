# UI138 — 소셜 로그인 관리자의 API 키 본인 확인 수정

## 수정 이유와 사용 순서

Google로 가입한 최고관리자가 API 키 등록·교체·삭제 중 최근 본인 확인을 요구받아도 아이하루 비밀번호가 표시되던 문제를 수정했습니다. 실제로 연결된 로그인 방법을 조회해 Google·카카오·네이버 버튼 또는 비밀번호 입력란을 표시합니다. 연결되지 않은 방법은 표시하지 않습니다.

1. 시스템관리 → AI 브리핑 설정에서 등록·교체·삭제를 진행합니다.
2. 본인 확인이 필요하면 **Google로 본인 확인**을 누르고 동일한 최고관리자 계정을 선택합니다.
3. 인증을 마치면 `/admin?section=ai`로 돌아옵니다.
4. 등록·교체 시 API 키를 다시 입력하고 버튼을 누릅니다. 삭제 시 삭제 대화상자를 다시 열어 확인합니다.

아이하루 비밀번호가 연결된 계정에는 비밀번호 본인 확인도 제공합니다. 비밀번호 확인 완료 자체는 API 키를 변경하지 않으며, 원래 작업 버튼을 다시 눌러 적용합니다. Google 인증을 시작하기 전에 키 입력값을 비웁니다. 따라서 인증에 실패하거나 취소해도 키를 다시 입력해야 합니다.

## 보호 범위

- 기존 최고관리자 권한, 최근 본인 확인 제한, 버전 충돌 검사, 서버 암호화와 감사 이력을 유지합니다. 구글 비밀번호를 아이하루에서 입력받지 않습니다.
- 키 원문이나 대기 중인 등록·삭제 작업을 URL, OAuth 요청, localStorage, sessionStorage에 넣지 않습니다. 소셜 인증 후 변경을 자동 실행하지 않습니다.
- OAuth 복귀 경로에는 정확히 `/admin?section=ai`만 추가했습니다. 임의 query·중복 query·다른 origin·fragment·우회 인코딩·키가 포함된 query는 계속 거절합니다. 계정 연결·비밀번호 재설정 경로 정책은 유지합니다.
- Google 계정 선택과 기존 OAuth state·PKCE·서명 검증을 사용합니다. Google 비밀번호 재입력을 강제하는 기능으로 설명하지 않습니다. 다른 계정을 선택하면 해당 계정 권한을 다시 확인합니다.
- 연결 방법 API는 비밀번호 원문·해시 대신 재확인 가능 여부만 반환합니다. 인증 실패 후 버튼 재시도와 브라우저 뒤로가기를 통한 복귀도 처리합니다.
- 기존 암호화 키와 이미 등록된 OpenAI 키를 변경하지 않습니다. DB 마이그레이션·환경변수 추가·앱 권한 변경이 없습니다. AI 브리핑 답변 생성과 위치 전송은 이번 패치에 포함되지 않습니다.

## 검증

- 로컬 프로덕션 빌드와 타입 검사 통과.
- 서명된 Google OAuth 통합 테스트: Google 전용 계정, state·PKCE, 정확한 설정 복귀, 새 세션 발급, 이전 세션 폐기, 재인증 전 변경 거절, 재인증 후 명시적 저장, state 재사용 거절, 임의 비밀번호 계정 생성 방지를 확인했습니다. 실제 사용자 계정이나 API 키를 사용하지 않았습니다.
- 소스 검증 커밋: `5ff052e3b0a7824b32d9852be5dfe29f9efed52a`.
- 전체 단위·API 테스트 307개, PostgreSQL 17 통합 시나리오 41개, 별도 대화·게스트·스티커 브라우저 검사 16개 통과. [PostgreSQL·대화 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42763076913).
- Google 전용·비밀번호 본인 확인을 포함한 AI 설정 브라우저 검사 4개, 전체 통합 화면 검사 45개 통과. 320·820·1440px 화면에서 Google 버튼·안내·입력란의 넘침이 없음을 확인했습니다. [통합 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42763076881). 닫힌 삭제 대화상자의 본인 확인 폼은 렌더링하지 않아 중복 입력란을 방지합니다.
- 별도 Workspace usability 검사에서는 17개 통과, 기존 달력 제스처 검사 4개 실패가 동일합니다(`continuous-workspace` 1개, `jade-paging` 3개). UI137에서 확인된 실패이며 이번 인증 수정 파일과 분리해 기록합니다. [해당 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42761836227).
- 실제 Google 계정 선택 화면은 사용자가 직접 진행합니다. 브라우저 검사는 독립된 가짜 계정·키와 인증 요청 가로채기를 사용하며, 서버 OAuth 콜백 검증과 구분합니다.

## 변경 파일

추가 2개, 수정 14개, 삭제 없음. ZIP에는 아래 파일만 원래 폴더 구조로 포함합니다.

| 구분 | 파일 | 변경 내용 |
| --- | --- | --- |
| 추가 | `web/src/components/AdminReauthentication.tsx` | 연결된 소셜·비밀번호 본인 확인, 인증 전 키 제거, 실패·복귀 재시도 |
| 추가 | `docs/UI138-social-admin-reauth.md` | 적용 방법·검증·파일 목록 |
| 수정 | `web/src/pages/AiBriefingSettings.tsx` | 비밀번호 일괄 요구 제거, 연결 방법 패널과 명시적 적용 |
| 수정 | `web/src/auth.ts` | 재인증 복귀 경로 전달, 확인 가능한 로그인 방법 스키마 |
| 수정 | `web/src/pages/Login.tsx` | 지정한 재인증 복귀 경로 유지 |
| 수정 | `web/src/admin.css` | 본인 확인 패널·버튼 배치 |
| 수정 | `server/auth/routes.ts` | 연결 방법별 본인 확인 가능 여부 반환 |
| 수정 | `server/admin/routes.ts` | 로그인 방식에 중립적인 본인 확인 안내 |
| 수정 | `shared/entry-intent.ts` | 정확한 AI 설정 복귀 경로 허용 |
| 수정 | `shared/auth-redirect.ts` | 소셜 복귀 query 허용 범위 검증 |
| 수정 | `tests/ai-credentials.test.ts` | 서명된 Google OAuth와 API 키 변경 권한 통합 검증 |
| 수정 | `tests/auth-redirect.test.ts` | AI 설정 경로 허용·우회 경로 거절 |
| 수정 | `tests/helpers/auth-server.ts` | 독립 테스트 서버에만 Google 전용·오래된 본인 확인 fixture 제공 |
| 수정 | `tests/e2e/ai-settings.spec.ts` | Google 전용·비밀번호 계정 UI와 키 미전달·수동 적용 검증 |
| 수정 | `.github/workflows/ledger.yml` | AI 설정 사전 검사·UI138 검증 결과 보관 |
| 수정 | `.github/workflows/chat-rooms.yml` | UI138 PostgreSQL·대화 회귀 결과 보관 |
