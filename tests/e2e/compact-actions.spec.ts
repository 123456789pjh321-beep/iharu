import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});
async function login(page:Page,request:APIRequestContext,key:string){
 const email=`compact-${key}@example.test`,password='compact-ui-fixture-2026';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'화면 확인 보호자',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
}
test('labeled registration actions, modal entry/exit, dirty cancellation, save and reduced motion',async({page,request})=>{
 test.setTimeout(120000);await login(page,request,'actions');
 await page.addInitScript(()=>{
  const original=Element.prototype.animate;
  (window as any).dialogMotions=[];
  Element.prototype.animate=function(frames,options){
   const animation=original.call(this,frames,options);
   if(this.matches('.direct-editor,.calendar-day-sheet')){
    (window as any).dialogMotions.push({frames,options});
    if((window as any).holdDialogMotion){animation.pause();animation.currentTime=110;}
   }
   return animation;
  };
 });
 for(const width of [390,1024])for(const [path,label,title] of [['/tuition','학원비 추가','학원비 등록'],['/records','메모 추가','메모 작성']]){
  await page.setViewportSize({width,height:900});await page.goto(path);
  const add=page.locator('.workspace-add-action');await expect(add).toHaveAccessibleName(label);await expect(add).toHaveText('등록');
  const box=(await add.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(64);expect(box.height).toBeGreaterThanOrEqual(40);
  await add.click();const editor=page.getByRole('dialog',{name:title,exact:true});
  await expect.poll(async()=>Math.round((await editor.boundingBox())!.y)).toBe(0);
  const save=editor.getByRole('button',{name:'저장',exact:true});await expect(save).toHaveText('저장');await expect(save).toHaveAttribute('title','저장');
  await page.locator('#personal-title').fill(`아이콘 저장 ${path} ${width}`);
  if(path==='/tuition')await page.getByLabel('납부 금액',{exact:true}).fill('150000');
  await page.screenshot({path:`test-results/ui97-editor-${path.replaceAll('/','-')}-${width}.png`,animations:'disabled'});
  await save.click();await expect(editor).toHaveCount(0);
  const motions=await page.evaluate(()=>(window as any).dialogMotions);
  expect(motions[0].frames[0].transform).toBe('translateY(900px)');expect(motions[0].frames[1].transform).toBe('translateY(0)');expect(motions.at(-1).frames[1].transform).toBe('translateY(900px)');
 }
 await page.goto('/today/calendar');const day=page.locator('.calendar-cell.is-today .calendar-day-target>span');await day.click();
 const agenda=page.locator('.calendar-day-sheet'),add=agenda.getByRole('button',{name:'이 날짜에 일정 추가'});await expect(add).toHaveText('등록');await add.click();await expect(agenda).toHaveCount(0);
 const editor=page.locator('.personal-editor');await page.locator('#personal-title').fill('미저장 내용');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.locator('#personal-title')).toHaveValue('미저장 내용');await expect(editor).not.toHaveAttribute('data-closing');
 await page.evaluate(()=>(window as any).holdDialogMotion=true);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'편집 닫기'}).click();await expect(editor).toHaveAttribute('data-closing','true');
 expect((await editor.boundingBox())!.y).toBeGreaterThan(0);await expect(editor.getByRole('button',{name:'저장',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(editor).toHaveCount(1);
 await page.evaluate(()=>{(window as any).holdDialogMotion=false;document.querySelector('.personal-editor')!.getAnimations().forEach(a=>a.finish());});await expect(editor).toHaveCount(0);
 // OS motion preference skips both directions; native focus returns to the trigger.
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/records');const trigger=page.locator('.workspace-add-action');await trigger.click();await expect(editor).toBeVisible();
 expect(await page.evaluate(()=>(window as any).dialogMotions)).toEqual([]);await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);await expect(trigger).toBeFocused();
});

test('fixed seven-day timetable and aligned composer with emoji choices above input',async({page,request})=>{
 await login(page,request,'dates-chat');
 for(const [date,title,startTime,endTime,color] of [['2027-01-02','팀 회의','09:00','10:00',0],['2027-01-02','프로젝트 작업','10:00','12:00',1],['2027-01-02','주간 계획','14:00','16:30',2],['2027-01-03','집중 작업','09:00','11:30',1],['2027-01-03','검토 시간','13:30','15:00',0],['2027-01-04','학습 시간','09:00','11:00',2],['2027-01-04','집중 작업','13:00','16:30',1]])expect((await page.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'EVENT',data:{date,title,startTime,endTime,color}}})).ok()).toBe(true);
 for(const width of [320,820,1440]){
  await page.setViewportSize({width,height:900});await page.clock.setFixedTime(new Date('2026-12-31T12:00:00+09:00'));await page.goto('/timetable');await expect(page.getByLabel('시간표 날짜 선택')).toHaveCount(0);
  const dates=page.locator('[data-timetable-date]');await expect(dates).toHaveCount(7);expect(await dates.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-timetable-date')))).toEqual(['2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02']);await expect(dates.nth(4)).toHaveAttribute('aria-pressed','true');
  await dates.nth(2).click();await expect(dates.nth(2)).toHaveAttribute('aria-pressed','true');await expect(dates.nth(0)).toHaveAttribute('data-timetable-date','2026-12-27');await expect(page.locator('.timetable-weekdays button>span')).toHaveText(['일','월','화','수','목','금','토']);await expect(page.locator('.timetable-day-column')).toHaveCount(7);await expect(page.locator('.timetable-week')).toHaveCount(0);await expect(page.locator('.timetable-card-top,.timetable-place')).toHaveCount(0);
  await page.screenshot({path:`test-results/ui97-timetable-${width}.png`,animations:'disabled'});
  await page.goto('/chat');const input=page.getByRole('textbox',{name:'가족에게 전할 말'}),send=page.getByRole('button',{name:'메시지 보내기'}),emoji=page.getByRole('button',{name:'이모티콘',exact:true});
  await expect(send).toHaveText('');await expect(send).toBeDisabled();await expect(emoji).toHaveCount(0);
  const tray=(await page.locator('.conversation-sticker-tray').boundingBox())!,i=(await input.boundingBox())!,s=(await send.boundingBox())!;
  expect(tray.y+tray.height).toBeLessThanOrEqual(i.y);expect(i.height).toBe(44);expect(s.height).toBe(44);expect(i.y).toBe(s.y);
  await page.getByRole('button',{name:'나 집이야 그림 선택'}).click();await expect(input).toHaveValue('');await expect(input).not.toBeFocused();await expect(send).toBeEnabled();
  await page.screenshot({path:`test-results/ui97-chat-${width}.png`,animations:'disabled'});
  await input.fill('첫 줄\n둘째 줄\n셋째 줄');expect((await input.boundingBox())!.height).toBeGreaterThan(44);expect((await input.boundingBox())!.height).toBeLessThanOrEqual(132);
  await input.fill('');await expect(input).toHaveCSS('height','44px');await expect(send).toBeDisabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
