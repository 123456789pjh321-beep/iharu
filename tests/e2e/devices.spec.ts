import {test,expect,type Page} from '@playwright/test';
const origin='http://127.0.0.1:4174';
test.use({baseURL:origin,actionTimeout:10000});
async function setup(page:Page){
 const email=`f05-${crypto.randomUUID()}@example.test`,password='isolated-device-flow-password';
 async function post(path:string,data:object){const r=await page.request.post(path,{headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
 await post('/api/auth/sign-up/email',{email,password,name:'가상 보호자',callbackURL:'/login?verified=1'});
 const mail=await(await page.request.get('/__test__/mail')).json();await page.request.get(mail.find((m:{to:string})=>m.to===email).url);await post('/api/auth/sign-in/email',{email,password});await post('/__test__/ready',{email});
 const family=await post('/api/v1/families',{name:'F05 가상 가족'}),children=[];
 for(const nickname of ['F05 첫째','F05 둘째']){const d=await post(`/api/v1/families/${family.id}/child-registration-drafts`,{});await post('/__test__/verify-draft',{draftId:d.id});const proof=await post(`/api/v1/child-registration-drafts/${d.id}/consent-proofs`,{general:true,location:false,policyVersion:'6.1'});children.push(await post(`/api/v1/families/${family.id}/children`,{draftId:d.id,proofId:proof.proofId,nickname,birthDate:'2018-03-02'}));}
 return {post,first:children[0].id as string,second:children[1].id as string};
}
async function sendPicture(page:Page,label:string){await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'보낼 말 확인하기'}).click();await page.getByRole('dialog').getByRole('button',{name:'보내기',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);}
test('F05 two browsers complete renewed pairing, reload, lost exchange reply, pictures in both directions and revocation',async({page,browser})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const {first,second}=await setup(page);
 await page.goto('/family');await page.getByRole('button',{name:'F05 첫째 동의·공유·기기 관리'}).click();
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),child=await ctx.newPage();child.on('pageerror',e=>errors.push(e.message));
 try{
  await child.goto(origin+'/device/connect');await child.getByRole('button',{name:'연결 번호 받기'}).click();const oldCode=(await child.locator('.pairing-code').innerText()).replace(/\s/g,'');
  await child.getByRole('button',{name:'새 번호 받기'}).click();await expect.poll(async()=>child.locator('.pairing-code').innerText()).not.toBe(oldCode.slice(0,3)+' '+oldCode.slice(3));
  const code=(await child.locator('.pairing-code').innerText()).replace(/\s/g,'');await child.reload();await expect(child.locator('.pairing-code')).toContainText(code.slice(0,3));
  const rejected=await page.request.post('/api/v1/device-pairings/resolve',{headers:{Origin:origin},data:{code:oldCode}});expect(rejected.status()).toBe(400);
  await page.getByLabel('6자리 연결 번호').fill(code);await page.getByRole('button',{name:'연결할 기기 확인'}).click();await page.getByRole('button',{name:'이 아이의 기기로 승인'}).click();
  await expect(child.getByRole('heading',{name:'내 이름이 맞나요?'})).toBeVisible({timeout:10000});await expect(child.getByRole('region',{name:'연결할 아이 확인'})).toContainText('F05 첫째');await expect(child.getByRole('region',{name:'연결할 아이 확인'})).toContainText('F05 가상 가족');
  await child.screenshot({path:'test-results/f05-confirm-390.png',fullPage:true});
  let lost=true;await child.route('**/api/v1/device-pairings/*/exchange',async route=>{if(lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();});
  await child.getByRole('button',{name:'내 기기로 연결하기'}).click();await expect(child.getByRole('alert')).toBeVisible();await child.getByRole('button',{name:'내 기기로 연결하기'}).click();
  await expect(child.getByRole('heading',{name:'F05 첫째, 반가워요'})).toBeVisible();await child.reload();await child.getByRole('link',{name:'가족에게 말하기'}).click();await expect(child).toHaveURL(origin+`/child/chat?child=${first}`);
  await expect(child.getByRole('heading',{name:'F05 첫째 가족방'})).toBeVisible();await expect(child.getByText('F05 둘째')).toHaveCount(0);
  const devices=await(await page.request.get(`/api/v1/children/${first}/devices`)).json();expect(devices.devices).toHaveLength(1);
  await sendPicture(child,'도착했어요');await page.getByRole('link',{name:'F05 첫째 가족방 열기'}).click();await expect(page.locator('.chat-bubble').filter({hasText:'도착했어요'})).toHaveCount(1);
  await sendPicture(page,'기다릴게요');await child.getByRole('button',{name:'대화 새로고침'}).click();await expect(child.locator('.chat-bubble').filter({hasText:'기다릴게요'})).toHaveCount(1);
  expect((await(await page.request.get(`/api/v1/children/${second}/messages`)).json()).data.items).toHaveLength(0);
  for(const width of [320,390,768]){await child.setViewportSize({width,height:900});await expect.poll(()=>child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  await child.screenshot({path:'test-results/f05-chat-768.png',fullPage:true});
  // A signed-in guardian in the same browser must not widen the child view.
  await ctx.addCookies(await page.context().cookies());await child.reload();await expect(child.getByRole('heading',{name:'F05 첫째 가족방'})).toBeVisible();await expect(child.getByText('F05 둘째')).toHaveCount(0);
  await child.goto(origin+`/child/chat?child=${second}`);await expect(child.getByRole('heading',{name:'선택한 대화방에 접근할 수 없어요'})).toBeVisible();await expect(child.getByRole('region',{name:'메시지 만들기'})).toHaveCount(0);
  await child.goto(origin+`/child/chat?child=${first}`);await expect(child.locator('.chat-bubble')).toHaveCount(2);
  const revoke=await page.request.delete(`/api/v1/children/${first}/devices/${devices.devices[0].id}`,{headers:{Origin:origin},data:{}});expect(revoke.ok()).toBe(true);
  await child.getByRole('button',{name:'대화 새로고침'}).click();await expect(child.getByRole('heading',{name:'기기 연결을 확인해 주세요'})).toBeVisible();await expect(child.locator('.chat-bubble')).toHaveCount(0);await expect(child.getByRole('region',{name:'메시지 만들기'})).toHaveCount(0);
  expect((await ctx.request.get(origin+'/api/v1/chat-rooms',{headers:{'X-Iharu-Actor':'child'}})).status()).toBe(401);
  await page.goto('/device/connect');await expect(page.getByRole('heading',{name:'아이 기기에서 시작해 주세요'})).toBeVisible();expect(errors).toEqual([]);
 }finally{await ctx.close();}
});
test('F05 child rejects the wrong approved name and obtains a new code without creating a device',async({page,browser})=>{
 const {post,second}=await setup(page),ctx=await browser.newContext({viewport:{width:320,height:740}}),child=await ctx.newPage();
 try{
  await child.goto(origin+'/device/connect');await child.getByRole('button',{name:'연결 번호 받기'}).click();const code=(await child.locator('.pairing-code').innerText()).replace(/\s/g,'');
  const p=await post('/api/v1/device-pairings/resolve',{code});await post(`/api/v1/device-pairings/${p.id}/approve`,{childId:second,expectedVersion:p.version});
  await expect(child.getByRole('heading',{name:'내 이름이 맞나요?'})).toBeVisible({timeout:10000});await expect(child.getByRole('region',{name:'연결할 아이 확인'})).toContainText('F05 둘째');
  await child.getByRole('button',{name:'다른 아이예요 · 연결 취소'}).click();await expect(child.getByRole('heading',{name:'가족과 연결해 볼까요?'})).toBeVisible();
  expect((await(await page.request.get(`/api/v1/children/${second}/devices`)).json()).devices).toHaveLength(0);
  await child.getByRole('button',{name:'연결 번호 받기'}).click();await expect(child.locator('.pairing-code')).toBeVisible();await expect.poll(()=>child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{await ctx.close();}
});

