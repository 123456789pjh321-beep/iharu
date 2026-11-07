import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin});
async function parentLogin(page:Page,request:APIRequestContext,email:string){await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:'가상 부모',password:'new-parent-fixture-password',callbackURL:'/login?verified=1'}});const mails=await(await request.get('/__test__/mail')).json();await page.goto(mails.find((m:{to:string})=>m.to===email).url);await page.getByLabel('이메일',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill('new-parent-fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.getByRole('heading',{name:'오늘도 함께 챙겨요'})).toBeVisible();}
test('child name/password → parent number approval → automatic family → child login without email',async({page,browser,request})=>{
 test.setTimeout(60000);await page.setViewportSize({width:1440,height:1000});await parentLogin(page,request,'ui75-parent@example.test');
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),child=await ctx.newPage();
 try{
  await child.goto(origin+'/login');await child.getByRole('navigation',{name:'로그인 대상'}).getByRole('link',{name:'자녀',exact:true}).click();await expect(child.getByRole('heading',{name:'내 하루에 로그인해요'})).toBeVisible();
  await child.getByRole('link',{name:'처음 왔어요 · 자녀 회원가입'}).click();await child.getByLabel('자녀 이름',{exact:true}).fill('가상 서준');await child.getByLabel('비밀번호',{exact:true}).fill('child-password-2026');await child.getByRole('button',{name:'가입하고 부모 연결 번호 받기'}).click();
  const code=await child.locator('.parent-link-code').innerText(),loginId=await child.locator('.child-login-id').innerText();expect(code).toMatch(/^\d{6}$/);expect(loginId).toMatch(/^i[a-z0-9]{10}$/);await expect(child.getByLabel('이메일',{exact:true})).toHaveCount(0);
  await page.goto('/family');await page.getByLabel('자녀의 6자리 인증 번호',{exact:true}).fill(code);await page.getByRole('button',{name:'자녀 확인하기'}).click();await expect(page.getByRole('heading',{name:'이 자녀가 맞나요?'})).toBeVisible();await expect(page.locator('.parent-child-preview')).toContainText('가상 서준');
  await page.getByRole('checkbox',{name:/만 18세 이상/}).check();await page.getByRole('button',{name:'내 자녀로 인증하고 연결'}).click();await expect(page.getByRole('status').filter({hasText:'인증 완료'})).toBeVisible();await expect(page.locator('.parent-child-row')).toContainText('가상 서준');
  await expect(child.getByRole('status').filter({hasText:'인증 완료'})).toBeVisible({timeout:10000});await child.getByRole('button',{name:'내 하루 시작하기'}).click();await expect(child.getByRole('heading',{name:'가상 서준, 반가워요'})).toBeVisible();
  const cookie=(await ctx.cookies()).find(c=>c.name==='iharu-child');expect(cookie).toMatchObject({httpOnly:true,sameSite:'Strict'});await child.reload();await expect(child.getByText('가족 연결 완료',{exact:true})).toBeVisible();
  const fresh=await browser.newContext(),freshPage=await fresh.newPage();try{await freshPage.goto(origin+'/login?role=child');await freshPage.getByLabel('자녀 아이디',{exact:true}).fill(loginId);await freshPage.getByLabel('비밀번호',{exact:true}).fill('child-password-2026');await freshPage.getByRole('button',{name:'자녀 로그인',exact:true}).click();await expect(freshPage.getByRole('heading',{name:'가상 서준, 반가워요'})).toBeVisible();}finally{await fresh.close();}
  await page.goto('/today/calendar');await expect(page.getByRole('heading',{name:'우리 가족 달력',exact:true})).toBeVisible();
 }finally{await ctx.close();}
});
for(const width of [320,390,768,1440])test(`account and parent forms align and remain reachable at ${width}px`,async({page,request})=>{
 await page.setViewportSize({width,height:900});
 for(const path of ['/login','/signup','/login?role=child','/signup?role=child','/device/connect']){
  await page.goto(path);await expect(page.locator('.auth-title')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  const input=page.locator('.auth-form input').first();await expect(input).toBeVisible();const inputBox=await input.boundingBox(),panel=await page.locator('.auth-panel').boundingBox();expect(inputBox!.x).toBeGreaterThanOrEqual(panel!.x);expect(inputBox!.x+inputBox!.width).toBeLessThanOrEqual(panel!.x+panel!.width+1);
 }
 await parentLogin(page,request,`ui75-align-${width}@example.test`);await page.goto('/family');await expect(page.getByRole('heading',{name:'자녀와 가족을 연결해요'})).toBeVisible();await expect(page.getByLabel('자녀의 6자리 인증 번호')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto('/family/invite');const input=await page.getByLabel('가족 고유키 또는 초대 링크').boundingBox(),button=await page.getByRole('button',{name:'고유키 확인'}).boundingBox();expect(Math.abs(input!.width-button!.width)).toBeLessThan(2);expect(button!.y).toBeGreaterThanOrEqual(input!.y+input!.height);
});
