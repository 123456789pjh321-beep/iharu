import {test,expect,request as apiRequest} from '@playwright/test';
const origin='http://127.0.0.1:4174';test.use({baseURL:origin});
test('new family content dots clear after the destination loads and the replaced memo menu does not contribute a hidden update dot',async({page,request})=>{
 test.setTimeout(120000);
 const password='menu-dot-fixture-2026',other=await apiRequest.newContext({baseURL:origin});
 try{
  for(const [client,email] of [[page.request,'dot-reader@example.test'],[other,'dot-writer@example.test']] as const){
   expect((await client.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,name:email.split('@')[0],password,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
   const mail=await(await request.get('/__test__/mail')).json();await client.get(mail.find((m:{to:string})=>m.to===email).url);expect((await client.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);
  }
  const call=async(client:typeof other,op:string,data:object={})=>{const r=await client.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();};
  const invite=await call(page.request,'invite.issue',{consent:true});await call(other,'family.join',{code:invite.code});
  await page.goto('/family');await expect(page.getByRole('heading',{name:'연결된 가족',exact:true})).toBeVisible();await page.goto('/timetable');
  const nav=page.getByRole('navigation',{name:'모바일 주 메뉴'}),chat=nav.getByRole('link',{name:'대화',exact:true}),more=nav.getByRole('link',{name:'더보기',exact:true});
  await call(other,'chat.send',{text:'읽음 표시 확인 메시지',clientMessageId:crypto.randomUUID()});
  await expect(chat.locator('.workspace-nav-update')).toHaveCount(1,{timeout:15000});await expect(chat).toHaveAccessibleDescription('새 업데이트가 있어요');
  await chat.click();await expect(page.getByRole('button',{name:'메시지 상세: 읽음 표시 확인 메시지',exact:true})).toBeVisible();await expect(chat.locator('.workspace-nav-update')).toHaveCount(0);
  await page.goto('/timetable');await page.reload();await expect(chat.locator('.workspace-nav-update')).toHaveCount(0);
  const now=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
  await call(other,'items.create',{kind:'NOTE',data:{title:'새 메모 알림',date:now,note:'확인 후 사라져요'}});
  await expect(more.locator('.workspace-nav-update')).toHaveCount(0);await more.click();
  const menu=page.getByRole('navigation',{name:'더보기 메뉴',exact:true});await expect(menu.getByRole('link',{name:'메모',exact:true})).toHaveCount(0);await expect(menu.getByRole('link',{name:'알림설정',exact:true})).toBeVisible();
  await menu.getByRole('link',{name:'알림설정',exact:true}).click();await expect(page.getByRole('heading',{name:'알림설정',exact:true})).toBeVisible();
  await page.goto('/records');await expect(page.getByRole('heading',{name:'새 메모 알림',exact:true})).toBeVisible();

 }finally{await other.dispose();}
});
