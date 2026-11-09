# UI113 · 시간표 다중 선택과 계정별 저장

시간표 구성원 버튼을 각각 눌러 여러 사람을 선택·해제한다. 선택한 모든 사람의 일정을 함께 보여 주며, 전체 구성원 대상 일정은 중복 없이 한 번 표시한다. 같은 시간의 서로 다른 일정은 나란히 배치한다. 최소 한 명은 선택해야 한다.

**첫 화면으로 저장**을 누르면 현재 조합이 로그인한 계정에 저장되어 메뉴 재진입, 재로그인, 다른 기기에서도 적용된다. 저장하지 않은 임시 조회는 기본값을 바꾸지 않는다. 순서만 다른 동일한 조합은 같은 설정으로 취급한다. 저장 중 중복 요청·선택 변경을 막고 실패 시 기존 설정을 유지한다.

기존 한 사람 설정을 배열로 이관한다. 보호자와 자녀는 각자의 설정만 변경할 수 있다. 저장 대상은 본인과 현재 연결된 가족만 허용하며, 잘못된 구성원이 하나라도 있으면 요청 전체를 거절한다. 연결 해제·삭제된 사람만 제외하고 남은 선택은 유지한다. 아무도 남지 않으면 본인으로 돌아온다. 이전에 열어 둔 화면의 단일 선택 API도 호환한다.

## 파일 변경

추가:
- `supabase/migrations/20261109070100_timetable_multiple_members.sql`, 동일한 `db/migrations` 파일: 개인 설정 배열, 기존 선택 이관, 검증된 저장·조회.
- `docs/UI113-timetable-multiple-members.md`: 동작과 검증 범위.

수정:
- `server/workspace/routes.ts`, `shared/workspace.ts`: 다중 선택 입력·응답, 기존 API 호환.
- `shared/workspace-schedules.ts`: 선택한 구성원들의 일정을 중복 없이 조회.
- `web/src/components/MemberFilter.tsx`: 여러 버튼의 선택 상태 표시.
- `web/src/components/PersonalTimetable.tsx`: 선택·해제, 최소 선택 안내, 조합 저장.
- `web/src/pages/PersonalWorkspace.tsx`: 로그인 계정별 설정 연결과 오래된 응답 처리.
- `web/src/compact-workspace.css`: 다중 선택 안내와 긴 이름 줄바꿈.
- `tests/workspace.test.ts`, `tests/workspace-schedules.test.ts`, `tests/integration/postgres.ts`, `tests/e2e/timetable-preference.spec.ts`: 저장·권한·필터·실제 PostgreSQL·브라우저 검증.

삭제: 없음. 기존 일정 데이터 변경 없음.

## 검증 범위

기존 단일 선택 호환, 보호자·자녀 다중 선택 저장, 임시 조회와 저장 구분, 공통 일정 중복 방지·겹치는 일정, 계정 전환·다른 기기, 저장 실패, 최소 한 명 유지, 연결 해제 후 남은 선택 유지, 권한 없는 구성원·위조 입력 거절, 모바일·태블릿·PC·어두운 화면. 기존 달력·학원비 필터 동작 유지.
