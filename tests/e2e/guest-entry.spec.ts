import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {entryIntentKey} from '../../shared/entry-intent';
const origin='http://127.0.0.1:4174',password='guest-entry-fixture-2026';
test.use({baseURL:origin,viewport:{width:390,height:844},reducedMotion:'reduce'});
async function ready(page:Page){await expect(page.locator('#app-launch')).toHaveCount(0,{timeout:12000});}
async function parent(playwright:typeof import('playwright-core'),name:string){
 const client=await playwright.request.newContext({baseURL:origin}),email=`ui129-${name}@example.test`;
 expect((await client.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'일반사용자 '+name,password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await client.get('/__test__/mail')).json();await client.get(mails.find((mail:{to:string})=>mail.to===email).url);
 expect((await client.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 return {client,email};
}
async function command(client:APIRequestContext,op:string,data:object={}){const r=await client.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
async function signInSheet(page:Page,email:string){const sheet=page.getByRole('dialog');await expect(sheet).toBeVisible();await sheet.getByLabel('아이디',{exact:true}).fill(email);await sheet.getByLabel('암호',{exact:true}).fill(password);await sheet.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('.entry-login-sheet')).not.toBeVisible();}

test('root shows fictional samples without a logo top bar and never requests private records',async({page})=>{
 const privateRequests:string[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/v1\/workspace\/(items\.|chat\.|updates\.|push\.)/.test(r.url()))privateRequests.push(r.url());});
 await page.goto('/');await ready(page);await expect(page).toHaveURL(/\/timetable$/);await expect(page.locator('[data-guest-workspace]')).toBeVisible();await expect(page.locator('.timetable-day-column')).toHaveCount(7);await expect(page.locator('.guest-sample-badge')).toHaveText('샘플 데이터');expect(await page.locator('[data-timetable-item]').count()).toBeGreaterThan(0);await expect(page.locator('.guest-entry-header')).toHaveCount(0);await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'달력',exact:true}).click();await page.getByLabel('달력 월 선택',{exact:true}).fill('2027-02');await expect(page.locator('.calendar-cell[data-date="2027-02-19"]')).toBeVisible();
 await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'더보기',exact:true}).click();await page.getByRole('link',{name:/빠른 시작 가이드/}).click();await expect(page.locator('.workspace-reader')).toBeVisible();await expect(page.getByRole('dialog')).not.toBeVisible();
 expect(privateRequests).toEqual([]);expect(errors).toEqual([]);
 for(const width of [320,820,1440]){await page.setViewportSize({width,height:900});await page.goto('/timetable');await ready(page);await expect(page.locator('.timetable-grid')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/ui129-guest-timetable-${width}.png`,animations:'disabled'});}
});

test('a timetable slot opens a sheet, reports an invalid password, then resumes that exact input after parent login',async({page,playwright})=>{
 const user=await parent(playwright,'timetable');await user.client.dispose();let creates=0;page.on('request',r=>{if(r.url().endsWith('/workspace/items.create'))creates++;});
 await page.goto('/timetable');await ready(page);const slot=page.locator('.timetable-day-column').first().locator('[data-time="16:30"]');const date=await slot.locator('..').locator('..').getAttribute('data-date');await slot.click();
 const sheet=page.getByRole('dialog');await expect(sheet).toBeVisible();await expect(page).toHaveURL(/\/timetable\?signin=1$/);expect(Math.abs((await sheet.boundingBox())!.y+(await sheet.boundingBox())!.height-844)).toBeLessThan(2);
 const saved=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!),entryIntentKey);expect(saved.intent).toMatchObject({kind:'REPEAT',date,time:'16:30'});expect(Object.keys(saved.intent).sort()).toEqual(['date','kind','path','time','type']);
 await sheet.getByLabel('아이디',{exact:true}).fill(user.email);await sheet.getByLabel('암호',{exact:true}).fill('wrong-password-2026');await sheet.getByRole('button',{name:'로그인',exact:true}).click();await expect(sheet.getByRole('alert')).toBeVisible();await expect(sheet).toBeVisible();
 await page.screenshot({path:'test-results/ui129-login-sheet-mobile.png',animations:'disabled'});await signInSheet(page,user.email);
 await expect(page.getByRole('dialog',{name:'반복 일정 등록',exact:true})).toBeVisible();await expect(page.locator('input[name=startTime]')).toHaveValue('16:30');expect(creates).toBe(0);await expect(page.locator('[data-guest-workspace]')).toHaveCount(0);
 await page.getByRole('button',{name:'편집 닫기'}).click();await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'더보기',exact:true}).click();await expect(page.locator('.more-account')).toContainText('일반사용자 timetable');
});

test('calendar cancellation and browser Back preserve the viewed month and remove the pending action',async({page})=>{
 await page.goto('/today/calendar');await ready(page);const month=page.getByLabel('달력 월 선택',{exact:true});await month.fill('2027-02');
 const date=page.locator('.calendar-cell[data-date="2027-02-19"] .calendar-day-target');await date.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(month).toHaveValue('2027-02');await expect(date).toBeFocused();
 expect(await page.evaluate(key=>sessionStorage.getItem(key),entryIntentKey)).toBeNull();await date.click();await expect(page.getByRole('dialog')).toBeVisible();await page.goBack();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(month).toHaveValue('2027-02');await expect(page).toHaveURL(/\/today\/calendar$/);
});

test('calendar login opens the selected date and creates a record only after an explicit save',async({page,playwright})=>{
 const user=await parent(playwright,'calendar');await user.client.dispose();let creates=0;page.on('request',r=>{if(r.url().endsWith('/workspace/items.create'))creates++;});
 await page.goto('/today/calendar');await ready(page);await page.getByLabel('달력 월 선택',{exact:true}).fill('2027-02');await page.locator('.calendar-cell[data-date="2027-02-19"] .calendar-day-target').click();await signInSheet(page,user.email);
 await expect(page.getByRole('dialog',{name:'일정 등록',exact:true})).toBeVisible();await expect(page.locator('input[name=date]')).toHaveValue('2027-02-19');expect(creates).toBe(0);
 await page.getByLabel('제목',{exact:true}).fill('로그인 후 직접 저장한 일정');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.personal-editor')).toHaveCount(0);await expect(page.getByLabel('달력 월 선택',{exact:true})).toHaveValue('2027-02');await expect(page.locator('.calendar-event').filter({hasText:'로그인 후 직접 저장한 일정'})).toHaveCount(1);expect(creates).toBe(1);
 const items=await command(page.request,'items.list',{from:'2027-02-01',to:'2027-02-28',kind:'EVENT'});expect(items.items.some((item:{data:{title:string;date:string}})=>item.data.title==='로그인 후 직접 저장한 일정'&&item.data.date==='2027-02-19')).toBe(true);
});

test('Back during an in-flight login cancels the continuation without replaying an input action',async({page,playwright})=>{
 const user=await parent(playwright,'cancel-login');await user.client.dispose();let release!:()=>void,submitted!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{submitted=resolve;});
 await page.route('**/api/auth/sign-in/email',async route=>{submitted();await held;await route.continue();});
 await page.goto('/timetable');await ready(page);await page.locator('.timetable-day-column').first().locator('[data-time="10:00"]').click();const sheet=page.getByRole('dialog');await sheet.getByLabel('아이디',{exact:true}).fill(user.email);await sheet.getByLabel('암호',{exact:true}).fill(password);await sheet.getByRole('button',{name:'로그인',exact:true}).click();await requested;await page.goBack();await expect(page.locator('.entry-login-sheet')).not.toBeVisible();release();
 await expect(page.locator('[data-guest-workspace]')).toHaveCount(0,{timeout:12000});await expect(page.locator('.personal-editor')).toHaveCount(0);await expect(page).toHaveURL(/\/timetable$/);expect(await page.evaluate(key=>sessionStorage.getItem(key),entryIntentKey)).toBeNull();
});

test('account-dependent deep links open the same login sheet without mounting private pages',async({page})=>{
 const sensitive:string[]=[];page.on('request',r=>{if(/\/api\/account\/(methods|sessions)|\/api\/v1\/(legal\/admin|workspace\/(items\.|chat\.|push\.|invite\.))/.test(r.url()))sensitive.push(r.url());});
 for(const path of ['/account','/family/invite','/notification-settings','/privacy','/admin','/account/email']){
  await page.goto(path);await ready(page);await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.guest-feature')).toBeVisible();await page.getByRole('button',{name:'로그인 창 닫기'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.guest-feature')).toBeVisible();await expect(page.locator('.personal-editor,.admin-console,.chat-composer')).toHaveCount(0);
 }
 expect(sensitive).toEqual([]);
});

test('child login resumes the timetable and retains child-only account and fee restrictions',async({page,playwright})=>{
 const user=await parent(playwright,'child-parent');await command(user.client,'items.create',{kind:'FEE',data:{title:'일반사용자 전용 비용',date:'2026-11-10',amount:100000}});const invite=await command(user.client,'invite.issue',{consent:true}),child=await playwright.request.newContext({baseURL:origin});
 await command(child,'child.signup',{loginId:'ui129_child',name:'검증 어린이',password,code:invite.code});await child.dispose();await user.client.dispose();
 await page.goto('/timetable');await ready(page);await page.locator('.timetable-day-column').first().locator('[data-time="10:00"]').click();const sheet=page.getByRole('dialog');await sheet.getByRole('button',{name:'어린이',exact:true}).click();await sheet.getByLabel('아이디',{exact:true}).fill('ui129_child');await sheet.getByLabel('암호',{exact:true}).fill(password);await sheet.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('dialog',{name:'반복 일정 등록',exact:true})).toBeVisible();await expect(page.locator('input[name=startTime]')).toHaveValue('10:00');await page.getByRole('button',{name:'편집 닫기'}).click();
 await expect(page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'가계부',exact:true})).toHaveCount(0);await page.goto('/tuition');await ready(page);await expect(page).toHaveURL(/\/timetable$/);
 const hidden=await command(page.request,'items.list',{from:'2026-11-01',to:'2026-11-30',kind:'FEE'});expect(hidden.items).toEqual([]);
 const denied=await page.request.post('/api/v1/workspace/items.create',{headers:{Origin:origin},data:{kind:'FEE',data:{title:'어린이 등록 차단',date:'2026-11-10',amount:100000}}});expect(denied.status()).toBe(403);
});

test('Google button reaches the real auth router with a contextual calendar return',async({page,playwright})=>{
 const user=await parent(playwright,'social');await user.client.dispose();let callback='';
 page.on('request',request=>{if(request.url().endsWith('/api/auth/sign-in/social')){const body=request.postDataJSON();callback=body.callbackURL;expect(body.errorCallbackURL).toBe('/login?next=%2Ftoday%2Fcalendar');}});
 // Only the external provider page is replaced. The app's provider listing, validation,
 // state, PKCE and auth response use the real configured test server.
 await page.route('https://accounts.google.com/**',route=>route.fulfill({contentType:'text/html',body:'<p>Isolated Google authorization fixture</p>'}));
 await page.goto('/today/calendar');await ready(page);await page.getByLabel('달력 월 선택',{exact:true}).fill('2027-02');await page.locator('.calendar-cell[data-date="2027-02-19"] .calendar-day-target').click();await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
 const authorization=new URL(page.url());expect(authorization.searchParams.get('redirect_uri')).toBe(origin+'/api/auth/callback/google');expect(authorization.searchParams.get('state')).toBeTruthy();expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');expect(callback).toBe('/today/calendar');
 // The signed Google callback is covered by auth.test.ts. Here a real fixture session
 // verifies browser storage and continuation on the return to the app.
 expect((await page.request.post(origin+'/api/auth/sign-in/email',{headers:{Origin:origin},data:{email:user.email,password}})).ok()).toBe(true);await page.goto(origin+callback);await ready(page);await expect(page.getByRole('dialog',{name:'일정 등록',exact:true})).toBeVisible();await expect(page.locator('input[name=date]')).toHaveValue('2027-02-19');await expect(page.getByLabel('제목',{exact:true})).toHaveValue('');
});

test('anonymous API calls remain unauthorized and desktop dark reduced-motion login remains usable',async({page})=>{
 for(const [op,data] of [['items.list',{from:'2027-02-01',to:'2027-02-28'}],['items.create',{kind:'EVENT',data:{title:'must never be stored',date:'2027-02-19',allDay:true}}],['chat.list',{}],['invite.issue',{consent:true}]] as const){const response=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(response.status()).toBe(401);}
 await page.setViewportSize({width:1440,height:900});await page.addInitScript(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'dark',quiet:true})));await page.goto('/timetable');await ready(page);await page.locator('.timetable-day-column').first().locator('[data-time="16:30"]').click();const sheet=page.getByRole('dialog');await expect(sheet).toBeVisible();await expect(sheet).toHaveCSS('animation-name','none');const box=(await sheet.boundingBox())!;expect(Math.abs(box.x+box.width/2-720)).toBeLessThan(2);expect(box.width).toBeLessThanOrEqual(480);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/ui129-login-sheet-desktop-dark.png',animations:'disabled'});
});

test('sample menus can be browsed and every write starts login without contacting private APIs',async({page})=>{
 const privateRequests:string[]=[];page.on('request',request=>{if(/\/api\/v1\/workspace\/(items\.|chat\.|invite\.|member-filter\.|fees\.)/.test(request.url()))privateRequests.push(request.url());});
 for(const [path,action] of [['/chat','메시지 보내기'],['/tuition','가계부 추가'],['/records','메모 추가'],['/family','우리 그룹 연결하기']]){
  await page.goto(path);await ready(page);await expect(page.locator('.guest-sample-badge')).toHaveText('샘플 데이터');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.locator('.guest-entry-header')).toHaveCount(0);await page.getByRole('button',{name:action,exact:true}).click();await expect(page.locator('.entry-login-sheet')).toBeVisible();await page.getByRole('button',{name:'로그인 창 닫기'}).click();await expect(page.locator('.entry-login-sheet')).not.toBeVisible();
 }
 expect(privateRequests).toEqual([]);
});

test('tapping a sample never imports it into the account after login',async({page,playwright})=>{
 const user=await parent(playwright,'sample-isolation');await user.client.dispose();let writes=0;page.on('request',request=>{if(request.url().endsWith('/workspace/items.create'))writes++;});
 await page.goto('/today/calendar');await ready(page);await page.getByLabel('달력 월 선택',{exact:true}).fill('2027-02');await page.locator('[data-pager-current=true] .calendar-event').filter({hasText:'학교 공개 수업'}).first().click();await signInSheet(page,user.email);
 await expect(page.getByRole('dialog',{name:'일정 등록',exact:true})).toBeVisible();await expect(page.getByLabel('제목',{exact:true})).toHaveValue('');await expect(page.locator('.guest-sample-badge')).toHaveCount(0);expect(writes).toBe(0);
 const data=await command(page.request,'items.list',{from:'2027-02-01',to:'2027-02-28'});expect(data.items).toEqual([]);
});

test('native Back from Google restores a cached login sheet that can retry or close',async({playwright})=>{
 // Playwright normally disables bfcache; enable it for this real browser lifecycle regression.
 const browser=await playwright.chromium.launch({channel:'chromium',ignoreDefaultArgs:['--disable-back-forward-cache']}),context=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},reducedMotion:'reduce',ignoreHTTPSErrors:true,extraHTTPHeaders:{'x-fixture-oauth-return':'1'}}),page=await context.newPage();
 try{
  await page.addInitScript(()=>window.addEventListener('pageshow',event=>{document.documentElement.dataset.restoredFromCache=String(event.persisted);}));
  await page.goto('/today/calendar');await ready(page);await page.getByLabel('달력 월 선택',{exact:true}).fill('2027-02');await page.locator('.calendar-cell[data-date="2027-02-19"] .calendar-day-target').click();await page.getByRole('button',{name:'Google로 계속하기',exact:true}).click();await expect(page).toHaveURL('https://127.0.0.1:4274/authorize');await expect(page.getByText('Isolated external authorization fixture')).toBeVisible();
  await page.evaluate(()=>{setTimeout(()=>history.back(),0);});await expect(page).toHaveURL(origin+'/today/calendar?signin=1');const restoration=await page.evaluate(()=>JSON.stringify({reason:(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming&{notRestoredReasons?:unknown}).notRestoredReasons}));await expect(page.locator('html'),restoration).toHaveAttribute('data-restored-from-cache','true');
  const sheet=page.locator('.entry-login-sheet');await expect(sheet).toBeVisible();await expect(sheet.getByRole('button',{name:'Google로 계속하기',exact:true})).toBeEnabled();await expect(sheet.getByLabel('아이디',{exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'로그인 창 닫기'})).toBeEnabled();
  await page.getByRole('button',{name:'로그인 창 닫기'}).click();await expect(sheet).not.toBeVisible();await expect(page.getByLabel('달력 월 선택',{exact:true})).toHaveValue('2027-02');expect(await page.evaluate(key=>sessionStorage.getItem(key),entryIntentKey)).toBeNull();
 }finally{await context.close();await browser.close();}
});

test('timetable and calendar share member chips and the TimeTree bottom navigation', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await page.goto('/timetable');await ready(page);
 const workspace=page.locator('.auth-app.workspace-page');
 const nav=page.getByRole('navigation',{name:'모바일 주 메뉴'});
 const grid=page.locator('.timetable-grid');
 await expect(grid).toBeVisible();
 const timetableSize=await grid.boundingBox();
 const timetableNav=await nav.boundingBox();
 await expect(workspace).toHaveAttribute('data-timetree','/timetable');
 await expect(nav).toHaveCSS('height','80px');
 const activeIcon=nav.locator('a[aria-current="page"] .rail-icon');
 const timetableIcon=(await activeIcon.boundingBox())!;
 const selectedChip=page.locator('.member-preference-row .member-filters>button[aria-pressed=true]').first();
 const chipStyle=()=>selectedChip.evaluate(el=>{const style=getComputedStyle(el);return [style.height,style.borderRadius,style.fontSize,style.backgroundColor];});
 const timetableChip=await chipStyle();
 for(const [label,route,content] of [
  ['달력','/today/calendar','.direct-calendar'],
  ['대화','/chat','.guest-chat-sample'],
  ['가계부','/tuition','.ledger-workspace'],
  ['더보기','/more','.more-guide-area'],
 ]) {
  await nav.getByRole('link',{name:label,exact:true}).click();
  await expect(workspace).toHaveAttribute('data-timetree',route);
  await expect(page.locator(content)).toBeVisible();
  await expect(nav.getByRole('link',{name:label,exact:true})).toHaveAttribute('aria-current','page');
  await expect(nav).toHaveCSS('height','80px');
  if(label==='달력'){
   const calendarIcon=(await activeIcon.boundingBox())!;
   expect([calendarIcon.width,calendarIcon.height]).toEqual([timetableIcon.width,timetableIcon.height]);
   expect(await chipStyle()).toEqual(timetableChip);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await nav.getByRole('link',{name:'시간표',exact:true}).click();
 await expect(workspace).toHaveAttribute('data-timetree','/timetable');
 await expect(grid).toBeVisible();
 expect(await grid.boundingBox()).toEqual(timetableSize);
 expect(await nav.boundingBox()).toEqual(timetableNav);
});

test('all signed-in menus use the timetable bottom bar at every size and theme', async ({page,playwright}) => {
 test.setTimeout(90000);
 const account=await parent(playwright,'bottom-navigation');
 await account.client.dispose();
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email:account.email,password}})).ok()).toBe(true);
 await page.addInitScript(()=>sessionStorage.setItem('iharu:launch-video:v2','seen'));

 const nav=page.getByRole('navigation',{name:'모바일 주 메뉴'});
 const appearance=()=>nav.evaluate(element=>{
  const bar=getComputedStyle(element);
  const active=element.querySelector('[aria-current=page]')!;
  const tab=getComputedStyle(active);
  const capsule=getComputedStyle(active.querySelector('.rail-icon')!);
  const icon=getComputedStyle(active.querySelector('.icon')!);
  return {
   position:bar.position,height:bar.height,background:bar.backgroundColor,border:bar.borderTopColor,
   text:tab.color,textSize:tab.fontSize,tabBackground:tab.backgroundColor,
   capsuleWidth:capsule.width,capsuleHeight:capsule.height,capsuleRadius:capsule.borderRadius,
   capsuleBackground:capsule.backgroundColor,iconWidth:icon.width,
  };
 });
 const mainMenus=[
  ['/today/calendar','달력'],['/chat','대화'],['/briefing','AI 브리핑'],['/tuition','가계부'],['/more','더보기'],
 ];
 const moreMenus=[
  '/family','/account','/settings','/notification-settings','/help','/more/notices','/more/blog','/more/service','/privacy','/records','/legal/terms',
 ];
 for(const [width,height] of [[320,844],[820,1000],[1440,900],[844,390]]){
  await page.setViewportSize({width,height});
  await page.goto('/timetable');
  await expect(nav.getByRole('link',{name:'시간표',exact:true})).toHaveAttribute('aria-current','page');
  const reference=await appearance();
  expect(reference).toMatchObject({
   position:'fixed',height:height<500?'64px':'80px',tabBackground:'rgba(0, 0, 0, 0)',
   capsuleWidth:width<=360?'46px':'56px',capsuleHeight:'34px',capsuleRadius:'20px',iconWidth:'20px',
  });
  const routes=width===320?[...mainMenus,...moreMenus.map(path=>[path,'더보기'])]:[['/account','더보기'],['/chat','대화']];
  for(const [path,label] of routes){
   await page.goto(path);
   await expect(nav.getByRole('link',{name:label,exact:true})).toHaveAttribute('aria-current','page');
   expect(await appearance(),path).toEqual(reference);
   expect(await nav.evaluate(element=>element.scrollWidth<=element.clientWidth),path).toBe(true);
  }
 }

 await page.goto('/settings');
 await page.getByRole('button',{name:'어둡게',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.goto('/timetable');
 const darkReference=await appearance();
 expect(darkReference).toMatchObject({background:'rgb(25, 28, 27)',capsuleBackground:'rgb(37, 75, 56)'});
 await page.goto('/account');
 await expect(nav.getByRole('link',{name:'더보기',exact:true})).toHaveAttribute('aria-current','page');
 expect(await appearance()).toEqual(darkReference);
});
