# UI137 — 선택 위치 권한과 OpenAI API 키 설정

기준 버전: 운영 UI136 (`22f3f156ec2bb69ec6606289362d0f69d600c4d9`).

## 사용 방법

1. 시간표·달력·대화 등 작업 화면 첫 접속의 **위치 사용하기**에서 목적 안내를 읽고 브라우저·기기 권한을 선택합니다. **나중에**를 선택하거나 거부해도 기본 기능을 계속 이용할 수 있습니다.
2. **더보기 → 설정 → 위치 사용**에서 권한 상태·최근 확인 시각을 확인하고 다시 확인하거나 끌 수 있습니다. 선택은 기기별로 기억하며 브라우저 권한 자체의 취소는 사이트·기기 설정에서 합니다.
3. 최고관리자는 **더보기 → 시스템관리 → AI 브리핑 설정**에서 OpenAI API 키를 등록합니다. 등록 후 **연결 확인**으로 저장한 키의 모델 목록 접근을 확인할 수 있습니다. 교체·삭제 시에는 최근 본인 확인이 필요하며 소셜 로그인은 다시 로그인해서 이어갈 수 있습니다.

## 위치 처리 범위

- HTTPS 및 동일 출처에서만 Geolocation API를 사용합니다. 카메라·마이크 차단과 기존 기타 보안 설정은 유지합니다.
- 안내를 선택하기 전에는 브라우저가 이미 허용 상태여도 위치를 읽지 않습니다. 거부·일회성 권한 만료 후에 권한 요청창을 자동 반복하지 않습니다.
- 현재 좌표를 소수점 둘째 자리로 줄이고 정확도를 최소 1,500m로 표시하는 내부 자료로 처리합니다. 원본 좌표는 저장하지 않습니다.
- 대략적인 마지막 위치 하나만 활성 화면 메모리에 최대 30분 보관합니다. 화면 숨김·대상 화면 종료·계정 전환·사용 끄기·권한 철회 시 비웁니다. 이동 이력·백그라운드 추적·서버 저장·그룹 공유·외부 AI 전송은 하지 않습니다.
- 브라우저 저장소에는 버전과 선택 상태만 보관합니다. 다른 탭에서 끄면 열린 화면도 비웁니다. 향후 화면은 `useBriefingLocation().getBriefingLocation()`으로 유효한 현재 자료만 읽을 수 있습니다. 만료·비활성·비허용 자료는 NULL입니다.
- AI 브리핑 화면 및 위치를 외부에 보내는 기능은 이번 범위에 없습니다. 추후 연결 시 전송 목적·범위 안내와 별도 서버 권한 검사가 필요합니다. 어린이 위치를 보호자에게 공유하는 기능으로 해석하지 않습니다.
- Android 앱은 TWA이며 네이티브 위치 권한을 선언하지 않습니다. 이 경우 Chrome 사이트 권한으로 처리하는 공식 동작을 사용하므로 새 APK나 위치 SDK가 필요하지 않습니다. 실제 Android·iOS 기기의 권한창 형태·일회성 권한·OS 위치 OFF는 실기기 확인 대상입니다.
- 기존 게시 약관·처리방침과 버전이 있는 검토 초안은 변경하지 않습니다. 개인정보 안내 화면에 이번 기기 내 선택 위치 기능의 구체적인 처리 범위를 별도로 표시합니다.

## API 키 보호와 사용

- API 키는 HTTPS로 서버에 제출한 뒤 AES-256-GCM으로 암호화합니다. 매 저장마다 새 12바이트 nonce와 인증 태그를 사용하고 용도에 고정된 AAD를 적용합니다.
- 암호문은 비공개 `app_private.ai_provider_settings`에, 32바이트 암호화 키는 별도의 운영 서버 Secret `AI_CREDENTIAL_ENCRYPTION_KEY`에 보관합니다. 클라이언트 공개 환경변수에 넣지 않습니다. DB는 강제 RLS와 제한된 함수 경로를 사용하며 런타임은 테이블을 직접 조회할 수 없습니다.
- 화면·조회 응답은 등록 여부·키에서 직접 일부를 떼지 않은 HMAC 식별 코드·버전·변경 시각·연결 상태만 제공합니다. 원문·암호문·암호화 키는 조회 API로 반환하지 않습니다. 입력값은 저장 후 비우며 localStorage·sessionStorage에 넣지 않습니다.
- 최고관리자 권한을 API와 DB에서 매번 확인합니다. 등록·교체·삭제에는 최근 재인증, 변경에는 버전 충돌 검사, 연결 확인에는 분당 3회 요청 제한을 적용합니다.
- 변경 이력에는 작업자·작업·결과만 남깁니다. API 키·암호문·외부 서비스 오류 본문을 이력·요청 로그·오류 응답에 포함하지 않습니다.
- 연결 확인은 서버에서 고정 주소 `https://api.openai.com/v1/models`에 저장된 키로 GET 요청합니다. 리디렉션을 허용하지 않고 10초 제한을 적용합니다. 인증/한도/연결 실패만 안전한 상태로 표시합니다. 답변 생성이나 위치·그룹 자료 전송은 하지 않습니다.
- `AiCredentials.withKey()`는 서버 내부에서 복호화해 사용하는 연결 지점입니다. 현재는 최고관리자의 연결 확인만 사용하며 일반사용자 브리핑용 공개 API는 만들지 않습니다.
- 등록 키 삭제는 아이하루 저장소에서의 삭제입니다. OpenAI에서 발급한 키 자체의 폐기는 OpenAI 관리 화면에서 별도로 처리해야 합니다.

## 적용·복구

1. 별도 Production Secret으로 암호화 키를 준비합니다. 값은 32바이트 난수의 64자리 hex이며 샘플 파일에는 빈 항목만 제공합니다.
2. `db/migrations/20261110042833_ai_briefing_credentials.sql`을 적용한 뒤 앱을 배포합니다. 애플리케이션의 기준은 `db/migrations/`이며 `supabase/migrations/`는 같은 내용의 사본입니다. 같은 DB에 두 번 수동 적용하지 않습니다.
3. 최고관리자가 시스템관리 화면에서 실제 OpenAI API 키를 직접 등록하고 연결을 확인합니다. 키를 채팅·저장소·공개 설정에 적을 필요가 없습니다.
4. 암호화 키를 임의로 교체·삭제하면 기존 암호문을 읽을 수 없습니다. 보관 중에는 유지하고, 별도 재암호화 절차를 마련하거나 실제 API 키를 다시 등록하는 방식으로 복구합니다.
5. 암호화 키가 없거나 잘못되면 저장·복호화는 실패하도록 차단합니다. 다른 앱 메뉴에는 영향을 주지 않습니다.

## 검증 및 파일 목록

- 검증 소스: `8f2cbd3998e90a39e9b888365647433073555958`.
- [통합 화면 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42758220537): 단위·API 299개, 타입 검사·운영 빌드, 기존 메뉴와 신규 위치·키 관리 화면 43개 통과.
- [실제 DB·대화 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42758220538): PostgreSQL 17 통합 시나리오 41개와 대화·비회원·그림 메시지 화면 검사 16개 통과. 키 동시 교체, 런타임 테이블 접근 차단, 그림 메시지 입력 공간을 검증했습니다.
- 신규 위치 검사 6개: 명시적 선택, 저장소·요청에 좌표 없음, 거부 후 기본 기능, 시간 초과 재시도, 미지원, 다른 탭에서 끄기. 신규 AI 화면 검사 2개: 관리자 등록·확인·교체·삭제와 일반사용자 차단.
- 운영 DB 마이그레이션 적용 및 애플리케이션 기록 SHA-256 일치 확인: `89b32cd3e5079037989130c7243e6e323c25e743cb0c19d82896c882c5840f22`. 강제 RLS, 런타임 테이블 접근 불가, PUBLIC 함수 실행 불가, 함수 소유자 `iharu_policy`를 확인했습니다. 보안 권고 0개입니다.
- 운영 서버의 전용 Production Secret 설정을 확인했습니다. 운영 OpenAI API 키는 등록하지 않았으며, 실제 OpenAI 호출은 키 등록 후 관리자의 연결 확인으로 검증합니다. 자동 검증은 격리된 가상 키와 응답만 사용했습니다.
- Android 빌드와 API 28·36 기본 실행 검사는 통과했습니다. 실제 기기의 위치 권한창·OS 위치 설정 조합은 자동 브라우저 검사가 대신하지 않습니다.
- 별도 Workspace usability는 17개 통과, 기존 달력 제스처 검사 4개 실패가 동일합니다(continuous-workspace 1개, jade-paging 3개). Android 릴리스의 스토어 화면 캡처 스크립트는 이전 홈 선택자 `.personal-home-feed`를 기대하지만 현재 `/today`는 시간표로 이동하므로 실패했습니다. Android 빌드·기본 실행 결과와 구분합니다.
- 운영 대상: <https://myiharu.com/settings#location-settings>, <https://myiharu.com/admin?section=ai> (최고관리자 로그인 필요), PR #69.
 위치 좌표·OpenAI 키는 격리된 테스트 자료만 사용하며 운영 사용자 위치나 실제 키를 검증 목적으로 등록하지 않습니다.

참고: [Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition), [Permissions Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation), [Chrome TWA 위치 권한](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/android/java/src/org/chromium/chrome/browser/browserservices/permissiondelegation/README.md), [OpenAI 인증](https://developers.openai.com/api/reference/overview), [모델 목록 API](https://developers.openai.com/api/reference/resources/models/methods/list).

### 파일별 변경 목록 — 추가 13개·수정 17개·삭제 없음

| 구분 | 파일 | 주요 변경 |
| --- | --- | --- |
| 수정 | `.env.example` | 서버 전용 암호화 키의 빈 환경변수 예시 |
| 수정 | `.github/workflows/chat-rooms.yml` | 실제 PostgreSQL 검증 산출물 갱신 |
| 수정 | `.github/workflows/ledger.yml` | 위치·AI 설정을 포함한 43개 화면 검사 |
| 수정 | `android/README.md` | TWA 사이트 위치 권한과 실기기 확인 안내 |
| 추가 | `db/migrations/20261110042833_ai_briefing_credentials.sql` | 암호화 보관 테이블·강제 RLS·관리자 검증·버전·이력 |
| 추가 | `server/admin/ai-credentials.ts` | AES-GCM 암호화·복호화·서버 전용 OpenAI 연결 확인 |
| 수정 | `server/admin/routes.ts` | 최고관리자 키 등록·조회·교체·삭제·확인 API |
| 수정 | `server/app.ts` | 격리 검증용 AI 의존성 주입 |
| 수정 | `server/family/service.ts` | 전용 비공개 DB 명령 경로 연결 |
| 추가 | `shared/ai-settings.ts` | 비밀을 제외한 관리 화면 응답 형식 |
| 추가 | `supabase/migrations/20261110042833_ai_briefing_credentials.sql` | DB 마이그레이션 관리용 동일 사본 |
| 추가 | `tests/ai-credentials.test.ts` | 암호화·변조·접근 권한·동시 변경·오류·제한 검사 |
| 추가 | `tests/briefing-location.test.ts` | 명시적 선택·만료·철회·백그라운드·임시 보관 검사 |
| 추가 | `tests/e2e/ai-settings.spec.ts` | 관리자 키 수명주기와 일반사용자 차단 화면 검사 |
| 추가 | `tests/e2e/briefing-location.spec.ts` | 허용·거부·재시도·미지원·다중 탭 위치 검사 |
| 수정 | `tests/helpers/auth-server.ts` | 실제 외부 요청 없는 격리 OpenAI 응답 |
| 수정 | `tests/integration/postgres.ts` | 실제 PostgreSQL 키 교체 경합과 접근 차단 검사 |
| 수정 | `vercel.json` | 위치 접근의 동일 출처 허용 |
| 수정 | `vitest.config.ts` | 검증 시 운영 암호화 환경변수 접근 차단 |
| 수정 | `web/src/admin.css` | AI 설정 화면과 반응형 정보 표시 |
| 추가 | `web/src/briefing-location.css` | 접속 안내·위치 설정·그림 메시지 공간 처리 |
| 추가 | `web/src/briefing-location.ts` | 기기 내 위치 상태·권한·선택·만료·복사용 자료 관리 |
| 수정 | `web/src/components/AuthLayout.tsx` | 공통 앱 화면에 위치 제공자·접속 안내 연결 |
| 추가 | `web/src/components/BriefingLocation.tsx` | 선택 안내·설정·철회·개인정보 설명 UI |
| 수정 | `web/src/components/WorkspaceMore.tsx` | 더보기 설정의 위치 관리 항목 |
| 수정 | `web/src/main.tsx` | 위치 기능 스타일 연결 |
| 수정 | `web/src/pages/AdminConsole.tsx` | 최고관리자 AI 브리핑 설정 탭·이력 명칭 |
| 추가 | `web/src/pages/AiBriefingSettings.tsx` | 키 입력·상태·재인증·연결 확인·삭제 확인 UI |
| 수정 | `web/src/pages/Legal.tsx` | 기기 내 선택 위치 처리 별도 안내 |
| 추가 | `docs/UI137-location-and-openai-settings.md` | 사용법·처리 범위·적용·검증·파일 목록 |

ZIP에는 위의 추가·수정 파일만 원래 폴더 구조로 포함합니다. 삭제 파일은 없습니다.
