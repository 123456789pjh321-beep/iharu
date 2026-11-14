import {test,expect,type Page} from '@playwright/test';
import {wordmarkPath} from '../../shared/brand';

const origin='http://127.0.0.1:4174';
test.use({baseURL:origin,viewport:{width:390,height:844}});
const mainBundle=/\/assets\/index-[^/]+\.js$/;
const introAsset=/\/assets\/iharu-intro-[^/]+\.mp4(?:\?|$)/;
async function ready(page:Page){await expect(page.locator('#app-launch')).toHaveCount(0,{timeout:12000});await expect(page.locator('#root')).not.toHaveAttribute('inert');}
async function holdBundle(page:Page){
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route(mainBundle,async route=>{await held;await route.continue();});
 return release;
}

test('first paint displays the original wordmark and animates the feature introduction before the app bundle',async({page})=>{
 const release=await holdBundle(page);
 try{
  await page.goto('/service',{waitUntil:'commit'});
  await expect(page.locator('#app-launch')).toBeVisible();await expect(page.locator('.launch-logo path')).toHaveAttribute('d',wordmarkPath);
  await expect(page.locator('#app-launch')).toHaveAttribute('data-intro','welcome');
  const features=page.getByRole('list',{name:'아이하루 주요 기능'}).getByRole('listitem');
  await expect(features).toHaveText(['시간표','가족 달력','가족 대화']);
  const delays=await features.evaluateAll(elements=>elements.map(node=>getComputedStyle(node).animationDelay));
  expect(delays).toEqual(['0.18s','0.27s','0.36s']);
  const center=await page.locator('.launch-logo').boundingBox();expect(center).not.toBeNull();expect(Math.abs(center!.x+center!.width/2-195)).toBeLessThan(2);expect(center!.width).toBeGreaterThan(200);
  await expect(page.locator('#root')).toHaveAttribute('inert','');
  await page.setViewportSize({width:320,height:740});
  const featureBounds=await page.locator('.launch-features').boundingBox();
  expect(featureBounds!.x).toBeGreaterThanOrEqual(16);
  expect(featureBounds!.x+featureBounds!.width).toBeLessThanOrEqual(304);
  await page.screenshot({path:'test-results/ui141-launch-mobile.png',animations:'disabled'});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'test-results/ui141-launch-desktop.png',animations:'disabled'});
 }finally{release();}
 await ready(page);await expect(page.locator('.market-hero h1')).toBeVisible();
 await expect(page.locator('.market-brand .iharu-wordmark path')).toHaveAttribute('d',wordmarkPath);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('workspace launch waits for initial data and does not repeat when switching menus',async({page})=>{
 const email='launch-parent@example.test',password='launch-browser-fixture-2026';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'시작 화면 검증',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();await page.request.get(mails.find((mail:{to:string})=>mail.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/workspace/items.list',async route=>{await held;await route.continue();});
 try{
  await page.goto('/timetable');await expect(page.locator('[data-app-loading]')).toBeAttached();
  // The entrance animation completing must not dismiss the logo before data arrives.
  await page.waitForTimeout(950);await expect(page.locator('#app-launch')).toBeVisible();
 }finally{release();}
 await ready(page);await expect(page.locator('.personal-timetable')).toBeVisible();
 await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'더보기',exact:true}).click();
 await expect(page.getByRole('heading',{name:'더보기',exact:true})).toBeVisible();await expect(page.locator('#app-launch')).toHaveCount(0);
 await page.screenshot({path:'test-results/ui127-more-navigation-mobile.png',animations:'disabled'});
 // The standard mobile workspace has no header logo; check the shared brand in the legacy shell where it is rendered.
 await page.goto('/timetable?legacy=1');await ready(page);
 await expect(page.locator('.workspace-wordmark .iharu-wordmark path')).toHaveAttribute('d',wordmarkPath);
});

test('public navigation, login, and narrow screens share the wordmark without replaying launch',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.goto('/service');await ready(page);
 await page.locator('.market-header').getByRole('link',{name:'로그인',exact:true}).click();await expect(page.locator('.auth-login-form')).toBeVisible();
 await expect(page.locator('#app-launch')).toHaveCount(0);await expect(page.locator('.market-brand .iharu-wordmark path')).toHaveAttribute('d',wordmarkPath);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'test-results/ui127-login-wordmark-320.png',animations:'disabled'});
});

test('reloading in the same tab uses only the normal loading state',async({page})=>{
 await page.goto('/service');await ready(page);
 const release=await holdBundle(page);
 try{
  await page.reload({waitUntil:'commit'});
  await expect(page.locator('#app-launch')).toHaveAttribute('data-intro','compact');
  await expect(page.locator('.launch-features')).toBeHidden();
  await expect(page.locator('.launch-brand')).toHaveCSS('animation-name','none');
  await expect(page.getByRole('status')).toHaveText('나의 하루를 준비하고 있어요');
 }finally{release();}
 await ready(page);
 await expect(page.locator('.market-hero h1')).toBeVisible();
});

test('reduced motion and stored dark appearance apply before React starts',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(()=>localStorage.setItem('iharu:appearance',JSON.stringify({theme:'dark',quiet:true,font:'noto'})));
 const release=await holdBundle(page);
 try{
  await page.goto('/login',{waitUntil:'commit'});await expect(page.locator('#app-launch')).toHaveAttribute('data-motion','reduced');
  await expect(page.locator('.launch-brand')).toHaveCSS('animation-name','none');
  await expect(page.locator('.launch-feature').first()).toHaveCSS('animation-name','none');
  await expect(page.locator('#app-launch')).toHaveCSS('background-color','rgb(16, 35, 30)');
  await page.screenshot({path:'test-results/ui141-launch-dark-reduced.png',animations:'disabled'});
 }finally{release();}
 await ready(page);await expect(page.locator('.market-brand')).toBeVisible();
});

test('failed app bundle provides a retry and recovers instead of trapping the user behind the logo',async({page})=>{
 await page.route(mainBundle,route=>route.abort('failed'));
 await page.goto('/service');await expect(page.locator('#launch-recovery')).toBeVisible({timeout:12000});await expect(page.locator('#launch-message')).toHaveText('화면을 불러오지 못했어요');await expect(page.locator('.launch-features')).toBeHidden();
 await page.unroute(mainBundle);await page.getByRole('button',{name:'다시 시도',exact:true}).click();await ready(page);await expect(page.locator('.market-hero h1')).toBeVisible();
});

test('an initial API failure reveals the app error and retry controls',async({page})=>{
 await page.route('**/api/health',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE'}})}));
 await page.goto('/timetable');await ready(page);await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'다시 불러오기',exact:true})).toBeVisible();
});

test('no JavaScript leaves public article content readable and never shows a permanent splash',async({browser})=>{
 const context=await browser.newContext({baseURL:origin,javaScriptEnabled:false});
 try{const page=await context.newPage();await page.goto('/guide');await expect(page.locator('#app-launch')).toBeHidden();await expect(page.locator('noscript main h1')).toBeVisible();}finally{await context.close();}
});

test('mobile login is usable on first visit and reload without requesting intro media',async({page})=>{
 const requests:string[]=[];
 page.on('request',request=>{if(introAsset.test(request.url()))requests.push(request.url());});
 await page.setViewportSize({width:320,height:740});
 await page.goto('/login');
 await ready(page);
 await expect(page.locator('.auth-login-form')).toBeVisible();
 await expect(page.getByLabel('아이디',{exact:true})).toBeEditable();
 await page.reload();
 await ready(page);
 await expect(page.locator('.auth-login-form')).toBeVisible();
 await expect(page.locator('.launch-video')).toHaveCount(0);
 expect(requests).toEqual([]);
});

test('tablet demo opens without a launch video',async({page})=>{
 await page.setViewportSize({width:834,height:1194});
 const requests:string[]=[];
 page.on('request',request=>{if(introAsset.test(request.url()))requests.push(request.url());});
 await page.goto('http://127.0.0.1:4173/test/today');
 await ready(page);
 await expect(page.getByRole('heading',{name:'그룹의 하루를 자유롭게 테스트해요'})).toBeVisible();
 await expect(page.locator('.launch-video')).toHaveCount(0);
 expect(requests).toEqual([]);
});

test('contextual login reopens the selected timetable slot without a video overlay',async({page,playwright})=>{
 const email='launch-timetable-inline@example.test',password='launch-timetable-fixture-password';
 const client=await playwright.request.newContext({baseURL:origin});
 try{
  expect((await client.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,name:'첫 화면 일정 검사',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
  const mails=await(await client.get('/__test__/mail')).json();
  await client.get(mails.find((mail:{to:string})=>mail.to===email).url);
 }finally{await client.dispose();}
 await page.goto('/timetable');
 await ready(page);
 await page.locator('.timetable-day-column').first().locator('[data-time="16:30"]').click();
 const sheet=page.locator('.entry-login-sheet');
 await sheet.getByLabel('아이디',{exact:true}).fill(email);
 await sheet.getByLabel('암호',{exact:true}).fill(password);
 await sheet.getByRole('button',{name:'로그인',exact:true}).click();
 await expect(page).toHaveURL(/\/timetable$/);
 await expect(page.getByRole('dialog',{name:'반복 일정 등록',exact:true})).toBeVisible();
 await expect(page.locator('.launch-video')).toHaveCount(0);
 await expect(page.locator('input[name=startTime]')).toHaveValue('16:30');
});

test('desktop home opens the timetable without downloading intro media',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 const requests:string[]=[];
 page.on('request',request=>{if(introAsset.test(request.url()))requests.push(request.url());});
 await page.goto('/');
 await ready(page);
 await expect(page).toHaveURL(/\/timetable$/);
 await expect(page.locator('.timetable-day-column').first()).toBeVisible();
 await expect(page.locator('.launch-video')).toHaveCount(0);
 expect(requests).toEqual([]);
});
