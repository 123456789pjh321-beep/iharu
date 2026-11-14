import {test,expect} from '@playwright/test';
import {waitForAppReady} from '../helpers/workspace-ui';
test.use({baseURL:'http://127.0.0.1:4174',reducedMotion:'reduce'});

test('social login retains only safe continuations and recovers after a provider failure without losing inputs',async({page})=>{
 await page.route('**/api/account/session',r=>r.fulfill({json:{authenticated:false}}));
 await page.route('**/api/account/providers',r=>r.fulfill({json:{providers:[{id:'email',name:'이메일',enabled:true},{id:'google',name:'Google',enabled:true}]}}));
 const bodies:{callbackURL:string;errorCallbackURL:string}[]=[];
 await page.route('**/api/auth/sign-in/social',r=>{bodies.push(r.request().postDataJSON());return r.fulfill({status:503,json:{code:'AUTH_UNAVAILABLE',detail:'private-provider-debug'}});});
 for(const [requested,expected] of [['/privacy?request=delete','/privacy?request=delete'],['/invite','/invite'],['//outside.example/steal','/timetable']]){
  await page.goto('/login?next='+encodeURIComponent(requested));await waitForAppReady(page);
  await page.getByLabel('아이디',{exact:true}).fill('kept@example.test');await page.getByLabel('암호',{exact:true}).fill('kept-fixture-password');
  const button=page.getByRole('button',{name:'Google로 계속하기',exact:true});await button.click();
  await expect(page.getByRole('alert')).toContainText('지금은 연결이 원활하지 않아요');await expect(button).toBeEnabled();
  expect(bodies.at(-1)).toMatchObject({callbackURL:expected,errorCallbackURL:'/login?next='+encodeURIComponent(expected)});
  await expect(page.getByLabel('아이디',{exact:true})).toHaveValue('kept@example.test');await expect(page.getByLabel('암호',{exact:true})).toHaveValue('kept-fixture-password');await expect(page.getByText('private-provider-debug')).toHaveCount(0);
  const count=bodies.length;await button.click();await expect.poll(()=>bodies.length).toBe(count+1);await expect(button).toBeEnabled();
 }
});

test('startup hands keyboard focus to content and the release is visible without revealing private data',async({page})=>{
 await page.goto('/timetable');await waitForAppReady(page);await expect(page.locator('main')).toBeFocused();
 await expect(page.locator('[data-guest-workspace]')).toBeVisible();await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'더보기',exact:true}).click();
 await expect(page.locator('.more-signature')).toContainText('아이하루 v2.0');
 const health=await(await page.request.get('/api/health')).json();expect(health.data.version).toBe('2.0.0');
});
