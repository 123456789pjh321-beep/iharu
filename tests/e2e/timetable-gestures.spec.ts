import {test,expect,type Locator} from '@playwright/test';

const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});

test('timetable touch swipes work on cards and week buttons while vertical scrolling, taps and wheel bursts stay independent',async({browser,request})=>{
 test.setTimeout(120000);
 const context=await browser.newContext({baseURL:origin,hasTouch:true,isMobile:true,viewport:{width:390,height:900}});
 const page=await context.newPage(),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 try{
  const email='timetable-gestures@example.test',password='timetable-gestures-fixture-2026';
  const signup=await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'슬라이드 부모',password,callbackURL:'/login?verified=1'}});
  expect(signup.ok()).toBe(true);
  const mails=await(await request.get('/__test__/mail')).json();
  await context.request.get(mails.find((m:{to:string})=>m.to===email).url);
  const signin=await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});expect(signin.ok()).toBe(true);
  const created=await context.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'REPEAT',data:{title:'매일 가족 일정',date:'2026-12-31',startTime:'09:00',endTime:'18:00',weekdays:[0,1,2,3,4,5,6],untilDate:'2027-12-31',allMembers:true}}});expect(created.ok(),await created.text()).toBe(true);
  await page.goto('/timetable');
  const date=page.getByLabel('시간표 날짜 선택'),pane=page.locator('.timetable-scroll'),card=page.locator('.timetable-event').filter({hasText:'매일 가족 일정'});
  const settled=async()=>{await expect(page.locator('.timetable-day')).toHaveAttribute('aria-busy','false');await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);};
  await date.fill('2026-12-31');await settled();
  const selected=page.getByRole('group',{name:'시간표 구성원 필터'}).getByRole('button',{name:'슬라이드 부모',exact:true});await selected.click();
  const cdp=await context.newCDPSession(page);
  const touch=async(from:{x:number;y:number},to:{x:number;y:number},cancel=false)=>{
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
   for(let n=1;n<=10;n++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*n/10,y:from.y+(to.y-from.y)*n/10,id:1}]});
    await page.waitForTimeout(16);
   }
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  };
  const visibleCard=async()=>{
   const c=(await card.boundingBox())!,p=(await pane.boundingBox())!;
   const top=Math.max(c.y,p.y)+12,bottom=Math.min(c.y+c.height,p.y+p.height,(await page.viewportSize())!.height-90)-12;
   return {left:c.x+5,right:c.x+c.width-5,y:(top+bottom)/2};
  };
  const swipeCard=async(left:boolean)=>{
   const c=await visibleCard(),from={x:left?c.right:c.left,y:c.y},to={x:left?c.left:c.right,y:c.y+2};
   expect(await page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('.timetable-event'),from)).toBe(true);
   await touch(from,to);
  };
  await swipeCard(true);await expect(date).toHaveValue('2027-01-01');await settled();await expect(selected).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('dialog')).toHaveCount(0);
  await swipeCard(false);await expect(date).toHaveValue('2026-12-31');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  const p=(await pane.boundingBox())!,before=await pane.evaluate(node=>node.scrollTop),x=p.x+p.width*.7,y=Math.min(p.y+p.height-60,780);
  await touch({x,y},{x:x+3,y:y-160});await expect.poll(()=>pane.evaluate(node=>node.scrollTop)).toBeGreaterThan(before+50);await expect(date).toHaveValue('2026-12-31');await expect(page.getByRole('dialog')).toHaveCount(0);
  // Let native scroll momentum settle before touching the event again.
  await page.waitForTimeout(400);
  let c=await visibleCard();await touch({x:c.right,y:c.y},{x:c.right-30,y:c.y});await expect(date).toHaveValue('2026-12-31');await expect(page.getByRole('dialog')).toHaveCount(0);
  c=await visibleCard();await touch({x:c.right,y:c.y},{x:c.left,y:c.y},true);await expect(date).toHaveValue('2026-12-31');await expect(page.getByRole('dialog')).toHaveCount(0);
  c=await visibleCard();await page.touchscreen.tap((c.left+c.right)/2,c.y);await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('매일 가족 일정');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const swipeRegion=async(region:Locator,left:boolean)=>{const b=(await region.boundingBox())!;await touch({x:b.x+(left?b.width-30:30),y:b.y+30},{x:b.x+(left?30:b.width-30),y:b.y+32});};
  await swipeRegion(page.locator('.timetable-week'),true);await expect(date).toHaveValue('2027-01-01');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'2027-01-02 시간표',exact:true}).tap();await expect(date).toHaveValue('2027-01-02');await settled();await date.fill('2026-12-30');await settled();await expect(card).toHaveAttribute('data-dates','2026-12-31 2027-01-01');
  await swipeRegion(pane,true);await expect(date).toHaveValue('2026-12-31');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  await swipeRegion(page.getByRole('group',{name:'시간표 구성원 필터'}),true);await expect(date).toHaveValue('2026-12-31');
  await page.screenshot({path:'test-results/ui89-timetable-touch-390.png',animations:'disabled'});

  await page.setViewportSize({width:820,height:1100});
  await pane.hover();
  for(let n=0;n<3;n++)await page.mouse.wheel(120,0);
  await expect(date).toHaveValue('2027-01-01');await settled();await page.waitForTimeout(300);
  await page.mouse.wheel(-120,0);await expect(date).toHaveValue('2026-12-31');await settled();
  const scrollBefore=await pane.evaluate(node=>node.scrollTop);await page.mouse.wheel(0,160);await expect.poll(()=>pane.evaluate(node=>node.scrollTop)).toBeGreaterThan(scrollBefore);await expect(date).toHaveValue('2026-12-31');
  const w=(await page.locator('.timetable-week').boundingBox())!;await page.mouse.move(w.x+w.width-20,w.y+30);await page.mouse.down();await page.mouse.move(w.x+20,w.y+32,{steps:10});await page.mouse.up();await expect(date).toHaveValue('2027-01-01');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({path:'test-results/ui89-timetable-tablet-820.png',animations:'disabled'});

  await page.goto('/today/calendar');await page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button',{name:'일간',exact:true}).click();await page.getByLabel('달력 날짜 선택').fill('2026-12-31');await settled();
  await swipeCard(true);await expect(page.getByLabel('달력 날짜 선택')).toHaveValue('2027-01-01');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
 }finally{await context.close();}
});
