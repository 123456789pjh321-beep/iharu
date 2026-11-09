# UI115 · 인원 필터 전체 통일

운영 화면의 시간표·달력·학원비와 오늘 화면의 일정·학원비 필터를 같은 공통 컴포넌트로 교체했다.

- 이름 버튼을 눌러 여러 명을 선택·해제한다. 최소 한 명을 유지하며 전체 보기 버튼은 표시하지 않는다.
- 선택 조합은 **첫 화면으로 저장**을 눌러 로그인 계정·화면별로 저장한다. 다른 기기와 재로그인에도 적용된다. 저장하지 않은 임시 조회는 기본값을 바꾸지 않는다.
- 기존 시간표의 단일·다중 선택 설정과 API를 유지한다. 기존 계정의 새 화면 필터 초기값에는 저장된 시간표 조합을 이관한다.
- 달력·학원비의 선택과 저장은 서로 독립적이며 동시에 다른 화면의 설정을 저장해도 두 결과를 보존한다.
- 저장 대상은 본인과 현재 연결된 가족만 허용한다. 권한 없는 구성원이 섞이면 요청 전체를 거절한다. 자녀는 학원비 필터를 저장하거나 조회할 수 없다.
- 연결 해제·삭제된 사람만 제외하며 남는 사람이 없으면 본인으로 돌아온다. 저장 중 중복 요청을 막고 실패하면 기존 기본값을 유지한다.

## 추가 파일

- `web/src/components/MemberPreferenceFilter.tsx`: 공통 다중선택·기본값 저장·실패/최소 선택 안내와 선택 상태 훅.
- `db/migrations/20261109072945_member_filter_preferences.sql`, 동일한 `supabase/migrations` 파일: 계정별 화면 설정 저장, 기존 설정 이관, 인증·가족 권한 재검사.
- `tests/e2e/member-filters.spec.ts`: 달력·학원비 다중선택, 화면별 독립 저장, 임시 조회, 다른 기기와 계정 격리.
- `docs/UI115-member-filter-unification.md`: 이번 변경 설명.

## 수정 파일

- `web/src/components/{PersonalTimetable,PersonalCalendar,PersonalFees}.tsx`: 공통 필터로 교체하고 선택한 사람들의 일정·합계를 함께 조회.
- `web/src/pages/PersonalWorkspace.tsx`: 계정·화면별 저장 연결과 오래된 조회 응답 처리.
- `shared/workspace.ts`, `server/workspace/routes.ts`: 화면 범위와 입력/응답 계약.
- `shared/tuition-calendar.ts`, `tests/tuition-calendar.test.ts`: 다중 구성원별 금액 집계.
- `tests/workspace.test.ts`, `tests/integration/postgres.ts`: 화면·계정 격리, 동시 저장 보존, 권한 거절·연결 해제 검사.
- `tests/e2e/timetable-preference.spec.ts`: 공통 저장 경로와 전체 보기 제거 확인.
- `web/src/usability.css`, `web/src/components/WorkspaceTutorial.tsx`, `tests/e2e/usability.spec.ts`: 공통 안내와 짧은 화면 대화 여백 보완.
- `.github/workflows/usability.yml`: 공통 필터 브라우저 검사 추가.
- `.gitignore`: CLI가 생성한 임시 상태 제외.

삭제 파일 없음. 운영 일정·대화·학원비 원본 데이터 변경 없음.
