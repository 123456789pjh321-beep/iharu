# 아이하루 Android 1.1.0

- Application ID: `com.myiharu.app` (Play 최초 업로드 후 변경 불가)
- versionCode: `3`, versionName: `1.1.0`
- Android 7.0(API 24) 이상 / target·compile SDK 36
- Android Browser Helper 2.7.4의 Trusted Web Activity로 `https://myiharu.com/timetable` 실행
- 네이티브 위치 위임·연락처·사진·광고 ID·결제 SDK를 추가하지 않음. 웹의 인증과 그룹 권한을 그대로 사용.
- 지원 브라우저와 인터넷 연결 필요. 도메인 검증 실패 시 주소 표시줄이 있는 Custom Tab으로 열릴 수 있음.

## 빌드

JDK 17 이상, Gradle 8.13, Android SDK 36 및 Build Tools 36.0.0을 설치한 뒤:

```sh
cd android
gradle --no-daemon bundleRelease assembleRelease lintRelease
```

CI의 **Android release kit** 워크플로도 같은 빌드를 수행한다. GitHub에는 서명되지 않은 산출물만 올린다. 실제 업로드 키·암호는 이 저장소에 넣지 않는다.

## 배포 서명과 도메인 확인

1. 별도로 보관한 개인 업로드 키로 AAB를 서명한다. Play Console에는 서명된 AAB를 업로드한다.
2. Play App Signing을 사용한다. Google이 생성한 **앱 서명 키**와 **업로드 키**는 다를 수 있다.
3. Play Console 앱 무결성의 **앱 서명 키 인증서 SHA-256**을 확인한다.
4. `web/public/.well-known/assetlinks.json`의 `sha256_cert_fingerprints` 배열에 그 값을 추가하고 웹을 배포한다. 기존 값은 제공한 직접 설치용 APK의 인증서다.
5. 실제 Play 내부 테스트로 설치한 앱에서 주소 표시줄 없는 실행과 로그인·뒤로 가기·가족 연결을 확인한다. OAuth 외부 도메인에서는 브라우저 표시줄이 나타나는 것이 정상이다.
6. 내부 앱 공유(Internal app sharing)는 별도의 서명 키를 사용하므로 내부 **테스트 트랙**과 구별한다.

확인 주소: `https://myiharu.com/.well-known/assetlinks.json` — HTTPS 200, JSON, 리디렉션 없이 응답해야 한다.

현재 포함하지 않는 기능: 네이티브 홈 화면 위젯, 오프라인 일정 편집, 위치 추적. 스토어 소개에서 지원하는 것처럼 표시하지 않는다.

## 출시 전 운영 확인

계정 신원·전화·기기 확인, 개인 계정의 테스트 요건, 실제 지원 연락처·운영자 정보·개인정보처리방침·삭제 요청 경로, 자녀 포함 타겟층과 가족 정책, 데이터 보안 신고를 실제 운영 값으로 완료한다. 빌드 성공이나 AAB 생성은 Google Play 심사 승인을 의미하지 않는다.

## 1.0.1 실행·연결 오류 복구

- 온라인 실행 중 누락된 `ManageDataLauncherActivity`로 강제 종료되던 오류를 수정합니다. 비공개 Activity와 고정된 사이트 관리 주소를 등록합니다.
- 브라우저 QualityEnforcer의 의도적인 메인 스레드 종료 경로를 연결 안내로 대체합니다. 브라우저가 보낸 URL·오류 사유는 로그에 남기지 않습니다.
- 인터넷이 없는 최초 실행에는 네이티브 연결 안내와 수동 재시도를 표시합니다. 자동 반복 재시도·백그라운드 작업은 없습니다.
- 웹 서비스 워커는 네트워크 단절/서버 장애 시 정적 재시도 화면만 반환합니다. 인증 HTML·API·가족 데이터를 캐시하지 않습니다.
- 앱 아이콘 실행의 빈 URI를 유지하여 기존 TWA 복귀와 딥링크 실행을 구분합니다.
- 앱 버전 1.0.1 / versionCode 2. 1.0.0과 같은 업로드 키로 서명해야 제거 없이 업데이트됩니다.
- Android 단위 회귀 검사와 API 28/36 에뮬레이터에서 오프라인 실행·재시도·종료·회전을 검사합니다. 삼성 실기기의 원본 오류 로그와 동일 원인인지는 별도 확인이 필요합니다.

## 1.1.0 — 달력·대화 기기 알림

- 더보기 → 알림설정에서 사용자가 허용하면 Web Push를 등록한다. TWA의 `DelegationService`가 검증된 브라우저의 알림을 아이하루 앱으로 위임받는다.
- Android 13 이상 `POST_NOTIFICATIONS`와 비공개 `NotificationPermissionRequestActivity`를 선언했다. 자동으로 권한을 요청하지 않으며, 알림 켜기 버튼에서 요청한다.
- 앱 시작 주소는 `/timetable`, 알림 터치는 `/today/calendar` 또는 `/chat`으로 연결한다.
- 새 네이티브 선언을 사용하려면 **versionCode 3 / versionName 1.1.0** 설치가 필요하다. 이전 APK에는 웹 화면 변경만 반영되고 앱 이름의 알림 위임은 적용되지 않는다.
- 앱 종료 후 수신은 Chrome/TWA의 Web Push와 OS 알림 허용에 의존한다. 강제 중지·배터리 제한·오프라인 상태에서는 지연될 수 있다.
- 기존 서명키로 업데이트 설치하고, 실기기에서 알림 허용 → 시험 알림 → 앱 닫기 → 다른 가족의 대화·달력 변경 순으로 확인한다. Play 배포는 별도 앱 서명 인증서가 assetlinks에 등록되어 있어야 한다.

## UI137 — 접속 시 선택 위치 권한

- 웹·PWA와 동일하게 첫 접속 안내의 **위치 사용하기**를 누르면 브라우저가 현재 사이트의 위치 권한을 요청합니다. 거부해도 앱의 기본 메뉴는 사용할 수 있습니다.
- 이 APK는 네이티브 위치 권한을 선언하지 않습니다. Chrome 공식 TWA 동작에 따라 앱이 위치 권한을 선언하지 않은 경우 Chrome의 사이트 위치 권한으로 처리합니다. [Chromium 공식 문서](https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/android/java/src/org/chromium/chrome/browser/browserservices/permissiondelegation/README.md)
- 따라서 이번 웹 패치에 새 APK 설치나 네이티브 위치 SDK 추가는 필요하지 않습니다. 설치 앱에서도 사이트 권한과 기기의 위치 서비스가 모두 허용되어야 합니다. 브라우저별 실제 표시 형태는 다를 수 있습니다.
- 대략적인 좌표만 활성 화면 메모리에 최대 30분 보관합니다. 좌표 서버 저장·외부 AI 전송·그룹 위치 공유·백그라운드 추적은 이번 패치에 포함하지 않습니다. 향후 브리핑은 웹의 `useBriefingLocation().getBriefingLocation()`으로 유효한 현재 위치를 읽어 연결할 수 있습니다.
- 실제 Android 기기에서 허용·거부·일회성 권한·앱 복귀·OS 위치 OFF를 확인합니다. 자동 브라우저 검사는 실제 Android 권한 UI 검증을 대신하지 않습니다.
