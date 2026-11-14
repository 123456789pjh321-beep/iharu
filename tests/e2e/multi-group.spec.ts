import {test,expect,type Page} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174',password='multi-group-browser-2026';
test.use({baseURL:origin,viewport:{width:520,height:900},reducedMotion:'reduce'});
const nav=(page:Page)=>page.getByRole('navigation',{name:'모바일 주 메뉴'});
const filter=(page:Page)=>page.getByRole('group',{name:'조회할 그룹',exact:true});
async function register(page:Page,name:string){
 const email='groups-'+crypto.randomUUID()+'@example.test';const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,password,name,callbackURL:'/login?verified=1'}});expect(signup.ok(),await signup.text()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
}
async function command(page:Page,op:string,data:object={}){const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
const memo=(title:string)=>({id:crypto.randomUUID(),version:0,title,body:'공간별로 분리한 기록',date:koreaToday(),time:'09:00',category:'DAILY',tags:[],place:'',location:null,visibility:'GROUP',photos:[]});

test('creates groups from the menu, accepts an invitation without leaving another group and never shares personal records',async({page,browser})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const context=await browser.newContext({baseURL:origin,viewport:{width:520,height:900},reducedMotion:'reduce'}),guest=await context.newPage();
 try{
  await register(page,'그룹장');await command(page,'memos.save',memo('그룹장의 개인 기록'));
  await page.goto('/family');await expect(page.getByRole('region',{name:'개인 공간'})).toContainText('나만 보는');
  await page.getByRole('button',{name:'새 그룹 만들기',exact:true}).click();const editor=page.getByRole('dialog',{name:'새 그룹 만들기'});await expect(editor.getByLabel('그룹 이름')).toHaveValue('기본그룹');await editor.getByRole('button',{name:'그룹 만들기',exact:true}).click();
  const card=page.getByRole('region',{name:'기본그룹 그룹 상세',exact:true});await expect(card).toBeVisible();await card.getByRole('button',{name:'구성원 초대',exact:true}).click();const link=page.getByLabel('발급한 그룹 초대 링크');await expect(link).toBeVisible();const url=await link.inputValue();await page.getByRole('button',{name:'초대 닫기'}).click();
  await register(guest,'구성원');await command(guest,'memos.save',memo('구성원의 개인 기록'));await command(guest,'group.create',{name:'친구 모임',description:'',color:1,clientRequestId:crypto.randomUUID()});
  await guest.goto(url);await guest.getByRole('button',{name:'초대 수락',exact:true}).click();await guest.getByRole('link',{name:'그룹 관리 열기'}).click();await expect(guest.locator('.managed-group')).toHaveCount(2);
  await nav(page).getByRole('link',{name:'타임라인',exact:true}).click();await expect(page.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'새글 등록',exact:true}).click();const entry=page.getByRole('dialog',{name:'메모 작성'});await entry.getByLabel('제목',{exact:true}).fill('기본그룹 공유 기록');await entry.getByLabel('공유 범위').selectOption('GROUP');await entry.getByRole('button',{name:'메모 저장'}).click();await expect(page.getByRole('article',{name:'기본그룹 공유 기록',exact:true})).toBeVisible();
  await nav(guest).getByRole('link',{name:'타임라인',exact:true}).click();await expect(guest.getByRole('article',{name:'기본그룹 공유 기록',exact:true})).toBeVisible();await expect(guest.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toHaveCount(0);
  await filter(guest).getByRole('button',{name:'개인',exact:true}).click();await expect(guest.getByRole('article',{name:'구성원의 개인 기록',exact:true})).toBeVisible();await expect(guest.getByRole('article',{name:'기본그룹 공유 기록',exact:true})).toHaveCount(0);
  await filter(guest).getByRole('button',{name:'친구 모임',exact:true}).click();await expect(guest.getByRole('article',{name:'구성원의 개인 기록',exact:true})).toHaveCount(0);await guest.reload();await expect(filter(guest).getByRole('button',{name:'친구 모임',exact:true})).toHaveAttribute('aria-pressed','true');
  await filter(page).getByRole('button',{name:'개인',exact:true}).click();await expect(page.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toBeVisible();await page.getByRole('button',{name:'새글 등록',exact:true}).click();await expect(page.getByLabel('공유 범위').locator('option')).toHaveCount(1);await page.getByRole('button',{name:'메모 작성 닫기'}).click();
  // A private unfinished draft cannot be restored in a group editor.
  const me=await command(page,'me');
  await page.evaluate(({id,draft})=>sessionStorage.setItem('iharu-memo-draft:'+id,JSON.stringify({draft,expiresAt:Date.now()+86400000})),{id:me.id,draft:memo('개인 임시 글')});
  await page.getByRole('button',{name:'새글 등록',exact:true}).click();
  await expect(page.getByLabel('제목',{exact:true})).toHaveValue('개인 임시 글');
  await expect(page.getByLabel('공유 범위')).toHaveValue('PRIVATE');
  await page.reload();
  await expect(page.getByRole('article',{name:'그룹장의 개인 기록',exact:true})).toBeVisible();
  await filter(page).getByRole('button',{name:'기본그룹',exact:true}).click();await page.getByRole('button',{name:'새글 등록',exact:true}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'메모 작성 닫기'}).click();
  await filter(page).getByRole('button',{name:'개인',exact:true}).click();await page.getByRole('button',{name:'새글 등록',exact:true}).click();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('개인 임시 글');
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'메모 작성 닫기'}).click();
  await nav(page).getByRole('link',{name:'그룹관리',exact:true}).click();await page.getByRole('region',{name:'기본그룹 그룹',exact:true}).locator('.group-card-title').click();await expect(card.locator('.group-member-list .group-member-row')).toHaveCount(2);
  await card.locator('.group-manage-options summary').click();page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'구성원 내보내기',exact:true}).click();await expect(card.locator('.group-member-list .group-member-row')).toHaveCount(1);
  await guest.reload();expect((await command(guest,'me')).groups.map((g:{name:string})=>g.name)).toEqual(['친구 모임']);
  await filter(guest).getByRole('button',{name:'개인',exact:true}).click();await expect(guest.getByRole('article',{name:'구성원의 개인 기록',exact:true})).toBeVisible();expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('keeps seven navigation items, shared group filters and management sheets usable at mobile and tablet sizes',async({page})=>{
 test.setTimeout(120000);await register(page,'화면검증');
 for(const [i,name] of ['기본그룹','우리 가족','학교 친구 모임'].entries())await command(page,'group.create',{name,color:i,description:'선택한 그룹 안에서만 함께 보는 자료',clientRequestId:crypto.randomUUID()});
 await page.goto('/family');
 await expect(nav(page).getByRole('link')).toHaveText(['시간표','달력','가계부','타임라인','그룹관리','대화','더보기']);
 for(const width of [320,520,820,1440]){
  await page.setViewportSize({width,height:900});await expect(page.getByRole('heading',{name:/^내 그룹/})).toBeVisible();await expect(page.locator('#app-launch')).toBeHidden();await expect(page.locator('.group-management>.workspace-toolbar')).toHaveCount(0);const firstRow=(await page.locator('.managed-group .group-card-title').first().boundingBox())!;expect(firstRow.x).toBeLessThanOrEqual(12);expect(width-firstRow.x-firstRow.width).toBeLessThanOrEqual(12);expect(firstRow.y).toBeLessThan(40);await page.screenshot({path:`test-results/groups-management-${width}.png`,animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  await page.getByRole('button',{name:'새 그룹 만들기',exact:true}).click();const dialog=page.getByRole('dialog',{name:'새 그룹 만들기'});await expect(dialog).toBeVisible();const bounds=(await dialog.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);await page.screenshot({path:`test-results/groups-editor-${width}.png`,animations:'disabled'});await dialog.getByRole('button',{name:'취소',exact:true}).click();
  for(const label of ['시간표','달력','가계부','타임라인']){await nav(page).getByRole('link',{name:label,exact:true}).click();await expect(filter(page)).toBeVisible();await expect(filter(page).getByRole('button',{name:'학교 친구 모임',exact:true})).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);await expect(page.locator('.workspace-topbar-content[aria-busy=false]')).toHaveCount(1);await expect(page.getByRole('region',{name:'그룹 선택',exact:true})).toHaveCount(1);await expect(page.locator('.member-preference-row .group-invite-shortcut')).toBeVisible();const upper=(await page.locator('.group-add-shortcut').boundingBox())!,lower=(await page.locator('.member-preference-row .group-invite-shortcut').boundingBox())!;expect(Math.abs(upper.x-lower.x)).toBeLessThan(1);expect(Math.abs(upper.width-lower.width)).toBeLessThan(1);await expect(page.locator('.group-manage-shortcut')).toHaveCount(0);}
  await expect(page.getByRole('region',{name:'샘플 메모',exact:true})).toBeVisible();await page.screenshot({path:`test-results/groups-timeline-${width}.png`,animations:'disabled'});await nav(page).getByRole('link',{name:'그룹관리',exact:true}).click();
 }
 await page.evaluate(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'dark',quiet:true,font:'noto'})));await page.reload();await page.setViewportSize({width:320,height:900});await expect(page.locator('.managed-group')).toHaveCount(3);await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.locator('#app-launch')).toBeHidden();await page.screenshot({path:'test-results/groups-dark-320.png',animations:'disabled'});
});

test('personal space hides member invitation, group plus creates explicitly and list settings persist',async({page})=>{
 test.setTimeout(120000);await register(page,'그룹목록검사');
 let issued=0;page.on('request',r=>{if(r.url().endsWith('/workspace/invite.link.issue'))issued++;});
 for(const path of ['/timetable','/today/calendar','/tuition','/timeline']){
  await page.goto(path);await expect(filter(page).getByRole('button',{name:'개인',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.member-preference-row .group-invite-shortcut')).toHaveCount(0);
  const row=page.getByRole('region',{name:'그룹 선택',exact:true});
  const plus=row.getByRole('button',{name:'새 그룹 만들기',exact:true});await expect(plus).toBeVisible();
  const a=(await plus.boundingBox())!,b=(await filter(page).getByRole('button',{name:'개인',exact:true}).boundingBox())!;
  expect(a.x+a.width).toBeLessThanOrEqual(b.x);expect(Math.abs(a.y+a.height/2-b.y-b.height/2)).toBeLessThan(2);
  await plus.click();await expect(page.getByRole('dialog',{name:'새 그룹 만들기',exact:true})).toBeVisible();await expect(page).toHaveURL(origin+path);await page.getByRole('button',{name:'취소',exact:true}).click();await expect(plus).toBeFocused();await expect(page).toHaveURL(origin+path);
 }
 expect(issued).toBe(0);expect((await command(page,'me')).groups).toHaveLength(0);
 await page.getByRole('button',{name:'새 그룹 만들기',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'새 그룹 만들기'});await editor.getByLabel('그룹 이름',{exact:true}).fill('우리 가족');await editor.getByRole('button',{name:'파랑',exact:true}).click();await editor.getByRole('button',{name:'그룹 만들기',exact:true}).click();
 await expect(page).toHaveURL(origin+'/timeline');await expect(filter(page).getByRole('button',{name:'우리 가족',exact:true})).toHaveAttribute('aria-pressed','true');
 await nav(page).getByRole('link',{name:'그룹관리',exact:true}).click();await page.locator('.managed-group .group-card-title').click();
 const detail=page.locator('.group-detail');await expect(detail.getByRole('heading',{name:'우리 가족',exact:true})).toBeVisible();await expect(detail.getByRole('button',{name:'구성원 초대',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/group-detail-520.png',animations:'disabled'});expect(issued).toBe(0);expect((await command(page,'me')).groups).toHaveLength(1);
 await detail.getByRole('button',{name:'그룹 설정',exact:true}).click();const settings=page.getByRole('dialog',{name:'그룹 설정'});await settings.getByLabel('그룹 이름',{exact:true}).fill('가족의 하루');await settings.getByRole('button',{name:'변경 저장'}).click();await expect(detail.getByRole('heading',{name:'가족의 하루',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'그룹 목록',exact:true}).click();await expect(page.locator('.managed-group')).toHaveCount(1);await expect(page.getByRole('button',{name:'구성원 초대',exact:true})).toHaveCount(0);await expect(page.getByLabel('일반 초대 링크')).toHaveCount(0);await page.reload();await expect(page.locator('.managed-group')).toContainText('가족의 하루');
 await page.locator('.managed-group .group-card-title').click();await page.getByRole('button',{name:'그룹 열기',exact:true}).click();
 for(const label of ['시간표','달력','가계부','타임라인']){
  await nav(page).getByRole('link',{name:label,exact:true}).click();await expect(page.locator('.member-preference-row .group-invite-shortcut')).toBeVisible();
  await filter(page).getByRole('button',{name:'개인',exact:true}).click();await expect(filter(page).getByRole('button',{name:'개인',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.member-preference-row .group-invite-shortcut')).toHaveCount(0);
  await filter(page).getByRole('button',{name:'가족의 하루',exact:true}).click();await expect(page.locator('.member-preference-row .group-invite-shortcut')).toBeVisible();
 }
 await expect(page.getByRole('region',{name:'샘플 메모',exact:true})).toBeVisible();await page.screenshot({path:'test-results/group-plus-and-members.png',animations:'disabled'});
 await filter(page).getByRole('button',{name:'개인',exact:true}).click();await page.reload();await expect(filter(page).getByRole('button',{name:'개인',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('region',{name:'샘플 메모',exact:true})).toBeVisible();await expect(page.locator('#app-launch')).toBeHidden();await expect(page.locator('.member-preference-row .group-invite-shortcut')).toHaveCount(0);await page.screenshot({path:'test-results/personal-without-member-invite.png',animations:'disabled'});expect(issued).toBe(0);
});

test('late invitation responses never replace the currently selected group link',async({page})=>{
 await register(page,'초대공간검사');
 const a=(await command(page,'group.create',{name:'첫 그룹',description:'',color:0,clientRequestId:crypto.randomUUID()})).group;
 const b=(await command(page,'group.create',{name:'다음 그룹',description:'',color:1,clientRequestId:crypto.randomUUID()})).group;
 await command(page,'group.select',{groupId:a.id});await page.goto('/timetable');
 let release!:()=>void,started!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;}),pending=new Promise<void>(resolve=>{started=resolve;});let first=true;
 await page.route('**/workspace/invite.link.issue',async route=>{
  if(first){first=false;const response=await route.fetch();started();await hold;await route.fulfill({response});}
  else await route.continue();
 });
 try{
  await page.locator('.member-preference-row .group-invite-shortcut').click();await pending;
  await page.getByRole('button',{name:'그룹 초대 닫기'}).click();await filter(page).getByRole('button',{name:'다음 그룹',exact:true}).click();
  await page.locator('.member-preference-row .group-invite-shortcut').click();const field=page.getByLabel('발급한 그룹 초대 링크');await expect(field).toBeVisible();const link=await field.inputValue();
  const late=page.waitForResponse(r=>r.url().endsWith('/workspace/invite.link.issue')&&r.request().postDataJSON().groupId===a.id);release();await late;await expect(field).toHaveValue(link);await expect(page.locator('.group-invite-target')).toContainText('다음 그룹');
  const inspected=await command(page,'invite.link.inspect',{token:new URL(link).hash.slice(1)});expect(inspected.familyId).toBe(b.id);
 }finally{release();}
});


test('group switches retain topbar and bottom navigation without document reloads',async({page})=>{
 test.setTimeout(120000);await register(page,'고정화면검사');
 for(const name of ['그룹 하나','그룹 둘'])await command(page,'group.create',{name,color:0,description:'',clientRequestId:crypto.randomUUID()});
 for(const path of ['/timetable','/today/calendar','/tuition','/timeline']){
  await page.goto(path);await expect(page.locator('.workspace-topbar-content[aria-busy=false]')).toHaveCount(1);
  await page.evaluate(()=>Object.assign(window,{fixedChrome:{bar:document.querySelector('[data-workspace-topbar]'),toolbar:document.querySelector('.workspace-topbar .workspace-toolbar'),nav:document.querySelector('.workspace-mobile-nav'),plus:document.querySelector('.group-add-shortcut')}}));
  const bar=page.locator('[data-workspace-topbar]'),beforeBar=(await bar.boundingBox())!,beforeNav=(await nav(page).boundingBox())!;
  let documents=0,bootstrap=0;const observe=(r:import('@playwright/test').Request)=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;if(/\/api\/(health|account\/session)$/.test(r.url()))bootstrap++;};page.on('request',observe);
  const selected=await filter(page).locator('[aria-pressed=true]').innerText();
  for(const name of ['개인','그룹 하나','그룹 둘'].filter(name=>name!==selected)){
   let release!:()=>void,started!:()=>void;const held=new Promise<void>(r=>{release=r;}),pending=new Promise<void>(r=>{started=r;});
   const handler=async(route:import('@playwright/test').Route)=>{const response=await route.fetch();started();await held;await route.fulfill({response});};await page.route('**/workspace/group.select',handler);
   try{
    await filter(page).getByRole('button',{name,exact:true}).click();await pending;
    await expect(page.locator('.workspace-topbar-content')).toHaveAttribute('aria-busy','true');await expect(bar).toBeVisible();await expect(nav(page)).toBeVisible();
    expect(await page.evaluate(()=>{const w=window as unknown as {fixedChrome:{bar:Element;toolbar:Element;nav:Element;plus:Element}};return w.fixedChrome.bar===document.querySelector('[data-workspace-topbar]')&&w.fixedChrome.toolbar===document.querySelector('.workspace-topbar .workspace-toolbar')&&w.fixedChrome.nav===document.querySelector('.workspace-mobile-nav')&&w.fixedChrome.plus===document.querySelector('.group-add-shortcut');})).toBe(true);
    const busyBar=(await bar.boundingBox())!,busyNav=(await nav(page).boundingBox())!;expect(busyBar.y).toBe(beforeBar.y);expect(busyBar.height).toBe(beforeBar.height);expect(busyNav.y).toBe(beforeNav.y);
    release();await expect(filter(page).getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.workspace-topbar-content[aria-busy=false]')).toHaveCount(1);
    expect(await page.evaluate(()=>{const w=window as unknown as {fixedChrome:{bar:Element;toolbar:Element;nav:Element;plus:Element}};return w.fixedChrome.bar===document.querySelector('[data-workspace-topbar]')&&w.fixedChrome.toolbar===document.querySelector('.workspace-topbar .workspace-toolbar')&&w.fixedChrome.nav===document.querySelector('.workspace-mobile-nav')&&w.fixedChrome.plus===document.querySelector('.group-add-shortcut');})).toBe(true);
    await expect(page).toHaveURL(origin+path);
   }finally{release();await page.unroute('**/workspace/group.select',handler);}
  }
  page.off('request',observe);expect(documents).toBe(0);expect(bootstrap).toBe(0);
 }
});
