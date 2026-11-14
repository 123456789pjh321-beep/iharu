import {koreaToday} from '../../shared/schedules';
import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
async function parentLogin(page:Page,request:APIRequestContext,email:string){
 const password='new-parent-fixture-password';
 const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'가상 일반사용자',password,callbackURL:'/login?verified=1'}});
 expect(signup.ok(),await signup.text()).toBe(true);
 const mails=await(await request.get('/__test__/mail')).json();
 await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 const login=await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
 expect(login.ok(),await login.text()).toBe(true);
 await page.goto('/timetable');
 await expect(page.locator('.personal-timetable')).toBeVisible();
}

test('existing child account → login → shared read-only data → removal preserves own data',async({page,browser,request})=>{
 test.setTimeout(90000);await parentLogin(page,request,'ui76-parent@example.test');
 await page.goto('/today/calendar');await page.locator('.calendar-cell[data-date="'+koreaToday()+'"] .calendar-day-target').click({position:{x:12,y:12}});await page.getByRole('button',{name:'이 날짜에 일정 추가',exact:true}).click();await page.getByLabel('제목',{exact:true}).fill('일반사용자 개인 일정');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('일반사용자 개인 일정',{exact:true})).toBeVisible();
 await page.goto('/family');const invitation=await page.request.post('/api/v1/workspace/invite.issue',{headers:{Origin:origin},data:{consent:true}});expect(invitation.ok()).toBe(true);const {code}=await invitation.json();
 const ctx=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}}),child=await ctx.newPage();try{
 const legacyAccount=await ctx.request.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{code,name:'가상 서준',loginId:'ui76_child',password:'child-password-2026'}});expect(legacyAccount.ok()).toBe(true);
 await ctx.clearCookies();
 const login=await ctx.request.post('/api/v1/workspace/child.login',{headers:{Origin:origin},data:{loginId:'ui76_child',password:'child-password-2026'}});
 expect(login.ok(),await login.text()).toBe(true);
 await child.goto('/timetable');await expect(child.locator('.personal-timetable')).toBeVisible();
 await child.goto(origin+'/chat');await expect(child.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'대화',exact:true})).toHaveAttribute('aria-current','page');
 const groupEvent=await page.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'EVENT',data:{title:'그룹 공유 일정',date:koreaToday(),allDay:true,allMembers:true}}});
 expect(groupEvent.ok()).toBe(true);
 await child.goto(origin+'/today/calendar');await expect(child.getByText('일반사용자 개인 일정',{exact:true})).toHaveCount(0);await child.getByRole('button',{name:/그룹 공유 일정 · 종일.* · 상세$/}).click();await expect(child.getByLabel('제목',{exact:true})).toBeDisabled();await expect(child.getByRole('button',{name:'저장',exact:true})).toHaveCount(0);await child.getByRole('button',{name:'편집 닫기'}).click();await expect(child.getByRole('dialog')).toHaveCount(0);
 await child.locator('.calendar-cell[data-date="'+koreaToday()+'"] .calendar-day-target').click({position:{x:12,y:12}});await child.getByRole('button',{name:'이 날짜에 일정 추가',exact:true}).click();await child.getByLabel('제목',{exact:true}).fill('어린이 개인 일정');await child.getByRole('button',{name:'저장',exact:true}).click();await expect(child.getByText('어린이 개인 일정',{exact:true})).toBeVisible();
 await page.goto('/today/repeats');await page.getByRole('button',{name:'일정 추가',exact:true}).click();await page.getByRole('radio',{name:'가상 서준',exact:true}).check();await page.getByLabel('제목',{exact:true}).fill('서준 대상 반복 일정');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.personal-assignee')).toHaveText('가상 서준');
 await page.goto('/family');await page.locator('.managed-group .group-card-title').click();await expect(page.locator('.group-member-list .group-member-row').filter({hasText:'가상 서준'})).toBeVisible();await page.locator('.group-manage-options summary').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'가상 서준 내보내기'}).click();await expect(page.locator('.group-member-list .group-member-row').filter({hasText:'가상 서준'})).toHaveCount(0);
 await child.reload();await expect(child.getByText('일반사용자 개인 일정',{exact:true})).toHaveCount(0);await expect(child.getByText('어린이 개인 일정',{exact:true})).toBeVisible();expect((await ctx.cookies()).find(c=>c.name==='iharu-space')).toMatchObject({httpOnly:true,sameSite:'Strict'});
 }finally{await ctx.close().catch(()=>{});}
});
for(const width of [320,390,768,1440])test(`signup fields and personal workspace remain reachable at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:900});for(const path of ['/login','/login?role=child']){await page.goto(path);const login=await page.getByRole('button',{name:path.includes('child')?'로그인':'로그인',exact:true}).boundingBox(),signup=await page.getByRole('link',{name:'회원가입',exact:true}).boundingBox();expect(signup!.y).toBeGreaterThanOrEqual(login!.y+login!.height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await page.goto('/signup?role=child');await expect(page.getByRole('heading',{name:'회원가입',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'만 14세 미만',exact:true})).toBeVisible();await expect(page.getByLabel('이메일',{exact:true})).toHaveCount(0);
 await parentLogin(page,request,`ui76-align-${width}@example.test`);
 await expect(page.locator('[data-timetable-date]')).toHaveCount(7);await expect(page.locator('[data-home-section]')).toHaveCount(0);
 await expect(page.getByRole('navigation',{name:'오늘 화면 보기'})).toHaveCount(0);
 if(width<=760)await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link')).toHaveText(['시간표','달력','가계부','타임라인','그룹관리','대화','더보기']);
 await expect(page.locator('[data-home-section="chat"],.personal-chat')).toHaveCount(0);await expect(page.getByLabel('참여자에게 전할 말')).toHaveCount(0);await page.goto('/chat');await expect(page.getByRole('button',{name:'이모티콘',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'그림 메시지',exact:true}).click();await page.getByRole('button',{name:'안녕 그림 선택'}).click();await expect(page.getByLabel('참여자에게 전할 말')).toHaveValue('');const buttons=await page.locator('.conversation-sticker-tray button').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width})));expect(new Set(buttons.map(b=>b.y)).size).toBeLessThanOrEqual(2);expect(buttons.every(b=>b.width>=44)).toBe(true);await page.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(page.locator('.group-chat-history').getByRole('img',{name:'안녕',exact:true})).toBeVisible();
 for(const path of ['/today/calendar','/today/repeats','/tuition','/records','/family']){await page.goto(path);await expect(page.locator('.personal-context')).toHaveCount(0);await expect(page.locator('.workspace-page')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
