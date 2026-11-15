import {test,expect} from '@playwright/test';

const origin='http://127.0.0.1:4174';
test.use({baseURL:origin,reducedMotion:'reduce'});

test('retired briefing links open the timetable and the settings omit briefing and its location controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 for(const path of ['/briefing','/briefing?settings=1','/briefing?view=saved']){
  await page.goto(path);
  await expect(page).toHaveURL(origin+'/timetable');
  await expect(page.locator('.timetable-grid')).toBeVisible();
  await expect(page.getByText('위치 사용하기',{exact:true})).toHaveCount(0);
 }
 await page.goto('/settings');
 await expect(page.getByText('화면 밝기',{exact:true})).toBeVisible();
 await expect(page.getByText(/AI 브리핑|브리핑 설정|보관한 소식|AI 브리핑을 위한 내 기기 위치/)).toHaveCount(0);
 await expect(page.getByRole('link',{name:'알림설정',exact:true})).toBeVisible();
});

test('administrator links for the retired provider open the existing admin overview',async({page})=>{
 await page.goto('/admin?section=ai');
 await expect(page).toHaveURL(origin+'/admin');
 await expect(page.getByRole('dialog').getByRole('heading',{name:'계정 확인 이용을 위해 로그인해 주세요'})).toBeVisible();

 const email='retired-briefing-admin@example.test',password='briefing-admin-fixture-password';
 const post=(path:string,data:object)=>page.request.post(path,{headers:{Origin:origin},data});
 expect((await post('/api/auth/sign-up/email',{ageAtLeast14:true,email,password,name:'브리핑 종료 검증',callbackURL:'/login?verified=1'})).ok()).toBe(true);
 const mail=await(await page.request.get('/__test__/mail')).json();
 expect((await page.request.get(mail.find((entry:{to:string})=>entry.to===email).url)).ok()).toBe(true);
 expect((await post('/__test__/system-admin',{email})).ok()).toBe(true);
 expect((await post('/api/auth/sign-in/email',{email,password})).ok()).toBe(true);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/admin?section=ai');
 await expect(page).toHaveURL(origin+'/admin');
 await expect(page.getByRole('region',{name:'운영 현황'})).toBeVisible();
 const menu=page.getByRole('navigation',{name:'시스템 관리 메뉴'});
 for(const viewport of [{width:390,height:844},{width:820,height:980}]){
  await page.setViewportSize(viewport);
  await expect(menu.getByRole('button')).toHaveText(['현황','회원관리','이력관리','권한관리','로그관리','운영·개인정보']);
  await expect(menu.getByRole('button',{name:'현황',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByLabel('OpenAI API 키',{exact:true})).toHaveCount(0);
 }
 await menu.getByRole('button',{name:'회원관리',exact:true}).click();
 await expect(page).toHaveURL(origin+'/admin?section=members');
 await expect(menu.getByRole('button',{name:'회원관리',exact:true})).toHaveAttribute('aria-current','page');
 expect((await post('/api/v1/admin/ai.read',{})).status()).toBe(404);
});
