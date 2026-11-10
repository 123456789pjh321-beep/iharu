# UI132 — 가계부 확장·대화방 안내문 삭제·그룹 명칭 통일

기준: 배포된 UI131 `2856d00d28d60dab0c16ccdb6c362b8d4612f1e9`.

## 적용 내용

- 메뉴·하단 탐색·게스트 화면·사용 가이드의 학원비 명칭을 가계부로 변경.
- 수입·지출, 거래 분류, 결제 수단, 거래일, 처리 담당자와 예정·완료 상태 등록.
- 기존 학원비는 교육·학원 분류의 지출로 표시. 기존 금액·반복·월별 처리 기록 유지.
- 월별 수입·지출·수지 차액 및 예정 금액·완료 기준 차액, 지출 분류별 합계.
- 달력/내역, 구성원·수입/지출·분류·상태·검색 필터, 선택 결과 CSV 저장.
- CSV는 UTF-8 BOM과 셀 따옴표 처리를 적용하고 수식 실행을 유도하는 문자열을 중화.
- 대화방 만들기 창의 구성원 선택 설명과 참여 인원/메시지·알림 설명 문단 삭제.
- 관리자 회원 목록·회원 상세·CSV와 그룹 연결 응답의 예전 자동 이름을 그룹 명칭으로 통일: 가족 미연결 → 그룹 미연결, 박정훈의 가족 → 박정훈의 그룹.
- 서비스 소개의 기본 문구와 계정 확인 안내도 그룹 명칭으로 통일.

## 호환성 및 권한

- 기존 `/tuition` 주소와 FEE API, 저장 테이블 유지. 선택 필드가 JSON 자료에 추가되어 별도 DB 마이그레이션 불필요.
- 이전 클라이언트가 가계부 항목을 수정해도 기존 수입·지출/분류/결제 수단을 보존.
- 그룹 공유 범위·작성자만 수정/삭제·작성자 또는 지정 담당자만 상태 변경 규칙 유지. 어린이는 가계부 조회 및 작성 불가.
- 매월 반복 거래의 예정/완료 상태는 월별로 관리. 내용 수정/삭제는 반복 전체에 적용.
- 요약은 필터에 맞는 등록 금액 기준. 은행 잔액이나 실제 결제·송금 기능이 아님.
- 비로그인 샘플의 쓰기/내려받기 동작은 로그인 창으로 연결.
- 기존 자동 그룹명은 응답에서 표시를 보정하므로 DB 마이그레이션 없이 적용됩니다. 사용자 지정 이름·대화 내용·저장된 법률 문서·버전 이력은 수정하지 않습니다.

## 검증

- 로컬 단위·API 테스트 268개 통과, TypeScript 검사와 프로덕션 빌드 통과.
- 가계부·대화·로그인·터치 브라우저 검사: GitHub Actions `42728242350`, 기능 소스 `f484ac3`, 24개 통과.
- 관리자 그룹 명칭 변경 후 API 검사와 브라우저 검증은 아래 완료 결과에 기록합니다.
- 기존 사용성 브라우저 검사 4건(continuous-workspace 1건, jade-paging 3건)은 UI131 `b8ea852` 및 UI132 `f484ac3`에서 동일 실패. 월 넘기기 중간 상태·스와이프의 기존 실패이며 이번 가계부 저장/조회 검사는 통과.
- 이 실행 환경의 직접 Chromium 실행은 소켓 권한 제한으로 차단되어 브라우저 판정에는 GitHub Actions 결과를 사용했습니다.

## 파일 목록

추가 7개 · 수정 55개 · 삭제 0개. ZIP에는 추가·수정 파일만 원래 경로로 포함합니다.

| 구분 | 경로 | 주요 변경 |
|---|---|---|
| 추가 | `.github/workflows/ledger.yml` | 단위·빌드·가계부/대화/터치/관리자 브라우저 검증 |
| 수정 | `server/workspace/routes.ts` | 가계부 메시지와 이전 클라이언트 수정 시 거래 메타데이터 보존 |
| 수정 | `shared/guest-samples.ts` | 급여·생활용품 예시 추가 |
| 추가 | `shared/ledger.ts` | 거래 분류·필터·월별 집계·CSV 변환 |
| 수정 | `shared/public-content.ts` | 공개 안내·콘텐츠 가계부 명칭 및 사용법 반영 |
| 수정 | `shared/workspace.ts` | 선택적 가계부 필드 및 입력 검증 |
| 수정 | `tests/e2e/auth-flow.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/calendar-holidays-layout.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/chat-rooms.spec.ts` | 대화방 안내문 삭제 및 기존 대화 동작 검증 |
| 수정 | `tests/e2e/child-account-onboarding.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/compact-actions.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/continuous-workspace.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/conversation-stickers.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/daily-calendar.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/direct-workspace.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/entry-input.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/family.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/guest-entry.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/jade-paging.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 추가 | `tests/e2e/ledger.spec.ts` | 가계부 저장/새로고침/상태/CSV/320~1440 화면 검증 |
| 수정 | `tests/e2e/marketing.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/member-filters.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/public-stories.spec.ts` | 공개 글의 처리 담당자 목차 갱신 |
| 수정 | `tests/e2e/month-gestures.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/tuition-touch.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/usability.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 수정 | `tests/e2e/workspace-reading-calendar.spec.ts` | 가계부 명칭 및 변경된 입력/화면에 맞춘 검증 갱신 |
| 추가 | `tests/ledger.test.ts` | 기존 자료·집계·필터·검증·CSV 테스트 |
| 수정 | `tests/workspace.test.ts` | 저장·월별 상태·이전 수정·권한 API 테스트 |
| 수정 | `web/public/manifest.webmanifest` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/components/AuthLayout.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/components/ChatRooms.tsx` | 요청된 두 안내 문단 삭제 |
| 수정 | `web/src/components/GuestWorkspace.tsx` | 샘플 가계부 및 명칭 반영 |
| 수정 | `web/src/components/PersonalEditor.tsx` | 수입/지출·분류·결제 수단·처리 상태 입력 |
| 수정 | `web/src/components/PersonalFees.tsx` | 월별 집계·검색/필터·달력/내역·상태 변경·CSV 저장 |
| 수정 | `web/src/components/PublicStories.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/components/PublicUserGuide.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/components/ScheduleTemplateDialog.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/components/TuitionDaySheet.tsx` | 날짜별 수입/지출 및 분류 표시 |
| 수정 | `web/src/components/WorkspaceNavigation.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/components/WorkspaceTabs.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/components/workspaceGuides.ts` | 가계부 기능 사용법 개정 |
| 추가 | `web/src/ledger.css` | 가계부 요약·필터·내역의 반응형 스타일 |
| 수정 | `web/src/main.tsx` | 가계부 스타일 로드 |
| 수정 | `web/src/pages/AdminConsole.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/pages/Daily.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/pages/Family.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/pages/Guardian.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/pages/Home.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/pages/Marketing.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/pages/NotificationSettings.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/pages/PersonalWorkspace.tsx` | 저장·상태 변경 후 자료 갱신 연결 |
| 수정 | `web/src/pages/Upcoming.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/testing/TestWorkspace.tsx` | 가계부 메뉴·안내 명칭 통일 |
| 수정 | `web/src/testing/store.ts` | 가계부 메뉴·안내 명칭 통일 |
| 추가 | `docs/UI132-household-ledger.md` | 적용·검증·추가/수정/삭제 목록 |

| 수정 | `server/app.ts` | 계정 확인 오류 안내의 그룹 명칭 통일 |

| 수정 | `server/family/service.ts` | DB 응답에 그룹 표시 이름 보정 적용 |

| 추가 | `server/family/group-labels.ts` | 기존 자동 그룹명·미연결 표시와 회원 상세/목록/CSV에 전달되는 그룹명 보정 |

| 수정 | `shared/legal.ts` | 서비스 소개 기본 문구를 그룹·가계부로 통일; 기존 법률 문서 초안 식별값 유지 |

| 수정 | `tests/system-admin.test.ts` | 실제 예전 저장 이름을 목록·상세에서 그룹으로 반환하는지 확인 |

| 수정 | `tests/e2e/system-admin.spec.ts` | 관리자 그룹명 표시와 기존 관리자 기능 브라우저 확인 |

삭제 파일: 없음.
