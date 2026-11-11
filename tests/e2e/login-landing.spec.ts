import {test,expect} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:4174'});

for(const width of [390,1320])test(`one login form serves both regular and old bookmarks at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/api/account/session',route=>route.fulfill({json:{authenticated:false}}));
  await page.route('**/api/account/providers',route=>route.fulfill({json:{providers:[{id:'email',name:'이메일',enabled:true}]}}));
  for(const path of ['/login','/login?role=child']){
    await page.goto(path);
    await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeEnabled();
    await expect(page.getByLabel('아이디',{exact:true})).toHaveAttribute('placeholder','이메일 또는 아이디');
    await expect(page.getByRole('navigation',{name:'로그인 대상'})).toHaveCount(0);
    await expect(page.getByRole('link',{name:'회원가입',exact:true})).toHaveAttribute('href','/signup?next=%2Ftimetable');
  }
});

test('email-less Kakao session enters the live home without demo or protected-data requests',async({page})=>{
  // UI contract fixture only; the real email-less Kakao callback/cookie is tested in auth.test.ts.
  const paths:string[]=[];page.on('request',r=>paths.push(new URL(r.url()).pathname));
  let state:'signed-in'|'expired'|'error'='signed-in';
  await page.route('**/api/account/session',route=>state==='error'?route.fulfill({status:503,json:{error:{code:'AUTH_UNAVAILABLE',message:'연결을 확인해 주세요.'}}}):route.fulfill({json:state==='expired'?{authenticated:false}:{authenticated:true,assurance:'HIGH',name:'가상 카카오 일반사용자',email:null,emailVerified:false,accessReady:false}}));
  await page.goto('/login');await expect(page).toHaveURL(/\/timetable$/);
  await expect(page.getByRole('heading',{name:'이메일 확인',exact:true})).toBeVisible();
  await expect(page.getByText('로그인 완료',{exact:true})).toBeVisible();
  expect(paths.filter(p=>p.startsWith('/api/demo/')||p.startsWith('/api/v1/'))).toEqual([]);
  await page.reload();await expect(page.getByRole('heading',{name:'이메일 확인',exact:true})).toBeVisible();
  state='error';await page.reload();await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/timetable$/);
  state='signed-in';await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'이메일 확인',exact:true})).toBeVisible();
  state='expired';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
});

test('LOW session keeps additional verification and explicit social reauthentication reachable',async({page})=>{
  await page.route('**/api/account/session',route=>route.fulfill({json:{authenticated:true,assurance:'LOW',accessReady:false}}));
  for(const path of ['/today','/login']) {
    await page.goto(path);await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading',{name:'한 번 더 확인할게요'})).toBeVisible();
  }
  await page.getByRole('link',{name:'연결한 소셜 계정으로 로그인',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?reauth=1$/);
  await expect(page.getByRole('button',{name:'로그인',exact:true})).toBeVisible();
});


test('Kakao without verified contact sees successful login and actionable chat setup, not a load failure',async({page})=>{
  const protectedRequests:string[]=[];
  page.on('request',r=>{if(r.url().includes('/api/v1/chat-rooms'))protectedRequests.push(r.url());});
  await page.route('**/api/account/session',r=>r.fulfill({json:{authenticated:true,assurance:'HIGH',email:null,emailVerified:false,accessReady:false}}));
  await page.goto('/chat?legacy=1');
  await expect(page.getByText('로그인 완료',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'단체 대화를 준비하고 있어요'})).toBeVisible();
  await expect(page.getByRole('link',{name:'그룹 연결 상태 확인'})).toHaveAttribute('href','/family');
  await expect(page.getByText('화면을 불러오지 못했어요')).toHaveCount(0);
  expect(protectedRequests).toEqual([]);
});

test('chat retains versioned API error message and redirects when session expires',async({page})=>{
  await page.route('**/api/account/session',r=>r.fulfill({json:{authenticated:true,assurance:'HIGH',email:'fixture@example.test',emailVerified:true,accessReady:true}}));
  let expired=false;
  await page.route('**/api/v1/chat-rooms',r=>r.fulfill({status:expired?401:403,json:{error:{code:expired?'AUTH_REQUIRED':'ACCESS_NOT_READY',message:'계정 확인과 그룹 연결을 먼저 마쳐 주세요.'},meta:{requestId:'fixture',serverNow:new Date().toISOString()}}}));
  await page.goto('/chat?legacy=1');
  await expect(page.getByText('계정 확인과 그룹 연결을 먼저 마쳐 주세요.')).toBeVisible();
  expired=true;
  await page.route('**/api/account/session',r=>r.fulfill({json:{authenticated:false}}));
  await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('expired OAuth callback explains how to restart without reflecting provider details',async({page})=>{
  await page.goto('/login?error=state_not_found&error_description=secret-provider-detail');
  await expect(page.getByText('로그인 연결이 만료됐어요.',{exact:false})).toBeVisible();
  await expect(page.getByText('secret-provider-detail')).toHaveCount(0);
});


test('deployment hostname hands off to configured login origin before OAuth POST',async({page})=>{
 const posts:string[]=[];
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/auth/'))posts.push(r.url());});
 await page.route('**/api/account/session',r=>r.fulfill({json:{authenticated:false}}));
 await page.route('**/api/account/providers',r=>r.fulfill({json:{loginOrigin:'https://canonical.example.test',providers:[{id:'kakao',name:'카카오',enabled:true}]}}));
 await page.route('https://canonical.example.test/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Canonical login</h1>'}));
 await page.goto('/login?reauth=1');
 await expect(page).toHaveURL('https://canonical.example.test/login?reauth=1');
 expect(posts).toEqual([]);
});

