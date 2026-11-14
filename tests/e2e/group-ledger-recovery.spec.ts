import {test,expect,type Page} from '@playwright/test';
const origin='http://127.0.0.1:4174',password='group-recovery-fixture-2026';
test.use({baseURL:origin,viewport:{width:390,height:844},reducedMotion:'reduce'});
async function register(page:Page,name:string,signIn=true){
 const email=name+'@example.test';
 const signup=await page.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{ageAtLeast14:true,email,password,name,callbackURL:'/login?verified=1'}});expect(signup.ok(),await signup.text()).toBe(true);
 const mails=await(await page.request.get('/__test__/mail')).json();await page.request.get(mails.find((m:{to:string})=>m.to===email).url);
 if(signIn)expect((await page.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 return email;
}
async function command(page:Page,op:string,data:object={}){const r=await page.request.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
test('month changes stay silent, hide the bottom register button and keep daily entry usable',async({page})=>{
 await register(page,'silent-ledger');await page.goto('/tuition');
 await expect(page.getByLabel('조회 월',{exact:true})).toBeVisible();
 await expect(page.locator('.workspace-add-action')).toHaveCount(0);
 await page.route('**/ledger.budget.read',async route=>{await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});
 await page.evaluate(()=>{const seen:string[]=[];(window as unknown as {budgetMessages:string[]}).budgetMessages=seen;new MutationObserver(()=>{if(document.body.textContent?.includes('예산 불러오는 중'))seen.push('loading');}).observe(document.body,{subtree:true,childList:true,characterData:true});});
 await page.getByLabel('조회 월',{exact:true}).fill('2027-02');
 await expect(page.getByRole('button',{name:'예산 설정',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'예산 설정',exact:true}).click();await page.getByLabel('월 예산 (원)',{exact:true}).fill('500000');await page.getByRole('button',{name:'예산 저장',exact:true}).click();
 await expect(page.getByRole('region',{name:'나의 월 예산'})).toContainText('500,000원');
 await page.getByLabel('조회 월',{exact:true}).fill('2027-03');
 await expect(page.getByRole('region',{name:'나의 월 예산'})).not.toContainText('500,000원');
 await expect(page.getByRole('button',{name:'예산 설정',exact:true})).toBeEnabled();
 await page.getByLabel('조회 월',{exact:true}).fill('2027-02');
 await expect(page.getByRole('region',{name:'나의 월 예산'})).toContainText('500,000원');
 expect(await page.evaluate(()=>(window as unknown as {budgetMessages:string[]}).budgetMessages)).toEqual([]);
 await page.locator('.tuition-date[data-date="2027-02-20"]').click();await page.getByRole('button',{name:'이 날짜에 가계부 추가',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'가계부 등록',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/group-ledger-entry.png'});
});
test('all startup phases use a single continuous workspace loading indicator',async({page})=>{
 await register(page,'single-loader');
 await page.addInitScript(()=>{const nodes=new Set<Element>();(window as unknown as {loaderNodes:Set<Element>}).loaderNodes=nodes;new MutationObserver(()=>{document.querySelectorAll('.workspace-loading-overlay > .loading-state').forEach(node=>nodes.add(node));}).observe(document,{childList:true,subtree:true});});
 for(const pattern of ['**/api/account/session','**/workspace/me','**/workspace/items.list'])await page.route(pattern,async route=>{await new Promise(resolve=>setTimeout(resolve,180));await route.continue();});
 await page.goto('/timetable');await expect(page.locator('.workspace-loading-overlay')).toHaveCount(0);await expect(page.locator('[data-app-loading]')).toHaveCount(0);
 await expect(page.locator('.personal-timetable')).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as {loaderNodes:Set<Element>}).loaderNodes.size)).toBe(1);
});
test('invite and inline logins land on timetable with an explicit invitation choice',async({page,browser})=>{
 test.setTimeout(90000);await register(page,'landing-host');const link=await command(page,'invite.link.issue',{consent:true});
 const context=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},extraHTTPHeaders:{'x-fixture-client':'landing-invite'}});
 try{
  const guest=await context.newPage(),email=await register(guest,'landing-guest',false);
  await guest.goto(link.url);await guest.getByRole('link',{name:'로그인하고 계속'}).click();
  await guest.getByLabel('아이디',{exact:true}).fill(email);await guest.getByLabel('암호',{exact:true}).fill(password);await guest.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(guest).toHaveURL(origin+'/timetable');await expect(guest.getByRole('region',{name:'받은 그룹 초대'})).toBeVisible();expect((await command(guest,'me')).family).toBeNull();
  await guest.getByRole('link',{name:'초대 확인',exact:true}).click();await guest.getByRole('button',{name:'초대 수락',exact:true}).click();await guest.getByRole('link',{name:'그룹 관리 열기'}).click();
  await expect(guest.locator('.personal-member')).toHaveCount(2);await guest.getByRole('button',{name:'그룹 초대 링크',exact:true}).click();
  await expect(guest.getByLabel('발급한 그룹 초대 링크')).toBeVisible();await guest.keyboard.press('Escape');
  await guest.request.post('/api/auth/sign-out',{headers:{Origin:origin},data:{}});await guest.goto('/tuition');
  await guest.getByRole('button',{name:'예산 수정',exact:true}).click();const login=guest.locator('.entry-login-sheet');
  await login.getByLabel('아이디',{exact:true}).fill(email);await login.getByLabel('암호',{exact:true}).fill(password);await login.getByRole('button',{name:'로그인',exact:true}).click();
  await expect(guest).toHaveURL(origin+'/timetable');await expect(login).not.toBeVisible();
 }finally{await context.close();}
});
