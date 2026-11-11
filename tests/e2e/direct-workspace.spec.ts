import {setEntryTime} from './entry-controls';
import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
async function login(page:Page,request:APIRequestContext,email:string,name='가상 일반사용자'){
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name,password:'direct-workspace-fixture-2026',callbackURL:'/login?verified=1'}});
 const mails=await(await request.get(origin+'/__test__/mail')).json();await page.goto(mails.find((m:{to:string})=>m.to===email).url);await page.getByLabel('아이디',{exact:true}).fill(email);await page.getByLabel('암호',{exact:true}).fill('direct-workspace-fixture-2026');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('.personal-timetable')).toBeVisible();
}
async function issue(page:Page){
 await page.goto('/family');await page.getByRole('checkbox',{name:/초대받은 사람과/}).check();
 await page.getByRole('button',{name:'그룹 초대 링크 만들기'}).click();
 const field=page.getByLabel('발급한 그룹 초대 링크');
 await expect(field).toBeVisible();
 return field.inputValue();
}
async function issueLegacy(page:Page){
 const response=await page.request.post('/api/v1/workspace/invite.issue',{headers:{Origin:origin},data:{consent:true}});
 expect(response.ok(),await response.text()).toBe(true);
 return (await response.json()).code;
}
async function accept(page:Page,link:string,switchGroup=false){
 await page.goto(link);
 if(switchGroup)await page.getByRole('checkbox',{name:/연결을 끝내고 새 그룹/}).check();
 await page.getByRole('button',{name:'초대 수락'}).click();
 await page.getByRole('link',{name:'그룹 관리 열기'}).click();
}

test('direct calendar CRUD, general-event copy, title editing, stable menu shell and edge-to-edge swipe',async({page,request})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await login(page,request,'direct-calendar@example.test');
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'달력',exact:true}).click();await expect(page.locator('.direct-calendar')).toBeVisible();
 const geometry=await page.locator('.direct-calendar').boundingBox();expect(geometry!.x).toBe(0);expect(geometry!.width).toBe(390);
 await page.locator('.calendar-cell[data-date="'+koreaToday()+'"] .calendar-day-target').click({position:{x:12,y:12}});await page.getByRole('button',{name:'이 날짜에 일정 추가',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('그룹 나들이');await page.getByRole('checkbox',{name:'종일',exact:true}).check();await page.getByRole('button',{name:'일정 색상 3'}).click();await page.getByRole('button',{name:'저장',exact:true}).click();
 await expect(page.getByRole('button',{name:/그룹 나들이 · 종일 .* · 수정$/})).toBeVisible();await page.getByRole('button',{name:/그룹 나들이 · 종일 .* · 수정$/}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('그룹 나들이');await page.getByLabel('제목',{exact:true}).fill('그룹 산책');await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.getByRole('button',{name:/그룹 산책 · 종일 .* · 수정$/}).click();await page.getByRole('button',{name:'복사',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('주말 행사');await expect(page.getByLabel('반복',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('button',{name:/주말 행사 · 종일 .* · 수정$/}).first()).toBeVisible();
 await page.getByRole('button',{name:/그룹 산책 · 종일 .* · 수정$/}).click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(page.getByRole('button',{name:/그룹 산책 · 종일 .* · 수정$/})).toHaveCount(0);
 await expect(page.getByRole('dialog')).toHaveCount(0);const originalMonth=await page.getByLabel('달력 월 선택').inputValue(),grid=await page.locator('.calendar-grid').boundingBox();await page.mouse.move(grid!.x+grid!.width-20,grid!.y+20);await page.mouse.down();await page.mouse.move(grid!.x+20,grid!.y+22,{steps:10});await page.mouse.up();await expect(page.getByLabel('달력 월 선택')).not.toHaveValue(originalMonth);await expect(page.getByRole('dialog')).toHaveCount(0);
 // A vertical drag must not turn the month.
 const newMonth=await page.getByLabel('달력 월 선택').inputValue();await page.mouse.move(100,grid!.y+25);await page.mouse.down();await page.mouse.move(105,grid!.y+100,{steps:5});await page.mouse.up();await expect(page.getByLabel('달력 월 선택')).toHaveValue(newMonth);
 await page.locator('.auth-header').evaluate(el=>el.setAttribute('data-stable-shell','preserved'));let health=0,sessions=0,documents=0;page.on('request',r=>{if(r.url().endsWith('/api/health'))health++;if(r.url().endsWith('/api/account/session'))sessions++;if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
 for(const name of ['대화','시간표','달력']){if(name==='위치'){await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('button',{name:'전체메뉴',exact:true}).click();await page.getByRole('dialog',{name:'전체 메뉴'}).getByRole('link',{name,exact:true}).click();}else await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name,exact:true}).click();await expect(page.locator('.auth-header')).toHaveAttribute('data-stable-shell','preserved');await expect(page.locator('.loading-state')).toHaveCount(0);}
 expect(health).toBe(0);expect(sessions).toBe(0);expect(documents).toBe(0);await expect(page.locator('.workspace-tabs,.personal-context')).toHaveCount(0);expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/ui78-calendar-mobile.png'});
 await page.goto('/tuition');await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await page.getByRole('button',{name:'가계부 추가'}).click();await page.getByLabel('내용').fill('피아노');await page.getByLabel('금액',{exact:true}).fill('180000');await page.getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('button',{name:'피아노 수정',exact:true}).click();await page.getByLabel('금액',{exact:true}).fill('190000');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.personal-fee-value strong')).toHaveText('190,000원');
});

test('parent B joins while signed in and group conversation has shared history, search and safe edits',async({page,browser,request})=>{
 test.setTimeout(90000);await login(page,request,'direct-parent-a@example.test','일반사용자 A');const code=await issue(page);
 const ctx=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}}),b=await ctx.newPage();try{
 await login(b,request,'direct-parent-b@example.test','일반사용자 B');await issue(b);await accept(b,code,true);await expect(b.locator('.personal-member')).toHaveCount(2);
 await b.goto(origin+'/chat');await expect(b.getByLabel('조회 월')).toHaveCount(0);await expect(b.getByLabel('자료 범위')).toHaveCount(0);await b.getByLabel('참여자에게 전할 말').fill('오늘 같이 저녁 먹어요');await b.getByRole('button',{name:'메시지 보내기'}).click();await expect(b.getByRole('button',{name:'메시지 수정: 오늘 같이 저녁 먹어요'})).toBeVisible();
 await page.goto('/chat');await expect(page.getByRole('button',{name:'메시지 상세: 오늘 같이 저녁 먹어요'})).toBeVisible();await page.getByRole('button',{name:'대화 참여자'}).click();await expect(page.getByLabel('참여자 목록')).toContainText('일반사용자 B');await page.getByRole('button',{name:'메시지 상세: 오늘 같이 저녁 먹어요'}).click();await expect(page.getByLabel('메시지',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'삭제',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByLabel('참여자에게 전할 말').fill('좋아요 ❤️');await page.getByRole('button',{name:'메시지 보내기'}).click();await expect(page.locator('.chat-message.mine')).toContainText('좋아요 ❤️');await page.getByRole('button',{name:'대화 검색',exact:true}).click();await page.getByLabel('대화 내용 검색').fill('저녁');await page.getByRole('button',{name:'검색',exact:true}).click();await expect(page.locator('.group-chat-history .chat-message')).toHaveCount(1);
 await page.getByRole('button',{name:'검색 해제'}).click();await expect(page.locator('.group-chat-history .chat-message')).toHaveCount(2);await page.screenshot({path:'test-results/ui78-chat-desktop.png'});
 await b.getByRole('button',{name:'메시지 수정: 오늘 같이 저녁 먹어요'}).click();await b.getByLabel('메시지',{exact:true}).fill('저녁 7시에 만나요');await b.getByRole('button',{name:'저장',exact:true}).click();await expect(b.getByRole('button',{name:'메시지 수정: 저녁 7시에 만나요'})).toBeVisible();
 await b.screenshot({path:'test-results/ui78-chat-mobile.png'});
 }finally{await ctx.close().catch(()=>{});}
});

test('tuition recurrence, designated payer, parent-only home, navigation and fixed appearance work together',async({page,browser,request})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});await login(page,request,'tuition-a@example.test','결제 일반사용자 A');const code=await issue(page);
 const ctx=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}}),b=await ctx.newPage(),cc=await browser.newContext({baseURL:origin,viewport:{width:320,height:900}}),child=await cc.newPage();
 try{
  await login(b,request,'tuition-b@example.test','결제 일반사용자 B');await accept(b,code);await expect(b.locator('.personal-member')).toHaveCount(2);
  await page.goto('/tuition');await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await page.getByRole('button',{name:'가계부 추가'}).click();await page.getByLabel('내용').fill('매월 피아노');await page.getByRole('button',{name:'매달',exact:true}).click();await page.getByLabel('시작 날짜',{exact:true}).fill('2027-01-31');await page.getByLabel('금액',{exact:true}).fill('180000');await page.locator('.ledger-extra-options summary').click();await page.getByLabel('담당자',{exact:true}).selectOption({label:'결제 일반사용자 B'});await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('조회 월').fill('2027-02');await expect(page.locator('.personal-tuition-item')).toContainText('2027-02-28');await expect(page.locator('.personal-tuition-item')).toContainText('담당 결제 일반사용자 B');
  await b.goto('/tuition');await b.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await b.getByLabel('조회 월').fill('2027-02');await expect(b.locator('.personal-tuition-item')).toContainText('매월 피아노');await expect(b.locator('.personal-fee-value .badge')).toHaveCount(0);await expect(b.getByRole('button',{name:/납부 완료 표시|납부 취소/})).toHaveCount(0);await expect(b.locator('.personal-fee-summary')).not.toContainText('미납');
  await b.getByLabel('조회 월').fill('2027-03');await expect(b.locator('.personal-fee-value')).toContainText('180,000원');await expect(b.locator('.personal-tuition-item')).toContainText('2027-03-31');
  await page.getByRole('button',{name:'가계부 추가'}).click();await page.getByLabel('내용').fill('이번 달 교재');await page.getByRole('button',{name:'한 번',exact:true}).click();await page.getByLabel('날짜',{exact:true}).fill(koreaToday());await page.getByLabel('금액',{exact:true}).fill('60000');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/today');await expect(page.locator('[data-home-section="fees"]')).toContainText('이번 달 교재');await expect(page.locator('[data-home-section="fees"] .badge')).toHaveCount(0);const homeFees=page.locator('[data-home-section="fees"]');await expect(homeFees.locator('details')).not.toHaveAttribute('open','');await expect(homeFees.locator('.personal-tuition-item')).toBeHidden();await homeFees.locator('summary').click();await expect(homeFees.locator('.personal-tuition-item')).toBeVisible();await homeFees.locator('summary').click();await expect(homeFees.locator('.personal-tuition-item')).toBeHidden();await expect(page.locator('[data-home-section="fees"]')).not.toContainText('미납');expect(await page.locator('[data-home-section]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-home-section')))).toEqual(['schedule','fees']);
  await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link')).toHaveText(['시간표','달력','대화','가계부']);await page.getByRole('button',{name:'전체메뉴',exact:true}).click();await expect(page.getByRole('dialog',{name:'전체 메뉴'}).getByRole('link',{name:'가계부',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  const childCode=await issueLegacy(page);const signup=await cc.request.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'ui80_child',name:'가상 어린이',password:'fixture-child-2026',code:childCode}});expect(signup.ok()).toBe(true);
  await child.goto('/today');await expect(child.locator('.personal-timetable')).toBeVisible();await expect(child.locator('[data-home-section="fees"]')).toHaveCount(0);expect(await child.locator('[data-home-section]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-home-section')))).toEqual(['schedule']);
  await child.getByRole('button',{name:'전체메뉴',exact:true}).click();await expect(child.getByRole('dialog').getByRole('link',{name:'가계부',exact:true})).toHaveCount(0);await child.keyboard.press('Escape');await child.goto('/tuition');await expect(child).toHaveURL(/\/today$/);await expect(child.getByText('이번 달 교재',{exact:true})).toHaveCount(0);
  await page.goto('/today');await page.evaluate(()=>{localStorage.setItem('iharu:large-type','true');localStorage.setItem('iharu:appearance',JSON.stringify({theme:'light',font:'manrope'}));});await page.reload();await expect(page.locator('html')).toHaveAttribute('data-font','noto');await expect(page.locator('html')).not.toHaveClass(/large-type/);await expect(page.getByRole('button',{name:'큰 글씨'})).toHaveCount(0);await expect(page.getByLabel('화면 설정')).toHaveCount(0);
  await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.getByRole('button',{name:'밝게',exact:true}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await expect(page.locator('[data-home-section="fees"]')).toContainText('이번 달 교재');await page.screenshot({path:'test-results/ui80-home-mobile.png'});await page.goto('/tuition');await page.getByRole('group',{name:'가계부 보기'}).getByRole('button',{name:'내역',exact:true}).click();await page.getByRole('button',{name:'가계부 추가'}).click();await page.screenshot({path:'test-results/ui80-fee-editor.png'});
 }finally{await ctx.close();await cc.close();}
});

test('today schedule and tuition member filters stay independent with collapsed totals and narrow screens',async({page,browser,request})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await login(page,request,'today-filters@example.test','필터 일반사용자');
 const api=async(op:string,data:object={})=>{const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
 // Use separately authenticated family members so this filter scenario does not consume
 // the shared test server's IP-wide child-signup quota used by child-account scenarios.
 for(const [email,name] of [['today-filter-one@example.test','필터 그룹 하나'],['today-filter-two@example.test','필터 그룹 둘']]){
  const code=await issue(page),ctx=await browser.newContext({baseURL:origin});
  try{const other=await ctx.newPage();await login(other,request,email,name);await accept(other,code);}finally{await ctx.close();}
 }
 const me=await api('me'),one=me.family.members.find((m:{name:string})=>m.name==='필터 그룹 하나').id,two=me.family.members.find((m:{name:string})=>m.name==='필터 그룹 둘').id,today=koreaToday();
 const event=(title:string,startTime:string,extra:object)=>api('items.create',{kind:'EVENT',data:{title,date:today,startTime,endTime:'22:00',...extra}});
 await event('둘 오후 수업','16:00',{assigneeId:two});await event('하나 오전 수업','09:00',{assigneeId:one});await event('일반사용자 일정','08:00',{assigneeId:me.id});await event('그룹 전체 일정','18:00',{allMembers:true});
 await api('items.create',{kind:'FEE',data:{title:'하나 피아노',date:today,amount:180000,feeFrequency:'MONTHLY',assigneeId:one,feePayerId:me.id,untilDate:today.slice(0,4)+'-12-31'}});
 await api('items.create',{kind:'FEE',data:{title:'둘 교재',date:today,amount:60000,feeFrequency:'ONCE',assigneeId:two,feePayerId:me.id}});
 await page.goto('/today');const schedule=page.getByRole('region',{name:'오늘의 일정',exact:true}),fees=page.getByRole('region',{name:'가계부',exact:true}),sf=schedule.getByRole('group',{name:'오늘 일정 구성원 필터'}),ff=fees.getByRole('group',{name:'오늘 가계부 구성원 필터'});
 await expect(schedule.locator('.personal-item h3')).toHaveText(['일반사용자 일정','하나 오전 수업','둘 오후 수업','그룹 전체 일정']);await expect(fees.locator('summary strong')).toHaveText('240,000원');await expect(ff).toBeVisible();await expect(fees.locator('details')).not.toHaveAttribute('open','');
 await sf.getByRole('button',{name:'필터 그룹 하나',exact:true}).click();await expect(schedule.locator('.personal-item h3')).toHaveText(['하나 오전 수업','그룹 전체 일정']);await expect(sf.getByRole('button',{name:'필터 그룹 하나',exact:true})).toHaveAttribute('aria-pressed','true');
 await ff.getByRole('button',{name:'필터 그룹 둘',exact:true}).click();await expect(fees.locator('summary strong')).toHaveText('60,000원');await expect(fees.locator('summary')).toContainText('필터 그룹 둘 합계');await expect(fees.locator('details')).not.toHaveAttribute('open','');await expect(fees.locator('.personal-tuition-item')).toBeHidden();await expect(schedule.locator('.personal-item h3')).toHaveText(['하나 오전 수업','그룹 전체 일정']);
 await fees.locator('summary').click();await expect(fees.locator('.personal-tuition-item h3')).toHaveText(['둘 교재']);await expect(fees.locator('.personal-tuition-item')).toBeVisible();
 await ff.getByRole('button',{name:'필터 그룹 하나',exact:true}).click();await expect(fees.locator('details')).toHaveAttribute('open','');await expect(fees.locator('summary strong')).toHaveText('180,000원');await expect(fees.locator('.personal-tuition-item h3')).toHaveText(['하나 피아노']);
 await sf.getByRole('button',{name:'필터 그룹 둘',exact:true}).click();await expect(schedule.locator('.personal-item h3')).toHaveText(['둘 오후 수업','그룹 전체 일정']);await expect(fees.locator('summary strong')).toHaveText('180,000원');
 await ff.getByRole('button',{name:'필터 일반사용자',exact:true}).click();await expect(fees.locator('summary strong')).toHaveText('0원');await expect(fees.locator('.personal-tuition-item')).toHaveCount(0);await expect(fees.getByText('필터 일반사용자의 이번 달 가계부가 없어요.',{exact:true})).toBeVisible();
 await ff.getByRole('button',{name:'전체 보기',exact:true}).click();await sf.getByRole('button',{name:'전체 보기',exact:true}).click();await expect(fees.locator('summary strong')).toHaveText('240,000원');await expect(fees.locator('.personal-tuition-item')).toHaveCount(2);await expect(schedule.locator('.personal-item')).toHaveCount(4);
 for(const width of [320,390,768,1320]){
  await page.setViewportSize({width,height:1000});
  for(const filter of [sf,ff]){
   await filter.scrollIntoViewIfNeeded();await expect(filter).toBeVisible();expect(await filter.evaluate(el=>el.clientHeight>=38&&el.scrollHeight<=el.clientHeight+1)).toBe(true);
   await filter.getByRole('button',{name:'필터 그룹 둘',exact:true}).click();await expect(filter.getByRole('button',{name:'필터 그룹 둘',exact:true})).toBeInViewport();
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
   const toolbarBox=(await toolbar.boundingBox())!,action=page.locator('.workspace-add-action');
   if(path==='/timetable'||path==='/today/calendar'){await expect(action).toHaveCount(0);}else{const actionBox=(await action.boundingBox())!;
   await expect(action).toHaveCount(1);expect(actionBox.width).toBeGreaterThanOrEqual(56);expect(actionBox.height).toBeGreaterThanOrEqual(44);
   expect(actionBox.x+actionBox.width).toBeLessThanOrEqual(toolbarBox.x+toolbarBox.width);expect(actionBox.y+actionBox.height).toBeLessThanOrEqual(900);
   if(width<=760){const nav=(await page.getByRole('navigation',{name:'모바일 주 메뉴'}).boundingBox())!;expect(actionBox.y+actionBox.height).toBeLessThan(nav.y);}}
   expect(await navigation.locator('.workspace-date-picker').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
   if(path==='/today/calendar')await expect(page.getByRole('group',{name:'달력 보기',exact:true}).getByRole('button')).toHaveText(['월간','주간','일간']);
   if(path!=='/records'){
    const filter=page.locator('.member-filters:visible'),filterBox=(await filter.boundingBox())!;
    expect(filterBox.y).toBeGreaterThanOrEqual(toolbarBox.y+toolbarBox.height-1);
    for(const button of await filter.getByRole('button').all()){const r=(await button.boundingBox())!;expect(r.y).toBeGreaterThanOrEqual(filterBox.y);expect(r.y+r.height).toBeLessThanOrEqual(filterBox.y+filterBox.height);}
   }
   const input=navigation.locator('input'),daily=path==='/timetable';
   await input.fill(daily?'2026-12-31':'2026-12');
   await input.fill(daily?'2027-01-01':'2027-01');await expect(input).toHaveValue(daily?'2027-01-01':'2027-01');
   await input.fill(daily?'2026-12-31':'2026-12');await expect(input).toHaveValue(daily?'2026-12-31':'2026-12');
   if(path==='/timetable'){await page.getByRole('button',{name:'2026-12-31 09:00 일정 등록',exact:true}).click();}else if(path==='/today/calendar'){await page.locator('.calendar-cell[data-date="2026-12-01"] .calendar-day-target').click();await page.getByRole('button',{name:'이 날짜에 일정 추가'}).click();}else await action.click();await expect(page.getByRole('dialog')).toBeVisible();
   await expect(page.locator('#personal-date')).toHaveValue(daily?'2026-12-31':'2026-12-01');await page.getByRole('button',{name:'편집 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
   await input.fill(daily?koreaToday():koreaToday().slice(0,7));await expect(input).toHaveValue(daily?koreaToday():koreaToday().slice(0,7));
   await page.screenshot({path:`test-results/ui91-${path.replaceAll('/','-')}-${width}.png`,animations:'disabled'});
   if(width===320){await page.getByRole('button',{name:'어둡게',exact:true}).click();await page.screenshot({path:`test-results/ui91-${path.replaceAll('/','-')}-dark.png`,animations:'disabled'});await page.getByRole('button',{name:'밝게',exact:true}).click();}
  }
  if(['/tuition','/family','/account'].includes(path))await page.screenshot({path:`test-results/ui78-${path.slice(1)}-${width}.png`});
  await expect(page.locator('.workspace-tabs,.personal-context')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await expect(page.getByText('오늘 화면으로',{exact:true})).toHaveCount(0);await page.goto('/today/calendar');await page.locator('.calendar-cell[data-date="'+koreaToday()+'"] .calendar-day-target').click({position:{x:12,y:12}});await page.getByRole('button',{name:'이 날짜에 일정 추가',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('좁은 화면 일정');await expect(page.getByLabel('반복',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/ui78-calendar-${width}.png`});
});

test('weekly repeat timetable and event calendar have independent CRUD and preserve family visibility',async({page,browser,request})=>{
 test.setTimeout(120000);await page.setViewportSize({width:390,height:844});await login(page,request,'timetable-sync@example.test','시간표 일반사용자');
 const today=koreaToday(),code=await issueLegacy(page),ctx=await browser.newContext({baseURL:origin,viewport:{width:320,height:900}}),child=await ctx.newPage();
 const api=async(op:string,data:object={})=>{const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
 try{
  expect((await ctx.request.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'timetable_child',name:'가상 서준',password:'fixture-child-2026',code}})).ok()).toBe(true);
  await api('items.create',{kind:'EVENT',data:{title:'그룹 기념일',date:today,allDay:true,allMembers:true}});
  await page.goto('/timetable');await expect(page.locator('.timetable-title')).toHaveCount(0);await expect(page.locator('[data-timetable-date]')).toHaveCount(7);
  await page.getByRole('button',{name:today+' 09:00 일정 등록',exact:true}).click();await expect(page.getByRole('dialog',{name:'반복 일정 등록',exact:true})).toBeVisible();await expect(page.getByLabel('반복',{exact:true})).toHaveCount(0);
  await page.getByLabel('제목',{exact:true}).fill('학교 수업');await page.getByRole('radio',{name:'전체',exact:true}).check();await expect(page.getByLabel('반복 종료일',{exact:true})).toHaveCount(0);await setEntryTime(page,'종료 시간','13:40');await page.getByRole('button',{name:'저장',exact:true}).click();
  await expect(page.locator('.timetable-title')).toHaveText(['학교 수업']);const saved=await api('items.list',{from:today,to:today,kind:'REPEAT'});expect(saved.items).toHaveLength(1);expect(saved.items[0].kind).toBe('REPEAT');
  await child.goto('/timetable');await expect(child.locator('.timetable-card').filter({hasText:'학교 수업'})).toHaveAccessibleName(/전체/);await child.locator('.timetable-card').filter({hasText:'학교 수업'}).click();await expect(child.getByLabel('제목',{exact:true})).toBeDisabled();await expect(child.getByRole('button',{name:'저장',exact:true})).toHaveCount(0);
  await page.goto('/today/calendar');await page.locator('.calendar-cell[data-date="'+today+'"] .calendar-day-target').click();await expect(page.locator('.day-sheet-event strong')).toHaveText(['그룹 기념일']);await page.locator('.day-sheet-event').click();await page.getByLabel('제목',{exact:true}).fill('그룹 생일');await expect(page.getByLabel('반복 요일')).toHaveCount(0);await page.getByRole('button',{name:'저장',exact:true}).click();
  await page.goto('/timetable');await expect(page.locator('.timetable-title')).toHaveText(['학교 수업']);expect((await api('items.list',{from:today,to:today,kind:'REPEAT'})).items).toEqual(saved.items);
  await page.locator('.timetable-card').click();await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('button',{name:'삭제 확인'}).click();await expect(page.locator('.timetable-card')).toHaveCount(0);expect((await api('items.list',{from:today,to:today,kind:'EVENT'})).items[0].data.title).toBe('그룹 생일');
  await page.clock.setFixedTime(new Date('2027-01-01T12:00:00+09:00'));await page.reload();await expect(page.getByLabel('시간표 날짜 선택')).toHaveCount(0);await expect(page.locator('.timetable-weekdays button>span')).toHaveText(['일','월','화','수','목','금','토']);await expect(page.locator('[data-timetable-date]').first()).toHaveAttribute('data-timetable-date','2026-12-27');await expect(page.locator('[data-timetable-date="2027-01-01"] .calendar-holiday')).toHaveText('신정');
  for(const width of [320,820,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/separate-weekly-timetable-${width}.png`});}
 }finally{await ctx.close();}
});
