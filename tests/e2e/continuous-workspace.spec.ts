import {test,expect,type BrowserContext} from '@playwright/test';
const origin='http://127.0.0.1:4174',password='continuous-workspace-fixture-2026';
async function setup(context:BrowserContext,email:string){
 expect((await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'연속 화면',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await context.request.get('/__test__/mail')).json();await context.request.get(mails.find((mail:{to:string})=>mail.to===email).url);
 expect((await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
}
test('real adjacent events, holidays and recurring fees remain present during drag and delayed revalidation',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,hasTouch:true,isMobile:true,viewport:{width:390,height:900}}),page=await context.newPage();try{
  await setup(context,'continuous-data@example.test');
  for(const [kind,data] of [['EVENT',{title:'다음 달 실제 일정',date:'2026-12-01',allDay:true}],['FEE',{title:'매월 피아노',date:'2026-11-01',amount:180000,feeFrequency:'MONTHLY'}]] as const)expect((await context.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind,data}})).ok()).toBe(true);
  const cdp=await context.newCDPSession(page);
  for(const [route,label] of [['/today/calendar','달력 월 선택'],['/tuition','조회 월']]){
   await page.goto(route);await expect(page.locator('#app-launch')).toHaveCount(0,{timeout:12000});const month=page.getByLabel(label,{exact:true});await month.fill('2026-11');
   const next=page.locator('[data-page-offset="1"]');await expect(next).toContainText(route==='/tuition'?'18만':'다음 달 실제 일정');if(route!=='/tuition')await expect(next).toContainText('성탄절');
   await page.route('**/api/v1/workspace/items.list',async r=>{await new Promise(resolve=>setTimeout(resolve,1200));await r.continue();});
   const viewport=page.locator('.continuous-pager'),box=(await viewport.boundingBox())!,x=box.x+box.width*.8,y=box.y+80;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-box.width*.65*n/8,y,id:1}]});
   await expect(page.locator('.calendar-page-track')).toHaveAttribute('data-paging','dragging');await expect(month).toHaveValue('2026-11');
   await expect.poll(()=>page.locator('.calendar-page-track').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeCloseTo(-box.width*.65,0);const {a,b}=await page.evaluate(()=>{const a=document.querySelector('[data-pager-current]')!.getBoundingClientRect(),b=document.querySelector('[data-page-offset="1"]')!.getBoundingClientRect();return {a:{x:a.x,width:a.width},b:{x:b.x,width:b.width}};});expect(Math.abs(a.x+a.width-b.x)).toBeLessThan(.5);expect(b.x).toBeLessThan(box.x+box.width*.4);expect(b.x+b.width).toBeGreaterThanOrEqual(box.x+box.width);
   await page.screenshot({path:`test-results/ui123-seam-${route==='/tuition'?'fees':'calendar'}.png`});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(month).toHaveValue('2026-12');
   await expect(page.locator('[data-pager-current]')).toContainText(route==='/tuition'?'18만':'다음 달 실제 일정',{timeout:600});
   await page.unrouteAll({behavior:'wait'});
  }
  // A visited menu paints from its scoped snapshot while a fresh request is still pending.
  const nav=page.getByRole('navigation',{name:'모바일 주 메뉴'});await nav.getByRole('link',{name:'더보기',exact:true}).click();await expect(page.locator('.more-account')).toContainText('연속 화면');
  await page.route('**/api/v1/workspace/items.list',async r=>{await new Promise(resolve=>setTimeout(resolve,1600));await r.continue();});
  await nav.getByRole('link',{name:'가계부',exact:true}).click();await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('180,000원',{timeout:600});await expect(page.locator('.loading-state')).toHaveCount(0);
 }finally{await page.unrouteAll({behavior:'wait'});await context.close();}
});
test('failed and successful mutations preserve input, avoid duplicate writes and refresh before the sheet closes',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,reducedMotion:'reduce',viewport:{width:390,height:900}}),page=await context.newPage();try{
  await setup(context,'continuous-mutations@example.test');await page.goto('/tuition');await page.getByLabel('조회 월').fill('2026-11');
  await page.locator('[data-pager-current] .tuition-date[data-date="2026-11-15"]').click();await page.getByRole('button',{name:'이 날짜에 가계부 추가',exact:true}).click();
  const editor=page.locator('.personal-editor');await editor.getByLabel('내용').fill('등록 확인 교재');await editor.getByLabel('금액',{exact:true}).fill('25000');await editor.getByRole('button',{name:'한 번',exact:true}).click();
  await page.route('**/api/v1/workspace/items.create',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'잠시 후 다시 시도해 주세요.'}})}),{times:1});
  await editor.getByRole('button',{name:'저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('잠시 후');await expect(editor.getByLabel('내용')).toHaveValue('등록 확인 교재');
  await page.route('**/api/v1/workspace/items.list',async r=>{await new Promise(resolve=>setTimeout(resolve,800));await r.continue();});
  await editor.getByRole('button',{name:'저장',exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click();});
  await expect(editor.getByRole('button',{name:'저장 중',exact:true})).toBeVisible();await expect(editor).toHaveCount(0);await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('25,000원');
  await page.locator('[data-pager-current] .tuition-date[data-date="2026-11-15"]').click();await expect(page.locator('.tuition-day-event')).toHaveCount(1);await page.getByRole('button',{name:'등록 확인 교재 수정',exact:true}).click();await editor.getByLabel('금액',{exact:true}).fill('30000');await editor.getByRole('button',{name:'저장',exact:true}).click();await expect(editor).toHaveCount(0);await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('30,000원');
  await page.locator('[data-pager-current] .tuition-date[data-date="2026-11-15"]').click();await page.getByRole('button',{name:'등록 확인 교재 수정',exact:true}).click();await editor.getByRole('button',{name:'삭제',exact:true}).click();await editor.getByRole('button',{name:'삭제 확인',exact:true}).click();await expect(editor).toHaveCount(0);await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('0원');
 }finally{await page.unrouteAll({behavior:'wait'});await context.close();}
});
