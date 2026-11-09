# UI112 · 계정별 시간표 첫 화면

시간표의 ‘전체 보기’ 필터를 제거하고, 구성원 버튼으로 한 사람을 조회한다. 저장하지 않은 계정의 첫 화면은 본인이다. 다른 구성원을 누른 뒤 **첫 화면으로 저장**을 누르면 이후 로그인·메뉴 재진입·다른 기기에서 그 사람의 시간표로 시작한다. 버튼으로 잠깐 조회한 선택은 저장하지 않으면 기본값을 바꾸지 않는다.

설정은 로그인한 보호자/자녀의 개인 프로필에 저장하며, 가족이나 다른 계정의 설정을 바꾸지 않는다. 저장 대상은 본인 또는 현재 연결된 가족만 허용한다. 연결이 해제되거나 대상이 삭제되면 본인으로 돌아온다. 전체 구성원 대상 일정은 선택한 사람의 시간표에도 표시한다. 달력·학원비 등의 ‘전체 보기’ 필터는 유지한다.

## 변경 파일

추가: `db/migrations/20261109063457_timetable_member_preference.sql`, 동일한 `supabase/migrations` 파일, `tests/e2e/timetable-preference.spec.ts`, 본 문서.

수정:
- `shared/workspace.ts`: 계정 응답의 기본 구성원.
- `server/workspace/routes.ts`: 본인 설정 저장 API와 엄격한 입력 검증.
- `web/src/components/MemberFilter.tsx`: 전체 버튼 표시 여부·저장 중 선택 잠금.
- `web/src/components/PersonalTimetable.tsx`: 첫 화면 선택, 저장 상태·오류 안내.
- `web/src/pages/PersonalWorkspace.tsx`: 계정별 설정 연결과 이전 요청 응답 차단.
- `web/src/compact-workspace.css`: 모바일·어두운 화면을 포함한 설정 표시.
- `tests/workspace.test.ts`, `tests/integration/postgres.ts`: 세션·계정·가족 권한·저장 검증.
- `.github/workflows/entry-input.yml`: 새 화면 검사를 기존 등록 검증에 포함.

삭제: 없음. 기존 일정 데이터 변경 없음. 프로필 컬럼을 추가하고 기존 RLS·인증·권한 검사를 유지한다.

## 검증 범위

보호자·자녀 기본값, 저장/임시 조회 구분, 새 기기·새 로그인 유지, 계정 전환 격리, 저장 실패, 가족 연결 해제, 외부 구성원/타 계정 위조 차단, 기존 달력 필터, 모바일·태블릿·PC 및 어두운 화면.
