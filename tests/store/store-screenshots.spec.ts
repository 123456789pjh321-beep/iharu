import {test,expect,type APIRequestContext} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});

test('capture actual iHaru screens with an isolated fictional family',async({page,request,playwright})=>{
 const password='store-fixture-only-2026',day='2026-11-09';
 const api=async(client:APIRequestContext,op:string,data:object={})=>{
  const r=await client.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});
  expect(r.ok(),await r.text()).toBe(true);return r.json();
 };
 const signup=async(client:APIRequestContext,email:string,name:string)=>{
  expect((await client.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name,password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
  const mail=(await(await request.get('/__test__/mail')).json()).find((m:{to:string})=>m.to===email);
  await client.get(mail.url);
  expect((await client.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
  return api(client,'me');
 };
 const dad=await playwright.request.newContext({baseURL:origin}),jun=await playwright.request.newContext({baseURL:origin}),rin=await playwright.request.newContext({baseURL:origin});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  const mom=await signup(page.request,'store-mom@example.test','엄마');
  const code=(await api(page.request,'invite.issue',{consent:true})).code;
  const dadMe=await signup(dad,'store-dad@example.test','아빠');await api(dad,'family.join',{code});
  for(const [client,name,loginId] of [[jun,'하준','store_jun'],[rin,'하린','store_rin']] as const){
   const approval=(await api(page.request,'invite.issue',{consent:true})).code;
   await api(client,'child.signup',{name,loginId,password,code:approval});
  }
  const junMe=await api(jun,'me'),rinMe=await api(rin,'me');
  const make=async(kind:string,data:object)=>api(page.request,'items.create',{kind,data});
  for(const [title,startTime,endTime,assigneeId,color,weekdays] of [
   ['학교 수업','09:00','13:10',junMe.id,0,[1,2,3,4,5]],
   ['유치원','09:30','14:00',rinMe.id,2,[1,2,3,4,5]],
   ['피아노','14:30','15:30',junMe.id,1,[1,3,5]],
   ['미술 놀이','15:00','16:00',rinMe.id,3,[1,4]],
   ['태권도','16:00','17:00',junMe.id,4,[1,2,3,4,5]],
  ] as const)await make('REPEAT',{title,date:'2026-11-01',untilDate:'2026-12-31',startTime,endTime,assigneeId,color,weekdays});
  await make('EVENT',{title:'가족 저녁',date:day,startTime:'18:30',endTime:'19:30',allMembers:true,color:0});
  await make('EVENT',{title:'주말 공원 산책',date:'2026-11-14',startTime:'10:00',endTime:'12:00',allMembers:true,color:0});
  for(const [title,amount,assigneeId] of [['피아노',150000,junMe.id],['태권도',170000,junMe.id],['미술 놀이',120000,rinMe.id],['영어 교실',100000,junMe.id],['독서 놀이',90000,rinMe.id]] as const)
   await make('FEE',{title,amount,assigneeId,date:'2026-11-01',feeFrequency:'MONTHLY',untilDate:'2026-12-31',feePayerId:dadMe.id});
  for(const [title,note] of [['내일 준비물','물통, 색연필, 실내화를 챙겨요.'],['주말 가족 나들이','토요일 오전 10시, 공원에서 함께 산책해요.'],['이번 주 할 일','겨울 외투 정리 · 도서관 책 반납']])
   await make('NOTE',{title,note,date:day,assigneeId:mom.id});
  for(const [client,text] of [[page.request,'오늘 피아노 끝나면 아빠가 데리러 갈게요.'],[jun,'네! 가방 챙겨서 기다릴게요 😊'],[dad,'4시에 만나요. 집에서 같이 저녁 먹자!'],[rin,'저도 같이 갈래요 ❤️'],[page.request,'좋아요. 모두 조심히 만나요!']] as const)
   await api(client,'chat.send',{text,clientMessageId:crypto.randomUUID()});
  await page.clock.setFixedTime(new Date(day+'T15:10:00+09:00'));
  await page.addInitScript(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'light',font:'noto',quiet:true})));
  await mkdir('test-results/store',{recursive:true});
  const capture=async(name:string,path:string,ready:string)=>{
   await page.goto(path);await expect(page.locator(ready).first()).toBeVisible();
   await expect(page.getByText('불러오는 중',{exact:true})).toHaveCount(0);
   await page.evaluate(()=>document.fonts.ready);
   await page.waitForTimeout(500);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`test-results/store/${name}.png`,animations:'disabled'});
  };
  await api(page.request,'member-filter.preference.save',{scope:'timetable',memberIds:[junMe.id]});
  await api(page.request,'member-filter.preference.save',{scope:'fees',memberIds:[mom.id,dadMe.id,junMe.id,rinMe.id]});
  await capture('01-more-phone','/more','.more-guide-area');
  await capture('02-timetable-phone','/timetable','.timetable-card');
  await capture('03-calendar-phone','/today/calendar','[data-pager-current] .calendar-event');
  await capture('04-tuition-phone','/tuition','[data-pager-current] .ledger-summary');
  await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('630,000원');
  await capture('05-chat-phone','/chat','.chat-message');
  await capture('06-notes-phone','/records','[data-pager-current] .personal-item-list');
  await page.setViewportSize({width:800,height:1280});
  await capture('07-calendar-tablet','/today/calendar','[data-pager-current] .calendar-event');
  await capture('08-tuition-tablet','/tuition','[data-pager-current] .ledger-summary');
  expect(errors).toEqual([]);
 }finally{await dad.dispose();await jun.dispose();await rin.dispose();}
});
