# UI110 · 날짜·시간 등록 편의성

## 사용자 변화

- 시간표: 요일 버튼과 평일·주말·매일 바로 선택. 시작/종료의 오전·오후·시·분을 분리하고 24시간 값을 함께 표시. 30분/1시간/1시간 30분/2시간/3시간 소요 시간 선택, 시작 변경 시 유효한 소요 시간 유지. 종일을 켰다가 꺼도 편집 중 시간 유지.
- 달력: 한 번 일정은 날짜 선택, 반복 일정은 시작 날짜와 반복 종료일을 함께 표시. PC 두 달/모바일 한 달 달력에서 시작→종료→선택 완료. 선택 전 취소 가능. 오늘·내일·이번 토요일, +1/3/6개월·올해 말·종료일 없음.
- 학원비: 동일한 기간 선택, 월별/한 번 납부 버튼, 천 단위 금액 표시. 새 월별 납부는 종료일 없이 시작하며 기존 종료일·금액·결제자는 유지.
- 공통: 구성원 버튼 선택, 선택 내용 요약, 고정 저장 버튼, 필드별 오류, 모바일·어두운 화면 대응. 달력에서 선택 완료하기 전에는 저장을 잠가 미확정 선택의 오저장을 방지.

## 설계 근거와 범위

STAYCATION 예약 달력의 시작→종료→확정 흐름과 Airbnb의 날짜/기간 빠른 선택 개념을 가족 일정 등록에 맞췄다. 브랜드·문구·이미지를 복제하지 않았다.

- https://www.staycation.jp/en/post-15141/
- https://www.airbnb.co.kr/help/article/252

범위는 기존 등록 기능의 입력 개선이다. 달력의 종료일은 **반복 종료일**이고, 여러 날에 걸친 단일 이벤트를 새로 도입한 것은 아니다. 시간표는 날짜 제한 없는 주간 반복을 유지한다. 기존 API/DB 계약과 푸시 발송 기준은 그대로 사용하며 DB 마이그레이션은 없다.

## 파일

추가: `shared/entry-input.ts`, `web/src/components/EntryDatePicker.tsx`, `EntryTimeRange.tsx`, `PersonalEditor.tsx`, `web/src/entry-input.css`, `tests/entry-input.test.ts`, `tests/e2e/entry-input.spec.ts`, `.github/workflows/entry-input.yml`, 본 문서.

수정: `web/src/pages/PersonalWorkspace.tsx` (편집기 분리), `web/src/components/ScheduleMemberPicker.tsx` (비일정 항목의 전체 선택 제외).

삭제: 없음.

## 검증

월말·윤년·연도 변경·자정 경계 단위 검사. 실제 테스트 DB의 시간표/달력/학원비 등록→조회→수정, 기간 취소, 키보드 이동, 모바일·태블릿·PC 및 어두운 화면 브라우저 검사.
