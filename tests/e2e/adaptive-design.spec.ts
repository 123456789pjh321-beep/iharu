import {test,expect} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});
const pages=['today','calendar','daily','repeats','chat','family','devices','location','fees','records','notifications','account'];
for(const [width,height] of [[320,740],[390,844],[600,960],[768,1024],[820,1180],[1024,768],[1440,900],[1920,1080],[844,390]]){
 test(`all test menus keep navigation and content usable at ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});
  for(const route of pages){
   await page.goto('/test/'+route);
   await expect(page.locator('main h1')).toBeVisible();
   const nav=page.locator(width<=760?'.workspace-mobile-nav':'.workspace-rail');
   await expect(nav).toBeVisible();
   const bounds=await nav.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(height+1);
   expect(await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}))).toEqual({x:false,y:false});
   const main=await page.locator('main').boundingBox();expect(main!.height).toBeGreaterThan(100);
   const brand=await page.locator('.workspace-brand').boundingBox();const controls=await page.locator('.top-actions').boundingBox();
   expect(controls!.y>=brand!.y+brand!.height-1||controls!.x>=brand!.x+brand!.width-1).toBe(true);
  }
 });
}
test('mobile More exposes every destination, traps focus and closes on navigation or Escape',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/test/today');
 const more=page.getByRole('button',{name:'더 보기',exact:true});await more.click();
 const menu=page.getByRole('dialog',{name:'전체 메뉴',exact:true});await expect(menu).toBeVisible();await expect(menu.getByRole('link')).toHaveCount(12);
 await menu.getByRole('link',{name:'내 계정',exact:true}).focus();await page.keyboard.press('Tab');await expect(menu.getByRole('button',{name:'전체 메뉴 닫기'})).toBeFocused();
 await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();await expect(more).toBeFocused();
 await more.click();await menu.getByRole('link',{name:'메모',exact:true}).click();await expect(page).toHaveURL(/\/test\/records$/);await expect(menu).not.toBeVisible();await expect(more).toHaveClass('active');
});
test('large type, dark theme and reduced motion preserve mobile menu access',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/test/chat');
 await page.getByRole('button',{name:'큰 글씨',exact:true}).click();await page.getByLabel('화면 설정',{exact:true}).click();await page.getByRole('button',{name:'어둡게',exact:true}).click();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'더 보기',exact:true}).click();
 const menu=page.getByRole('dialog',{name:'전체 메뉴',exact:true});await expect(menu).toBeVisible();
 expect(await menu.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await menu.getByRole('link',{name:'내 계정',exact:true}).click();await expect(page.locator('main h1')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
});
