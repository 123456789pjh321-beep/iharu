import {test,expect} from '@playwright/test';
import {addDays,koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});

test('calendar daily view identifies each family member and shares timed CRUD with the timetable',async({page,request,playwright})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:390,height:844});
 const email='calendar-day@example.test',password='calendar-day-fixture-2026';
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'일간 부모',password,callbackURL:'/login?verified=1'}});
 const mails=await(await request.get('/__test__/mail')).json();
 await page.goto(mails.find((m:{to:string})=>m.to===email).url);
 await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill(password);
 await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('heading',{name:'오늘의 일정',exact:true})).toBeVisible();
 await page.goto('/family');await page.getByRole('checkbox',{name:/부모·보호자이며/}).check();await page.getByRole('button',{name:'부모 승인번호 발급'}).click();
 const code=await page.locator('.personal-invite-code strong').innerText();
 const childRequest=await playwright.request.newContext({baseURL:origin});
 try {
  const signup=await childRequest.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'calendar_day_child',name:'가상 서하',password:'calendar-child-2026',code}});expect(signup.ok()).toBe(true);
  const api=async(op:string,data:object={})=>{const res=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(res.ok(),await res.text()).toBe(true);return res.json();};
  const me=await api('me'),childId=me.family.members.find((m:{name:string})=>m.name==='가상 서하').id,today=koreaToday();
  for(const [title,assigneeId,startTime,endTime] of [['자녀 수업',childId,'09:00','10:00'],['부모 회의',me.id,'10:00','11:00']])await api('items.create',{kind:'EVENT',data:{title,date:today,assigneeId,startTime,endTime}});
  await api('items.create',{kind:'EVENT',data:{title:'가족 기념일',date:today,allMembers:true,allDay:true}});
  await page.goto('/today/calendar');await page.getByLabel('달력 보기',{exact:true}).selectOption('day');
  const daily=page.getByRole('region',{name:'일간 일정',exact:true});
  await expect(daily).toBeVisible();await expect(page.getByLabel('달력 날짜 선택')).toHaveValue(today);
  await expect(daily.locator('.timetable-title')).toHaveText(['가족 기념일','자녀 수업','부모 회의']);
  await expect(daily.locator('.timetable-person')).toHaveText(['전체','가상 서하','일간 부모']);
  await expect(page.locator('.timetable-toolbar,.timetable-filters,.calendar-weekdays')).toHaveCount(0);
  await page.getByLabel('구성원 일정 필터').selectOption(childId);await expect(daily.locator('.timetable-title')).toHaveText(['가족 기념일','자녀 수업']);
  await page.getByLabel('이 날의 일정 검색').fill('자녀');await expect(daily.locator('.timetable-title')).toHaveText(['자녀 수업']);
  await page.getByLabel('이 날의 일정 검색').fill('');await page.getByLabel('구성원 일정 필터').selectOption('all');
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(daily.locator('.timetable-person').filter({hasText:'가상 서하'})).toBeVisible();await page.screenshot({path:`test-results/ui82-calendar-daily-${width}.png`});}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.screenshot({path:'test-results/ui82-calendar-daily-dark.png'});await page.getByRole('button',{name:'밝게',exact:true}).click();
  await page.getByRole('button',{name:today+' 15:30 일정 등록',exact:true}).click();await expect(page.getByLabel('시작 시간',{exact:true})).toHaveValue('15:30');await page.getByLabel('제목',{exact:true}).fill('가족 산책');await page.getByLabel('가족 구성원',{exact:true}).selectOption('ALL');await page.getByRole('button',{name:'저장',exact:true}).click();
  await expect(daily.locator('.timetable-card').filter({hasText:'가족 산책'}).locator('.timetable-person')).toHaveText('전체');
  await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'시간표',exact:true}).click();await expect(page.locator('.timetable-card').filter({hasText:'가족 산책'})).toContainText('15:30');
  await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'달력',exact:true}).click();await page.getByLabel('달력 보기',{exact:true}).selectOption('day');
  await daily.locator('.timetable-card').filter({hasText:'가족 산책'}).click();await page.getByLabel('가족 구성원',{exact:true}).selectOption(childId);await page.getByLabel('제목',{exact:true}).fill('서하 산책');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(daily.locator('.timetable-card').filter({hasText:'서하 산책'}).locator('.timetable-person')).toHaveText('가상 서하');
  await page.getByLabel('달력 날짜 선택').fill('2026-11-30');await page.getByRole('button',{name:'다음 기간'}).click();await expect(page.getByLabel('달력 날짜 선택')).toHaveValue('2026-12-01');await page.getByRole('button',{name:'이전 기간'}).click();await expect(page.getByLabel('달력 날짜 선택')).toHaveValue('2026-11-30');
  await page.getByRole('button',{name:'오늘',exact:true}).click();await expect(page.getByLabel('달력 날짜 선택')).toHaveValue(today);
  await page.getByRole('button',{name:'다음 기간'}).click();await expect(page.getByLabel('달력 날짜 선택')).toHaveValue(addDays(today,1));await page.getByRole('button',{name:'오늘',exact:true}).click();
  await daily.locator('.timetable-card').filter({hasText:'서하 산책'}).click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(daily.locator('.timetable-title')).toHaveCount(3);
  await daily.getByRole('button',{name:'일정 등록',exact:true}).click();await page.getByLabel('반복',{exact:true}).selectOption('REPEAT');await expect(page.getByLabel('반복 종료일',{exact:true})).toHaveValue(today.slice(0,4)+'-12-31');await page.getByLabel('반복 시작일',{exact:true}).fill('2027-02-01');await expect(page.getByLabel('반복 종료일',{exact:true})).toHaveValue('2027-12-31');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'편집 닫기'}).click();
  await page.getByLabel('달력 보기',{exact:true}).selectOption('week');await expect(page.locator('.calendar-grid.week-view')).toBeVisible();await page.getByLabel('달력 보기',{exact:true}).selectOption('month');await expect(page.getByLabel('달력 월 선택')).toHaveValue(today.slice(0,7));
  await page.goto('/tuition');await page.getByLabel('조회 월',{exact:true}).fill('2026-12');await page.getByRole('button',{name:'다음 달 학원비',exact:true}).click();await expect(page.getByLabel('조회 월',{exact:true})).toHaveValue('2027-01');await page.getByRole('button',{name:'이전 달 학원비',exact:true}).click();await expect(page.getByLabel('조회 월',{exact:true})).toHaveValue('2026-12');await page.getByLabel('조회 월',{exact:true}).fill(today.slice(0,7));await page.getByRole('button',{name:'학원비 추가'}).click();await expect(page.getByLabel('반복 종료일 (선택)',{exact:true})).toHaveValue(today.slice(0,4)+'-12-31');await page.getByLabel('첫 납부일',{exact:true}).fill('2027-01-10');await expect(page.getByLabel('반복 종료일 (선택)',{exact:true})).toHaveValue('2027-12-31');await page.getByLabel('반복 종료일 (선택)',{exact:true}).fill('2027-10-31');await page.getByLabel('첫 납부일',{exact:true}).fill('2027-02-10');await expect(page.getByLabel('반복 종료일 (선택)',{exact:true})).toHaveValue('2027-10-31');await page.getByLabel('학원·비용 이름').fill('연말 기본값 학원');await page.getByLabel('금액',{exact:true}).fill('100000');await page.getByRole('button',{name:'저장',exact:true}).click();await page.getByLabel('조회 월',{exact:true}).fill('2027-02');await page.getByRole('button',{name:'연말 기본값 학원 수정',exact:true}).click();await expect(page.getByLabel('반복 종료일 (선택)',{exact:true})).toHaveValue('2027-10-31');
  await page.getByRole('button',{name:'편집 닫기'}).click();
  for(let i=1;i<=4;i++)await api('items.create',{kind:'FEE',data:{title:'합계 검증 학원 '+i,date:today,assigneeId:me.id,feePayerId:me.id,feeFrequency:'ONCE',amount:10000*i}});
  await page.goto('/today');const homeFees=page.locator('[data-home-section="fees"]');await expect(homeFees.locator('summary')).toContainText('100,000원');await expect(homeFees.locator('.personal-tuition-item').first()).toBeHidden();await homeFees.locator('summary').click();await expect(homeFees.locator('.personal-tuition-item')).toHaveCount(4);await expect(homeFees.getByRole('button',{name:'합계 검증 학원 4 수정',exact:true})).toBeVisible();await expect(homeFees).not.toContainText('미납');await homeFees.locator('summary').click();await expect(homeFees.locator('.personal-tuition-item').first()).toBeHidden();
 } finally {await childRequest.dispose();}
});
