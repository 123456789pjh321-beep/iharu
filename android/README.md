# 아이하루 Android 1.0.0

- Application ID: `com.myiharu.app` (Play 최초 업로드 후 변경 불가)
- versionCode: `1`, versionName: `1.0.0`
- Android 7.0(API 24) 이상 / target·compile SDK 36
- Android Browser Helper 2.7.3의 Trusted Web Activity로 `https://myiharu.com/today` 실행
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
