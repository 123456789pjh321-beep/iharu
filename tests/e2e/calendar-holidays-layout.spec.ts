import {selectCalendarView,setCalendarTheme,waitForAppReady} from '../helpers/workspace-ui';
import {test,expect,type Page} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});

function calendarDesign(page:Page){
 return page.locator('[data-pager-current] .calendar-month-content').evaluate(calendar=>{
  const weekdays=calendar.querySelector('.calendar-weekdays')!;
  const header=getComputedStyle(weekdays);
  const firstWeek=calendar.querySelector('.calendar-week-row')!;
  const rule=getComputedStyle(firstWeek,'::after');
  const bounds=calendar.getBoundingClientRect();
  return {
   frame:[bounds.x,bounds.width],
   header:[weekdays.textContent,header.height,header.fontSize,header.borderBottomColor],
   weeks:[...calendar.querySelectorAll('.calendar-week-row')].map(week=>week.getAttribute('data-week-start')),
   columns:getComputedStyle(firstWeek).gridTemplateColumns,
   rule:[rule.height,rule.backgroundColor],
   dates:[...calendar.querySelectorAll('.calendar-cell')].map(cell=>{
    const label=cell.querySelector('.calendar-day-target>span')!;
    const date=getComputedStyle(label);
    const lunar=cell.querySelector('.calendar-lunar')!;
    const badge=cell.querySelector('.calendar-day-badge');
    return [cell.className,cell.getAttribute('data-date'),label.textContent,date.color,date.fontWeight,
     date.backgroundColor,date.borderRadius,lunar.textContent,badge?.textContent,
     badge&&getComputedStyle(badge).backgroundColor,getComputedStyle(cell).backgroundColor];
   }),
  };
 });
}

test('holidays, day agenda and full-screen editors use a bottom navigation at every size',async({page,request})=>{
 test.setTimeout(120000);
 const email='holiday-layout@example.test',password='holiday-layout-fixture-2026';
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'달력 일반사용자',password,callbackURL:'/login?verified=1'}});
 const mails=await(await request.get('/__test__/mail')).json();await request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 for(let i=0;i<5;i++)expect((await page.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'EVENT',data:{title:'연휴 일정 '+(i+1),date:'2027-02-09',allDay:true}}})).ok()).toBe(true);
 await page.clock.setFixedTime(new Date('2027-02-16T12:00:00+09:00'));
 for(const [width,height] of [[320,740],[820,1180],[1440,900],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('/today/calendar');
  const calendarMonth=page.getByLabel('달력 월 선택');
  await calendarMonth.fill('2027-01');
  await calendarMonth.fill('2027-02');
  const nav=page.locator('.workspace-mobile-nav');await expect(nav).toBeVisible();await expect(nav.locator(':scope > a,:scope > button')).toHaveText(['시간표','달력','가계부','타임라인','그룹관리','설정','더보기']);
  const n=(await nav.boundingBox())!,main=(await page.locator('#auth-main').boundingBox())!;
  expect(n.x).toBe(0);expect(n.width).toBe(width);expect(n.y+n.height).toBeCloseTo(height,0);expect(main.width).toBe(width);expect(main.y+main.height).toBeLessThanOrEqual(n.y+1);await expect(page.locator('.workspace-rail')).toHaveCount(0);
  const cell=page.locator('[data-date="2027-02-09"]');await expect(cell.locator('.calendar-holiday')).toHaveText('대체공휴일(설날)');await expect(cell.locator('.calendar-overflow')).toHaveText('+2개');
  await waitForAppReady(page);
  const design=await calendarDesign(page);
  await page.screenshot({path:`test-results/ui96-calendar-${width}.png`,animations:'disabled'});
  await cell.locator('.calendar-overflow').click();const agenda=page.getByRole('dialog',{name:'2월 9일 화요일',exact:true});await expect(agenda.locator('.day-sheet-event')).toHaveCount(5);await expect(agenda.locator('.holiday-label')).toHaveText('대체공휴일(설날)');
  await page.screenshot({path:`test-results/ui96-agenda-${width}.png`,animations:'disabled'});
  await agenda.getByRole('button',{name:'이 날짜에 일정 추가'}).click();const editor=page.locator('.personal-editor');await expect(page.getByLabel('시작일',{exact:true})).toHaveValue('2027-02-09');
  await expect.poll(()=>editor.evaluate(element=>{const box=element.getBoundingClientRect();return Math.max(Math.abs(box.left),Math.abs(box.top),Math.abs(box.right-innerWidth),Math.abs(box.bottom-innerHeight));})).toBeLessThan(0.5);
  await page.getByLabel('제목',{exact:true}).fill('날짜에서 등록');await page.getByRole('textbox',{name:'메모 선택',exact:true}).fill('입력 중인 내용은 화면을 바꾸어도 유지되어야 해요');
  await editor.locator('.entry-editor-body').evaluate(el=>el.scrollTop=el.scrollHeight);await expect(editor.getByRole('button',{name:'저장',exact:true})).toBeInViewport();expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await editor.locator('.entry-editor-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`test-results/ui96-editor-${width}.png`,animations:'disabled'});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'편집 닫기'}).click();await expect(editor).toHaveCount(0);
  await nav.getByRole('link',{name:'가계부',exact:true}).click();
  const ledgerMonth=page.getByLabel('조회 월',{exact:true});
  await ledgerMonth.fill('2027-01');
  await ledgerMonth.fill('2027-02');
  const current=page.locator('[data-pager-current]');
  await expect(current.locator('.calendar-holiday').filter({hasText:'대체공휴일(설날)'})).toBeVisible();
  await expect(current.locator('.calendar-day-target[aria-current=date]')).toHaveText('16');
  await expect.poll(()=>calendarDesign(page)).toEqual(design);
  await page.screenshot({path:`test-results/ui96-ledger-${width}.png`,animations:'disabled'});
  if(width===320){
   await current.locator('.outside[data-date="2027-03-01"] .calendar-day-target').click();
   await expect(ledgerMonth).toHaveValue('2027-03');
   const ledgerDay=page.locator('.tuition-day-sheet');
   await expect(ledgerDay.locator('header')).toContainText('3월 1일');
   await ledgerDay.getByRole('button',{name:'날짜 가계부 닫기'}).click();
  }
  await ledgerMonth.fill('2027-03');await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await page.getByRole('region',{name:'가계부 내역',exact:true}).getByRole('button',{name:'추가',exact:true}).click();await expect(page.getByLabel('날짜',{exact:true})).toHaveValue('2027-03-01');await expect(page.getByRole('button',{name:'저장',exact:true})).toBeInViewport();await page.screenshot({path:`test-results/ui96-fee-editor-${width}.png`,animations:'disabled'});await page.getByRole('button',{name:'편집 닫기'}).click();
 }
 await page.setViewportSize({width:820,height:1180});await page.goto('/today/calendar');await page.getByLabel('달력 월 선택').fill('2026-10');await expect(page.locator('[data-date="2026-10-05"] .calendar-holiday')).toHaveText('대체공휴일(개천절)');
 await setCalendarTheme(page,'어둡게');await page.getByLabel('달력 월 선택').fill('2026-10');await page.screenshot({path:'test-results/ui96-calendar-dark.png',animations:'disabled'});
 await selectCalendarView(page,'일간');await page.getByLabel('달력 날짜 선택').fill('2026-10-05');await expect(page.locator('.timetable-holiday')).toHaveText('대체공휴일(개천절)');
 await page.clock.setFixedTime(new Date('2027-05-13T12:00:00+09:00'));await page.goto('/timetable');await expect(page.locator('.timetable-holiday')).toHaveText('부처님오신날');
});
