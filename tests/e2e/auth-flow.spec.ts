import { test,expect } from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});

test('browser signup → mail proof → login → timetable → account → logout persists through the real API and SQL',async({page,request})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/signup');await page.getByRole('link',{name:'일반사용자로 회원가입',exact:true}).click();
  await page.getByLabel('이름',{exact:true}).fill('테스트 일반사용자');
  await page.getByLabel('아이디',{exact:true}).fill('browser-parent@example.test');
  await page.getByLabel('암호',{exact:true}).fill('browser-parent-password-2026');
  await page.getByRole('button',{name:'인증 메일 보내기',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('인증 메일이 도착해요');
  const mails=await(await request.get('/__test__/mail')).json();
  const proof=mails.find((m:{to:string})=>m.to==='browser-parent@example.test');expect(proof).toBeTruthy();
  await page.goto(proof.url);
  await expect(page.getByText('이메일 확인을 마쳤어요. 로그인해 주세요.')).toBeVisible();
  await page.getByLabel('아이디',{exact:true}).fill('browser-parent@example.test');
  await page.getByLabel('암호',{exact:true}).fill('browser-parent-password-2026');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(page).toHaveURL(/\/timetable$/);
  const nav=page.getByRole('navigation',{name:'모바일 주 메뉴'});await expect(nav.locator(':scope > a,:scope > button')).toHaveText(['시간표','달력','대화','가계부','전체메뉴']);await expect(nav.getByRole('link',{name:'오늘',exact:true})).toHaveCount(0);
  await expect(page.locator('.personal-timetable')).toBeVisible();
  await page.reload();
  await expect(page.locator('.personal-timetable')).toBeVisible();
  await expect(page.getByText('서준',{exact:true})).toHaveCount(0);
  for(const path of ['/login','/signup','/','/today','/today/timetable']) {
    await page.goto(path);await expect(page).toHaveURL(/\/timetable$/);
    await expect(page.locator('.personal-timetable')).toBeVisible();
  }
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'큰 글씨',exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/home-390-large.png',fullPage:true});
  await expect(page.getByRole('button',{name:'큰 글씨',exact:true})).toHaveCount(0);
  await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'달력',exact:true}).click();
  await expect(page.locator('.direct-calendar')).toBeVisible();
  await page.getByRole('navigation',{name:'모바일 주 메뉴'}).getByRole('link',{name:'시간표',exact:true}).click();
  await expect(page).toHaveURL(/\/timetable$/);
  await page.goto('/account');
  await expect(page.getByRole('heading',{name:'로그인 방법과 기기'})).toBeVisible();
  await expect(page.getByText('현재 기기',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText('browser-parent@example.test',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/account-390.png',fullPage:true});
  await page.locator('.auth-header').getByRole('link',{name:'아이하루',exact:true}).click();
  await expect(page).toHaveURL(/\/timetable$/);
  await page.goto('/account/reauth');
  await page.getByRole('link',{name:'다른 로그인 방법으로 확인',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?reauth=1$/);
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button',{name:'해제',exact:true}).click();
  await page.getByRole('button',{name:'연결 해제 확인',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('로그인 방법이 하나는 남아 있어야 해요');
  await page.getByRole('button',{name:'모든 기기에서 로그아웃',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  for(const path of ['/account','/today','/chat','/']){await page.goto(path);await expect(page).toHaveURL(/\/login$/);}
  expect(errors).toEqual([]);
});

