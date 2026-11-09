import {test,expect,type Locator} from '@playwright/test';

const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});

test('tuition and notes swipe across months while filters, taps, scrolling and registration stay independent',async({browser,request})=>{
 test.setTimeout(120000);
 const context=await browser.newContext({baseURL:origin,hasTouch:true,isMobile:true,viewport:{width:390,height:900}}),page=await context.newPage();
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  const email='month-swipes@example.test',password='month-swipes-fixture-2026';
  const signup=await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'월 이동 부모',password,callbackURL:'/login?verified=1'}});expect(signup.ok()).toBe(true);
  const mails=await(await request.get('/__test__/mail')).json();await context.request.get(mails.find((m:{to:string})=>m.to===email).url);
  const signin=await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});expect(signin.ok()).toBe(true);
  const api=async(op:string,data:object={})=>{const r=await context.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
  const me=await api('me');
  await api('items.create',{kind:'FEE',data:{title:'매월 학원',date:'2026-12-01',assigneeId:me.id,feePayerId:me.id,feeFrequency:'MONTHLY',untilDate:'2027-12-31',amount:100000}});
  await api('items.create',{kind:'FEE',data:{title:'12월 교재',date:'2026-12-15',assigneeId:me.id,feePayerId:me.id,feeFrequency:'ONCE',amount:20000}});
  for(const [date,title] of [['2026-12-15','12월 메모'],['2027-01-15','1월 메모']])await api('items.create',{kind:'NOTE',data:{title,date,assigneeId:me.id,note:'가족 준비물을 확인해요.'}});
  for(let n=1;n<=10;n++)await api('items.create',{kind:'NOTE',data:{title:'12월 기록 '+n,date:'2026-12-16',assigneeId:me.id,note:'확인할 내용'}});
  const cdp=await context.newCDPSession(page),month=page.getByLabel('조회 월',{exact:true}),area=page.locator('.month-swipe-area');
  const settled=async()=>{await expect.poll(()=>area.evaluate(node=>node.getAnimations().length)).toBe(0);};
  const touch=async(from:{x:number;y:number},to:{x:number;y:number},cancel=false)=>{
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...from,id:1}]});
   for(let n=1;n<=10;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*n/10,y:from.y+(to.y-from.y)*n/10,id:1}]});await page.waitForTimeout(16);}
   await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  };
  const swipe=async(region:Locator,left:boolean,cancel=false)=>{const b=(await region.boundingBox())!,y=Math.max(b.y,80)+Math.min(b.height/2,80);await touch({x:b.x+(left?b.width-24:24),y},{x:b.x+(left?24:b.width-24),y:y+2},cancel);};
  await page.goto('/tuition');await page.getByRole('group',{name:'학원비 보기'}).getByRole('button',{name:'내역',exact:true}).click();await month.fill('2026-12');await expect(area.locator('.personal-fee-summary')).toContainText('120,000원');await settled();
  const filter=page.getByRole('group',{name:'학원비 구성원 필터'}),selected=filter.getByRole('button',{name:'월 이동 부모',exact:true});await selected.click();
  await swipe(area.locator('.personal-tuition-item').first(),true);await expect(month).toHaveValue('2027-01');await settled();
  await expect(area.locator('.personal-fee-summary')).toContainText('100,000원');await expect(selected).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('dialog')).toHaveCount(0);
  await area.getByRole('button',{name:'매월 학원 수정',exact:true}).tap();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await swipe(area,false);await expect(month).toHaveValue('2026-12');await settled();await expect(area.locator('.personal-fee-summary')).toContainText('120,000원');
  await swipe(filter,true);await expect(month).toHaveValue('2026-12');await expect(selected).toHaveAttribute('aria-pressed','true');
  await swipe(area,true,true);await expect(month).toHaveValue('2026-12');await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({path:'test-results/ui92-tuition-month-swipe-390.png',animations:'disabled'});

  await page.goto('/records');await month.fill('2026-12');await expect(area.getByRole('button',{name:'12월 메모 수정',exact:true})).toBeVisible();await settled();
  const scrollPosition=()=>page.evaluate(()=>Array.from(document.querySelectorAll('*')).reduce((sum,node)=>sum+node.scrollTop,0));
  const before=await scrollPosition();await touch({x:260,y:600},{x:263,y:350});await expect.poll(scrollPosition).toBeGreaterThan(before+50);await expect(month).toHaveValue('2026-12');
  await page.locator('.workspace-toolbar').scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  await swipe(area,true);await expect(month).toHaveValue('2027-01');await settled();await expect(area.getByRole('button',{name:'1월 메모 수정',exact:true})).toBeVisible();await expect(area.getByRole('button',{name:'12월 메모 수정',exact:true})).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
  await area.getByRole('button',{name:'1월 메모 수정',exact:true}).tap();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('1월 메모');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await swipe(area,true);await expect(month).toHaveValue('2027-02');await settled();await expect(area.getByRole('button',{name:'눌러서 등록',exact:true})).toBeVisible();
  await swipe(area,true);await expect(month).toHaveValue('2027-03');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'메모 추가',exact:true}).click();await expect(page.locator('#personal-date')).toHaveValue('2027-03-01');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({path:'test-results/ui92-empty-notes-swipe-390.png',animations:'disabled'});

  await page.setViewportSize({width:1440,height:1000});
  const b=(await area.boundingBox())!;await page.mouse.move(b.x+30,b.y+70);await page.mouse.down();await page.mouse.move(b.x+b.width-30,b.y+72,{steps:10});await page.mouse.up();await expect(month).toHaveValue('2027-02');await settled();await expect(page.getByRole('dialog')).toHaveCount(0);
  await area.hover();for(let n=0;n<3;n++)await page.mouse.wheel(120,0);await expect(month).toHaveValue('2027-03');await settled();
  expect(errors).toEqual([]);
 }finally{await context.close();}
});
