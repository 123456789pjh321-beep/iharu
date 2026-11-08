import {test,expect} from '@playwright/test';

test('offline navigation offers retry without caching family data and recovers online',async({page,context})=>{
  await page.goto('/login');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller) await new Promise<void>(resolve=>navigator.serviceWorker.addEventListener('controllerchange',()=>resolve(),{once:true}));
  });
  await context.setOffline(true);
  await page.goto('/today');
  await expect(page.getByRole('heading',{name:'잠시 연결할 수 없어요'})).toBeVisible();
  await page.getByRole('link',{name:'다시 연결'}).click();
  await expect(page.getByRole('heading',{name:'잠시 연결할 수 없어요'})).toBeVisible();
  expect(await page.evaluate(()=>caches.keys())).toEqual([]);
  // API failures remain failures, never successful HTML or stale private data.
  expect(await page.evaluate(async()=>{try{await fetch('/api/v1/workspace/me');return false;}catch{return true;}})).toBe(true);
  await page.screenshot({path:'test-results/android-offline-phone.png'});
  await context.setOffline(false);
  await page.goto('/login');
  await expect(page.getByRole('heading',{name:'잠시 연결할 수 없어요'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>caches.keys())).toEqual([]);
});
