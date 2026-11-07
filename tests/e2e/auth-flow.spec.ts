import { test,expect } from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});

test('browser signup → mail proof → login → home → account → logout persists through the real API and SQL',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/signup');
  await page.getByLabel('이름',{exact:true}).fill('테스트 보호자');
  await page.getByLabel('이메일',{exact:true}).fill('browser-parent@example.test');
  await page.getByLabel('비밀번호',{exact:true}).fill('browser-parent-password-2026');
  await page.getByRole('button',{name:'인증 메일 보내기',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('인증 메일이 도착해요');
  const mails=await(await request.get('/__test__/mail')).json();
  const proof=mails.find((m:{to:string})=>m.to==='browser-parent@example.test');expect(proof).toBeTruthy();
  await page.goto(proof.url);
  await expect(page.getByText('이메일 확인을 마쳤어요. 로그인해 주세요.')).toBeVisible();
  await page.getByLabel('이메일',{exact:true}).fill('browser-parent@example.test');
  await page.getByLabel('비밀번호',{exact:true}).fill('browser-parent-password-2026');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading',{name:'오늘도 함께 챙겨요'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'오늘의 등하원',exact:true})).toBeVisible();
  await expect(page.getByText('서준',{exact:true})).toHaveCount(0);
  for(const path of ['/login','/signup','/']) {
    await page.goto(path);await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading',{name:'오늘도 함께 챙겨요'})).toBeVisible();
  }
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'큰 글씨',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/home-390-large.png',fullPage:true});
  await page.getByRole('button',{name:'큰 글씨',exact:true}).click();
  await page.getByRole('link',{name:'가족 달력 열기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'가족 연결부터 시작해요'})).toBeVisible();
  await page.getByRole('link',{name:'한눈에',exact:true}).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.locator('main').getByRole('link',{name:'내 계정',exact:true}).click();
  await expect(page.getByRole('heading',{name:'로그인 방법과 기기'})).toBeVisible();
  await expect(page.getByText('현재 기기',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText('browser-parent@example.test',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/account-390.png',fullPage:true});
  await page.locator('.auth-header').getByRole('link',{name:'아이하루',exact:true}).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/account/reauth');
  await page.getByRole('link',{name:'다른 로그인 방법으로 확인',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?reauth=1$/);
  await expect(page.getByRole('heading',{name:'다시 만나 반가워요'})).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button',{name:'해제',exact:true}).click();
  await page.getByRole('button',{name:'연결 해제 확인',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('로그인 방법이 하나는 남아 있어야 해요');
  await page.getByRole('button',{name:'모든 기기에서 로그아웃',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  for(const path of ['/account','/today','/chat','/']){await page.goto(path);await expect(page).toHaveURL(/\/login$/);}
  expect(errors).toEqual([]);
});

