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
  await expect(page).toHaveURL(origin+'/timetable');
  await page.getByRole('link',{name:'초대 확인',exact:true}).click();
 }
}

async function issue(page:Page){
 const section=page.getByRole('region',{name:'그룹 초대',exact:true});
 await expect(section.getByRole('checkbox')).toHaveCount(0);
 await section.getByRole('button',{name:'그룹 초대 링크',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'그룹 초대 공유'});
 const field=dialog.getByLabel('발급한 그룹 초대 링크');
 await expect(field).toBeVisible();
 const link=await field.inputValue();
 await page.keyboard.press('Escape');
 await expect(dialog).toBeHidden();
 return link;
}

test('group invite shortcut creates one link per click and fits member filters across the workspace',async({page,request})=>{
 test.setTimeout(70000);
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'share',{configurable:true,value:async ({url}:ShareData)=>{
   document.documentElement.dataset.inviteShared=url;
  }});
  Object.defineProperty(navigator.clipboard,'writeText',{value:async (url:string)=>{
   document.documentElement.dataset.inviteCopied=url;
  }});
 });
 await page.goto('/timetable');
 await expect(page.locator('[data-guest-workspace]')).toBeVisible();
 await expect(page.getByRole('button',{name:'그룹 초대 공유',exact:true})).toHaveCount(0);
 await register(page,request,'group-shortcut-host@example.test','초대 단축 버튼');
 await page.goto('/timetable');
 const menu=page.getByRole('navigation',{name:'모바일 주 메뉴'});
 const shortcut=page.getByRole('button',{name:'그룹 초대 공유',exact:true});
 const dialog=page.getByRole('dialog',{name:'그룹 초대 공유'});
 const filteredMenus=['시간표','달력','가계부','타임라인'];
 let issueRequests=0;
 page.on('request',request=>{if(request.url().endsWith('/api/v1/workspace/invite.link.issue'))issueRequests++;});
 const urls=new Set<string>();
 for(const label of ['시간표','달력','가계부','타임라인','대화','더보기']){
  await menu.getByRole('link',{name:label,exact:true}).click();
  const toolbar=label==='대화'?'.chat-rooms-toolbar':'.workspace-toolbar-actions';
  const position=filteredMenus.includes(label)?'.member-preference-row > .group-invite-shortcut:first-child':toolbar+' > .group-invite-shortcut';
  await expect(shortcut).toHaveCount(1);
  await expect(page.locator(position)).toBeVisible();
  await expect(shortcut).toHaveText('');
  if(filteredMenus.includes(label)){
   const row=page.locator('.member-preference-row');
   const chip=row.locator('.member-filter-bar > .member-filters > button').first();
   await expect(chip).toBeVisible();
   const geometry=await row.evaluate(node=>{
    const plus=node.querySelector('.group-invite-shortcut')!.getBoundingClientRect();
    const chip=node.querySelector('.member-filter-bar > .member-filters > button')!.getBoundingClientRect();
    return {plusHeight:plus.height,chipHeight:chip.height,plusY:plus.y,chipY:chip.y};
   });
   expect(geometry.plusHeight).toBe(geometry.chipHeight);
   expect(geometry.plusY).toBeCloseTo(geometry.chipY);
  }else if(label==='대화'){
   const chatRow=page.locator(toolbar);
   const geometry=await chatRow.evaluate(node=>{
    const invite=node.querySelector('.group-invite-shortcut')!.getBoundingClientRect();
    const create=node.querySelector('.chat-room-create')!.getBoundingClientRect();
    return {inviteHeight:invite.height,createHeight:create.height,inviteY:invite.y,createY:create.y};
   });
   expect(geometry.inviteHeight).toBe(geometry.createHeight);
   expect(geometry.inviteY).toBeCloseTo(geometry.createY);
  }
  const [response]=await Promise.all([
   page.waitForResponse(r=>r.url().endsWith('/api/v1/workspace/invite.link.issue')),
   shortcut.click()
  ]);
  expect(response.ok(),await response.text()).toBe(true);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'그룹 초대 링크 만들기'})).toHaveCount(0);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByText('사용 가능한 그룹 초대')).toHaveCount(0);
  await expect(dialog.getByLabel('일반 초대 링크',{exact:true})).toHaveCount(0);
  const field=dialog.getByLabel('발급한 그룹 초대 링크');
  await expect(field).toBeVisible();
  const url=await field.inputValue();
  expect(new URL(url).pathname).toBe('/invite');
  expect(urls.has(url)).toBe(false);
  urls.add(url);
  await expect(dialog.getByRole('button',{name:'그룹 초대 공유',exact:true})).toBeEnabled();
  await expect(dialog.getByRole('button',{name:'그룹 초대 링크 복사'})).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
 }
 await shortcut.click();
 const linkField=dialog.getByLabel('발급한 그룹 초대 링크');
 await expect(linkField).toBeVisible();
 const link=await linkField.inputValue();
 await dialog.getByRole('button',{name:'그룹 초대 공유',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-invite-shared',link);
 await dialog.getByRole('button',{name:'그룹 초대 링크 복사'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-invite-copied',link);
 await dialog.getByRole('button',{name:'그룹 초대 닫기'}).click();
 await expect(shortcut).toBeFocused();
 expect(issueRequests).toBe(7);

 await page.evaluate(()=>Object.defineProperty(navigator,'share',{value:undefined}));
 await shortcut.click();
 await expect(linkField).toBeVisible();
 const fallbackLink=await linkField.inputValue();
 await dialog.getByRole('button',{name:'그룹 초대 공유',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-invite-copied',fallbackLink);
 await dialog.getByRole('button',{name:'그룹 초대 닫기'}).click();
 await page.goto('/family');
 await expect(page.getByRole('button',{name:'링크 취소'})).toHaveCount(0);
 await expect(page.getByText('사용 가능한 그룹 초대')).toHaveCount(0);
 const options=page.request.post('/api/v1/workspace/invite.link.options',{headers:{Origin:origin},data:{}});
 expect((await(await options).json()).pending).toHaveLength(1);
 await expect(page.locator('.personal-member')).toHaveCount(1);
 await issue(page);
 expect(issueRequests).toBe(9);
});

test('More destinations align the group invite shortcut with their page heading',async({page,request})=>{
 test.setTimeout(60000);
 await page.emulateMedia({reducedMotion:'reduce'});
 await register(page,request,'more-heading-host@example.test','더보기 메뉴 검사');
 for(const path of ['/settings','/family','/help','/more/notices','/more/blog','/more/service','/notification-settings','/account','/privacy','/legal/terms','/legal/privacy','/account-deletion']){
  await page.goto(path);
  const heading=page.locator('.more-page-heading').first();
  const shortcut=heading.getByRole('button',{name:'그룹 초대 공유',exact:true});
  await expect(shortcut).toBeVisible();
  await expect(page.getByRole('button',{name:'그룹 초대 공유',exact:true})).toHaveCount(1);
  const geometry=await heading.evaluate(node=>{
   const title=node.querySelector('h1')!.getBoundingClientRect();
   const button=node.querySelector('.group-invite-shortcut')!.getBoundingClientRect();
   return {titleEnd:title.right,buttonStart:button.left,buttonCenter:button.y+button.height/2,titleCenter:title.y+title.height/2};
  });
  expect(geometry.buttonStart).toBeGreaterThan(geometry.titleEnd);
  expect(Math.abs(geometry.buttonCenter-geometry.titleCenter)).toBeLessThan(1);
 }
});

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
  await expect(guest.getByRole('link',{name:'로그인하고 계속'})).toHaveAttribute('href','/login');
  await guest.getByRole('link',{name:'회원가입',exact:true}).click();
  await register(guest,request,'group-link-guest@example.test','가상 초대 손님',true);
  await expect(guest.getByRole('button',{name:'초대 수락'})).toBeVisible();
  await expect(page.locator('.personal-member')).toHaveCount(1);
  await guest.getByRole('button',{name:'초대 수락'}).click();
  await guest.getByRole('link',{name:'그룹 관리 열기'}).click();
  await expect(guest.locator('.personal-member')).toHaveCount(2);
  await expect(guest.getByRole('button',{name:'그룹 초대 링크 만들기'})).toHaveCount(0);
  await guest.getByRole('button',{name:'그룹 초대 공유',exact:true}).click();
  const dialog=guest.getByRole('dialog',{name:'그룹 초대 공유'});
  await expect(dialog.getByLabel('발급한 그룹 초대 링크')).toBeVisible();
  await expect(dialog.getByRole('button',{name:'그룹 초대 링크 만들기'})).toHaveCount(0);
  await guest.keyboard.press('Escape');
  await expect(guest.getByLabel('일반 초대 링크',{exact:true})).toHaveValue(timetableInvite);
  await guest.goto(link);
  await expect(guest.getByRole('alert')).toContainText('초대');
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
