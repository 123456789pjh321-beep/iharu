import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
test('holidays, day agenda and full-screen editors use a bottom navigation at every size',async({page,request})=>{
 test.setTimeout(120000);
 const email='holiday-layout@example.test',password='holiday-layout-fixture-2026';
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'달력 일반사용자',password,callbackURL:'/login?verified=1'}});
 const mails=await(await request.get('/__test__/mail')).json();await page.goto(mails.find((m:{to:string})=>m.to===email).url);
 await page.getByLabel('아이디',{exact:true}).fill(email);await page.getByLabel('암호',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('.personal-timetable')).toBeVisible();
 for(let i=0;i<5;i++)expect((await page.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'EVENT',data:{title:'연휴 일정 '+(i+1),date:'2027-02-09',allDay:true}}})).ok()).toBe(true);
 for(const [width,height] of [[320,740],[820,1180],[1440,900],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('/today/calendar');await page.getByLabel('달력 월 선택').fill('2027-02');
  const nav=page.locator('.workspace-mobile-nav');await expect(nav).toBeVisible();await expect(nav.locator(':scope > a,:scope > button')).toHaveText(['시간표','달력','대화','가계부','전체메뉴']);
  const n=(await nav.boundingBox())!,main=(await page.locator('#auth-main').boundingBox())!;
  expect(n.x).toBe(0);expect(n.width).toBe(width);expect(n.y+n.height).toBeCloseTo(height,0);expect(main.width).toBe(width);expect(main.y+main.height).toBeLessThanOrEqual(n.y+1);await expect(page.locator('.workspace-rail')).toHaveCount(0);
  const cell=page.locator('[data-date="2027-02-09"]');await expect(cell.locator('.calendar-holiday')).toHaveText('대체공휴일(설날)');await expect(cell.locator('.calendar-overflow')).toHaveText('+2개');
  await page.screenshot({path:`test-results/ui96-calendar-${width}.png`,animations:'disabled'});
  await cell.locator('.calendar-overflow').click();const agenda=page.getByRole('dialog',{name:'2월 9일 화요일',exact:true});await expect(agenda.locator('.day-sheet-event')).toHaveCount(5);await expect(agenda.locator('.holiday-label')).toHaveText('대체공휴일(설날)');
  await page.screenshot({path:`test-results/ui96-agenda-${width}.png`,animations:'disabled'});
  await agenda.getByRole('button',{name:'이 날짜에 일정 추가'}).click();const editor=page.locator('.personal-editor');await expect(page.getByLabel('시작일',{exact:true})).toHaveValue('2027-02-09');
  await expect.poll(async()=>Math.round((await editor.boundingBox())!.y)).toBe(0);const box=(await editor.boundingBox())!;expect(box.x).toBe(0);expect(box.y).toBe(0);expect(box.width).toBe(width);expect(box.height).toBe(height);
  await page.getByLabel('제목',{exact:true}).fill('날짜에서 등록');await page.getByLabel('메모',{exact:true}).fill('입력 중인 내용은 화면을 바꾸어도 유지되어야 해요');
  await editor.locator('.entry-editor-body').evaluate(el=>el.scrollTop=el.scrollHeight);await expect(editor.getByRole('button',{name:'저장',exact:true})).toBeInViewport();expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await editor.locator('.entry-editor-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:`test-results/ui96-editor-${width}.png`,animations:'disabled'});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'편집 닫기'}).click();await expect(editor).toHaveCount(0);
  await nav.getByRole('link',{name:'가계부',exact:true}).click();await page.getByLabel('조회 월',{exact:true}).fill('2027-03');await page.getByRole('button',{name:'가계부 추가'}).click();await expect(page.getByLabel('거래일')).toHaveValue('2027-03-01');await expect(page.getByRole('button',{name:'저장',exact:true})).toBeInViewport();await page.screenshot({path:`test-results/ui96-fee-editor-${width}.png`,animations:'disabled'});await page.getByRole('button',{name:'편집 닫기'}).click();
 }
 await page.setViewportSize({width:820,height:1180});await page.goto('/today/calendar');await page.getByLabel('달력 월 선택').fill('2026-10');await expect(page.locator('[data-date="2026-10-05"] .calendar-holiday')).toHaveText('대체공휴일(개천절)');
 await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.screenshot({path:'test-results/ui96-calendar-dark.png',animations:'disabled'});
 await page.getByRole('group',{name:'달력 보기'}).getByRole('button',{name:'일간',exact:true}).click();await page.getByLabel('달력 날짜 선택').fill('2026-10-05');await expect(page.locator('.timetable-holiday')).toHaveText('대체공휴일(개천절)');
 await page.clock.setFixedTime(new Date('2027-05-13T12:00:00+09:00'));await page.goto('/timetable');await expect(page.locator('.timetable-holiday')).toHaveText('부처님오신날');
});
