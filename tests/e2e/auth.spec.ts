import { test, expect } from '@playwright/test';

test('production account routes show truthful readiness and do not expose sample children',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/login');
  await expect(page.getByRole('button',{name:'이메일 로그인 준비 중',exact:true})).toBeVisible();
  await expect(page.getByText('로그인 연결을 준비하고 있어요')).toBeVisible();
  for(const label of ['Google로 계속하기','카카오로 계속하기','네이버로 계속하기'])await expect(page.getByRole('button',{name:new RegExp(label)})).toBeDisabled();
  await expect(page.locator('#email')).toBeDisabled();
  await expect(page.getByText('서준',{exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'회원가입',exact:true}).click();
  await expect(page.getByRole('heading',{name:'아이하루 시작하기'})).toBeVisible();
  await page.goto('/phone');await expect(page.getByRole('button',{name:'인증번호 받기',exact:true})).toBeDisabled();
  await page.goto('/account');await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test('account pages reflow at phone widths and large text with accessible form labels',async({page})=>{
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const path of ['/login','/signup','/forgot-password','/verify-email','/reset-password','/phone','/account/reauth','/account/email']){
      await page.goto(path);if(path==='/login')await expect(page.getByLabel('아이디',{exact:true})).toBeVisible();else await expect(page.locator('.auth-title')).toBeVisible();
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({width:390,height:844});await page.goto('/login');
  await page.screenshot({path:'test-results/login-390.png',fullPage:true});
  await expect(page.getByRole('button',{name:'큰 글씨',exact:true})).toHaveCount(0);await page.reload();
  await expect(page.locator('html')).not.toHaveClass(/large-type/);await expect(page.locator('html')).toHaveAttribute('data-font','noto');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.setViewportSize({width:1440,height:1000});await expect(page.getByRole('button',{name:'큰 글씨',exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/login-1440.png',fullPage:true});
  await page.goto('/account/reauth');
  await page.getByLabel('암호',{exact:true}).fill('user-owned-test-password');
  await page.getByRole('button',{name:'암호 표시',exact:true}).click();
  await expect(page.getByLabel('암호',{exact:true})).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'암호 숨기기',exact:true}).click();
  await expect(page.getByLabel('암호',{exact:true})).toHaveAttribute('type','password');
});

test('F02 email linking resends a pending proof and offers recovery after a failed confirmation',async({page})=>{
  await page.route('**/api/account/providers',r=>r.fulfill({json:{providers:[{id:'email',name:'이메일',enabled:true}]}}));
  await page.route('**/api/account/email/status',r=>r.fulfill({json:{pending:{email:'contact@example.test',expiresAt:new Date(Date.now()+300000).toISOString()}}}));
  await page.route('**/api/account/email/resend',r=>r.fulfill({json:{status:true}}));
  await page.route('**/api/account/email/confirm',r=>r.fulfill({status:400,json:{code:'INVALID_TOKEN'}}));
  await page.goto('/account/email?token='+ 'a'.repeat(64));
  await expect.poll(()=>page.evaluate(()=>location.search)).toBe('');
  await page.getByRole('button',{name:'이 이메일을 계정에 연결',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('만료되었거나 이미 사용했어요');
  await page.getByRole('button',{name:'만료된 링크 다시 요청하기',exact:true}).click();
  await page.getByRole('button',{name:'인증 메일 다시 받기',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('가장 최근 메일');
  await expect(page.getByRole('button',{name:'인증 메일 다시 받기',exact:true})).toBeDisabled();
  await page.setViewportSize({width:320,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

