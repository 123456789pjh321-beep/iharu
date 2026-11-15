import {selectCalendarView,setCalendarTheme} from '../helpers/workspace-ui';
import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
test('calendar merges adjacent identical schedules while dates, overflow and original editors remain available',async({page,request})=>{
 test.setTimeout(90000);
 const email='merged-calendar@example.test',password='merged-calendar-fixture-2026';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'달력 병합 일반사용자',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 const api=async(op:string,data:object)=>{const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
 for(const date of ['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06'])await api('items.create',{kind:'EVENT',data:{title:'그룹 여행',date,startTime:'09:00',endTime:'13:50',place:'여행지',color:0}});
 for(const date of ['2026-11-02','2026-11-03'])await api('items.create',{kind:'EVENT',data:{title:'프로젝트 작업',date,startTime:'14:00',endTime:'15:00',color:1}});
 for(let i=0;i<2;i++)await api('items.create',{kind:'EVENT',data:{title:'중복된 준비 일정',date:'2026-11-04',startTime:'16:00',endTime:'17:00',color:2}});
 for(let i=0;i<4;i++)await api('items.create',{kind:'EVENT',data:{title:'개별 일정 '+i,date:'2026-11-02',startTime:`${16+i}:00`,endTime:`${17+i}:00`}});
 for(const data of [
  {title:'종일 캠프',date:'2026-11-18',endDate:'2026-11-20',allDay:true},
  {title:'밤샘 일정',date:'2026-11-16',endDate:'2026-11-17',startTime:'23:00',endTime:'01:00',calendarFrequency:'DAILY',untilDate:'2026-11-17'},
  {title:'수업 시간',date:'2026-11-19',startTime:'09:30',endTime:'11:30',color:1},
 ])await api('items.create',{kind:'EVENT',data});
 const before=await api('items.list',{from:'2026-11-01',to:'2026-11-30'});
 for(const width of [320,820,1440]){
  await page.setViewportSize({width,height:1000});await page.goto('/today/calendar');await page.getByLabel('달력 월 선택').fill('2026-11');
  const week=page.locator('[data-week-start="2026-11-01"]'),school=week.locator('.calendar-event').filter({hasText:'그룹 여행'});
  await expect(school).toHaveCount(1);await expect(school).toHaveAttribute('data-span','5');
  const bar=(await school.boundingBox())!,first=(await week.locator('[data-date="2026-11-02"]').boundingBox())!,last=(await week.locator('[data-date="2026-11-06"]').boundingBox())!;
  expect(Math.abs(bar.x-first.x)).toBeLessThan(4);expect(Math.abs(bar.x+bar.width-last.x-last.width)).toBeLessThan(4);
  await page.screenshot({path:`test-results/ui98-calendar-merged-${width}.png`,animations:'disabled'});
  const project=week.locator('.calendar-event').filter({hasText:'프로젝트 작업'});await expect(project).toHaveAttribute('data-span','2');
  const p=(await project.boundingBox())!;await project.click({position:{x:p.width*.75,y:p.height/2}});await expect(page.getByLabel('시작일',{exact:true})).toHaveValue('2026-11-03');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await week.locator('.calendar-event').filter({hasText:'중복된 준비 일정'}).click();await expect(page.locator('.calendar-day-sheet .day-sheet-event')).toHaveCount(3);await page.getByRole('button',{name:'날짜 일정 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await week.locator('[data-date="2026-11-02"] .calendar-overflow').click();await expect(page.locator('.calendar-day-sheet .day-sheet-event')).toHaveCount(6);await page.getByRole('button',{name:'날짜 일정 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await week.locator('[data-date="2026-11-03"] .calendar-day-target>span').click();await page.getByRole('button',{name:'이 날짜에 일정 추가'}).click();await expect(page.getByLabel('시작일',{exact:true})).toHaveValue('2026-11-03');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await selectCalendarView(page,'주간');
  const timedTravel=page.locator('[data-pager-current] .timetable-joined').filter({hasText:'그룹 여행'});
  await expect(timedTravel).toHaveCount(1);await expect(timedTravel).toHaveAttribute('data-span','5');
  await expect(timedTravel.locator('.timetable-range')).toHaveText('09:00 – 13:50');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const after=await api('items.list',{from:'2026-11-01',to:'2026-11-30'});expect(after.items).toEqual(before.items);
 await setCalendarTheme(page,'어둡게');await page.getByLabel('달력 월 선택').fill('2026-11');await page.screenshot({path:'test-results/ui98-calendar-merged-dark.png',animations:'disabled'});
 await page.clock.setFixedTime(new Date('2026-11-19T10:45:00+09:00'));
 await setCalendarTheme(page,'밝게');await selectCalendarView(page,'일간');await page.getByLabel('달력 날짜 선택').fill('2026-11-19');
 await selectCalendarView(page,'주간');
 const weekly=page.getByRole('region',{name:'주간 일정',exact:true});
 const hourGrid=weekly.locator('.timetable-grid'),pane=weekly.locator('.timetable-scroll');
 await expect(hourGrid).toHaveAttribute('data-start-minute','0');
 await expect(hourGrid).toHaveAttribute('data-end-minute','1440');
 await expect(weekly.locator('.timetable-time-axis>span')).toHaveCount(25);
 await expect(weekly.locator('.calendar-week-header .calendar-event').filter({hasText:'종일 캠프'})).toHaveAttribute('data-span','3');
 const overnight=weekly.locator('.timetable-joined').filter({hasText:'밤샘 일정'});
 await expect(overnight).toHaveCount(2);
 for(const interval of [
  {start:'0',end:'60',dates:'2026-11-17 2026-11-18'},
  {start:'1380',end:'1440',dates:'2026-11-16 2026-11-17'},
 ]){
  const block=overnight.and(weekly.locator(`[data-start-minute="${interval.start}"]`));
  await expect(block).toHaveAttribute('data-end-minute',interval.end);
  await expect(block).toHaveAttribute('data-dates',interval.dates);
 }
 const classTime=weekly.locator('.timetable-event').filter({hasText:'수업 시간'});
 await expect(classTime).toHaveAttribute('data-start-minute','570');
 await expect(classTime).toHaveAttribute('data-end-minute','690');
 await expect(weekly.locator('.timetable-now')).toHaveAttribute('aria-label','현재 시간 10:45');
 for(const width of [320,495,1280]){
  await page.setViewportSize({width,height:920});
  const alignment=await weekly.evaluate(element=>{
   const headers=[...element.querySelectorAll('.calendar-week-header .calendar-cell')];
   const columns=[...element.querySelectorAll('.timetable-day-column')];
   return columns.map((column,index)=>{
    const body=column.getBoundingClientRect(),head=headers[index].getBoundingClientRect();
    return {date:column.getAttribute('data-date'),head:headers[index].getAttribute('data-date'),x:Math.abs(body.x-head.x),width:Math.abs(body.width-head.width)};
   });
  });
  expect(alignment).toHaveLength(7);
  expect(alignment.every(column=>column.date===column.head&&column.x<.5&&column.width<.5)).toBe(true);
  await expect(weekly.locator('.timetable-now')).toBeInViewport();
  await page.screenshot({path:`test-results/calendar-week-hours-${width}.png`,animations:'disabled'});
 }
 await pane.evaluate(element=>{element.scrollTop=element.scrollHeight;});
 await expect(weekly.locator('.timetable-time-axis>span').last()).toHaveText('밤 12');
 await expect(weekly.locator('.timetable-time-axis>span').last()).toBeInViewport();
 await weekly.locator('.timetable-day-column[data-date="2026-11-17"] [data-time="13:15"]').click();
 await expect(page.getByLabel('시작일',{exact:true})).toHaveValue('2026-11-17');
 await expect(page.locator('input[name=startTime]')).toHaveValue('13:15');
 await page.getByRole('button',{name:'편집 닫기'}).click();
});
