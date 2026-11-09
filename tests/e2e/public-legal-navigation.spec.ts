import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
test('signed-out public documents never show workspace navigation, including session loading and logout',async({page,request,browser})=>{
 await page.addInitScript(()=>{(window as any).sawWorkspaceNavigation=false;new MutationObserver(()=>{if(document.querySelector('.workspace-mobile-nav'))(window as any).sawWorkspaceNavigation=true;}).observe(document,{childList:true,subtree:true});});
 for(const width of [320,1440])for(const path of ['/legal/terms','/legal/privacy','/legal/children','/privacy']){
  await page.setViewportSize({width,height:900});await page.goto(path);await expect(page.locator('.legal-page')).toBeVisible();
  await expect(page.locator('.workspace-mobile-nav,.workspace-rail')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).sawWorkspaceNavigation)).toBe(false);
  await expect(page.locator('.auth-footer')).toBeVisible();await expect(page.locator('#auth-main')).toHaveCSS('margin-bottom','0px');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(path==='/legal/privacy')await page.screenshot({path:`test-results/ui98-public-privacy-${width}.png`,animations:'disabled'});
 }
 const email='public-legal-nav@example.test',password='public-legal-fixture-2026';
 expect((await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'공개 페이지 일반사용자',password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mails=await(await request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 await page.goto('/legal/privacy');await expect(page.locator('.workspace-mobile-nav')).toBeVisible();
 const invite=await page.request.post('/api/v1/workspace/invite.issue',{headers:{Origin:origin},data:{consent:true}});expect(invite.ok()).toBe(true);
 const {code}=await invite.json(),childContext=await browser.newContext({baseURL:origin});
 try{
  expect((await childContext.request.post('/api/v1/workspace/child.signup',{headers:{Origin:origin},data:{loginId:'public_legal_child',name:'공개 문서 어린이',password:'legal-child-2026',code}})).ok()).toBe(true);
  const child=await childContext.newPage();await child.goto('/legal/privacy');await expect(child.locator('.workspace-mobile-nav')).toBeVisible();
  expect((await child.request.post('/api/v1/workspace/logout',{headers:{Origin:origin},data:{}})).ok()).toBe(true);
  await child.reload();await expect(child.locator('.legal-page')).toBeVisible();await expect(child.locator('.workspace-mobile-nav')).toHaveCount(0);
 }finally{await childContext.close();}
 expect((await page.request.post('/api/auth/sign-out',{headers:{Origin:origin},data:{}})).ok()).toBe(true);
 await page.reload();await expect(page.locator('.legal-page')).toBeVisible();await expect(page.locator('.workspace-mobile-nav')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).sawWorkspaceNavigation)).toBe(false);
});
