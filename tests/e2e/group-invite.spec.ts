import {test,expect,type Page,type APIRequestContext} from '@playwright/test';

const origin='http://127.0.0.1:4174';
const password='group-invite-browser-password';
const timetableInvite='https://myiharu.com/timetable';
test.use({baseURL:origin,viewport:{width:390,height:844},actionTimeout:10000});

async function register(page:Page,request:APIRequestContext,email:string,name:string,invite=false){
 const response=await page.request.post('/api/auth/sign-up/email',{
  headers:{Origin:origin},data:{ageAtLeast14:true,email,name,password,callbackURL:'/login?verified=1'+(invite?'&next=%2Finvite':'')}
 });
 expect(response.ok(),await response.text()).toBe(true);
 await verifyAndSignIn(page,request,email,invite);
}

async function verifyAndSignIn(page:Page,request:APIRequestContext,email:string,invite=false){
 const mail=await(await request.get('/__test__/mail')).json();
 await page.goto(mail.find((item:{to:string})=>item.to===email).url);
 const login=await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}});
 expect(login.ok(),await login.text()).toBe(true);
 if(invite){
  await page.reload();
  await expect(page).toHaveURL(origin+'/invite');
 }
}

async function issue(page:Page){
 await page.getByRole('checkbox',{name:/동의합니다/}).check();
 await page.getByRole('button',{name:'그룹 초대 링크 만들기'}).click();
 const field=page.getByLabel('발급한 그룹 초대 링크');
 await expect(field).toBeVisible();
 return field.inputValue();
}

test('group link resumes after email verification and requires explicit acceptance',async({page,browser,request})=>{
 test.setTimeout(60000);
 await register(page,request,'group-link-host@example.test','가상 초대 호스트');
 await page.goto('/family');
 const link=await issue(page);
 const context=await browser.newContext({baseURL:origin,viewport:{width:320,height:844}});
 try{
  const guest=await context.newPage();
  await guest.goto(link);
  await expect(guest.getByRole('heading',{name:'그룹에 초대받았어요'})).toBeVisible();
  await expect(guest).toHaveURL(origin+'/invite');
  await expect(guest.getByRole('link',{name:'로그인하고 계속'})).toHaveAttribute('href','/login?next=%2Finvite');
  await guest.getByRole('link',{name:'회원가입',exact:true}).click();
  await register(guest,request,'group-link-guest@example.test','가상 초대 손님',true);
  await expect(guest.getByRole('button',{name:'초대 수락'})).toBeVisible();
  await expect(page.locator('.personal-member')).toHaveCount(1);
  await guest.getByRole('button',{name:'초대 수락'}).click();
  await guest.getByRole('link',{name:'그룹 관리 열기'}).click();
  await expect(guest.locator('.personal-member')).toHaveCount(2);
  await expect(guest.getByRole('button',{name:'그룹 초대 링크 만들기'})).toHaveCount(0);
  await expect(guest.getByLabel('일반 초대 링크',{exact:true})).toHaveValue(timetableInvite);
  await guest.goto(link);
  await expect(guest.getByRole('alert')).toContainText('이미 사용');
 }finally{await context.close();}
});

test('general invitation shares the public timetable and leaves the new account independent',async({page,browser,request})=>{
 test.setTimeout(60000);
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'share',{value:async ({url}:ShareData)=>{
   document.documentElement.dataset.inviteShared=url;
  }});
  Object.defineProperty(navigator.clipboard,'writeText',{value:async (url:string)=>{
   document.documentElement.dataset.inviteCopied=url;
  }});
 });
 await register(page,request,'app-link-host@example.test','가상 앱 초대자');
 await page.goto('/family');
 await expect(page.getByRole('region',{name:'그룹 초대',exact:true})).toBeVisible();
 const general=page.getByRole('region',{name:'일반 초대',exact:true});
 await expect(general.getByRole('button',{name:'일반 초대 링크 복사'})).toBeVisible();
 await expect(page.getByLabel('초대 대상')).toHaveCount(0);
 const link=await general.getByLabel('일반 초대 링크',{exact:true}).inputValue();
 expect(link).toBe(timetableInvite);
 await general.getByRole('button',{name:'일반 초대 링크 복사'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-invite-copied',timetableInvite);
 await general.getByRole('button',{name:'일반 초대 공유'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-invite-shared',timetableInvite);
 const context=await browser.newContext({baseURL:origin,viewport:{width:320,height:844}});
 try{
  const guest=await context.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest).toHaveURL(origin+'/timetable');
  await expect(guest.locator('[data-guest-workspace]')).toBeVisible();
  await guest.locator('.timetable-day-column').first().locator('[data-time="16:30"]').click();
  await guest.getByRole('dialog').getByRole('link',{name:'회원가입',exact:true}).click();
  await expect(guest.getByRole('heading',{name:'회원가입',exact:true})).toBeVisible();
  await guest.getByRole('button',{name:'만 14세 이상',exact:true}).click();
  await expect(guest.getByLabel('이메일',{exact:true})).toBeVisible();
  await expect(guest.getByRole('navigation',{name:'회원가입 대상'})).toHaveCount(0);
  const email='app-link-guest@example.test';
  await guest.getByLabel('이름',{exact:true}).fill('가상 앱 가입자');
  await guest.getByLabel('이메일',{exact:true}).fill(email);
  await guest.getByLabel('암호',{exact:true}).fill(password);
  const [signup]=await Promise.all([
   guest.waitForResponse(response=>response.url().endsWith('/api/auth/sign-up/email')),
   guest.getByRole('button',{name:'인증 메일 보내기'}).click()
  ]);
  expect(signup.ok(),await signup.text()).toBe(true);
  await verifyAndSignIn(guest,request,email);
  await guest.goto('/family');
  await expect(guest.locator('.personal-member')).toHaveCount(0);
  const me=await guest.request.post('/api/v1/workspace/me',{headers:{Origin:origin},data:{}});
  expect(await me.json()).toMatchObject({name:'가상 앱 가입자',family:null});
  expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await context.close();}
});

test('an existing ID still signs in through the common form and keeps its group',async({page,browser,request})=>{
 test.setTimeout(60000);
 await register(page,request,'legacy-login-host@example.test','가상 기존 그룹');
 const headers={Origin:origin};
 const invitation=await page.request.post('/api/v1/workspace/invite.issue',{headers,data:{consent:true}});
 expect(invitation.ok(),await invitation.text()).toBe(true);
 const {code}=await invitation.json();
 const context=await browser.newContext({baseURL:origin});
 try{
  const loginId='existing_group_id';
  const seed=await context.request.post('/api/v1/workspace/child.signup',{headers,data:{code,loginId,name:'가상 기존 사용자',password}});
  expect(seed.ok(),await seed.text()).toBe(true);
  await context.clearCookies();
  const guest=await context.newPage();
  await guest.emulateMedia({reducedMotion:'reduce'});
  await guest.goto('/login');
  const identifier=guest.getByLabel('아이디',{exact:true});
  await identifier.click();
  await guest.keyboard.type(loginId);
  await expect(identifier).toHaveValue(loginId);
  await guest.getByLabel('암호',{exact:true}).fill(password);
  const [response]=await Promise.all([
   guest.waitForResponse(r=>r.url().endsWith('/api/v1/workspace/child.login')),
   guest.getByRole('button',{name:'로그인',exact:true}).click()
  ]);
  expect(response.ok(),await response.text()).toBe(true);
  await expect(guest).toHaveURL(origin+'/timetable');
  const me=await guest.request.post('/api/v1/workspace/me',{headers,data:{}});
  const host=await page.request.post('/api/v1/workspace/me',{headers,data:{}});
  expect(await me.json()).toMatchObject({loginId,family:{id:(await host.json()).family.id}});
 }finally{await context.close();}
});
