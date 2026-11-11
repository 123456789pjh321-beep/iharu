import {test,expect,type Page,type APIRequestContext} from '@playwright/test';

const origin='http://127.0.0.1:4174';
const password='group-invite-browser-password';
test.use({baseURL:origin,viewport:{width:390,height:844},actionTimeout:10000});

async function register(page:Page,request:APIRequestContext,email:string,name:string,invite=false){
 const response=await page.request.post('/api/auth/sign-up/email',{
  headers:{Origin:origin},data:{email,name,password,callbackURL:'/login?verified=1'+(invite?'&next=%2Finvite':'')}
 });
 expect(response.ok(),await response.text()).toBe(true);
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
 await page.getByRole('button',{name:'초대 링크 만들기'}).click();
 const field=page.getByLabel('발급한 초대 링크');
 await expect(field).toBeVisible();
 return field.inputValue();
}

test('adult link resumes after email verification and requires explicit acceptance',async({page,browser,request})=>{
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
  await expect(guest.getByRole('link',{name:'로그인하고 계속'})).toHaveAttribute('href','/login?role=parent&next=%2Finvite');
  await guest.getByRole('link',{name:'일반사용자 회원가입'}).click();
  await register(guest,request,'group-link-guest@example.test','가상 초대 손님',true);
  await expect(guest.getByRole('button',{name:'초대 수락'})).toBeVisible();
  await expect(page.locator('.personal-member')).toHaveCount(1);
  await guest.getByRole('button',{name:'초대 수락'}).click();
  await guest.getByRole('link',{name:'그룹 관리 열기'}).click();
  await expect(guest.locator('.personal-member')).toHaveCount(2);
  await guest.goto(link);
  await expect(guest.getByRole('alert')).toContainText('이미 사용');
 }finally{await context.close();}
});

test('verified guardian can share a child link to a separate browser for signup',async({page,browser,request})=>{
 test.setTimeout(90000);
 await register(page,request,'child-link-host@example.test','가상 보호자');
 await page.goto('/family/verification');
 await page.getByLabel('아이 구분 이름').fill('초대용 가상 첫째');
 await page.getByLabel('아이와의 관계').selectOption('LEGAL_GUARDIAN');
 await page.getByRole('button',{name:'일반사용자 확인 신청',exact:true}).click();
 const review=await browser.newContext({baseURL:origin}),child=await browser.newContext({baseURL:origin,viewport:{width:390,height:844}});
 try{
  const reviewer=await review.newPage();
  reviewer.setDefaultTimeout(12000);
  await register(reviewer,request,'child-link-reviewer@example.test','가상 심사자');
  await request.post('/__test__/reviewer',{data:{email:'child-link-reviewer@example.test'}});
  await reviewer.goto('/family/verification/review');
  const card=reviewer.locator('.guardian-application').filter({hasText:'초대용 가상 첫째'});
  await card.getByRole('button',{name:'심사 시작'}).click();
  await card.getByLabel('증빙 심사 기록 번호').fill('invite-review-fixture');
  await card.getByLabel('확인된 대상 참조 번호').fill('invite-subject-fixture');
  await card.getByLabel('기록에서 신청인과').check();
  await card.getByRole('button',{name:'승인',exact:true}).click();
  await card.getByLabel('증빙에서 확인한 생년월일').fill('2018-03-02');
  await card.getByLabel('승인한 대상과 생년월일이').check();
  await card.getByRole('button',{name:'등록 정보 확인 완료'}).click();
  await expect(card).toHaveCount(0);
  await page.goto('/family');
  await page.getByLabel('초대 대상').selectOption('CHILD');
  await page.getByLabel('보호자 확인이 끝난 어린이').selectOption({label:'초대용 가상 첫째'});
  const link=await issue(page);
  const guest=await child.newPage();
  guest.setDefaultTimeout(12000);
  await guest.goto(link);
  await expect(guest.getByRole('heading',{name:'어린이 계정 만들기'})).toBeVisible();
  await guest.getByLabel('그룹에서 쓸 이름').fill('가상 서준');
  await guest.getByLabel('아이디',{exact:true}).fill('group_link_child');
  await guest.getByLabel('암호',{exact:true}).fill('group-link-child-password');
  await guest.getByRole('button',{name:'가입하고 그룹 연결'}).click();
  await expect(guest).toHaveURL(origin+'/family');
  await expect(guest.locator('.personal-member')).toHaveCount(2);
 }finally{await review.close();await child.close();}
});
