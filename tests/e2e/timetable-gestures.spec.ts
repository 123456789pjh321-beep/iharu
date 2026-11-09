import {setEntryTime} from './entry-controls';
import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});

test('fixed timetable ignores horizontal gestures, keeps vertical scroll and saves button-selected family schedules',async({browser,request})=>{
 test.setTimeout(120000);
 const context=await browser.newContext({baseURL:origin,hasTouch:true,isMobile:true,viewport:{width:390,height:900}});
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00+09:00'));
  const email='timetable-gestures@example.test',password='timetable-gestures-fixture-2026';
  expect((await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'고정 시간표 부모',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
  const mails=await(await request.get('/__test__/mail')).json();await context.request.get(mails.find((m:{to:string})=>m.to===email).url);
  expect((await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
  await page.goto('/today');await expect(page).toHaveURL(/\/timetable$/);await expect(page.getByLabel('시간표 날짜 선택')).toHaveCount(0);
  await page.getByRole('button',{name:'2026-11-02 09:00 일정 등록',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'반복 일정 등록',exact:true});await expect(editor).toBeVisible();
  await expect(editor.locator('input[type=date]')).toHaveCount(0);await expect(editor.getByRole('radiogroup',{name:'가족 구성원'}).getByRole('combobox')).toHaveCount(0);await expect(editor.getByRole('region',{name:'일정 시간'}).getByRole('combobox')).toHaveCount(6);
  await editor.getByLabel('제목',{exact:true}).fill('유치원');await setEntryTime(editor,'종료 시간','16:20');
  await editor.getByRole('radio',{name:'전체',exact:true}).check();await expect(editor.getByRole('radio',{name:'전체',exact:true})).toBeChecked();
  const weekdays=editor.getByRole('group',{name:'반복 요일',exact:true});await weekdays.getByLabel('월',{exact:true}).uncheck();await editor.getByRole('button',{name:'저장',exact:true}).click();
  await expect(editor.getByRole('alert')).toContainText('반복 요일');await expect(editor.getByLabel('제목',{exact:true})).toHaveValue('유치원');
  for(const label of ['월','화','수','목','금'])await weekdays.getByLabel(label,{exact:true}).check();
  await editor.getByRole('button',{name:'저장',exact:true}).click();await expect(editor).toHaveCount(0);await expect(page.locator('.timetable-event').filter({hasText:'유치원'})).toHaveAttribute('data-span','5');
  const before=await page.locator('[data-timetable-date]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-timetable-date')));
  const cdp=await context.newCDPSession(page),head=(await page.locator('.timetable-day-headings').boundingBox())!;
  for(const direction of [1,-1]){
   const x=head.x+(direction===1?head.width-10:10),end=head.x+(direction===1?10:head.width-10),y=head.y+15;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*n/8,y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  const pane=page.locator('.timetable-scroll');await pane.hover();await page.mouse.wheel(400,0);await page.mouse.wheel(-400,0);
  expect(await page.locator('[data-timetable-date]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-timetable-date')))).toEqual(before);await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);
  await pane.evaluate(el=>{el.scrollTop=0;});await pane.hover();await page.mouse.wheel(0,300);await expect.poll(()=>pane.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  for(const width of [320,820,1440]){
   await page.setViewportSize({width,height:900});await expect(page.locator('.timetable-day-column')).toHaveCount(7);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await pane.evaluate(el=>{el.scrollTop=el.scrollHeight;});await page.screenshot({path:`test-results/ui105-fixed-timetable-${width}.png`});
  }
  const saved=await context.request.post('/api/v1/workspace/items.list',{headers:{Origin:origin},data:{kind:'REPEAT',from:'2030-01-01',to:'2030-01-31'}});const items=(await saved.json()).items;expect(items).toHaveLength(1);expect(items[0].data.untilDate).toBeUndefined();expect(items[0].data.weekdays).toEqual([1,2,3,4,5]);
  // The calendar retains its own day navigation and recurrence dates.
  await page.goto('/today/calendar');await page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button',{name:'일간',exact:true}).click();await page.getByLabel('달력 날짜 선택').fill('2026-12-31');
  await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);await page.locator('.timetable-scroll').hover();await page.mouse.wheel(400,0);await expect(page.getByLabel('달력 날짜 선택')).toHaveValue('2027-01-01');expect(errors).toEqual([]);
 }finally{await context.close();}
});
