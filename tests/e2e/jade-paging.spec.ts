import {test,expect,type Page,type BrowserContext} from '@playwright/test';
const origin='http://127.0.0.1:4174',password='jade-paging-fixture-2026';
async function signIn(context:BrowserContext,email:string){
 expect((await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'디자인 확인',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await context.request.get('/__test__/mail')).json();await context.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
}
async function settled(page:Page){await expect(page.locator('[data-paging]')).toHaveCount(0);await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);}
for(const width of [390,820])test(`finger-follow, snap-back, cancellation and touch recovery at ${width}px`,async({browser})=>{
 const context=await browser.newContext({baseURL:origin,hasTouch:true,isMobile:true,viewport:{width,height:1000},reducedMotion:'no-preference'}),page=await context.newPage(),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  await signIn(context,`jade-paging-${width}@example.test`);
  const cdp=await context.newCDPSession(page);
  for(const [route,areaSelector,inputLabel,gridSelector] of [
   ['/tuition','.month-swipe-area','조회 월','.tuition-date-grid'],
   ['/today/calendar','.calendar-grid','달력 월 선택','.calendar-grid'],
  ]){
   await page.goto(route);const month=page.getByLabel(inputLabel,{exact:true});await month.fill('2026-11');await settled(page);
   const area=page.locator(areaSelector),grid=page.locator(gridSelector);
   const bounds=(await grid.boundingBox())!,x=bounds.x+bounds.width*.5,y=bounds.y+40;
   const start=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   const drag=async(dx:number,dy=0)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy,id:1}]});};
   const end=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   // The live page follows the finger before release; a held, small drag returns without opening a card.
   await start();await drag(-20);await drag(-40);await expect(area).toHaveAttribute('data-paging','dragging');
   await expect.poll(()=>area.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeCloseTo(-40,0);await expect(month).toHaveValue('2026-11');
   await page.screenshot({path:`test-results/ui122-drag-${route==='/tuition'?'tuition':'calendar'}-${width}.png`});
   await page.waitForTimeout(150);await end();await settled(page);await expect(month).toHaveValue('2026-11');await expect(page.getByRole('dialog')).toHaveCount(0);
   // Cancel an in-progress horizontal gesture: no period change and no lingering transformed surface.
   await start();await drag(-90);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settled(page);await expect(month).toHaveValue('2026-11');
   // A deliberate swipe commits exactly one month; taps on the arriving page still work.
   await start();for(let i=1;i<=8;i++)await drag(-Math.min(210,bounds.width*.46)*i/8);await end();await expect(month).toHaveValue('2026-12');await settled(page);
   const day=route==='/tuition'?page.locator('.tuition-date[data-date="2026-12-01"]'):page.locator('.calendar-cell[data-date="2026-12-01"] .calendar-day-target');
   if(route==='/tuition'){await day.tap();await page.waitForTimeout(650);await expect(page.locator('.tuition-day-sheet')).toBeVisible();await page.getByRole('button',{name:'날짜 학원비 닫기'}).tap();}
   else{await day.tap();await page.waitForTimeout(650);await expect(page.locator('.calendar-day-sheet')).toBeVisible();await page.keyboard.press('Escape');}
   await expect(page.getByRole('dialog')).toHaveCount(0);
   await start();await drag(100);await drag(180);await end();await expect(month).toHaveValue('2026-11');await settled(page);
   // Vertical movement must never change the month.
   await start();await drag(2,-40);await drag(3,-100);await end();await expect(month).toHaveValue('2026-11');await settled(page);
  }
  // The same controller handles calendar day paging, but never the fixed weekly timetable.
  await page.getByRole('group',{name:'달력 보기'}).getByRole('button',{name:'일간',exact:true}).tap();await page.getByLabel('달력 날짜 선택').fill('2026-12-31');
  await page.locator('.timetable-scroll').hover();await page.mouse.wheel(300,0);await expect(page.getByLabel('달력 날짜 선택')).toHaveValue('2027-01-01');await settled(page);
  await page.goto('/timetable');await expect(page.locator('[data-timetable-date]')).toHaveCount(7);const days=await page.locator('[data-timetable-date]').evaluateAll(els=>els.map(el=>el.getAttribute('data-timetable-date')));
  await page.locator('.timetable-scroll').hover();await page.mouse.wheel(300,0);await settled(page);expect(await page.locator('[data-timetable-date]').evaluateAll(els=>els.map(el=>el.getAttribute('data-timetable-date')))).toEqual(days);
  expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('jade palette remains readable and aligned in light and dark at phone, tablet and desktop sizes',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,reducedMotion:'reduce'}),page=await context.newPage();
 try{
  await signIn(context,'jade-palette@example.test');
  expect((await context.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'FEE',data:{title:'피아노',amount:180000,date:'2026-11-01',feeFrequency:'MONTHLY'}}})).ok()).toBe(true);
  await page.goto('/tuition');await page.getByLabel('조회 월').fill('2026-11');
  for(const theme of ['light','dark']){
   await page.getByRole('button',{name:theme==='light'?'밝게':'어둡게',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
   const contrasts=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement),rgb=(value:string)=>{const probe=document.createElement('span');probe.style.color=value.trim();document.body.appendChild(probe);const color=getComputedStyle(probe).color;probe.remove();return color.match(/[\d.]+/g)!.slice(0,3).map(n=>Number(n)/255);};
    const lum=(color:string)=>rgb(color).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
    const ratio=(a:string,b:string)=>{const x=lum(root.getPropertyValue(a)),y=lum(root.getPropertyValue(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const button=getComputedStyle(document.querySelector('.workspace-add-action')!);const foreground=lum(button.color),background=lum(button.backgroundColor);
    return [ratio('--ink','--surface'),ratio('--muted','--surface'),ratio('--primary','--mint'),ratio('--on-primary','--primary'),(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)];
   });for(const contrast of contrasts)expect(contrast).toBeGreaterThanOrEqual(4.5);
   for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});await settled(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/ui122-jade-${theme}-${width}.png`,animations:'disabled'});
   }
  }
  for(const route of ['service','blog']){await page.goto('/'+route);await expect(page.locator('.marketing-site h1')).toBeVisible();if(route==='blog'){await expect(page.getByRole('searchbox',{name:'글 검색'})).toHaveCSS('background-color','rgb(255, 255, 255)');}await page.screenshot({path:`test-results/ui122-${route}.png`,animations:'disabled'});}
 }finally{await context.close();}
});

test('calendar slides in the chosen direction, survives fast navigation and respects reduced motion',async({browser})=>{
 const context=await browser.newContext({baseURL:origin}),page=await context.newPage();
 try{
 await page.setViewportSize({width:390,height:844});await signIn(context,'calendar-motion@example.test');await page.goto('/today/calendar');
 const month=page.getByLabel('달력 월 선택');await month.fill('2026-11');
 async function swipe(delta:number){
  const bounds=(await page.locator('.calendar-viewport').boundingBox())!,x=bounds.x+bounds.width*(delta>0?.8:.2),y=bounds.y+40;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-delta*bounds.width*.6,y,{steps:8});await page.mouse.up();
 }
 await page.evaluate(()=>{
  const viewport=document.querySelector('.calendar-viewport')!;
  const observations:object[]=[];(window as unknown as {pageTransitions:object[]}).pageTransitions=observations;
  new MutationObserver(()=>{
   const snapshot=viewport.querySelector<HTMLElement>('.calendar-motion-snapshot'),grid=viewport.querySelector('.calendar-grid');if(!snapshot||!grid)return;
   const animation=grid.getAnimations()[0];if(!animation)return;
   const frames=(animation.effect as KeyframeEffect).getKeyframes();observations.push({direction:Math.sign(new DOMMatrix(String(frames[0].transform)).m41),hidden:snapshot.getAttribute('aria-hidden')==='true',inert:snapshot.inert});
  }).observe(viewport,{childList:true});
 });
 await swipe(1);await expect(month).toHaveValue('2026-12');await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);
 await swipe(-1);await expect(month).toHaveValue('2026-11');await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as unknown as {pageTransitions:object[]}).pageTransitions)).toEqual([{direction:1,hidden:true,inert:true},{direction:-1,hidden:true,inert:true}]);
 await swipe(1);await swipe(-1);await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);await expect(month).toHaveValue('2026-11');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});await swipe(1);await expect(month).toHaveValue('2026-12');await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);
 expect(await page.locator('.calendar-grid').evaluate(el=>el.getAnimations().length)).toBe(0);
 await page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button',{name:'주간',exact:true}).click();await swipe(1);await expect(page.locator('.calendar-grid .calendar-cell')).toHaveCount(7);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'light',font:'noto',quiet:true})));await page.reload();await month.fill('2026-11');await swipe(1);await expect(month).toHaveValue('2026-12');
 await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);expect(await page.locator('.calendar-grid').evaluate(el=>el.getAnimations().length)).toBe(0);
 }finally{await context.close();}
});
