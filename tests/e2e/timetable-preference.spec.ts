import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174',password='timetable-preference-fixture-2026';test.use({baseURL:origin,reducedMotion:'reduce'});
async function call(client:APIRequestContext,op:string,data:object={}){const r=await client.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
async function signIn(page:Page,email:string){expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);}
async function parent(page:Page,email:string,name:string){expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name,password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);const mail=await(await page.request.get('/__test__/mail')).json();await page.request.get(mail.find((m:{to:string})=>m.to===email).url);await signIn(page,email);}
const filters=(page:Page)=>page.getByRole('group',{name:'시간표 구성원 필터',exact:true});
const selected=(page:Page,name:string,pressed=true)=>expect(filters(page).getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed',String(pressed));

test('timetable toggles multiple people, saves combinations across devices and keeps accounts isolated',async({page,browser})=>{
 test.setTimeout(120000);const bContext=await browser.newContext({baseURL:origin}),otherContext=await browser.newContext({baseURL:origin}),b=await bContext.newPage(),other=await otherContext.newPage();
 try{
  await parent(page,'tt-pref-a@example.test','기본 보호자');await parent(b,'tt-pref-b@example.test','다른 보호자');let invite=await call(page.request,'invite.issue',{consent:true});await call(b.request,'family.join',{code:invite.code});
  const am=await call(page.request,'me'),bm=await call(b.request,'me');
  for(const [title,assigneeId] of [['내 수업',am.id],['가족 수업',bm.id]])await call(page.request,'items.create',{kind:'REPEAT',data:{title,assigneeId,date:koreaToday(),weekdays:[1],startTime:'09:00',endTime:'10:00'}});
  await call(page.request,'items.create',{kind:'REPEAT',data:{title:'함께하는 일정',allMembers:true,date:koreaToday(),weekdays:[1],startTime:'11:00',endTime:'12:00'}});
  await page.goto('/timetable');await selected(page,'기본 보호자');await expect(filters(page).getByRole('button',{name:'전체 보기',exact:true})).toHaveCount(0);await expect(page.locator('.timetable-title').filter({hasText:'내 수업'})).toHaveCount(1);await expect(page.locator('.timetable-title').filter({hasText:'가족 수업'})).toHaveCount(0);await expect(page.locator('.timetable-title').filter({hasText:'함께하는 일정'})).toHaveCount(1);
  await filters(page).getByRole('button',{name:'기본 보호자',exact:true}).click();await selected(page,'기본 보호자');await expect(page.locator('.timetable-preference-message[role=status]')).toContainText('한 명 이상');
  await filters(page).getByRole('button',{name:'다른 보호자',exact:true}).click();await selected(page,'기본 보호자');await selected(page,'다른 보호자');await expect(page.locator('.timetable-title').filter({hasText:'내 수업'})).toHaveCount(1);await expect(page.locator('.timetable-title').filter({hasText:'가족 수업'})).toHaveCount(1);await expect(page.locator('.timetable-title').filter({hasText:'함께하는 일정'})).toHaveCount(1);await page.reload();await selected(page,'기본 보호자');await selected(page,'다른 보호자',false);
  await filters(page).getByRole('button',{name:'다른 보호자',exact:true}).click();await page.getByRole('button',{name:'첫 화면으로 저장',exact:true}).click();await expect(page.locator('.timetable-preference')).toContainText('첫 화면으로 설정됨');expect((await call(page.request,'me')).timetableMemberIds).toEqual([am.id,bm.id]);
  for(const width of [320,820,1440]){await page.setViewportSize({width,height:900});await page.reload();await selected(page,'기본 보호자');await selected(page,'다른 보호자');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('.timetable-scroll').evaluate(node=>{node.scrollTop=120;});await page.screenshot({path:`test-results/ui113-timetable-multiple-${width}.png`,animations:'disabled'});}
  await signIn(other,'tt-pref-a@example.test');await other.goto('/timetable');await selected(other,'기본 보호자');await selected(other,'다른 보호자');
  await b.goto('/timetable');await selected(b,'다른 보호자');await filters(b).getByRole('button',{name:'기본 보호자',exact:true}).click();await filters(b).getByRole('button',{name:'다른 보호자',exact:true}).click();await selected(b,'다른 보호자',false);await b.getByRole('button',{name:'첫 화면으로 저장',exact:true}).click();await expect(b.locator('.timetable-preference')).toContainText('첫 화면으로 설정됨');expect((await call(b.request,'me')).timetableMemberId).toBe(am.id);expect((await call(page.request,'me')).timetableMemberIds).toEqual([am.id,bm.id]);
  await page.request.post('/api/auth/sign-out',{headers:{Origin:origin},data:{}});await signIn(page,'tt-pref-b@example.test');await page.goto('/timetable');await selected(page,'기본 보호자');await selected(page,'다른 보호자',false);
  await filters(page).getByRole('button',{name:'다른 보호자',exact:true}).click();await page.route('**/api/v1/workspace/member-filter.preference.save',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'저장 연결을 다시 확인해 주세요.'}})}));await page.getByRole('button',{name:'첫 화면으로 저장',exact:true}).click();await expect(page.locator('.timetable-preference-message[role=alert]')).toContainText('다시 확인');expect((await call(page.request,'me')).timetableMemberId).toBe(am.id);await page.unroute('**/api/v1/workspace/member-filter.preference.save');await page.reload();await selected(page,'기본 보호자');await selected(page,'다른 보호자',false);
  await page.goto('/today/calendar');await expect(page.getByRole('group',{name:'달력 구성원 필터',exact:true}).getByRole('button',{name:'전체 보기',exact:true})).toHaveCount(0);
 }finally{await bContext.close();await otherContext.close();}
});

test('child saves multiple members and a disconnected target is removed from the combination',async({page,browser})=>{
 const childContext=await browser.newContext({baseURL:origin,viewport:{width:390,height:900}}),child=await childContext.newPage();
 try{
  await parent(page,'tt-pref-child-parent@example.test','연결 보호자');const invite=await call(page.request,'invite.issue',{consent:true});await call(child.request,'child.signup',{loginId:'tt_pref_child',name:'선택 자녀',password,code:invite.code});
  const am=await call(page.request,'me'),cm=await call(child.request,'me');await child.goto('/timetable');await selected(child,'선택 자녀');await filters(child).getByRole('button',{name:'연결 보호자',exact:true}).click();await child.getByRole('button',{name:'첫 화면으로 저장',exact:true}).click();await expect(child.locator('.timetable-preference')).toContainText('첫 화면으로 설정됨');await child.reload();await selected(child,'연결 보호자');await selected(child,'선택 자녀');expect((await call(child.request,'me')).timetableMemberIds).toHaveLength(2);
  await page.goto('/timetable');await filters(page).getByRole('button',{name:'선택 자녀',exact:true}).click();await page.getByRole('button',{name:'첫 화면으로 저장',exact:true}).click();await expect(page.locator('.timetable-preference')).toContainText('첫 화면으로 설정됨');
  await call(page.request,'family.remove',{familyId:am.family.id,profileId:cm.id,version:am.family.members.find((m:any)=>m.id===cm.id).version});await page.reload();await child.reload();await selected(page,'연결 보호자');await selected(child,'선택 자녀');await expect(filters(child).getByRole('button')).toHaveCount(1);
  await child.getByRole('button',{name:'어둡게',exact:true}).click();await child.screenshot({path:'test-results/ui113-child-multiple-dark.png',animations:'disabled'});
 }finally{await childContext.close();}
});
