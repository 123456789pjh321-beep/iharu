# 아이하루 Android 1.0.1

- Application ID: `com.myiharu.app` (Play 최초 업로드 후 변경 불가)
- versionCode: `2`, versionName: `1.0.1`
- Android 7.0(API 24) 이상 / target·compile SDK 36
- Android Browser Helper 2.7.4의 Trusted Web Activity로 `https://myiharu.com/today` 실행
- 위치·연락처·사진·광고 ID·결제 SDK를 추가하지 않음. 웹의 인증과 가족 권한을 그대로 사용.
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

현재 포함하지 않는 기능: 네이티브 홈 화면 위젯, 네이티브 푸시 알림, 오프라인 일정 편집, 위치 추적. 스토어 소개에서 지원하는 것처럼 표시하지 않는다.

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
