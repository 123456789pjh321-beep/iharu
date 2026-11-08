import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
async function login(page:Page,request:APIRequestContext,email:string,name='가상 부모'){
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name,password:'direct-workspace-fixture-2026',callbackURL:'/login?verified=1'}});
 const mails=await(await request.get(origin+'/__test__/mail')).json();await page.goto(mails.find((m:{to:string})=>m.to===email).url);await page.getByLabel('아이디',{exact:true}).fill(email);await page.getByLabel('암호',{exact:true}).fill('direct-workspace-fixture-2026');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('heading',{name:'오늘의 일정',exact:true})).toBeVisible();
}
async function issue(page:Page){await page.goto('/family');await page.getByRole('checkbox',{name:/부모·보호자이며/}).check();await page.getByRole('button',{name:'부모 승인번호 발급'}).click();return page.locator('.personal-invite-code strong').innerText();}

test('direct calendar CRUD, repeat/copy, title editing, stable menu shell and edge-to-edge swipe',async({page,request})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await login(page,request,'direct-calendar@example.test');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'달력',exact:true}).click();await expect(page.locator('.direct-calendar')).toBeVisible();
 const geometry=await page.locator('.direct-calendar').boundingBox();expect(geometry!.x).toBe(0);expect(geometry!.width).toBe(390);
 await page.getByRole('button',{name:koreaToday()+' 일정 등록',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('가족 나들이');await page.getByRole('checkbox',{name:'종일',exact:true}).check();await page.getByRole('button',{name:'일정 색상 3'}).click();await page.getByRole('button',{name:'저장',exact:true}).click();
 await expect(page.getByRole('button',{name:'가족 나들이 · 종일 · 수정'})).toBeVisible();await page.getByRole('button',{name:'가족 나들이 · 종일 · 수정'}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('가족 나들이');await page.getByLabel('제목',{exact:true}).fill('가족 산책');await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.getByRole('button',{name:'가족 산책 · 종일 · 수정'}).click();await page.getByRole('button',{name:'복사',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('주말 반복');await page.getByLabel('반복',{exact:true}).selectOption('REPEAT');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('button',{name:'주말 반복 · 종일 · 수정'}).first()).toBeVisible();
 await page.getByRole('button',{name:'가족 산책 · 종일 · 수정'}).click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(page.getByRole('button',{name:'가족 산책 · 종일 · 수정'})).toHaveCount(0);
 const originalMonth=await page.getByLabel('달력 월 선택').inputValue(),grid=await page.locator('.calendar-grid').boundingBox();await page.mouse.move(grid!.x+grid!.width-20,grid!.y+20);await page.mouse.down();await page.mouse.move(grid!.x+20,grid!.y+22,{steps:10});await page.mouse.up();await expect(page.getByLabel('달력 월 선택')).not.toHaveValue(originalMonth);await expect(page.getByRole('dialog')).toHaveCount(0);
 // A vertical drag must not turn the month.
 const newMonth=await page.getByLabel('달력 월 선택').inputValue();await page.mouse.move(100,grid!.y+25);await page.mouse.down();await page.mouse.move(105,grid!.y+100,{steps:5});await page.mouse.up();await expect(page.getByLabel('달력 월 선택')).toHaveValue(newMonth);
 await page.locator('.auth-header').evaluate(el=>el.setAttribute('data-stable-shell','preserved'));let health=0,sessions=0,documents=0;page.on('request',r=>{if(r.url().endsWith('/api/health'))health++;if(r.url().endsWith('/api/account/session'))sessions++;if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
 for(const name of ['대화','오늘','달력']){if(name==='위치'){await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('button',{name:'더보기',exact:true}).click();await page.getByRole('dialog',{name:'전체 메뉴'}).getByRole('link',{name,exact:true}).click();}else await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name,exact:true}).click();await expect(page.locator('.auth-header')).toHaveAttribute('data-stable-shell','preserved');await expect(page.locator('.loading-state')).toHaveCount(0);}
 expect(health).toBe(0);expect(sessions).toBe(0);expect(documents).toBe(0);await expect(page.locator('.workspace-tabs,.personal-context')).toHaveCount(0);expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/ui78-calendar-mobile.png'});
 await page.goto('/tuition');await page.getByRole('button',{name:'학원비 추가'}).click();await page.getByLabel('학원·비용 이름').fill('피아노');await page.getByLabel('금액',{exact:true}).fill('180000');await page.getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('button',{name:'피아노 수정',exact:true}).click();await page.getByLabel('금액',{exact:true}).fill('190000');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.personal-fee-value strong')).toHaveText('190,000원');
});

test('parent B joins while signed in and group conversation has shared history, search and safe edits',async({page,browser,request})=>{
 test.setTimeout(90000);await login(page,request,'direct-parent-a@example.test','부모 A');const code=await issue(page);
 const ctx=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}}),b=await ctx.newPage();try{
 await login(b,request,'direct-parent-b@example.test','부모 B');await issue(b);await b.getByLabel('부모 호스트 승인번호',{exact:true}).fill(code);await b.getByRole('checkbox',{name:/연결을 종료하고 새 가족/}).check();await b.getByRole('button',{name:'승인번호로 가족 합류'}).click();await expect(b.locator('.personal-member')).toHaveCount(2);
 await b.goto(origin+'/chat');await expect(b.getByLabel('조회 월')).toHaveCount(0);await expect(b.getByLabel('자료 범위')).toHaveCount(0);await b.getByLabel('가족에게 전할 말').fill('오늘 같이 저녁 먹어요');await b.getByRole('button',{name:'메시지 보내기'}).click();await expect(b.getByRole('button',{name:'메시지 수정: 오늘 같이 저녁 먹어요'})).toBeVisible();
 await page.goto('/chat');await expect(page.getByRole('button',{name:'메시지 상세: 오늘 같이 저녁 먹어요'})).toBeVisible();await page.getByRole('button',{name:'대화 참여자'}).click();await expect(page.getByLabel('참여자 목록')).toContainText('부모 B');await page.getByRole('button',{name:'메시지 상세: 오늘 같이 저녁 먹어요'}).click();await expect(page.getByLabel('메시지',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'삭제',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'편집 닫기'}).click();
 await page.getByLabel('가족에게 전할 말').fill('좋아요 ❤️');await page.getByRole('button',{name:'메시지 보내기'}).click();await expect(page.locator('.chat-message.mine')).toContainText('좋아요 ❤️');await page.getByRole('button',{name:'대화 검색',exact:true}).click();await page.getByLabel('대화 내용 검색').fill('저녁');await page.getByRole('button',{name:'검색',exact:true}).click();await expect(page.locator('.group-chat-history .chat-message')).toHaveCount(1);
 await page.getByRole('button',{name:'검색 해제'}).click();await expect(page.locator('.group-chat-history .chat-message')).toHaveCount(2);await page.screenshot({path:'test-results/ui78-chat-desktop.png'});
 await b.getByRole('button',{name:'메시지 수정: 오늘 같이 저녁 먹어요'}).click();await b.getByLabel('메시지',{exact:true}).fill('저녁 7시에 만나요');await b.getByRole('button',{name:'저장',exact:true}).click();await expect(b.getByRole('button',{name:'메시지 수정: 저녁 7시에 만나요'})).toBeVisible();
 await b.screenshot({path:'test-results/ui78-chat-mobile.png'});
 }finally{await ctx.close().catch(()=>{});}
});
test('calendar slides in the chosen direction, survives fast navigation and respects reduced motion',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await login(page,request,'calendar-motion@example.test');await page.goto('/today/calendar');await expect(page.locator('.calendar-grid')).toBeVisible();
 const initial=await page.getByLabel('달력 월 선택').inputValue();
 async function turn(delta:number){return page.evaluate(delta=>new Promise<{start:number;end:number;hidden:boolean;inert:boolean}>(resolve=>{
  const viewport=document.querySelector('.calendar-viewport')!;
  const observer=new MutationObserver(()=>{
   const snapshot=viewport.querySelector<HTMLElement>('.calendar-motion-snapshot'),grid=viewport.querySelector('.calendar-grid');if(!snapshot||!grid)return;
   const animation=grid.getAnimations()[0];if(!animation)return;
   const frames=(animation.effect as KeyframeEffect).getKeyframes(),translation=(v:unknown)=>Number(String(v).match(/translateX\((-?[\d.]+)/)?.[1]);observer.disconnect();resolve({start:translation(frames[0].transform),end:translation(frames.at(-1)!.transform),hidden:snapshot.getAttribute('aria-hidden')==='true',inert:snapshot.inert});
  });observer.observe(viewport,{childList:true});
  const grid=document.querySelector('.calendar-grid')!;
  grid.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,isPrimary:true,clientX:200,clientY:100}));
  grid.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,button:0,isPrimary:true,clientX:200-delta*100,clientY:100}));
 }),delta);}
 async function swipe(delta:number){await page.locator('.calendar-grid').dispatchEvent('pointerdown',{button:0,isPrimary:true,clientX:200,clientY:100});await page.locator('.calendar-grid').dispatchEvent('pointerup',{button:0,isPrimary:true,clientX:200-delta*100,clientY:100});}
 expect(await turn(1)).toEqual({start:100,end:0,hidden:true,inert:true});
 expect(await turn(-1)).toEqual({start:-100,end:0,hidden:true,inert:true});
 await expect(page.getByLabel('달력 월 선택')).toHaveValue(initial);
 // Reversing during a transition must clean up the previous visual page.
 await swipe(1);await swipe(-1);
 await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);await expect(page.getByLabel('달력 월 선택')).toHaveValue(initial);await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.locator('.auth-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await swipe(1);await expect(page.getByLabel('달력 월 선택')).not.toHaveValue(initial);
 await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);expect(await page.locator('.calendar-grid').evaluate(el=>el.getAnimations().length)).toBe(0);
 await page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button',{name:'주간',exact:true}).click();await swipe(1);await expect(page.locator('.calendar-grid .calendar-cell')).toHaveCount(7);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'light',font:'noto',quiet:true})));await page.reload();await expect(page.locator('.calendar-grid')).toBeVisible();await swipe(1);
 await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);expect(await page.locator('.calendar-grid').evaluate(el=>el.getAnimations().length)).toBe(0);
});

test('tuition recurrence, designated payer, parent-only home, navigation and fixed appearance work together',async({page,browser,request})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});await login(page,request,'tuition-a@example.test','결제 부모 A');const code=await issue(page);
 const ctx=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}}),b=await ctx.newPage(),cc=await browser.newContext({baseURL:origin,viewport:{width:320,height:900}}),child=await cc.newPage();
 try{
  await login(b,request,'tuition-b@example.test','결제 부모 B');await b.goto('/family');await b.getByLabel('부모 호스트 승인번호',{exact:true}).fill(code);await b.getByRole('button',{name:'승인번호로 가족 합류'}).click();await expect(b.locator('.personal-member')).toHaveCount(2);
  await page.goto('/tuition');await page.getByRole('button',{name:'학원비 추가'}).click();await page.getByLabel('학원·비용 이름').fill('매월 피아노');await page.getByLabel('납부 방식',{exact:true}).selectOption('MONTHLY');await page.getByLabel('첫 납부일',{exact:true}).fill('2027-01-31');await page.getByLabel('금액',{exact:true}).fill('180000');await page.getByLabel('결제자',{exact:true}).selectOption({label:'결제 부모 B'});await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('조회 월').fill('2027-02');await expect(page.locator('.personal-tuition-item')).toContainText('2027-02-28');await expect(page.locator('.personal-tuition-item')).toContainText('결제자 결제 부모 B');
  await b.goto('/tuition');await b.getByLabel('조회 월').fill('2027-02');await expect(b.locator('.personal-tuition-item')).toContainText('매월 피아노');await expect(b.locator('.personal-fee-value .badge')).toHaveCount(0);await expect(b.getByRole('button',{name:/납부 완료 표시|납부 취소/})).toHaveCount(0);await expect(b.locator('.personal-fee-summary')).not.toContainText('미납');
  await b.getByLabel('조회 월').fill('2027-03');await expect(b.locator('.personal-fee-value')).toContainText('180,000원');await expect(b.locator('.personal-tuition-item')).toContainText('2027-03-31');
  await page.getByRole('button',{name:'학원비 추가'}).click();await page.getByLabel('학원·비용 이름').fill('이번 달 교재');await page.getByLabel('납부 방식',{exact:true}).selectOption('ONCE');await page.getByLabel('납부일',{exact:true}).fill(koreaToday());await page.getByLabel('금액',{exact:true}).fill('60000');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'오늘',exact:true}).click();await expect(page.locator('[data-home-section="fees"]')).toContainText('이번 달 교재');await expect(page.locator('[data-home-section="fees"] .badge')).toHaveCount(0);const homeFees=page.locator('[data-home-section="fees"]');await expect(homeFees.locator('details')).not.toHaveAttribute('open','');await expect(homeFees.locator('.personal-tuition-item')).toBeHidden();await homeFees.locator('summary').click();await expect(homeFees.locator('.personal-tuition-item')).toBeVisible();await homeFees.locator('summary').click();await expect(homeFees.locator('.personal-tuition-item')).toBeHidden();await expect(page.locator('[data-home-section="fees"]')).not.toContainText('미납');expect(await page.locator('[data-home-section]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-home-section')))).toEqual(['schedule','fees']);
  await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link')).toHaveText(['오늘','시간표','달력','대화']);await page.getByRole('button',{name:'더보기',exact:true}).click();await expect(page.getByRole('dialog',{name:'전체 메뉴'}).getByRole('link',{name:'학원비',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  const childCode=await issue(page);const signup=await cc.request.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'ui80_child',name:'가상 자녀',password:'fixture-child-2026',code:childCode}});expect(signup.ok()).toBe(true);
  await child.goto('/today');await expect(child.getByRole('heading',{name:'오늘의 일정',exact:true})).toBeVisible();await expect(child.locator('[data-home-section="fees"]')).toHaveCount(0);expect(await child.locator('[data-home-section]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-home-section')))).toEqual(['schedule']);
  await child.getByRole('button',{name:'더보기',exact:true}).click();await expect(child.getByRole('dialog').getByRole('link',{name:'학원비',exact:true})).toHaveCount(0);await child.keyboard.press('Escape');await child.goto('/tuition');await expect(child).toHaveURL(/\/today$/);await expect(child.getByText('이번 달 교재',{exact:true})).toHaveCount(0);
  await page.goto('/today');await page.evaluate(()=>{localStorage.setItem('iharu:large-type','true');localStorage.setItem('iharu:appearance',JSON.stringify({theme:'light',font:'manrope'}));});await page.reload();await expect(page.locator('html')).toHaveAttribute('data-font','noto');await expect(page.locator('html')).not.toHaveClass(/large-type/);await expect(page.getByRole('button',{name:'큰 글씨'})).toHaveCount(0);await expect(page.getByLabel('화면 설정')).toHaveCount(0);
  await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.getByRole('button',{name:'밝게',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('[data-home-section="fees"]')).toContainText('이번 달 교재');await page.screenshot({path:'test-results/ui80-home-mobile.png'});await page.goto('/tuition');await page.getByRole('button',{name:'학원비 추가'}).click();await page.screenshot({path:'test-results/ui80-fee-editor.png'});
 }finally{await ctx.close();await cc.close();}
});

test('today schedule and tuition member filters stay independent with collapsed totals and narrow screens',async({page,browser,request})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await login(page,request,'today-filters@example.test','필터 부모');
 const api=async(op:string,data:object={})=>{const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
 // Use separately authenticated family members so this filter scenario does not consume
 // the shared test server's IP-wide child-signup quota used by child-account scenarios.
 for(const [email,name] of [['today-filter-one@example.test','필터 가족 하나'],['today-filter-two@example.test','필터 가족 둘']]){
  const code=await issue(page),ctx=await browser.newContext({baseURL:origin});
  try{const other=await ctx.newPage();await login(other,request,email,name);const r=await ctx.request.post('/api/v1/workspace/family.join',{headers:{Origin:origin},data:{code}});expect(r.ok(),await r.text()).toBe(true);}finally{await ctx.close();}
 }
 const me=await api('me'),one=me.family.members.find((m:{name:string})=>m.name==='필터 가족 하나').id,two=me.family.members.find((m:{name:string})=>m.name==='필터 가족 둘').id,today=koreaToday();
 const event=(title:string,startTime:string,extra:object)=>api('items.create',{kind:'EVENT',data:{title,date:today,startTime,endTime:'22:00',...extra}});
 await event('둘 오후 수업','16:00',{assigneeId:two});await event('하나 오전 수업','09:00',{assigneeId:one});await event('부모 일정','08:00',{assigneeId:me.id});await event('가족 전체 일정','18:00',{allMembers:true});
 await api('items.create',{kind:'FEE',data:{title:'하나 피아노',date:today,amount:180000,feeFrequency:'MONTHLY',assigneeId:one,feePayerId:me.id,untilDate:today.slice(0,4)+'-12-31'}});
 await api('items.create',{kind:'FEE',data:{title:'둘 교재',date:today,amount:60000,feeFrequency:'ONCE',assigneeId:two,feePayerId:me.id}});
 await page.goto('/today');const schedule=page.getByRole('region',{name:'오늘의 일정',exact:true}),fees=page.getByRole('region',{name:'학원비',exact:true}),sf=schedule.getByRole('group',{name:'오늘 일정 구성원 필터'}),ff=fees.getByRole('group',{name:'오늘 학원비 구성원 필터'});
 await expect(schedule.locator('.personal-item h3')).toHaveText(['부모 일정','하나 오전 수업','둘 오후 수업','가족 전체 일정']);await expect(fees.locator('summary strong')).toHaveText('240,000원');await expect(ff).toBeVisible();await expect(fees.locator('details')).not.toHaveAttribute('open','');
 await sf.getByRole('button',{name:'필터 가족 하나',exact:true}).click();await expect(schedule.locator('.personal-item h3')).toHaveText(['하나 오전 수업','가족 전체 일정']);await expect(sf.getByRole('button',{name:'필터 가족 하나',exact:true})).toHaveAttribute('aria-pressed','true');
 await ff.getByRole('button',{name:'필터 가족 둘',exact:true}).click();await expect(fees.locator('summary strong')).toHaveText('60,000원');await expect(fees.locator('summary')).toContainText('필터 가족 둘 합계');await expect(fees.locator('details')).not.toHaveAttribute('open','');await expect(fees.locator('.personal-tuition-item')).toBeHidden();await expect(schedule.locator('.personal-item h3')).toHaveText(['하나 오전 수업','가족 전체 일정']);
 await fees.locator('summary').click();await expect(fees.locator('.personal-tuition-item h3')).toHaveText(['둘 교재']);await expect(fees.locator('.personal-tuition-item')).toBeVisible();
 await ff.getByRole('button',{name:'필터 가족 하나',exact:true}).click();await expect(fees.locator('details')).toHaveAttribute('open','');await expect(fees.locator('summary strong')).toHaveText('180,000원');await expect(fees.locator('.personal-tuition-item h3')).toHaveText(['하나 피아노']);
 await sf.getByRole('button',{name:'필터 가족 둘',exact:true}).click();await expect(schedule.locator('.personal-item h3')).toHaveText(['둘 오후 수업','가족 전체 일정']);await expect(fees.locator('summary strong')).toHaveText('180,000원');
 await ff.getByRole('button',{name:'필터 부모',exact:true}).click();await expect(fees.locator('summary strong')).toHaveText('0원');await expect(fees.locator('.personal-tuition-item')).toHaveCount(0);await expect(fees.getByText('필터 부모의 이번 달 학원비가 없어요.',{exact:true})).toBeVisible();
 await ff.getByRole('button',{name:'전체 보기',exact:true}).click();await sf.getByRole('button',{name:'전체 보기',exact:true}).click();await expect(fees.locator('summary strong')).toHaveText('240,000원');await expect(fees.locator('.personal-tuition-item')).toHaveCount(2);await expect(schedule.locator('.personal-item')).toHaveCount(4);
 for(const width of [320,390,768,1320]){
  await page.setViewportSize({width,height:1000});
  for(const filter of [sf,ff]){
   await filter.scrollIntoViewIfNeeded();await expect(filter).toBeVisible();expect(await filter.evaluate(el=>el.clientHeight>=38&&el.scrollHeight<=el.clientHeight+1)).toBe(true);
   await filter.getByRole('button',{name:'필터 가족 둘',exact:true}).click();await expect(filter.getByRole('button',{name:'필터 가족 둘',exact:true})).toBeInViewport();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/ui87-today-filters-${width}.png`,fullPage:true});
 }
});

for(const width of [320,768,1440])test(`all functional canvases and calendar editor fit ${width}px`,async({page,request})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:900});await login(page,request,`direct-layout-${width}@example.test`);
 await expect.poll(()=>page.locator('.auth-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:`test-results/ui78-today-${width}.png`});
 for(const path of ['/today','/timetable','/today/calendar','/tuition','/records','/family','/chat','/account']){
  await page.goto(path);await expect(page.locator('.auth-panel')).toBeVisible();await expect(page.locator('.auth-panel')).toHaveCSS('padding','0px');await expect(page.locator('.loading-state')).toHaveCount(0);
  await expect.poll(()=>page.locator('.auth-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  if(['/timetable','/today/calendar','/tuition','/records'].includes(path)){
   const toolbar=page.locator('.workspace-toolbar'),navigation=toolbar.getByRole('group',{name:'날짜 선택',exact:true});
   await expect(toolbar).toHaveCount(1);
   const controls=await navigation.locator('button,.workspace-date-picker').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,height:r.height};}));
   expect(controls).toHaveLength(1);await expect(navigation.getByRole('button')).toHaveCount(0);
   for(let i=0;i<controls.length;i++){expect(controls[i].height).toBeGreaterThanOrEqual(44);if(i){expect(controls[i].x).toBeGreaterThanOrEqual(controls[i-1].right);expect(controls[i].y).toBe(controls[0].y);}}
   const toolbarBox=(await toolbar.boundingBox())!,action=page.locator('.workspace-add-action'),actionBox=(await action.boundingBox())!;
   await expect(action).toHaveCount(1);expect(actionBox.width).toBeGreaterThanOrEqual(56);expect(actionBox.height).toBeGreaterThanOrEqual(56);
   expect(actionBox.x+actionBox.width).toBeLessThanOrEqual(toolbarBox.x+toolbarBox.width);expect(actionBox.y+actionBox.height).toBeLessThanOrEqual(900);
   if(width<=760){const nav=(await page.getByRole('navigation',{name:'모바일 주 메뉴'}).boundingBox())!;expect(actionBox.y+actionBox.height).toBeLessThan(nav.y);}
   expect(await navigation.locator('.workspace-date-picker').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
   if(path==='/today/calendar')await expect(page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button')).toHaveText(['월간','주간','일간']);
   if(path!=='/records'){
    const filter=page.locator('.member-filters'),filterBox=(await filter.boundingBox())!;
    expect(filterBox.y).toBeGreaterThanOrEqual(toolbarBox.y+toolbarBox.height-1);
    for(const button of await filter.getByRole('button').all()){const r=(await button.boundingBox())!;expect(r.y).toBeGreaterThanOrEqual(filterBox.y);expect(r.y+r.height).toBeLessThanOrEqual(filterBox.y+filterBox.height);}
   }
   const input=navigation.locator('input'),daily=path==='/timetable';
   await input.fill(daily?'2026-12-31':'2026-12');
   await input.fill(daily?'2027-01-01':'2027-01');await expect(input).toHaveValue(daily?'2027-01-01':'2027-01');
   await input.fill(daily?'2026-12-31':'2026-12');await expect(input).toHaveValue(daily?'2026-12-31':'2026-12');
   await action.click();await expect(page.getByRole('dialog')).toBeVisible();
   await expect(page.locator('#personal-date')).toHaveValue(daily?'2026-12-31':'2026-12-01');await page.getByRole('button',{name:'편집 닫기'}).click();
   await input.fill(daily?koreaToday():koreaToday().slice(0,7));await expect(input).toHaveValue(daily?koreaToday():koreaToday().slice(0,7));
   await page.screenshot({path:`test-results/ui91-${path.replaceAll('/','-')}-${width}.png`,animations:'disabled'});
   if(width===320){await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.screenshot({path:`test-results/ui91-${path.replaceAll('/','-')}-dark.png`,animations:'disabled'});await page.getByRole('button',{name:'밝게',exact:true}).click();}
  }
  if(['/tuition','/family','/account'].includes(path))await page.screenshot({path:`test-results/ui78-${path.slice(1)}-${width}.png`});
  await expect(page.locator('.workspace-tabs,.personal-context')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await expect(page.getByText('오늘 화면으로',{exact:true})).toHaveCount(0);await page.goto('/today/calendar');await page.getByRole('button',{name:koreaToday()+' 일정 등록',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('좁은 화면 일정');await page.getByLabel('반복',{exact:true}).selectOption('REPEAT');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/ui78-calendar-${width}.png`});
});

test('daily timetable shares calendar CRUD, all-family assignment, time order and child visibility',async({page,browser,request})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});await login(page,request,'timetable-sync@example.test','시간표 부모');
 const today=koreaToday(),code=await issue(page),ctx=await browser.newContext({baseURL:origin,viewport:{width:320,height:900}}),child=await ctx.newPage();
 const api=async(op:string,data:object={})=>{const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
 try{
  const signup=await ctx.request.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'timetable_child',name:'가상 서준',password:'fixture-child-2026',code}});expect(signup.ok()).toBe(true);
  await page.goto('/today/calendar');await page.getByRole('button',{name:today+' 일정 등록',exact:true}).click({position:{x:12,y:12}});await page.getByLabel('제목',{exact:true}).fill('학교 수업');await page.getByLabel('가족 구성원',{exact:true}).selectOption({label:'가상 서준 · 자녀'});await page.getByLabel('시작 시간',{exact:true}).fill('09:00');await page.getByLabel('종료 시간',{exact:true}).fill('13:40');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  const me=await api('me');const make=(title:string,startTime:string,endTime:string,extra:object={})=>({kind:'EVENT',data:{title,date:today,startTime,endTime,weekdays:[],place:'',note:'',paid:false,...extra}});
  await api('items.create',make('눈놀이','17:00','18:00',{assigneeId:me.id}));await api('items.create',make('보호자 회의','10:00','11:00',{assigneeId:me.id}));await api('items.create',make('특별활동','14:15','15:00',{allMembers:true}));await api('items.create',{...make('돌봄교실','13:50','14:10',{allMembers:true,untilDate:today.slice(0,4)+'-12-31',weekdays:[new Date(today+'T12:00:00Z').getUTCDay()]}),kind:'REPEAT'});await api('items.create',make('가족 기념일','00:00','23:59',{allDay:true,allMembers:true}));
  const nav=page.getByRole('navigation',{name:'모바일 주 메뉴'});await nav.getByRole('link',{name:'시간표',exact:true}).click();await expect(page).toHaveURL(/\/timetable$/);await expect(page.locator('.timetable-title')).toHaveText(['가족 기념일','학교 수업','보호자 회의','돌봄교실','특별활동','눈놀이']);await expect(page.locator('.timetable-card').filter({hasText:'학교 수업'})).toContainText('가상 서준');await expect(nav.getByRole('link')).toHaveText(['오늘','시간표','달력','대화']);await expect(nav.locator(':scope > a,:scope > button')).toHaveText(['오늘','시간표','달력','대화','더보기']);
  await page.getByRole('group',{name:'시간표 구성원 필터'}).getByRole('button',{name:'가상 서준',exact:true}).click();await expect(page.locator('.timetable-title')).toHaveText(['가족 기념일','학교 수업','돌봄교실','특별활동']);await page.getByRole('button',{name:'전체 보기',exact:true}).click();
  const schoolBox=await page.locator('.timetable-event').filter({hasText:'학교 수업'}).boundingBox(),meetingBox=await page.locator('.timetable-event').filter({hasText:'보호자 회의'}).boundingBox(),activityBox=await page.locator('.timetable-event').filter({hasText:'특별활동'}).boundingBox();
  expect((await page.locator('.timetable-day').boundingBox())!.width).toBe(390);expect(schoolBox!.height).toBeCloseTo(280*1.2,0);expect(meetingBox!.height).toBeCloseTo(60*1.2,0);expect(meetingBox!.y-schoolBox!.y).toBeCloseTo(60*1.2,0);expect(activityBox!.y-schoolBox!.y).toBeCloseTo(315*1.2,0);expect(meetingBox!.x).toBeGreaterThan(schoolBox!.x+schoolBox!.width);await expect(page.locator('.timetable-grid')).toHaveCSS('height','1728px');
  await page.screenshot({path:'test-results/ui81-timetable-390.png'});await page.setViewportSize({width:320,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(nav.getByRole('button',{name:'더보기',exact:true})).toBeInViewport();await page.screenshot({path:'test-results/ui81-timetable-320.png'});
  await page.getByRole('button',{name:today+' 15:30 일정 등록',exact:true}).click();await expect(page.getByLabel('시작 시간',{exact:true})).toHaveValue('15:30');await page.getByLabel('제목',{exact:true}).fill('함께 저녁');await page.getByLabel('가족 구성원',{exact:true}).selectOption('ALL');await page.getByLabel('시작 시간',{exact:true}).fill('20:00');await page.getByLabel('종료 시간',{exact:true}).fill('21:00');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.timetable-title').last()).toHaveText('함께 저녁');
  await nav.getByRole('link',{name:'달력',exact:true}).click();await page.getByRole('button',{name:today+' 일정 등록',exact:true}).click({position:{x:12,y:12}});await expect(page.locator('.editor-day-events button')).toHaveText(['종일 가족 기념일','09:00 학교 수업','10:00 보호자 회의','13:50 돌봄교실','14:15 특별활동','17:00 눈놀이','20:00 함께 저녁']);await page.getByRole('button',{name:'20:00 함께 저녁',exact:true}).click();await expect(page.getByLabel('가족 구성원',{exact:true})).toHaveValue('ALL');await page.getByLabel('시작 시간',{exact:true}).fill('21:00');await page.getByLabel('종료 시간',{exact:true}).fill('22:00');await page.getByRole('button',{name:'저장',exact:true}).click();
  await page.getByRole('group',{name:'달력 구성원 필터'}).getByRole('button',{name:'가상 서준',exact:true}).click();await expect(page.locator('.calendar-cell[data-date="'+today+'"]')).toContainText('전체 ·');
  await nav.getByRole('link',{name:'시간표',exact:true}).click();await expect(page.locator('.timetable-card').filter({hasText:'함께 저녁'})).toContainText('21:00');
  await child.goto('/timetable');await expect(child.locator('.timetable-card').filter({hasText:'함께 저녁'})).toContainText('전체');await child.locator('.timetable-card').filter({hasText:'함께 저녁'}).click();await expect(child.getByLabel('제목',{exact:true})).toBeDisabled();await expect(child.getByRole('button',{name:'저장',exact:true})).toHaveCount(0);await child.getByRole('button',{name:'편집 닫기'}).click();
  await page.locator('.timetable-card').filter({hasText:'함께 저녁'}).click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(page.locator('.timetable-card').filter({hasText:'함께 저녁'})).toHaveCount(0);await page.reload();await expect(page.locator('.timetable-title')).toHaveCount(6);
  await page.getByRole('button',{name:'어둡게',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.getByRole('button',{name:'어둡게',exact:true})).toHaveAttribute('aria-pressed','true');await page.screenshot({path:'test-results/ui81-timetable-dark.png',animations:'disabled'});
  const contrast=await page.locator('.timetable-event').first().evaluate(el=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;const luminance=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);const [r,g,b]=Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};const fg=luminance(getComputedStyle(el.querySelector('.timetable-title')!).color),bg=luminance(getComputedStyle(el).backgroundColor);return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);
 await page.getByRole('button',{name:'밝게',exact:true}).click();
  const box=await page.locator('.timetable-day').boundingBox();await page.mouse.move(box!.x+box!.width-15,box!.y+40);await page.mouse.down();await page.mouse.move(box!.x+15,box!.y+42,{steps:8});await page.mouse.up();await expect(page.getByLabel('시간표 날짜 선택')).not.toHaveValue(today);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);
  await page.getByLabel('시간표 날짜 선택').fill(today);await expect(page.getByLabel('시간표 날짜 선택')).toHaveValue(today);await expect(page.locator('.calendar-motion-snapshot')).toHaveCount(0);await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'test-results/ui81-timetable-desktop.png'});
  await page.goto('/today/calendar');await page.getByRole('button',{name:today+' 일정 등록',exact:true}).click({position:{x:12,y:12}});await expect(page.locator('.editor-day-events')).not.toContainText('함께 저녁');
 }finally{await ctx.close();}
});
