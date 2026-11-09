import {test,expect} from '@playwright/test';

const origin='http://127.0.0.1:4174',password='tuition-touch-fixture-2026';
for(const width of [390,820])for(const reducedMotion of ['reduce','no-preference'] as const){
 test(`tuition cards remain open after touch at ${width}px with ${reducedMotion} motion`,async({browser})=>{
  const context=await browser.newContext({baseURL:origin,hasTouch:true,isMobile:true,viewport:{width,height:900},reducedMotion});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
   const email=`tuition-touch-${width}-${reducedMotion}@example.test`;
   expect((await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'터치 확인 부모',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
   const mails=await(await context.request.get('/__test__/mail')).json();await context.request.get(mails.find((mail:{to:string})=>mail.to===email).url);
   expect((await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
   expect((await context.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'FEE',data:{title:'터치 피아노',amount:180000,date:'2026-11-01',feeFrequency:'MONTHLY'}}})).ok()).toBe(true);
   await page.goto('/tuition');const month=page.getByLabel('조회 월',{exact:true});await month.fill('2026-11');
   await expect(page.locator('.tuition-month-summary strong')).toHaveText('180,000원');
   await page.evaluate(()=>{
    const events:object[]=[];(window as unknown as {touchTrace:object[]}).touchTrace=events;
    for(const type of ['pointerup','click'])document.addEventListener(type,event=>{const target=event.target as Element;events.push({type,target:target.className||target.tagName,detail:(event as MouseEvent).detail,openDialogs:document.querySelectorAll('dialog[open]').length});},true);
   });
   const day=page.locator('.tuition-date[data-date="2026-11-01"]'),sheet=page.locator('.tuition-day-sheet');
   await day.locator('strong').tap();
   // Let the compatibility click and any outgoing animation finish before checking.
   await page.waitForTimeout(650);await expect(sheet).toBeVisible();await expect(sheet.locator('.tuition-day-event')).toHaveCount(1);
   await expect(sheet).toContainText('터치 피아노');await page.screenshot({path:`test-results/ui121-tuition-touch-${width}-${reducedMotion}.png`});
   await sheet.getByRole('button',{name:'터치 피아노 수정',exact:true}).tap();
   const editor=page.getByRole('dialog',{name:'수정',exact:true});await expect(editor).toBeVisible();await expect(page.getByLabel('학원·비용 이름')).toHaveValue('터치 피아노');
   await page.getByRole('button',{name:'편집 닫기'}).tap();await expect(page.getByRole('dialog')).toHaveCount(0);
   await page.locator('.tuition-date[data-date="2026-11-02"]').tap();await expect(sheet).toContainText('이 날짜에 등록된 학원비가 없어요.');
   await sheet.getByRole('button',{name:'이 날짜에 학원비 추가',exact:true}).tap();await expect(page.getByRole('dialog',{name:'학원비 등록',exact:true})).toBeVisible();await expect(page.getByLabel('첫 납부일',{exact:true})).toHaveValue('2026-11-02');
   await page.getByRole('button',{name:'편집 닫기'}).tap();await expect(page.getByRole('dialog')).toHaveCount(0);
   const cdp=await context.newCDPSession(page),grid=page.locator('.tuition-date-grid'),area=page.locator('.month-swipe-area');
   const box=(await grid.boundingBox())!,start={x:box.x+box.width-20,y:box.y+30},end={x:box.x+20,y:box.y+32};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
   for(let n=1;n<=10;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*n/10,y:start.y+(end.y-start.y)*n/10,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await expect(month).toHaveValue('2026-12');await expect(page.getByRole('dialog')).toHaveCount(0);await expect.poll(()=>area.evaluate(el=>el.getAnimations().length)).toBe(0);
   // The first intentional tap after a swipe must not be swallowed or doubled.
   await page.locator('.tuition-date[data-date="2026-12-01"]').tap();await page.waitForTimeout(650);await expect(sheet).toBeVisible();await expect(sheet).toContainText('터치 피아노');
   await sheet.getByRole('button',{name:'날짜 학원비 닫기'}).tap();await expect(sheet).toHaveCount(0);
   await page.getByRole('group',{name:'학원비 보기'}).getByRole('button',{name:'내역',exact:true}).tap();await expect(page.locator('.tuition-ledger')).toBeVisible();await page.getByRole('button',{name:'터치 피아노 수정',exact:true}).tap();await expect(editor).toBeVisible();expect(errors).toEqual([]);
  }finally{
   if(!page.isClosed())await test.info().attach('touch-event-order',{body:JSON.stringify(await page.evaluate(()=>(window as unknown as {touchTrace?:object[]}).touchTrace||[])),contentType:'application/json'});
   await context.close();
  }
 });
}
