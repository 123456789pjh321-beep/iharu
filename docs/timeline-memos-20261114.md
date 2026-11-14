# 타임라인 메모·일정 알림 개선 (2026-11-14)

## 기능

- 시간표·달력·가계부를 자동으로 모으던 타임라인을 독립 메모로 전환합니다. 원래 일정·가계부 데이터는 변경하지 않습니다.
- 가계부와 같은 월 선택·구성원 선택 UI를 사용하고 기록의 상하좌우 여백을 줄였습니다.
- 제목·글·날짜·시간·카테고리·태그·장소·현재 위치·사진을 저장하고 수정·삭제합니다.
- 카테고리는 일상·가족·배움·나들이·건강·아이디어·기타입니다. 자유 태그는 5개까지 가능합니다.
- 사진은 메모당 3개, 원본 JPG·PNG·WebP 20MB까지 선택할 수 있습니다. 저장 전 최대 1600px/350KB로 최적화하고 숨겨진 촬영·GPS 메타데이터를 제거합니다. 사진은 인증된 API로만 조회하며 공개 URL을 만들지 않습니다.
- 현재 위치는 버튼을 눌러 권한을 허용했을 때만 한 번 읽습니다. 실패하면 장소 이름을 직접 입력할 수 있습니다. 백그라운드 위치 추적은 하지 않습니다.
- 기본 공유 범위는 ‘나만 보기’입니다. ‘현재 그룹과 공유’를 선택하면 사진·위치까지 공유됩니다. 작성자만 수정·삭제할 수 있고, 그룹 탈퇴·이동 후 이전 그룹의 접근은 종료됩니다.
- 월·전체 기간·직접 선택, 작성자, 카테고리, 공개 범위, 사진·위치 유무, 개인 즐겨찾기, 제목·글·장소·태그 검색을 조합합니다. 최신순·오래된순과 40개 단위 페이지 이동을 제공합니다.
- 기록이 없는 첫 화면에는 명확히 ‘샘플’로 표시한 안내 글 2개를 보여 줍니다. 샘플은 서버에 저장하지 않으며 첫 실제 메모를 저장하면 사라집니다. 로그인 전에도 샘플을 볼 수 있습니다.
- 작성 중 내용은 계정별로 현재 탭에 임시 보관해 24시간 이내 복원하며 저장 오류가 나도 유지합니다. 저장하면 임시 내용을 지웁니다. 닫기·삭제는 확인합니다.
- 기존 타임라인에서 직접 쓴 메모는 배포 시 ‘나만 보기’ 독립 기록으로 보존합니다. 이후 원본 일정과 연결하지 않습니다.
- 하단 메뉴: 시간표 → 달력 → 가계부 → 타임라인 → 대화 → 더보기.

## 알림

- 시간표의 주간 반복과 달력의 일정을 모두 알림 대상으로 포함합니다. 시간표는 화면과 동일하게 요일별 주간 틀을 사용합니다.
- 신규 계정의 기본값은 일정 알림 켬, 시작 시각(0분 전), 등록·변경 알림 끔입니다. 기존 계정의 선택은 유지하며 ‘일정 시작 시각 알림으로 설정’ 버튼으로 변경할 수 있습니다.
- 종일 일정은 한국 시간 오전 9시입니다. 중복 발생은 한 번만 처리하고, 수정·삭제·공유 종료·로그아웃은 발송 직전 다시 확인합니다.
- 예약 시각 순서로 처리합니다. 실제 기기 수신은 권한·기기 절전·네트워크와 푸시 서비스에 따라 지연될 수 있습니다. 기기 알림 연결은 별도로 한 번 필요합니다.
- 가계부와 타임라인 메모는 자동 푸시를 보내지 않습니다.

## 참고

- Day One: 날짜·텍스트 검색, 태그·즐겨찾기·장소 등 복합 필터. https://dayoneapp.com/guides/getting-started-with-day-one/search-in-day-one/
- Apple Journal: 사진·위치가 포함된 기록과 콘텐츠 종류별 필터. https://support.apple.com/en-us/guide/iphone/iph6257be047/ios

## 적용 및 검증

- 두 SQL 파일은 같은 마이그레이션이므로 사용하는 경로에서 한 번만 적용합니다.
- 테스트는 격리된 DB와 계정에서 수행하며 운영 개인 자료를 복제하지 않습니다.
- 검증 범위: 독립 메모 CRUD, 필터·페이지, 사진 권한, 다른 작성자의 변경 거부, 그룹 연결 종료, 입력 제한, 동시 수정, 일정 알림 순서·중복 방지, 모바일 브라우저 작성 흐름.

## 파일별 변경 목록

| 구분 | 파일 | 내용 |
|---|---|---|
| 추가 | `.github/workflows/timeline-memos.yml` | 메모·알림 설정 브라우저 검증과 화면 캡처 |
| 추가 | `db/migrations/20261114090732_timeline_memos_schedule_alerts.sql` | 독립 메모·사진·즐겨찾기, 접근 권한, 이전 메모 보존, 시간표 알림 |
| 추가 | `docs/timeline-memos-20261114.md` | 동작·적용·변경 목록 |
| 수정 | `server/family/service.ts` | 메모 전용 DB 명령 연결 |
| 수정 | `server/push/service.ts` | 예약 시각 순서로 전송하고 실행 시간 제한 유지 |
| 추가 | `server/workspace/memos.ts` | 메모 조회·저장·삭제·사진 API 입력 검증 |
| 수정 | `server/workspace/routes.ts` | 메모 API, 사진 요청 크기 제한과 비공개 응답 |
| 추가 | `shared/memos.ts` | 메모 필드·카테고리·타입과 입력 검증 |
| 추가 | `supabase/migrations/20261114090732_timeline_memos_schedule_alerts.sql` | 동일 SQL의 Supabase 배포용 사본 |
| 수정 | `tests/e2e/calendar-holidays-layout.spec.ts` | 변경 동작 회귀 검증 |
| 수정 | `tests/e2e/notification-calendar.spec.ts` | 변경 동작 회귀 검증 |
| 수정 | `tests/e2e/timeline.spec.ts` | 변경 동작 회귀 검증 |
| 수정 | `tests/integration/postgres.ts` | 변경 동작 회귀 검증 |
| 수정 | `tests/workspace-push.test.ts` | 변경 동작 회귀 검증 |
| 수정 | `tests/workspace.test.ts` | 변경 동작 회귀 검증 |
| 수정 | `web/src/App.tsx` | 로그인 전에도 샘플 2개 표시 |
| 수정 | `web/src/components/GuestWorkspace.tsx` | 메모 기능에 맞춘 안내 |
| 수정 | `web/src/components/Icon.tsx` | 사진·필터 아이콘 |
| 추가 | `web/src/components/MemoEditor.tsx` | 사진 최적화·현재 위치·태그·공유 범위·임시 저장 |
| 수정 | `web/src/components/WorkspaceNavigation.tsx` | 시간표→달력→가계부→타임라인→대화→더보기 |
| 수정 | `web/src/pages/NotificationSettings.tsx` | 시간표·달력 일정 알림과 시작 시각 설정 |
| 수정 | `web/src/pages/Timeline.tsx` | 가계부형 상단, 독립 메모·필터·샘플 2개 |
| 수정 | `web/src/pages/timeline.css` | 화면 여백 축소, 반응형 메모·사진·편집 창 |
| 수정 | `web/src/components/workspaceGuides.ts` | 메모 사용법과 시간표·달력 알림 안내 |
| 수정 | `web/src/components/PublicUserGuide.tsx` | 타임라인 가이드와 메뉴 순서 |
| 수정 | `web/src/pages/Marketing.tsx` | 변경된 메뉴 순서 안내 |
| 수정 | `web/src/components/BriefingLocation.tsx` | 브리핑 임시 위치와 메모 저장 위치 구분 |
| 수정 | `web/src/pages/Legal.tsx` | 선택한 사진·위치의 실제 저장·공유·삭제 방식 고지 |
| 수정 | `tests/e2e/group-invite.spec.ts` | 타임라인 구성원 필터 옆 초대 버튼과 메뉴 순서 검증 |

삭제 파일: 없음.
