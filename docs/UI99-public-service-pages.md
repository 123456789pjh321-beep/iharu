# UI99 — 아이하루 서비스 소개·활용법

- 공개 경로: `/service` (서비스 소개), `/guide` (활용법).
- TimeTree 한국어 홈페이지와 활용법의 서비스 소개·사용 상황·시작 안내 구성을 참고하고, 아이하루의 문구·브랜드·예시 화면으로 별도 제작.
- 시간표·연결 달력·학원비 필터·이모티콘을 눌러 보는 가상 예시 제공. 실제 가족 정보나 후기를 사용하지 않음.
- 일정 등록, 반복, 가족 연결, 학원비, 메모와 대화의 현재 구현을 기준으로 안내. Android 출시·스토어 다운로드·결제·위치 추적 등 미확인 기능을 홍보하지 않음.
- 휴대폰·태블릿·데스크톱 반응형. 소개 메뉴, 앵커, FAQ, 로그인·가입 링크, 키보드·모션 축소 지원.
- 공개 소개 화면은 앱 하단 내비게이션 없이 독립 표시. 로그인/가입/공개 문서 푸터에서 진입 가능.
- 두 공개 진입 HTML만 검색용 제목·설명·canonical·Open Graph·index 메타 제공. 로그인/작업실의 noindex 유지 및 페이지 전환 시 소개 메타 제거.
- 기존 루트 로그인 흐름과 Android 시작 경로 `/today` 유지.

## 추가 파일
- `web/src/pages/Marketing.tsx`: 서비스/활용법 페이지, 기능 예시, FAQ·시작 안내.
- `web/src/marketing.css`: 소개 전용 스타일과 반응형 레이아웃.
- `scripts/build-marketing.mjs`: 공개 진입 HTML의 메타데이터 생성.
- `tests/e2e/marketing.spec.ts`: 320/820/1440px, 예시 상호작용, 메뉴/앵커, 가입·로그인·공개 문서 연결, 메타 격리 검증.
- `docs/UI99-public-service-pages.md`: 변경 기록.

## 수정 파일
- `web/src/App.tsx`: 공개 페이지 지연 로드 경로.
- `web/src/components/AuthLayout.tsx`: 푸터 소개 링크.
- `package.json`: 공개 페이지 빌드 단계 연결.
- `vercel.json`: 두 경로의 공개 HTML 연결.
- `server/preview.ts`, `tests/helpers/auth-server.ts`: 로컬/검증 서버에 동일 경로 매핑.

삭제 파일 없음.

## 검증
TypeScript, 배포 빌드, 기존 단위/통합 검사 및 브라우저 회귀 검사로 검증. 브라우저 산출물에서 각 화면 크기의 소개·활용법·푸터 이미지를 확인한다.
