# UI144 아이하루 인트로 여백 제거

영상 비율을 유지하면서 화면 전체를 덮도록 표시한다. 모바일 브라우저 주소창 높이, 기기 회전, 창 크기 변경에 맞춰 재생 영역이 바뀐다. 영상 가장자리는 화면 비율에 따라 일부 잘리고, 회의·소통·대화 자막과 마지막 iHaru 로고는 브라우저가 화면 안쪽에 배치한다.

PC 가로 영상은 1920×1080, 모바일 세로 영상은 720×1280, 태블릿 영상은 1080×1080이다. 태블릿은 가로와 세로 방향의 잘림을 줄이기 위해 정사각형으로 구성했다. 휴대폰 가로 첫 진입에는 가로 영상을 사용하고, 재생 중 화면을 돌리면 재생 중인 영상의 표시 영역만 맞춘다. 영상은 4초 무음으로 재생되며 마지막 로고에서 본 화면으로 전환한다.

## 패치 파일

UI143 적용본을 기준으로 저장소 루트에 폴더 구조대로 덮어쓴다.

| 구분 | 파일 | 변경 내용 |
| --- | --- | --- |
| 추가 | `web/public/assets/iharu-intro-{pc,mobile,tablet}-v3.mp4` | 화면 비율별 4초 영상 장면 |
| 수정 | `web/src/components/LaunchVideo.tsx` | 첫 진입 화면 비율 선택, 재생 시점에 맞춘 자막과 로고 |
| 수정 | `web/src/components/launch-video.css` | 전체 화면 채우기, 기기 안전 영역에 자막과 로고 배치 |
| 수정 | `tests/e2e/launch-brand.spec.ts` | 넓은 PC, 세로 모바일, 태블릿, 회전 시 재생 영역 검증 |
| 추가 | `docs/UI144-full-screen-intro.md` | 적용 내역과 삭제 파일 목록 |

## 삭제 파일

- `web/public/assets/iharu-intro-mobile-v2.mp4`
- `web/public/assets/iharu-intro-pc-v2.mp4`
- `web/public/assets/iharu-intro-tablet-v2.mp4`
