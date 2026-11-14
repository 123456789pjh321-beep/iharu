import {selectAllMembers,selectCalendarView,setCalendarTheme} from '../helpers/workspace-ui';
import {test,expect} from '@playwright/test';
import {addDays,koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});

test('calendar daily view identifies each family member and shares timed CRUD with the timetable',async({page,request,playwright})=>{
 test.setTimeout(120000);
 await page.setViewportSize({width:390,height:844});
 const email='calendar-day@example.test',password='calendar-day-fixture-2026';
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'일간 일반사용자',password,callbackURL:'/login?verified=1'}});
 const mails=await(await request.get('/__test__/mail')).json();
 await request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 const invite=await page.request.post('/api/v1/workspace/invite.issue',{headers:{Origin:origin},data:{consent:true}});
 expect(invite.ok()).toBe(true);
 const {code}=await invite.json();
 const childRequest=await playwright.request.newContext({baseURL:origin});
 try {
  const signup=await childRequest.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'calendar_day_child',name:'가상 서하',password:'calendar-child-2026',code}});expect(signup.ok()).toBe(true);
  const api=async(op:string,data:object={})=>{const res=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(res.ok(),await res.text()).toBe(true);return res.json();};
  const me=await api('me'),childId=me.family.members.find((m:{name:string})=>m.name==='가상 서하').id,today=koreaToday();
  for(const [title,assigneeId,startTime,endTime] of [['어린이 수업',childId,'09:00','10:00'],['일반사용자 회의',me.id,'10:00','11:00']])await api('items.create',{kind:'EVENT',data:{title,date:today,assigneeId,startTime,endTime}});
  await api('items.create',{kind:'EVENT',data:{title:'그룹 기념일',date:today,allMembers:true,allDay:true}});
  await page.goto('/today/calendar');await selectCalendarView(page,'일간');await selectAllMembers(page);
  const daily=page.getByRole('region',{name:'일간 일정',exact:true});
  await expect(daily).toBeVisible();await expect(page.getByLabel('달력 날짜 선택')).toHaveValue(today);
  await expect(daily.locator('.timetable-title')).toHaveText(['그룹 기념일','어린이 수업','일반사용자 회의']);
  await expect(daily.locator('.timetable-card').nth(0)).toHaveAccessibleName(/전체/);await expect(daily.locator('.timetable-card').nth(1)).toHaveAccessibleName(/가상 서하/);await expect(daily.locator('.timetable-card').nth(2)).toHaveAccessibleName(/일간 일반사용자/);
  await expect(page.locator('.timetable-toolbar,.timetable-filters,.calendar-weekdays')).toHaveCount(0);
  const memberFilter=page.getByRole('group',{name:'달력 구성원 필터'});
  await expect(page.getByRole('textbox',{name:/일정 검색/})).toHaveCount(0);
  await memberFilter.getByRole('button',{name:'일간 일반사용자',exact:true}).click();await expect(daily.locator('.timetable-title')).toHaveText(['그룹 기념일','어린이 수업']);
  await selectAllMembers(page);await memberFilter.getByRole('button',{name:'가상 서하',exact:true}).click();await expect(daily.locator('.timetable-title')).toHaveText(['그룹 기념일','일반사용자 회의']);
  await selectAllMembers(page);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(daily.getByRole('button',{name:/어린이 수업 · 가상 서하/})).toBeVisible();await page.screenshot({path:`test-results/ui82-calendar-daily-${width}.png`});}
  await page.setViewportSize({width:390,height:844});await setCalendarTheme(page,'어둡게');await selectCalendarView(page,'일간');await selectAllMembers(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  // Theme colors transition briefly; verify the settled text contrast before capturing.
  await expect.poll(()=>daily.locator('.timetable-title').first().evaluate(title=>{
   const card=title.closest('.timetable-card')!;
   const ctx=document.createElement('canvas').getContext('2d')!;
   const luminance=(color:string)=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const rgb=ctx.getImageData(0,0,1,1).data;return [0.2126,0.7152,0.0722].reduce((sum,weight,i)=>{const value=rgb[i]/255;return sum+weight*(value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);},0);};
   const foreground=luminance(getComputedStyle(title).color),background=luminance(getComputedStyle(card).backgroundColor);
   return (Math.max(foreground,background)+0.05)/(Math.min(foreground,background)+0.05);
  })).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:'test-results/ui82-calendar-daily-dark.png',animations:'disabled'});await setCalendarTheme(page,'밝게');await selectCalendarView(page,'일간');await selectAllMembers(page);
  await page.getByRole('button',{name:today+' 15:30 일정 등록',exact:true}).click();await expect(page.locator('input[name=startTime]')).toHaveValue('15:30');await page.getByLabel('제목',{exact:true}).fill('그룹 산책');await page.getByRole('radio',{name:'전체',exact:true}).check();await page.getByRole('button',{name:'저장',exact:true}).click();
  await expect(daily.locator('.timetable-card').filter({hasText:'그룹 산책'})).toHaveAccessibleName(/전체/);
  await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'시간표',exact:true}).click();await expect(page.locator('.timetable-card').filter({hasText:'그룹 산책'})).toHaveCount(0);
  await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'달력',exact:true}).click();await selectCalendarView(page,'일간');await selectAllMembers(page);
  await daily.locator('.timetable-card').filter({hasText:'그룹 산책'}).click();await page.locator(`input[name=assigneeId][value="${childId}"]`).check();await page.getByLabel('제목',{exact:true}).fill('서하 산책');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(daily.locator('.timetable-card').filter({hasText:'서하 산책'})).toHaveAccessibleName(/가상 서하/);
  await page.getByLabel('달력 날짜 선택').fill('2026-11-30');await page.getByLabel('달력 날짜 선택').fill('2026-12-01');await expect(page.getByLabel('달력 날짜 선택')).toHaveValue('2026-12-01');await page.getByLabel('달력 날짜 선택').fill('2026-11-30');await expect(page.getByLabel('달력 날짜 선택')).toHaveValue('2026-11-30');
  await page.getByLabel('달력 날짜 선택').fill(today);await expect(page.getByLabel('달력 날짜 선택')).toHaveValue(today);
  await page.getByLabel('달력 날짜 선택').fill(addDays(today,1));await expect(page.getByLabel('달력 날짜 선택')).toHaveValue(addDays(today,1));await page.getByLabel('달력 날짜 선택').fill(today);
  await daily.locator('.timetable-card').filter({hasText:'서하 산책'}).click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(daily.locator('.timetable-title')).toHaveCount(3);
  await expect(page.locator('.direct-calendar .workspace-add-action')).toHaveCount(0);await page.goto('/timetable');await page.locator('.timetable-slot').last().click();await expect(page.getByLabel('반복',{exact:true})).toHaveCount(0);await expect(page.getByLabel('반복 시작일',{exact:true})).toHaveCount(0);await expect(page.getByLabel('반복 종료일',{exact:true})).toHaveCount(0);await expect(page.getByRole('radiogroup',{name:'그룹 구성원'})).toBeVisible();await page.getByRole('button',{name:'편집 닫기'}).click();
  await page.goto('/today/calendar');await selectCalendarView(page,'주간');await expect(page.locator('[data-pager-current] .calendar-grid.week-view')).toBeVisible();await selectCalendarView(page,'월간');await expect(page.getByLabel('달력 월 선택')).toHaveValue(today.slice(0,7));
 } finally {await childRequest.dispose();}
});
