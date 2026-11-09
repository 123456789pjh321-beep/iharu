import {test,expect,type APIRequestContext} from '@playwright/test';
import {legalInitialDraft,serviceIntroDefault} from '../../shared/legal';
const origin='http://127.0.0.1:4174',password='legal-save-fixture-2026';
test.use({baseURL:origin});
test.describe.configure({mode:'serial'});
async function signup(client:APIRequestContext,email:string,admin=false){
 expect((await client.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:email.split('@')[0],password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
 const mail=await(await client.get('/__test__/mail')).json();await client.get(mail.find((item:{to:string})=>item.to===email).url);
 expect((await client.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
 await client.post('/api/v1/workspace/me',{headers:{Origin:origin},data:{}});
 if(admin)expect((await client.post('/__test__/system-admin',{data:{email}})).ok()).toBe(true);
}
async function legal(client:APIRequestContext,op:string,data:object={}){const response=await client.post('/api/v1/legal/'+op,{headers:{Origin:origin},data});expect(response.ok(),await response.text()).toBe(true);return response.json();}
test('long Korean draft saves once, survives reload, and shows field-specific publication gaps',async({page})=>{
 await signup(page.request,'ui126-large@example.test',true);let saves=0;page.on('request',request=>{if(request.url().endsWith('/legal/admin.save'))saves++;});
 await page.goto('/admin?section=legal');await expect(page.getByLabel('운영자명 (개인 또는 법인)',{exact:true})).toBeVisible();
 await page.getByLabel('운영자명 (개인 또는 법인)',{exact:true}).fill('한글 문서 저장 관리자');
 for(const title of ['이용약관','개인정보처리방침']){await page.locator('summary').filter({hasText:new RegExp('^'+title)}).click();await page.getByLabel(title,{exact:true}).fill('가'.repeat(30000));}
 await page.getByLabel('저장·게시 사유',{exact:true}).fill('긴 한글 문서 저장 확인');
 await page.getByRole('button',{name:'초안 저장',exact:true}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});
 await expect(page.getByText('초안을 저장했습니다. 게시 전까지 외부에 공개되지 않습니다.',{exact:true})).toBeVisible();expect(saves).toBe(1);
 const stored=await legal(page.request,'admin.read');expect(stored.draft.terms).toHaveLength(30000);expect(stored.draft.privacy).toHaveLength(30000);
 await expect(page.getByRole('button',{name:'저장한 초안 게시',exact:true})).toBeDisabled();
 await expect(page.getByLabel('게시 전 확인 항목')).toContainText('처리 위탁');
 await page.reload();await expect(page.getByLabel('운영자명 (개인 또는 법인)',{exact:true})).toHaveValue('한글 문서 저장 관리자');
 await page.locator('summary').filter({hasText:/^이용약관/}).click();await expect(page.getByLabel('이용약관',{exact:true})).toHaveValue('가'.repeat(30000));
 expect((await(await page.request.get('/api/v1/legal/public')).json()).publication).toBeNull();
});
test('request failures and request responses preserve unsaved edits; stale versions require explicit resolution',async({page,playwright})=>{
 await signup(page.request,'ui126-conflict@example.test',true);
 const requester=await playwright.request.newContext({baseURL:origin});
 try{
  await signup(requester,'ui126-requester@example.test');await legal(requester,'request.create',{kind:'ACCESS',detail:'정보 열람을 요청합니다.'});
  await page.route('**/api/v1/legal/admin.requests',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'UNAVAILABLE',message:'요청 목록 테스트 실패'}})}));
  await page.goto('/admin?section=legal');await expect(page.getByLabel('운영자명 (개인 또는 법인)',{exact:true})).toBeVisible();
  await expect(page.getByText('요청 목록 테스트 실패',{exact:true})).toBeVisible();
  await page.getByLabel('운영자명 (개인 또는 법인)',{exact:true}).fill('아직 저장하지 않은 내 입력');
  await page.unroute('**/api/v1/legal/admin.requests');await page.getByRole('button',{name:'요청 목록 다시 불러오기'}).click();
  const item=page.locator('details.privacy-request').filter({hasText:'ui126-requester'});await item.locator('summary').click();
  await item.getByLabel('회원에게 보일 답변',{exact:true}).fill('본인 확인 후 열람 범위를 안내하겠습니다.');await item.getByLabel('내부 변경 사유',{exact:true}).fill('요청 검토 시작');await item.getByRole('button',{name:'처리 결과 저장'}).click();
  await expect(page.getByText('요청 처리 결과를 저장했습니다.',{exact:true})).toBeVisible();await expect(page.getByLabel('운영자명 (개인 또는 법인)',{exact:true})).toHaveValue('아직 저장하지 않은 내 입력');
  const current=await legal(page.request,'admin.read');await legal(page.request,'admin.save',{version:current.version,draft:{...current.draft,operatorName:'다른 화면의 최신 저장'},reason:'동시 변경 확인'});
  await page.getByLabel('저장·게시 사유',{exact:true}).fill('내 입력 저장 시도');await page.getByRole('button',{name:'초안 저장',exact:true}).click();
  await expect(page.getByRole('heading',{name:'최신 저장본과 비교해 주세요'})).toBeVisible();await expect(page.getByLabel('운영자명 (개인 또는 법인)',{exact:true})).toHaveValue('아직 저장하지 않은 내 입력');
  await page.getByText('서버의 최신 저장본 보기',{exact:true}).click();await expect(page.getByRole('alert').filter({has:page.getByRole('heading',{name:'최신 저장본과 비교해 주세요'})})).toContainText('다른 화면의 최신 저장');
  await page.getByRole('button',{name:'내 입력 내용 유지',exact:true}).click();await page.getByRole('button',{name:'초안 저장',exact:true}).click();await expect(page.getByText('초안을 저장했습니다. 게시 전까지 외부에 공개되지 않습니다.',{exact:true})).toBeVisible();
  expect((await legal(page.request,'admin.read')).draft.operatorName).toBe('아직 저장하지 않은 내 입력');
  // Saving one editor must not silently advance the other editor's optimistic lock.
  await page.getByLabel('서비스 소개 제목',{exact:true}).fill('내가 편집 중인 소개');
  const server=await legal(page.request,'admin.read');await legal(page.request,'admin.service.save',{version:server.service.version,draft:{...serviceIntroDefault,title:'다른 관리자가 저장한 소개'},reason:'다른 편집기의 동시 변경'});
  await page.getByRole('button',{name:'초안 저장',exact:true}).click();await expect(page.getByText('초안을 저장했습니다. 게시 전까지 외부에 공개되지 않습니다.',{exact:true})).toBeVisible();
  await page.getByLabel('서비스 소개 저장·게시 사유',{exact:true}).fill('편집기별 버전 충돌 검사');await page.getByRole('button',{name:'서비스 소개 초안 저장',exact:true}).click();
  await expect(page.getByRole('heading',{name:'최신 저장본과 비교해 주세요'})).toBeVisible();await expect(page.getByLabel('서비스 소개 제목',{exact:true})).toHaveValue('내가 편집 중인 소개');
  await page.getByRole('button',{name:'최신 저장본으로 교체',exact:true}).click();await expect(page.getByLabel('서비스 소개 제목',{exact:true})).toHaveValue('다른 관리자가 저장한 소개');

  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/ui126-admin-save-mobile.png',fullPage:true,animations:'disabled'});
 }finally{await requester.dispose();}
});
test('publishes service introduction to public and app readers, while incomplete legal drafts remain private',async({page,browser})=>{
 await signup(page.request,'ui126-publish@example.test',true);await page.goto('/admin?section=legal');
 await page.getByLabel('서비스 소개 제목',{exact:true}).fill('가족을 위한 서비스 안내');
 const body=serviceIntroDefault.body+'\n<script>window.injected=true</script>';
 await page.getByLabel('서비스 소개 본문',{exact:true}).fill(body);await page.getByLabel('서비스 소개 저장·게시 사유',{exact:true}).fill('실제 기능 소개 게시');
 await page.getByRole('button',{name:'서비스 소개 초안 저장',exact:true}).click();await expect(page.getByText('서비스 소개 초안을 저장했습니다. 게시하면 외부 화면에 반영됩니다.',{exact:true})).toBeVisible();
 await page.request.post('/api/account/reauthenticate',{headers:{Origin:origin},data:{password}});
 await page.getByLabel('서비스 소개가 실제 제공 기능과 일치함을 확인했습니다.',{exact:true}).check();await page.getByRole('button',{name:'저장한 서비스 소개 게시',exact:true}).click();await expect(page.getByText('서비스 소개를 게시했습니다. 홈페이지와 앱에서 확인할 수 있습니다.',{exact:true})).toBeVisible();
 const visitor=await browser.newContext({baseURL:origin});try{const publicPage=await visitor.newPage();await publicPage.goto('/service');await expect(publicPage.getByRole('heading',{name:'가족을 위한 서비스 안내',exact:true})).toBeVisible();await expect(publicPage.getByLabel('서비스 소개 본문')).toContainText('<script>');expect(await publicPage.evaluate(()=>(window as any).injected)).toBeUndefined();}finally{await visitor.close();}
 await page.goto('/more');await page.getByRole('link',{name:'서비스 소개',exact:true}).click();await expect(page).toHaveURL(/\/more\/service$/);await expect(page.getByRole('heading',{name:'가족을 위한 서비스 안내',exact:true})).toBeVisible();await expect(page.locator('.public-header,.marketing-site')).toHaveCount(0);await expect(page.getByRole('link',{name:'로그인',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/ui126-service-reader-mobile.png',fullPage:true,animations:'disabled'});
 const config=await legal(page.request,'admin.read');expect(config.publication).toBeNull();
 const verified={...legalInitialDraft,operatorName:'가상 운영자',privacyOfficer:'가상 책임자',contactEmail:'review@example.test',children:'가상 확인 절차와 어린이 문의 안내',processors:'검증용 위탁 계약 내용',transfers:'검증용 이전 국가와 근거',retention:'검증용 항목별 실제 보유 기준',reviewNotes:'PRIVATE-REVIEW-NOTES'};
 await legal(page.request,'admin.save',{version:config.version,draft:verified,reason:'검증 문서 저장'});await legal(page.request,'admin.publish',{version:config.version+1,reviewed:true,reason:'검증된 문서 게시'});
 for(const [path,text] of [['terms','아이하루 이용약관'],['privacy','아이하루 개인정보처리방침']]){await page.goto('/legal/'+path);await expect(page.locator('.legal-document .legal-prose').first()).toContainText(text);await expect(page.locator('.legal-document')).not.toContainText('PRIVATE-REVIEW-NOTES');}
});
