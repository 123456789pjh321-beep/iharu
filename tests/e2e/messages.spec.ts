import {test,expect,type Page} from '@playwright/test';
import {sampleRecurringInputs} from '../../server/domain/sample-schedule';
import {addDays,koreaToday} from '../../shared/schedules';
test.use({baseURL:'http://127.0.0.1:4174',actionTimeout:10000});
const origin='http://127.0.0.1:4174';
async function sampleFamily(page:Page){
 const email=`chat-${crypto.randomUUID()}@example.test`,password='message-browser-fixture-password';
 async function post(path:string,data:object){const r=await page.request.post(path,{headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},data});expect(r.ok(),await r.text()).toBe(true);return r.json();}
 await post('/api/auth/sign-up/email',{email,password,name:'테스트 일반사용자',callbackURL:'/login?verified=1'});const mail=await(await page.request.get('/__test__/mail')).json();await page.request.get(mail.find((m:{to:string})=>m.to===email).url);await post('/api/auth/sign-in/email',{email,password});await post('/__test__/ready',{email});
 const family=await post('/api/v1/families',{name:'우리 그룹 · 테스트'});const children=[];
 // Synthetic birthdays satisfy the isolated fixture contract; only names/ages were provided.
 for(const [nickname,birthDate] of [['서준','2018-03-02'],['서하','2019-03-02']]){const draft=await post(`/api/v1/families/${family.id}/child-registration-drafts`,{});await post('/__test__/verify-draft',{draftId:draft.id,birthDate});const proof=await post(`/api/v1/child-registration-drafts/${draft.id}/consent-proofs`,{general:true,location:false,policyVersion:'6.1'});children.push(await post(`/api/v1/families/${family.id}/children`,{draftId:draft.id,proofId:proof.proofId,nickname,birthDate}));}
 const day=koreaToday();for(const input of sampleRecurringInputs(day,addDays(day,55)))await post(`/api/v1/children/${children[0].id}/schedules`,input);
 return {post,seojun:children[0].id as string,seoha:children[1].id as string,familyId:family.id as string};
}
test('P06 picture conversation saves once after a lost response, preserves delete and child scope',async({page,browser})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const {post,seojun,seoha}=await sampleFamily(page);
 await page.setViewportSize({width:1440,height:1000});await page.goto('/today?legacy=1');await expect(page.getByRole('button',{name:'서준',exact:true})).toBeVisible();await page.getByRole('button',{name:'서하',exact:true}).click();await expect(page.getByText('오늘은 등록된 일정이 없어요.')).toBeVisible();
 await page.goto('/chat?legacy=1');await expect(page.getByRole('heading',{name:'서준 그룹방',exact:true})).toBeVisible();await expect(page.getByLabel('그룹에게 쓸 말')).toHaveCount(0);
 for(const group of ['일상','이동','기분','부탁','마음','답장']){await page.getByRole('button',{name:group,exact:true}).click();await expect.poll(()=>page.locator('.chat-sticker-grid img').evaluateAll(imgs=>imgs.every(i=>(i as HTMLImageElement).complete&&(i as HTMLImageElement).naturalWidth>0))).toBe(true);}await page.getByRole('button',{name:'일상',exact:true}).click();
 await page.getByRole('button',{name:'도착했어요',exact:true}).click();expect((await(await page.request.get(`/api/v1/children/${seojun}/messages`)).json()).data.items).toHaveLength(0);
 await page.getByRole('button',{name:'보낼 말 확인하기'}).click();let lost=true;
 await page.route(`**/api/v1/children/${seojun}/messages`,async route=>{if(route.request().method()==='POST'&&lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();});
 await page.getByRole('dialog').getByRole('button',{name:'보내기',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();await page.getByRole('dialog').getByRole('button',{name:'다시 보내기',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.chat-bubble')).toHaveCount(1);
 expect((await(await page.request.get(`/api/v1/children/${seojun}/messages`)).json()).data.items).toHaveLength(1);await page.screenshot({path:'test-results/p06-parent-1440.png',fullPage:true});
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),child=await ctx.newPage();const pair=await(await ctx.request.post(origin+'/api/v1/device-pairings',{headers:{Origin:origin},data:{label:'서준 테스트 기기'}})).json();await post(`/api/v1/device-pairings/${pair.id}/approve`,{childId:seojun,expectedVersion:1});await ctx.request.post(origin+`/api/v1/device-pairings/${pair.id}/exchange`,{headers:{Origin:origin},data:{exchangeKey:crypto.randomUUID()}});
 await child.goto(origin+'/child/chat?legacy=1&legacy=1');await expect(child.locator('.chat-bubble')).toHaveCount(1);await expect.poll(async()=>{await page.getByRole('button',{name:'대화 새로고침'}).click();return page.getByText('그룹이 읽었어요',{exact:true}).count();}).toBe(1);
 await child.getByRole('button',{name:'부탁',exact:true}).click();await child.getByRole('button',{name:'도와주세요',exact:true}).click();await child.getByRole('button',{name:'보낼 말 확인하기'}).click();await expect(child.getByText('답이 바로 오지 않을 수 있어요. 급하면 가까운 어른에게도 말해요.')).toBeVisible();await child.getByRole('dialog').getByRole('button',{name:'보내기',exact:true}).click();await expect(child.getByRole('dialog')).toHaveCount(0);
 await child.screenshot({path:'test-results/p06-child-390.png',fullPage:true});for(const width of [320,390,768]){await child.setViewportSize({width,height:900});await expect.poll(()=>child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}await expect(child.getByRole('button',{name:'큰 글씨',exact:true})).toHaveCount(0);await expect.poll(()=>child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'대화 새로고침'}).click();await page.getByRole('button',{name:'메시지 삭제: 도착했어요'}).click();await page.getByRole('dialog').getByRole('button',{name:'삭제하기'}).click();await child.getByRole('button',{name:'대화 새로고침'}).click();await expect(child.getByText('삭제된 메시지예요',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'직접 글 쓰기'}).click();await page.getByLabel('그룹에게 쓸 말').fill('이 초안은 다른 방으로 보내면 안 돼요');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:/서하.*우리 그룹/}).click();await expect(page.getByRole('heading',{name:'서하 그룹방'})).toBeVisible();await expect(page.getByLabel('그룹에게 쓸 말')).toHaveCount(0);expect((await(await page.request.get(`/api/v1/children/${seoha}/messages`)).json()).data.items).toHaveLength(0);
 await ctx.close();expect(errors).toEqual([]);
});
test('P06 Enter only adds a newline; schedule fixture repeats without filling Seoha or unknown tuition',async({page})=>{
 test.setTimeout(90000);const {seojun,seoha,familyId}=await sampleFamily(page);const day=koreaToday();const response=await page.request.get(`/api/v1/families/${familyId}/calendar?from=${day}&to=${addDays(day,13)}&limit=50`);const data=await response.json();if(data.nextCursor){const more=await(await page.request.get(`/api/v1/families/${familyId}/calendar?from=${day}&to=${addDays(day,13)}&limit=50&cursor=${data.nextCursor}`)).json();data.occurrences.push(...more.occurrences);}expect(data.occurrences.filter((o:{childId:string})=>o.childId===seoha)).toHaveLength(0);expect(data.occurrences.filter((o:{childId:string;title:string})=>o.childId===seojun&&o.title==='로고스 영어')).toHaveLength(6);
 await page.goto('/chat?legacy=1');await page.getByRole('button',{name:'직접 글 쓰기'}).click();const input=page.getByLabel('그룹에게 쓸 말');await input.fill('첫째 줄');await input.press('Enter');await input.pressSequentially('둘째 줄');await expect(input).toHaveValue('첫째 줄\n둘째 줄');expect((await(await page.request.get(`/api/v1/children/${seojun}/messages`)).json()).data.items).toHaveLength(0);
});

test('P07 another device sees new messages, read state and deletions without refresh',async({page,browser})=>{
 test.setTimeout(90000);
 const {post,seojun}=await sampleFamily(page);
 const childContext=await browser.newContext(),childPage=await childContext.newPage();
 try{
  const pairResponse=await childContext.request.post(origin+'/api/v1/device-pairings',{headers:{Origin:origin},data:{label:'P07 아이 기기'}});
  expect(pairResponse.ok()).toBe(true);const pair=await pairResponse.json();
  const resolved=await post('/api/v1/device-pairings/resolve',{code:pair.code});
  await post(`/api/v1/device-pairings/${resolved.id}/approve`,{childId:seojun,expectedVersion:1});
  const exchange=await childContext.request.post(origin+`/api/v1/device-pairings/${pair.id}/exchange`,{headers:{Origin:origin},data:{exchangeKey:crypto.randomUUID()}});expect(exchange.ok()).toBe(true);
  await page.goto('/chat?legacy=1');await childPage.goto(origin+'/child/chat?legacy=1&legacy=1');
  await expect(childPage.getByRole('heading',{name:'서준 그룹방'})).toBeVisible();
  await childPage.getByRole('button',{name:'도착했어요',exact:true}).click();await childPage.getByRole('button',{name:'보낼 말 확인하기',exact:true}).click();await childPage.getByRole('dialog').getByRole('button',{name:'보내기',exact:true}).click();
  await expect(page.locator('.chat-bubble').getByText('도착했어요',{exact:true})).toBeVisible({timeout:22000});
  await page.locator('.chat-bubble').getByText('도착했어요',{exact:true}).scrollIntoViewIfNeeded();
  await expect(childPage.getByText('그룹이 읽었어요',{exact:true})).toBeVisible({timeout:22000});
  await childPage.getByRole('button',{name:'메시지 삭제: 도착했어요'}).click();await childPage.getByRole('dialog').getByRole('button',{name:'삭제하기',exact:true}).click();
  await expect(page.getByText('삭제된 메시지예요',{exact:true})).toBeVisible({timeout:22000});
  await page.goto('/notifications');await expect(page.getByRole('heading',{name:'그룹의 새 소식'})).toBeVisible();await expect(page.getByText('이 페이지에는 해당 소식이 없어요.')).toBeVisible();
 }finally{await childContext.close();}
});

test('P07-F08 private socket signals update immediately, recover an offline deletion and clear revoked access',async({page})=>{
 test.setTimeout(90000);
 const {post,seojun}=await sampleFamily(page);
 // Provider protocol double only: DB/API authorization is covered by PostgreSQL tests.
 const topic=`realtime:child:${seojun}:chat:1`;
 const sockets:{send:(m:string)=>void;joinRef:string|null;array:boolean;joined:boolean}[]=[];
 const claims=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+180,role:'authenticated'})).toString('base64url');
 await page.route(`**/api/v1/children/${seojun}/realtime-token`,route=>route.fulfill({json:{data:{state:'AVAILABLE',url:'https://realtime-fixture.supabase.co',publishableKey:'sb_publishable_fixture',topic:topic.replace('realtime:',''),token:`eyJhbGciOiJFUzI1NiJ9.${claims}.fixture`,expiresAt:new Date(Date.now()+180000).toISOString()}}}));
 await page.routeWebSocket('wss://realtime-fixture.supabase.co/**',socket=>{
  const entry={send:(m:string)=>socket.send(m),joinRef:null as string|null,array:false,joined:false};sockets.push(entry);
  socket.onMessage(raw=>{
   const m=JSON.parse(String(raw)),array=Array.isArray(m);entry.array=array;
   const joinRef=array?m[0]:m.join_ref,ref=array?m[1]:m.ref,channel=array?m[2]:m.topic,event=array?m[3]:m.event,payload=array?m[4]:m.payload;
   if(event==='phx_join'){expect(payload.config.private).toBe(true);expect(payload.access_token).toBeTruthy();entry.joinRef=joinRef;entry.joined=true;}
   if(['phx_join','heartbeat','phx_leave','access_token'].includes(event))entry.send(JSON.stringify(array?[joinRef,ref,channel,'phx_reply',{status:'ok',response:{postgres_changes:[]}}]:{join_ref:joinRef,ref,topic:channel,event:'phx_reply',payload:{status:'ok',response:{postgres_changes:[]}}}));
  });
 });
 function signal(){const s=sockets.at(-1)!;const payload={type:'broadcast',event:'change',payload:{message_event_id:crypto.randomUUID(),version:1}};s.send(JSON.stringify(s.array?[s.joinRef,null,topic,'broadcast',payload]:{join_ref:s.joinRef,ref:null,topic,event:'broadcast',payload}));}
 await page.goto(`/chat?legacy=1&child=${seojun}`);await expect(page.getByText('새 소식이 바로 반영되고 있어요.',{exact:true})).toBeVisible();
 const sent=(await post(`/api/v1/children/${seojun}/messages`,{kind:'TEXT',body:'F08 즉시 동기화',clientMessageId:crypto.randomUUID()})).data;
 signal();await expect(page.locator('.chat-bubble').getByText('F08 즉시 동기화',{exact:true})).toBeVisible({timeout:5000});
 await page.goto('/today?legacy=1');
 const removed=await page.request.delete(`/api/v1/messages/${sent.id}`,{headers:{Origin:origin,'Idempotency-Key':crypto.randomUUID()},data:{expectedVersion:1}});expect(removed.ok()).toBe(true);
 await page.goto(`/chat?legacy=1&child=${seojun}`);await expect(page.getByText('삭제된 메시지예요',{exact:true})).toBeVisible();await expect(page.getByText('F08 즉시 동기화',{exact:true})).toHaveCount(0);
 await page.route(`**/api/v1/children/${seojun}/message-changes*`,route=>route.fulfill({status:404,json:{error:{code:'NOT_FOUND',message:'공유 범위를 확인해 주세요.'}}}));
 await expect.poll(()=>sockets.at(-1)?.joined).toBe(true);signal();await expect(page.getByRole('link',{name:'그룹 연결 확인',exact:true})).toBeVisible({timeout:5000});await expect(page.locator('.chat-bubble')).toHaveCount(0);
});

