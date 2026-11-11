# UI143 아이하루 첫 진입 홍보 영상

회의, 소통, 대화 장면이 교차 전환되고 기존 iHaru 로고로 마무리된다. 세 영상 모두 4초, 30fps, 무음 H.264 MP4다.

| 버전 | 해상도 | 비율 | 화면 너비 |
| --- | --- | --- | --- |
| 모바일 | 720×1280 | 9:16 | 600 CSS px 미만 |
| 태블릿 | 1200×900 | 4:3 | 600~1099 CSS px |
| PC | 1920×1080 | 16:9 | 1100 CSS px 이상 |

터치 화면은 화면의 짧은 쪽을 기준으로 하므로 휴대폰이나 태블릿을 가로로 돌려도 해당 기기의 영상이 선택된다. 영상 한 개만 요청하고 원본 비율을 유지한다.

시간표 등 시스템, 로그인 화면, 사용이 허용된 테스트 화면 중 첫 진입에서 브라우저 탭당 한 번 자동 재생한다. 컨트롤과 닫기 버튼을 숨기며 영상이 끝나면 230ms 동안 투명해지면서 본 화면을 드러낸다. 같은 탭에서 새로고침하거나 메뉴를 이동해도 반복 재생하지 않는다. 동작 줄이기 설정, 자동 재생 실패, 미디어 오류가 있는 경우에는 바로 본 화면으로 이어진다.

## 패치 파일

패치 ZIP은 UI139 운영 브랜치 `70529c1` 기준의 누적 변경분이다. 저장소 루트에 원래 폴더 구조대로 덮어쓴다.

| 구분 | 파일 | 변경 내용 |
| --- | --- | --- |
| 추가 | `web/public/assets/iharu-intro-{pc,mobile,tablet}-v2.mp4` | 기기별 4초 영상 |
| 추가 | `web/src/components/LaunchVideo.tsx`, `web/src/components/launch-video.css` | 영상 선택, 재생, 로고 대기 화면, 전환 |
| 수정 | `web/src/App.tsx`, `web/src/components/WorkspaceGate.tsx`, `web/src/pages/Login.tsx` | 시스템, 로그인, 테스트 진입 연결 |
| 수정 | `web/src/pages/PersonalWorkspace.tsx`, `web/index.html` | 편집 팝업과 첫 진입 화면 표시 순서 조정 |
| 수정 | `tests/e2e/launch-brand.spec.ts`, `tests/e2e/test-workspace.spec.ts` | 기기별 재생, 재생 실패, 탭 단위 동작과 포커스 검증 |
| 추가 | `docs/UI141-launch-intro.md`, `docs/UI142-launch-video.md`, `docs/UI143-responsive-intro.md` | 이전 시안과 이번 적용 기록 |

UI142를 이미 적용한 작업본에서는 `web/public/assets/iharu-intro-light-v1.mp4`와 `web/public/assets/iharu-intro-dark-v1.mp4`를 삭제한다.
