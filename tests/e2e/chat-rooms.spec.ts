import {test,expect,type APIRequestContext} from '@playwright/test';
const origin='http://127.0.0.1:4174',password='room-browser-fixture-2026';
test.use({baseURL:origin,viewport:{width:390,height:844},reducedMotion:'reduce'});
async function command(client:APIRequestContext,op:string,data:object={}){const r=await client.post('/api/v1/workspace/'+op,{headers:{Origin:origin},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
test('creates and switches individual and selected-member rooms without mixing drafts or messages',async({page,browser})=>{
 test.setTimeout(120000);
 const contexts=[];
 for(const name of ['민수','지우','서연']){
  const context=await browser.newContext({baseURL:origin,viewport:{width:390,height:844},extraHTTPHeaders:{'x-fixture-client':'room-browser-'+contexts.length}});
  const email='ui130-'+contexts.length+'@example.test';
  expect((await context.request.post('/api/auth/sign-up/email',{headers:{Origin:origin},data:{email,password,name,callbackURL:'/login?verified=1'}})).ok()).toBe(true);
  const mails=await(await context.request.get('/__test__/mail')).json();await context.request.get(mails.find((m:{to:string})=>m.to===email).url);
  expect((await context.request.post('/api/auth/sign-in/email',{headers:{Origin:origin},data:{email,password}})).ok()).toBe(true);contexts.push(context);
 }
 try{
  for(const context of contexts.slice(1)){const invitation=await command(contexts[0].request,'invite.issue',{consent:true});await command(context.request,'family.join',{code:invitation.code});}
  const host=await contexts[0].newPage();await host.goto('/chat');await expect(host.getByRole('heading',{name:'단체 대화',exact:true})).toBeVisible();
  await host.getByRole('button',{name:'대화방 만들기',exact:true}).click();const dialog=host.getByRole('dialog',{name:'대화방 만들기'});
  await dialog.getByRole('checkbox',{name:/지우/}).check();await dialog.getByRole('button',{name:'대화 시작하기'}).click();await expect(dialog).not.toBeVisible();
  await expect(host.getByRole('heading',{name:'지우',exact:true})).toBeVisible();const input=host.getByRole('textbox',{name:'참여자에게 전할 말'});
  await input.fill('지우에게만 보이는 메시지');await host.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(host.getByRole('button',{name:'메시지 수정: 지우에게만 보이는 메시지',exact:true})).toBeVisible();
  await input.fill('보내지 않은 개인 초안');await host.getByRole('navigation',{name:'대화방 목록'}).getByRole('button',{name:'단체 대화 그룹 전체'}).click();await expect(input).toHaveValue('');await expect(host.getByText('지우에게만 보이는 메시지',{exact:true})).toHaveCount(0);
  const guest=await contexts[2].newPage();await guest.goto('/chat');await expect(guest.getByRole('heading',{name:'단체 대화',exact:true})).toBeVisible();await expect(guest.getByRole('navigation',{name:'대화방 목록'}).getByRole('button')).toHaveCount(1);
  await host.getByRole('button',{name:'대화방 만들기',exact:true}).click();await dialog.getByRole('checkbox',{name:/지우/}).check();await dialog.getByRole('checkbox',{name:/서연/}).check();await dialog.getByRole('textbox',{name:'대화방 이름'}).fill('주말 모임');await dialog.getByRole('button',{name:'대화 시작하기'}).click();await expect(dialog).not.toBeVisible();await expect(host.getByRole('heading',{name:'주말 모임',exact:true})).toBeVisible();
  await input.fill('선택한 구성원끼리 함께해요');await host.getByRole('button',{name:'메시지 보내기',exact:true}).click();await expect(host.getByRole('button',{name:'메시지 수정: 선택한 구성원끼리 함께해요',exact:true})).toBeVisible();
  const peer=await contexts[1].newPage();await peer.goto('/chat');await peer.getByRole('navigation',{name:'대화방 목록'}).getByRole('button',{name:'민수 1:1 대화'}).click();await expect(peer.getByRole('button',{name:'메시지 상세: 지우에게만 보이는 메시지',exact:true})).toBeVisible();
  await peer.reload();await peer.getByRole('navigation',{name:'대화방 목록'}).getByRole('button',{name:'민수 1:1 대화'}).click();await expect(peer.getByRole('button',{name:'메시지 상세: 지우에게만 보이는 메시지',exact:true})).toBeVisible();
  for(const size of [{width:320,height:700},{width:390,height:844},{width:1440,height:900}]){
   await host.setViewportSize(size);const composer=(await input.boundingBox())!,nav=(await host.getByRole('navigation',{name:'모바일 주 메뉴'}).boundingBox())!;expect(composer.y+composer.height).toBeLessThanOrEqual(nav.y);expect(await host.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await host.screenshot({path:'test-results/ui130-chat-'+size.width+'.png',animations:'disabled'});
  }
 }finally{for(const context of contexts)await context.close();}
 await page.goto('/timetable');await expect(page.locator('#app-launch')).toHaveCount(0,{timeout:12000});await expect(page.locator('[data-guest-workspace]')).toBeVisible();expect((await page.locator('.member-preference').boundingBox())!.y).toBeGreaterThanOrEqual(24);
 await page.screenshot({path:'test-results/ui130-timetable.png',animations:'disabled'});
 await page.goto('/login');await expect(page.getByRole('link',{name:'일반사용자',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'어린이',exact:true})).toBeVisible();
 await page.goto('/chat');await page.getByRole('button',{name:'대화방 만들기',exact:true}).click();await expect(page.locator('.entry-login-sheet')).toBeVisible();
});
