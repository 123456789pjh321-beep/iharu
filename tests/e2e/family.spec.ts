import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});
async function login(page:Page,request:APIRequestContext,email:string,ready=true){
 await page.request.post('/api/auth/sign-up/email',{headers:{Origin:'http://127.0.0.1:4174'},data:{email,password:'browser-family-password-2026',name:'가상 보호자',callbackURL:'/login?verified=1'}});
 const mail=await(await request.get('/__test__/mail')).json();const m=mail.find((m:{to:string})=>m.to===email);await page.goto(m.url);
 await page.getByLabel('아이디',{exact:true}).fill(email);await page.getByLabel('암호',{exact:true}).fill('browser-family-password-2026');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect(page.locator('.personal-timetable')).toBeVisible();
 if(ready)expect((await request.post('/__test__/ready',{data:{email}})).ok()).toBe(true);
}
test('family creation → verified fixture consent → child → separate device pairing → immediate revocation',async({page,browser,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1000});await login(page,request,'family-flow@example.test');await page.goto('/family?legacy=1');
 await page.getByLabel('가족 이름',{exact:true}).fill('우리 가상 가족');await page.getByRole('button',{name:'우리 가족 만들기'}).click();await expect(page.getByText('아직 공유받은 아이가 없어요')).toBeVisible();
 const draftResponse=page.waitForResponse(r=>r.url().endsWith('/child-registration-drafts')&&r.request().method()==='POST');await page.getByRole('button',{name:'아이 등록 시작'}).click();const draft=await(await draftResponse).json();
 await expect(page.getByText('아이와의 관계를 먼저 확인해요')).toBeVisible();await expect(page.getByLabel('아이 별명')).toHaveCount(0);
 expect((await request.post('/__test__/verify-draft',{data:{draftId:draft.id}})).ok()).toBe(true);await page.getByRole('button',{name:'등록 상태 새로고침'}).click();await page.getByLabel('아이 별명').fill('가상 하늘');await page.getByLabel('일정·대화·학원비를 위한').check();await page.getByRole('button',{name:'동의하고 아이 등록'}).click();
 await page.getByRole('button',{name:'가상 하늘 동의·공유·기기 관리'}).click();await expect(page.getByRole('heading',{name:'가상 하늘 · 공유와 기기'})).toBeVisible();
 await page.screenshot({path:'test-results/family-1440.png',fullPage:true});
 const context=await browser.newContext({viewport:{width:390,height:844}}),child=await context.newPage();await child.goto('http://127.0.0.1:4174/device/connect?legacy=1');await child.getByRole('button',{name:'연결 번호 받기'}).click();await expect(child.locator('.pairing-code')).toBeVisible();const code=(await child.locator('.pairing-code').innerText()).replace(/\s/g,'');
 await child.screenshot({path:'test-results/device-390.png',fullPage:true});await page.getByLabel('6자리 연결 번호').fill(code);await page.getByRole('button',{name:'연결할 기기 확인'}).click();await page.getByRole('button',{name:'이 아이의 기기로 승인'}).click();
 await expect(child.getByRole('heading',{name:'내 이름이 맞나요?'})).toBeVisible({timeout:10000});await child.getByRole('button',{name:'내 기기로 연결하기'}).click();await expect(child.getByRole('heading',{name:'가상 하늘, 반가워요'})).toBeVisible();await child.reload();await expect(child.getByText('가족 연결 완료')).toBeVisible();
 const cookies=await context.cookies();expect(cookies.find(c=>c.name==='iharu-child')).toMatchObject({httpOnly:true,sameSite:'Strict'});expect(await child.evaluate(()=>JSON.stringify(localStorage))).not.toContain('token');
 await page.getByRole('button',{name:'연결 목록 새로고침'}).click();await expect(page.getByText('아이 기기',{exact:true})).toBeVisible();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'해제',exact:true}).click();await expect(page.getByText('아직 연결된 아이 기기가 없어요.')).toBeVisible();await child.reload();await expect(child.getByRole('heading',{name:'연결을 확인해 주세요'})).toBeVisible();
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 await expect(page.getByRole('button',{name:'큰 글씨',exact:true})).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'test-results/family-768-large.png',fullPage:true});await context.close();expect(errors).toEqual([]);
});
test('unverified guardian sees preparation state without forms for child personal data',async({page,request})=>{
 await page.setViewportSize({width:320,height:740});await login(page,request,'family-not-ready@example.test',false);await page.goto('/family?legacy=1');await expect(page.getByRole('heading',{name:'보호자 확인을 신청해 주세요'})).toBeVisible();await expect(page.getByText('이메일 확인 · 완료',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'연결 상태 다시 확인'})).toBeEnabled();await expect(page.getByLabel('아이 별명')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'test-results/family-preparing-320.png',fullPage:true});
});
test('child connection screen works by keyboard and fits small screens',async({page})=>{
 await page.setViewportSize({width:320,height:740});await page.goto('/device/connect?legacy=1');await expect(page.getByRole('heading',{name:'가족과 연결해 볼까요?'})).toBeVisible();const button=page.getByRole('button',{name:'연결 번호 받기'});await button.focus();await page.keyboard.press('Enter');await expect(page.locator('.pairing-code')).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.getByRole('button',{name:'보호자 확인이 끝났어요'}).click();await expect(page.getByRole('status').filter({hasText:'아직 확인하고 있어요'})).toBeVisible();
});

test('F01 distinguishes unavailable email, database failure and expired login without sending users in circles',async({page,request})=>{
 await login(page,request,'f01-status@example.test',false);
 let state={accountReady:false,emailVerified:false,emailDeliveryAvailable:false,databaseReady:true,relationshipVerification:'NOT_CONNECTED',realChildRegistrationEnabled:false};
 await page.route('**/api/v1/setup',route=>route.fulfill({json:state}));
 await page.goto('/family?legacy=1');
 await expect(page.getByRole('heading',{name:'이메일 확인이 필요해요'})).toBeVisible();
 await expect(page.getByRole('link',{name:'이메일 확인 진행'})).toHaveCount(0);
 await expect(page.getByText('가족 서비스 연결 · 정상',{exact:true})).toBeVisible();
 state={...state,databaseReady:false};
 await page.getByRole('button',{name:'연결 상태 다시 확인'}).click();
 await expect(page.getByRole('heading',{name:'가족 서비스에 연결하지 못했어요'})).toBeVisible();
 state={...state,databaseReady:true,emailDeliveryAvailable:true};
 await page.getByRole('button',{name:'연결 상태 다시 확인'}).click();
 await expect(page.getByRole('link',{name:'이메일 확인 진행'})).toHaveAttribute('href','/account/email');
 await page.route('**/api/account/providers',route=>route.fulfill({json:{providers:[{id:'email',name:'이메일',enabled:false}]}}));
 await page.goto('/account/email');
 await expect(page.getByRole('heading',{name:'이메일 인증 서비스를 준비하고 있어요'})).toBeVisible();
 await expect(page.getByLabel('연결할 이메일')).toHaveCount(0);
 await page.unroute('**/api/v1/setup');
 // Expire the real session after the account check, before setup returns 401.
 // Leaving the session valid only observes a transient /login redirect to /today.
 await page.route('**/api/v1/setup',async route=>{
  const signout=await page.request.post('/api/auth/sign-out',{headers:{Origin:'http://127.0.0.1:4174'},data:{}});expect(signout.ok()).toBe(true);
  await route.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED',message:'다시 로그인해 주세요.'}}});
 });
 await page.goto('/family?legacy=1');await expect(page).toHaveURL(/\/login$/);
 expect(await(await page.request.get('/api/account/session')).json()).toMatchObject({authenticated:false});await page.reload();await expect(page).toHaveURL(/\/login$/);
});

test('F03 applicant submits before family readiness and sees human-review result on mobile',async({page,browser,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page,request,'f03-browser-applicant@example.test',false);await page.goto('/family?legacy=1');
 await page.getByRole('link',{name:'보호자 확인 신청·결과 보기'}).click();
 await expect(page.getByText('신청 접수는 가능하지만 담당 심사자가 아직 지정되지 않았어요.',{exact:false})).toBeVisible();
 await page.getByLabel('아이 구분 이름').fill('첫째');await page.getByRole('button',{name:'보호자 확인 신청',exact:true}).click();await expect(page.getByText('접수 완료',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('접수 완료',{exact:true})).toBeVisible();
 const context=await browser.newContext(),reviewer=await context.newPage();
 await login(reviewer,request,'f03-browser-reviewer@example.test',false);await request.post('/__test__/reviewer',{data:{email:'f03-browser-reviewer@example.test'}});
 await reviewer.goto('http://127.0.0.1:4174/family/verification/review');const reviewCard=reviewer.locator('.guardian-application').filter({has:reviewer.getByRole('heading',{name:/^첫째 /})});await reviewCard.getByRole('button',{name:'심사 시작'}).click();
 await page.getByRole('button',{name:'상태 새로고침'}).click();await expect(page.getByText('심사 중',{exact:true})).toBeVisible();
 await reviewCard.getByLabel('신청인에게 안내할 반려 사유').fill('신청 대상과 확인 기록이 일치하지 않습니다.');await reviewCard.getByRole('button',{name:'사유를 안내하고 반려'}).click();
 await page.getByRole('button',{name:'상태 새로고침'}).click();await expect(page.getByText('반려',{exact:true})).toBeVisible();await expect(page.getByText('신청 대상과 확인 기록이 일치하지 않습니다.')).toBeVisible();
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 await page.screenshot({path:'test-results/f03-guardian-768.png',fullPage:true});await context.close();expect(errors).toEqual([]);
});

test('F04 approval → family → bound consent → invite → approval → scoped sharing',async({page,browser,request})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page,request,'f04-browser-owner@example.test',false);
 await page.goto('/family/verification');await page.getByLabel('아이 구분 이름').fill('F04 가상 첫째');await page.getByRole('button',{name:'보호자 확인 신청',exact:true}).click();
 const reviewContext=await browser.newContext(),reviewer=await reviewContext.newPage();
 await login(reviewer,request,'f04-browser-reviewer@example.test',false);await request.post('/__test__/reviewer',{data:{email:'f04-browser-reviewer@example.test'}});
 await reviewer.goto('http://127.0.0.1:4174/family/verification/review');
 const card=reviewer.locator('.guardian-application').filter({hasText:'F04 가상 첫째'});
 await card.getByRole('button',{name:'심사 시작'}).click();await card.getByLabel('증빙 심사 기록 번호').fill('browser-f04-evidence-001');await card.getByLabel('확인된 대상 참조 번호').fill('browser-f04-subject-001');await card.getByLabel('기록에서 신청인과').check();await card.getByRole('button',{name:'승인',exact:true}).click();
 await card.getByLabel('증빙에서 확인한 생년월일').fill('2018-03-02');await card.getByLabel('승인한 대상과 생년월일이').check();await card.getByRole('button',{name:'등록 정보 확인 완료'}).click();
 await page.goto('/family?legacy=1');await page.getByLabel('가족 이름',{exact:true}).fill('F04 가상 가족');await page.getByRole('button',{name:'우리 가족 만들기'}).click();
 await page.getByRole('button',{name:'아이 등록 시작'}).click();await page.getByLabel('등록할 아이의 승인 결과').selectOption({label:'F04 가상 첫째'});await page.getByRole('button',{name:'이 승인 결과로 등록 계속'}).click();
 await expect(page.getByText('확인된 생년월일 2018-03-02')).toBeVisible();await page.reload();await page.getByLabel('아이 별명').fill('F04 가상 아이');await page.getByLabel('일정·대화·학원비를 위한').check();await page.getByRole('button',{name:'동의하고 아이 등록'}).click();
 await page.getByRole('button',{name:'보호자 초대',exact:true}).click();const invite=await page.getByLabel('24시간 동안 사용할 초대 링크').inputValue();
 const guestContext=await browser.newContext({viewport:{width:390,height:844}}),guest=await guestContext.newPage();await login(guest,request,'f04-browser-guest@example.test',false);await guest.goto('/family/invite?legacy=1');await guest.getByLabel('가족 고유키 또는 초대 링크').fill('invalid-key');await guest.getByRole('button',{name:'고유키 확인',exact:true}).click();await expect(guest.getByRole('alert')).toContainText('받은 가족 고유키');await guest.getByLabel('가족 고유키 또는 초대 링크').fill(invite.split('#')[1]);await guest.getByRole('button',{name:'고유키 확인',exact:true}).click();
 await expect(guest).toHaveURL('http://127.0.0.1:4174/family/invite?legacy=1');await guest.getByRole('button',{name:'가족 참여 신청'}).click();await guest.getByRole('link',{name:'우리 가족으로'}).click();await guest.goto('/family?legacy=1');await expect(guest.getByRole('heading',{name:'F04 가상 가족 · 참여 승인 대기'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'참여 승인',exact:true}).click();await guest.getByRole('button',{name:'참여 상태 새로고침'}).first().click();await expect(guest.getByText('아직 공유받은 아이가 없어요')).toBeVisible();
 await page.getByRole('button',{name:'F04 가상 아이 동의·공유·기기 관리'}).click();const grant=page.locator('.grant-editor').filter({has:page.getByRole('button',{name:'공유 범위 저장'})});await grant.getByLabel('일정과 등하원').check();await grant.getByRole('button',{name:'공유 범위 저장'}).click();
 await guest.reload();await expect(guest.getByRole('button',{name:'F04 가상 아이 공유받은 아이'})).toBeVisible();await expect(guest.getByRole('heading',{name:'보호자별 공유 범위'})).toHaveCount(0);
 for(const width of [320,390,768]){await guest.setViewportSize({width,height:900});await expect.poll(()=>guest.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 await guest.screenshot({path:'test-results/f04-invited-family.png',fullPage:true});await page.screenshot({path:'test-results/f04-family-sharing.png',fullPage:true});
 await grant.getByLabel('일정과 등하원').uncheck();await grant.getByRole('button',{name:'공유 범위 저장'}).click();await guest.reload();await expect(guest.getByText('아직 공유받은 아이가 없어요')).toBeVisible();
 expect(errors).toEqual([]);await guestContext.close();await reviewContext.close();
});


