import {closeMemberPreferences,openMemberPreferences,selectAllMembers,saveMemberPreference,workspaceGroupButton} from '../helpers/workspace-ui';
import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174',password='shared-filter-fixture-2026';test.use({baseURL:origin,reducedMotion:'reduce'});
async function call(client:APIRequestContext,op:string,data:object={}){const r=await client.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
async function login(page:Page,email:string){expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);}
async function parent(page:Page,email:string,name:string){expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name,password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);const mail=await(await page.request.get('/__test__/mail')).json();await page.request.get(mail.find((m:{to:string})=>m.to===email).url);await login(page,email);}
test('calendar and tuition share multiple-member controls, save independently across devices and keep temporary filters private',async({page,browser})=>{
 test.setTimeout(90000);const context=await browser.newContext({baseURL:origin}),otherContext=await browser.newContext({baseURL:origin}),b=await context.newPage(),other=await otherContext.newPage();
 try{
  await parent(page,'shared-filter-a@example.test','필터 A');await parent(b,'shared-filter-b@example.test','필터 B');const invite=await call(page.request,'invite.issue',{consent:true});await call(b.request,'family.join',{code:invite.code});const am=await call(page.request,'me'),bm=await call(b.request,'me');
  for(const [name,id,amount] of [['A',am.id,100000],['B',bm.id,200000]] as const){await call(page.request,'items.create',{kind:'EVENT',data:{title:name+' 약속',date:koreaToday(),allDay:true,assigneeId:id}});await call(page.request,'items.create',{kind:'FEE',data:{title:name+' 수업',date:koreaToday(),amount,assigneeId:id,feeFrequency:'ONCE',paid:true}});}
  const member=(p:Page,name:string)=>p.getByRole('dialog',{name:'조회할 구성원'}).getByRole('button',{name,exact:true});
  await page.goto('/today/calendar');await openMemberPreferences(page);
  await expect(member(page,'필터 A')).toHaveAttribute('aria-pressed','true');
  await selectAllMembers(page);await expect(page.locator('.calendar-event')).toHaveCount(2);await saveMemberPreference(page);
  await page.goto('/tuition');await openMemberPreferences(page);
  await expect(member(page,'필터 B')).toHaveAttribute('aria-pressed','false');
  await selectAllMembers(page);await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('300,000원');
  await saveMemberPreference(page);
  await openMemberPreferences(page);await member(page,'필터 A').click();await closeMemberPreferences(page);
  await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('200,000원');
  await page.reload();await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('300,000원');
  await page.goto('/today/calendar');await openMemberPreferences(page);await member(page,'필터 A').click();await saveMemberPreference(page);
  const calendar=await openMemberPreferences(page);
  await expect(calendar.locator('.timetable-preference')).toContainText('설정됨');
  await member(page,'필터 B').click();await expect(calendar.locator('.timetable-preference-message')).toContainText('한 명 이상');
  await closeMemberPreferences(page);
  await login(other,'shared-filter-a@example.test');await other.goto('/today/calendar');await openMemberPreferences(other);
  await expect(member(other,'필터 A')).toHaveAttribute('aria-pressed','false');await expect(member(other,'필터 B')).toHaveAttribute('aria-pressed','true');
  await other.goto('/tuition');await expect(other.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('300,000원');
  await page.goto('/timetable');await openMemberPreferences(page);await expect(member(page,'필터 B')).toHaveAttribute('aria-pressed','false');
  await selectAllMembers(page);await openMemberPreferences(page);await expect(member(page,'필터 B')).toHaveAttribute('aria-pressed','true');
  await closeMemberPreferences(page);
  for(const path of ['/today/calendar','/tuition']){
   await page.goto(path);
   for(const width of [320,820,1440]){
    await page.setViewportSize({width,height:1000});const trigger=workspaceGroupButton(page);await expect(trigger).toBeVisible();
    const chooser=await openMemberPreferences(page);await expect(chooser.getByRole('button',{name:'전체선택',exact:true})).toBeVisible();await chooser.getByRole('button',{name:'전체선택',exact:true}).click();await chooser.getByRole('button',{name:'선택 완료',exact:true}).click();await expect(trigger).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }
  }
  expect((await call(b.request,'me')).memberFilterPreferences.calendar).toEqual([bm.id]);
 }finally{await context.close();await otherContext.close();}
});
