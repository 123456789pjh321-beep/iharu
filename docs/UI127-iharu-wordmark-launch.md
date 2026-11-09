# UI127 iHaru 글자 로고와 최초 진입 애니메이션

기준일: 2026-11-10. 대상: myiharu.com.

## 적용 동작

- HTML 첫 화면에 큰 iHaru 로고를 중앙에 표시합니다. 앱 JS·인증·초기 자료가 준비되는 동안 표시하고, 준비 후 약 0.28초에 걸쳐 사라집니다. 빠른 연결에서는 전체 표시 약 1초이며 임의의 긴 대기 시간을 추가하지 않습니다.
- 문서 최초 진입마다 한 번 실행하고 SPA 메뉴 전환·브라우저의 이전 화면 복원에서는 다시 실행하지 않습니다.
- 글자는 Manrope 650에서 윤곽선으로 추출했습니다. 추가 글꼴 다운로드와 무관하게 같은 모양을 표시하며, 소개·로그인·앱 로고와 기본 로딩 표시 및 웹 아이콘에 적용합니다. SIL OFL 1.1 라이선스 원문을 포함합니다.
- OS의 움직임 줄이기와 앱/소개 화면의 저장된 움직임 설정을 따릅니다. 어두운 화면 설정도 초기 표시부터 적용합니다.
- 로고 표시 중 앱 본문의 키보드·스크린리더 접근은 잠그고 표시 종료 시 복구합니다. 초기 API 오류는 앱의 실제 오류·재시도 화면을 표시합니다.
- 앱 번들을 불러오지 못하면 재시도 화면을 제공합니다. 8초 후 앱 본문이 준비 중이면 앱 자체 로딩/오류 화면으로 넘기며 전체 화면을 계속 가리지 않습니다. JavaScript가 꺼진 경우에는 소개 페이지의 기존 정적 본문을 읽을 수 있습니다.

## 유지보수

`shared/brand.ts`의 윤곽선이 원본입니다. 변경 시 `node scripts/sync-brand-assets.mjs`로 HTML의 첫 로고, SVG 원본과 웹 아이콘을 동기화합니다. 시작 화면에 외부 이미지·폰트·네트워크 호출을 추가하지 않습니다.

## 검증

타입 검사·프로덕션 빌드 통과, 단위 테스트 28개 파일/230개 통과입니다. 전용 브라우저 검사 7개도 통과했습니다. 번들 지연 중 첫 표시·초기 자료 대기·메뉴 전환·320px 화면·어두운 화면·움직임 줄이기·번들 실패와 재시도·API 실패·JavaScript 비활성화를 포함합니다.

검증 기준은 `0cccec791c4acaf834c82dd8243b91d12eb09168`입니다. 이후 변경은 이 문서뿐입니다.

| 검증 | 결과 | 근거 |
|---|---|---|
| 타입·빌드·단위 테스트 | 통과, 230개 | [로고 전용 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42701746501) |
| 로고·시작 화면 | 7개 통과 | 위 CI의 전용 브라우저 검사 및 실제 화면 캡처 |
| 안내문·공지·블로그·달력 스와이프 | 3개 통과 | [읽기·달력 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42701746004) |
| 문서 초안 저장·게시·충돌 처리 | 3개 통과 | [문서 저장 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42701746427) |
| 알림·달력 UI | 통과 | [알림·달력 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42701745997) |
| 일정 입력·시간표 제스처·키보드·표시 시간 | 8개 통과 | [시간표 회귀 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42701745955) |
| 실제 PostgreSQL 동시성·역할 분리 | 통과 | [통합 CI](https://github.com/123456789pjh321-beep/iharu/actions/runs/42701074251)의 해당 단계 |

브라우저 검사의 직접 입력·터치·키보드 포커스는 시작 화면이 닫힌 다음 수행합니다. 대기 조건 보완 후 시간표 키보드 회귀 검사도 통과했습니다.

기존 전체 E2E의 이전 메뉴 선택자 등 알려진 실패와 이번 전용 검증을 구분하며 전체 E2E 통과로 표현하지 않습니다.

## 변경 파일

추가 9개, 수정 10개, 삭제 0개입니다. 배포 ZIP은 아래 파일만 원래 경로로 포함합니다.

| 구분 | 파일 | 주요 변경 |
|---|---|---|
| 추가 | `shared/brand.ts` | iHaru 로고 윤곽선의 단일 원본 |
| 추가 | `web/src/components/BrandWordmark.tsx` | 공통 SVG 글자 로고 |
| 추가 | `web/src/brand.css` | 화면 크기·어두운 화면·움직임 설정별 로고/로딩 스타일 |
| 추가 | `web/public/brand/iharu-wordmark.svg` | 독립 사용 가능한 벡터 로고 |
| 추가 | `web/public/brand/OFL.txt` | Manrope의 SIL OFL 라이선스 원문 |
| 추가 | `scripts/sync-brand-assets.mjs` | HTML·SVG·웹 아이콘 동기화 도구 |
| 추가 | `tests/e2e/launch-brand.spec.ts` | 첫 표시, 초기 자료, 메뉴 이동, 접근성, 실패 복구 검사 |
| 추가 | `.github/workflows/launch-brand.yml` | 로고 전용 브라우저 검사와 결과 이미지 보관 |
| 추가 | `docs/UI127-iharu-wordmark-launch.md` | 적용 내용·검증·변경 목록 |
| 수정 | `web/index.html` | React 실행 전 중앙 시작 화면과 종료/실패 복구 처리 |
| 수정 | `web/src/main.tsx` | 공통 로고 스타일 연결 |
| 수정 | `web/src/components/Common.tsx` | 회색 스켈레톤을 작은 로고/로딩선으로 변경 |
| 수정 | `web/src/components/PublicHeader.tsx` | 소개·로그인 헤더의 글자 로고 통일 |
| 수정 | `web/src/components/WorkspaceNavigation.tsx` | 앱 공통 로고 통일 |
| 수정 | `web/public/app-icon.svg` | 설치형 웹앱의 기본 아이콘 교체 |
| 수정 | `web/public/icon.svg` | 브라우저 파비콘 교체 |
| 수정 | `tests/e2e/workspace-reading-calendar.spec.ts` | 시작 화면이 닫힌 후 실제 터치 검사 시작 |
| 수정 | `tests/e2e/legal-content-save.spec.ts` | 시작 화면 종료 후 문서 입력·새로고침 검증 |
| 수정 | `tests/e2e/timetable-visible-hours.spec.ts` | 시작 화면 종료 후 시간표 키보드 포커스·레이아웃 검증 |

## 적용·복구

소스 적용 후 `npm ci` 및 `npm run build`로 다시 빌드합니다. DB 마이그레이션이나 별도 환경변수는 없습니다. 웹 아이콘 변경은 브라우저/설치된 PWA의 갱신 시점에 반영되며, 이미 배포된 Android 네이티브 패키지의 리소스는 별도 앱 출시 대상입니다.

복구할 때는 배포를 UI126 기준 `76915aa002171741e519ea4ff15f9eb66c03ec33`으로 되돌립니다. 수동 소스 복구는 수정 10개를 이전 버전으로 복원하고 추가 9개를 제거한 뒤 다시 빌드합니다.
