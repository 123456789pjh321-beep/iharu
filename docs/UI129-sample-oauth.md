# UI129 — 소셜 로그인 복구 및 비회원 샘플 화면

기준: UI128 `a1dda78f7e3c0989245c77cb8ba9c4e43559d7a4` / 2026-11-10 KST

## 변경 동작

- 비회원 시간표 위의 큰 iHaru 로고·로그인 상단바와 안내 문구 행을 제거했다. 최초 시작 로고 애니메이션은 유지한다.
- 시간표, 달력, 학원비, 대화, 메모, 가족 관리에 가상 예시를 표시한다. 시간표·달력·학원비의 기존 구성원 필터 옆에 `샘플 데이터`를 표시한다. 날짜·월·보기·구성원 변경은 로그인 없이 탐색할 수 있다.
- 등록, 샘플 일정 누르기, 메시지 보내기, 가족 연결은 기존 로그인 시트를 연다. 로그인 이후에는 해당 계정의 자료를 조회한다. 계정·개인정보·알림 설정·관리자·가족 초대 페이지의 인증 및 권한 제한은 유지한다.
- 샘플은 브라우저 메모리에서만 생성한다. 계정·DB·대화 API·실시간 구독에 연결하지 않는다. 로그인 후 재개할 때는 종류·날짜·시간만 전달하며 제목·이름·금액·본문은 복사하지 않는다. 실제 저장은 사용자가 직접 저장할 때만 한다.

## 로그인 실패 원인과 수정

운영에서 `/api/auth/sign-in/social`에 현재 클라이언트와 같은 `{provider:"google", callbackURL:"/timetable", errorCallbackURL:"/login?next=%2Ftimetable"}`를 보내면 HTTP 400 `INVALID_CALLBACK`이 반환되었다. UI128에서 복귀 주소를 변경한 후 서버의 고정 허용 목록을 갱신하지 못한 것이 원인이다. 달력 등 복귀 경로와 이메일 인증의 `next`도 같은 문제가 있었다.

소셜 시작과 이메일 인증 GET/POST에 공통 검증 정책을 적용했다. 앱 내부의 명시된 경로와 필요한 `next`만 허용한다. 외부 도메인, 프로토콜 상대 URL, 중복 쿼리, 제어문자, 임의 복귀 경로는 거절한다. 계정 연결과 암호 재설정의 복귀 화면은 계속 고정한다. Origin, state, PKCE, 서명 검증, HttpOnly 쿠키, 명시적 계정 연결 정책은 유지한다. 설정값·OAuth 비밀·DB 마이그레이션 변경은 없다.

## 검증

- `npm run build`, `npm run typecheck` 통과.
- 실제 Better Auth·격리 PostgreSQL 인증 검사와 복귀 경로 검사 40개 통과: 실제 클라이언트 요청, Google RS256 서명/JWK 콜백, 계정 세션, 달력 복귀, state 재사용 거절, 이메일 인증 복귀, 외부 주소 차단 포함.
- 이전 브라우저 검사는 앱의 소셜 로그인 응답을 가짜 응답으로 대체해 이 오류를 놓쳤다. 이제 앱의 실제 로그인 API와 제공자 설정을 통과하고 외부 Google 페이지에 도달하는지 검사한다. 외부 페이지 표시만 격리 대체하며, 서명된 제공자 콜백은 위의 실제 서버 검사에서 별도로 검증한다.
- 브라우저 회귀 검사: 샘플 탐색, 상단바 제거, 입력 시 로그인, 로그인 후 빈 새 입력·계정 자료 전환, 샘플 미저장, 뒤로 가기, 자녀 권한, 모바일/데스크톱·다크·모션 감소. 배포 전 실행 결과를 이 문서에 보완한다.
- 운영에서는 OAuth 시작 응답과 실제 화면을 확인한다. 개인 Google 계정의 자격 증명 입력 및 최종 동의는 자동 수행하지 않는다.

## 파일 목록

추가 5개, 수정 12개, 삭제 0개. ZIP에는 아래 추가·수정 파일만 원래 경로로 포함한다.

|구분|파일|변경 내용|
|---|---|---|
|추가|`shared/auth-redirect.ts`|인증 복귀 경로의 공통 검증|
|추가|`shared/guest-samples.ts`|가상 가족·반복 일정·행사·학원비·메모|
|추가|`web/src/components/GuestSampleViews.tsx`|대화·메모·가족 샘플 화면|
|추가|`tests/auth-redirect.test.ts`|앱 내부 허용 주소와 외부·중복 주소 거절|
|추가|`docs/UI129-sample-oauth.md`|변경·검증·파일 목록|
|수정|`server/auth/routes.ts`|소셜·메일 인증에 같은 복귀 검증 적용|
|수정|`web/src/auth.ts`|복귀 주소 오류의 명확한 안내|
|수정|`web/src/components/GuestWorkspace.tsx`|상단바 제거, 샘플 연결, 실제 작업 로그인 요구|
|수정|`web/src/components/MemberPreferenceFilter.tsx`|예시 구성원 필터의 샘플 표시|
|수정|`web/src/components/PersonalTimetable.tsx`|비회원 미리보기 속성 전달|
|수정|`web/src/components/PersonalCalendar.tsx`|비회원 미리보기 속성 전달|
|수정|`web/src/components/PersonalFees.tsx`|비회원 미리보기 속성 전달|
|수정|`web/src/guest-entry.css`|상단바 제거, 샘플 배지·대화·가족 화면 스타일|
|수정|`tests/auth.test.ts`|실제 인증 라우터·메일·서명된 Google 콜백 회귀 검사|
|수정|`tests/helpers/auth-server.ts`|배포에 포함되지 않는 Google 브라우저 검사 설정|
|수정|`tests/e2e/guest-entry.spec.ts`|샘플·로그인·계정 분리 및 실제 OAuth 시작 검사|
|수정|`.github/workflows/guest-entry.yml`|인증 회귀 검사를 포함한 CI 실행 범위|

## 반영·되돌리기

별도 DB 실행 없이 변경 파일을 반영하고 재빌드·재배포한다. 되돌릴 때는 UI128 기준 배포를 복구하거나 이 변경을 되돌려 재배포한다. 샘플 데이터 정리 쿼리는 필요하지 않다.
