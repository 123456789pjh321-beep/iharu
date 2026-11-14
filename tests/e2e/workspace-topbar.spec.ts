import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {koreaToday} from '../../shared/schedules';
const origin='http://127.0.0.1:4174',password='persistent-topbar-fixture-2026';
test.use({baseURL:origin,viewport:{width:520,height:900}});
const nav=(page:Page)=>page.getByRole('navigation',{name:'모바일 주 메뉴'});
const bar=(page:Page)=>page.locator('[data-workspace-topbar]');
async function command(client:APIRequestContext,op:string,data:object={}){
 const r=await client.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();
}
async function register(page:Page,name:string){
 const email=name+'@example.test';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name,password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
}
async function rememberChrome(page:Page){
 await expect(bar(page).locator('.workspace-topbar-content[aria-busy=false]')).toHaveCount(1);
 await page.evaluate(()=>Object.assign(window,{topbarNode:document.querySelector('[data-workspace-topbar]'),toolbarNode:document.querySelector('.workspace-toolbar'),navNode:document.querySelector('.workspace-mobile-nav')}));
}
async function unchangedChrome(page:Page){
 expect(await page.evaluate(()=>{const w=window as unknown as {topbarNode:Element;toolbarNode:Element;navNode:Element};return w.topbarNode===document.querySelector('[data-workspace-topbar]')&&w.toolbarNode===document.querySelector('.workspace-toolbar')&&w.navNode===document.querySelector('.workspace-mobile-nav');})).toBe(true);
 expect(await bar(page).evaluate(node=>!node.closest('.auth-panel')&&node.getAnimations().length===0&&getComputedStyle(node).opacity==='1')).toBe(true);
 await expect(page.locator('.workspace-toolbar')).toHaveCount(1);
}

test('keeps the same top and bottom chrome across all four menus without changing its responsive design',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/timetable');await expect(page.locator('.timetable-grid')).toBeVisible();await rememberChrome(page);
 for(const width of [320,520,1440]){
  await page.setViewportSize({width,height:900});
  for(const [label,path] of [['달력','/today/calendar'],['가계부','/tuition'],['타임라인','/timeline'],['시간표','/timetable']]){
   await nav(page).getByRole('link',{name:label,exact:true}).click();await expect(bar(page).locator('[data-topbar-route]')).toHaveAttribute('data-topbar-route',path);await expect(bar(page).locator('.workspace-topbar-content[aria-busy=false]')).toHaveCount(1);
   await unchangedChrome(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
   expect((await bar(page).boundingBox())!.y).toBeLessThanOrEqual(1);
   await page.screenshot({path:`test-results/topbar-${path.split('/').pop()}-${width}.png`,animations:'disabled'});
  }
 }
 await nav(page).getByRole('link',{name:'달력',exact:true}).click();await bar(page).getByLabel('달력 월 선택',{exact:true}).fill('2027-02');await expect(page.locator('[data-pager-current] .calendar-cell[data-date="2027-02-19"]')).toBeVisible();
 await bar(page).getByRole('button',{name:/구성원 필터 설정/}).click();await expect(page.getByRole('dialog',{name:'조회할 구성원'})).toBeVisible();
 // Browser back closes a filter sheet owned by the previous menu.
 await page.goBack();await expect(page).toHaveURL(origin+'/timetable');await expect(page.getByRole('dialog',{name:'조회할 구성원'})).not.toBeVisible();await unchangedChrome(page);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'dark',quiet:true,font:'noto'})));await page.reload();await page.setViewportSize({width:320,height:900});await rememberChrome(page);
 for(const [label,path] of [['달력','/today/calendar'],['가계부','/tuition'],['타임라인','/timeline'],['시간표','/timetable']]){await nav(page).getByRole('link',{name:label,exact:true}).click();await expect(bar(page).locator('[data-topbar-route]')).toHaveAttribute('data-topbar-route',path);await expect(bar(page).locator('.workspace-topbar-content[aria-busy=false]')).toHaveCount(1);await unchangedChrome(page);}
 await page.screenshot({path:'test-results/topbar-dark-320.png',animations:'disabled'});expect(errors).toEqual([]);
 await nav(page).getByRole('link',{name:'더보기',exact:true}).click();await expect(bar(page)).toHaveCount(0);await expect(page.locator('.more-screen')).toBeVisible();
});

test('uses each menu’s own saved members, current month actions and invitation context',async({page,browser})=>{
 test.setTimeout(120000);const context=await browser.newContext({baseURL:origin}),other=await context.newPage();
 try{
  await register(page,'topbar-host');await register(other,'topbar-member');const invite=await command(page.request,'invite.issue',{consent:true});await command(other.request,'family.join',{code:invite.code});
  const me=await command(page.request,'me'),member=await command(other.request,'me');
  for(const [scope,memberIds] of [['timetable',[me.id]],['calendar',[member.id]],['fees',[me.id,member.id]]] as const)await command(page.request,'member-filter.preference.save',{scope,memberIds});
  const today=koreaToday();
  for(const owner of [page,other])for(const kind of ['REPEAT','EVENT','FEE'])await command(owner.request,'items.create',{kind,data:{title:(owner===page?'내':'그룹')+' '+kind,date:today,weekdays:[new Date(today+'T12:00:00Z').getUTCDay()],startTime:'09:00',endTime:'10:00',amount:1000}});
  await page.goto('/timetable');await expect(bar(page).getByRole('group',{name:'시간표 구성원 필터',exact:true})).toBeVisible();await rememberChrome(page);
  const selected=async(label:string,host:boolean,guest:boolean)=>{const group=bar(page).getByRole('group',{name:label,exact:true});await expect(group.getByRole('button',{name:'topbar-host',exact:true})).toHaveAttribute('aria-pressed',String(host));await expect(group.getByRole('button',{name:'topbar-member',exact:true})).toHaveAttribute('aria-pressed',String(guest));};
  await selected('시간표 구성원 필터',true,false);await expect(page.locator('.timetable-title').filter({hasText:'내 REPEAT'})).toHaveCount(1);await expect(page.locator('.timetable-title').filter({hasText:'그룹 REPEAT'})).toHaveCount(0);
  await nav(page).getByRole('link',{name:'달력',exact:true}).click();await selected('달력 구성원 필터',false,true);await unchangedChrome(page);await expect(page.locator('[data-pager-current]')).toContainText('그룹 EVENT');await expect(page.locator('[data-pager-current]')).not.toContainText('내 EVENT');
  await bar(page).getByLabel('달력 월 선택',{exact:true}).fill('2027-02');await expect(page.locator('[data-pager-current] .calendar-cell[data-date="2027-02-19"]')).toBeVisible();
  await bar(page).getByRole('button',{name:/구성원 필터 설정/}).click();await page.getByRole('dialog',{name:'조회할 구성원'}).getByRole('button',{name:'topbar-host',exact:true}).click();await page.getByRole('dialog',{name:'조회할 구성원'}).getByRole('button',{name:/첫 화면으로 저장$/}).click();await expect(page.getByRole('dialog',{name:'조회할 구성원'}).getByRole('button',{name:/첫 화면으로 설정됨/})).toBeDisabled();await page.keyboard.press('Escape');
  await nav(page).getByRole('link',{name:'가계부',exact:true}).click();await selected('가계부 구성원 필터',true,true);await unchangedChrome(page);await bar(page).getByLabel('조회 월',{exact:true}).fill(today.slice(0,7));await expect(page.locator('[data-pager-current] .ledger-summary-expense dd')).toHaveText('2,000원');
  await nav(page).getByRole('link',{name:'타임라인',exact:true}).click();await selected('메모 작성자',true,true);await unchangedChrome(page);await bar(page).getByRole('group',{name:'메모 작성자',exact:true}).getByRole('button',{name:'topbar-host',exact:true}).click();await selected('메모 작성자',false,true);
  await bar(page).getByLabel('타임라인 조회 월').fill('2027-03');await expect(page.locator('[data-pager-current] .memo-empty')).toContainText('이번 달');
  await bar(page).getByRole('button',{name:'그룹 초대 공유',exact:true}).click();await expect(page.getByRole('dialog',{name:'그룹 초대 공유'})).toBeVisible();await expect(page.getByLabel('발급한 그룹 초대 링크',{exact:true})).toBeVisible();await page.getByRole('button',{name:'그룹 초대 닫기'}).click();
  await nav(page).getByRole('link',{name:'시간표',exact:true}).click();await selected('시간표 구성원 필터',true,false);await unchangedChrome(page);
  await nav(page).getByRole('link',{name:'달력',exact:true}).click();await selected('달력 구성원 필터',true,true);await unchangedChrome(page);
  const saved=await command(page.request,'me');expect(saved.memberFilterPreferences.timetable).toEqual([me.id]);expect(saved.memberFilterPreferences.calendar).toHaveLength(2);expect(saved.memberFilterPreferences.fees).toHaveLength(2);
 }finally{await context.close();}
});

test('retains inert chrome during slow navigation and keeps it fixed while content scrolls',async({page})=>{
 await register(page,'topbar-delay');const today=koreaToday();
 for(let i=0;i<14;i++)await command(page.request,'memos.save',{id:crypto.randomUUID(),version:0,title:'스크롤 기록 '+i,body:'고정된 상단바 확인',date:today,time:'09:00',category:'DAILY',tags:[],place:'',location:null,visibility:'PRIVATE',photos:[]});
 await page.goto('/timeline');await expect(page.getByRole('article',{name:'스크롤 기록 0',exact:true})).toBeVisible();await rememberChrome(page);
 const top=(await bar(page).boundingBox())!.y;await page.locator('.auth-panel').evaluate(node=>{node.scrollTop=500;});await expect.poll(()=>page.locator('.auth-panel').evaluate(node=>node.scrollTop)).toBeGreaterThan(100);expect((await bar(page).boundingBox())!.y).toBe(top);await unchangedChrome(page);
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/workspace/me',async route=>{await gate;await route.continue();});
 await nav(page).getByRole('link',{name:'시간표',exact:true}).click();await expect(bar(page).locator('.workspace-topbar-content[aria-busy=true][inert]')).toHaveCount(1);await unchangedChrome(page);await expect(bar(page).locator('.workspace-toolbar')).toBeVisible();
 release();await page.unrouteAll({behavior:'wait'});await expect(bar(page).locator('.workspace-topbar-content[aria-busy=false]')).toHaveCount(1);await expect(page.locator('.timetable-grid')).toBeVisible();await unchangedChrome(page);
 await page.locator('.timetable-scroll').evaluate(node=>{node.scrollTop=500;});expect((await bar(page).boundingBox())!.y).toBe(top);
 // Navigating out must not leave an old date/member toolbar behind.
 await nav(page).getByRole('link',{name:'더보기',exact:true}).click();await expect(bar(page)).toHaveCount(0);await page.goBack();await expect(bar(page).getByRole('group',{name:'시간표 구성원 필터',exact:true})).toBeVisible();
});
