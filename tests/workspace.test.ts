import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {testDatabase} from './helpers/auth-db';
import {createAuthService} from '../server/auth/service';
import {createApp} from '../server/app';
import {FamilyService} from '../server/family/service';
import {query} from '../server/auth/database';
const origin='http://localhost:4173',secret='workspace-fixture-only-not-a-production-secret-0001',api='/api/v1/workspace/';
let database:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
const mail:{to:string;url:string}[]=[];
class Browser{cookies=new Map<string,string>();async req(path:string,data:object={},headers:Record<string,string>={}){const r=await app.request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...headers},body:JSON.stringify(data)});for(const cookie of r.headers.getSetCookie()){const [value]=cookie.split(';'),n=value.indexOf('=');if(value.slice(n+1))this.cookies.set(value.slice(0,n),value.slice(n+1));else this.cookies.delete(value.slice(0,n));}return r;}async ok(op:string,data:object={}){const r=await this.req(api+op,data);expect(r.status,await r.clone().text()).toBeLessThan(300);return r.json();}}
async function parent(name:string){const b=new Browser(),email=name+'@example.test';const signup=await b.req('/api/auth/sign-up/email',{ageAtLeast14:true,email,name,password:'parent-fixture-password',callbackURL:'/login?verified=1'});expect(signup.ok).toBe(true);await app.request(mail.find(m=>m.to===email)!.url);expect((await b.req('/api/auth/sign-in/email',{email,password:'parent-fixture-password'})).ok).toBe(true);return b;}
const payload=(title:string,kind='EVENT')=>({kind,data:{title,date:'2026-11-07',weekdays:[],startTime:'16:00',endTime:'17:00',place:'',note:'내 자료',paid:false,...(kind==='FEE'?{amount:150000}:{}),...(kind==='REPEAT'?{untilDate:'2026-12-07',weekdays:[1,3,5]}:{})}});
async function readUpdates(b:Browser,menu:string,revision:number){return b.ok('updates.read',{profileId:(await b.ok('me')).id,menu,revision});}
const listing={from:'2026-11-01',to:'2026-11-30'};
beforeAll(async()=>{database=await testDatabase();for(const file of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await database.engine.exec(await readFile('db/migrations/'+file,'utf8'));},30000);
function workspaceApp(legacyInviteFixtures:boolean){
 const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});
 return createApp({environment:'local',demoEnabled:false},()=>svc,async()=>new FamilyService(database.db,secret,'app_runtime'),undefined,undefined,{legacyInviteFixtures});
}
beforeEach(async()=>{
 await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets CASCADE');
 mail.length=0;
 app=workspaceApp(true);
});
afterAll(async()=>{await database.db.destroy();});
it('isolates monthly budgets by account and exact member selection, checks access and rejects lost updates',async()=>{
 const a=await parent('budget-a'),b=await parent('budget-b'),x=await parent('budget-x'),child=new Browser(),guest=new Browser();
 const am=await a.ok('me'),bm=await b.ok('me'),xm=await x.ok('me'),scope={month:'2027-02',memberIds:[am.id]};
 expect(await a.ok('ledger.budget.read',scope)).toMatchObject({amount:0,version:0});
 expect((await guest.req(api+'ledger.budget.read',scope)).status).toBe(401);
 expect((await b.req(api+'ledger.budget.read',scope)).status).toBe(400);
 const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 expect(await a.ok('ledger.budget.save',{...scope,amount:1000000,version:0})).toMatchObject({amount:1000000,version:1});
 expect(await b.ok('ledger.budget.read',scope)).toMatchObject({amount:0,version:0});
 expect(await a.ok('ledger.budget.read',{...scope,month:'2027-03'})).toMatchObject({amount:0,version:0});
 expect(await a.ok('ledger.budget.read',{...scope,memberIds:[am.id,bm.id]})).toMatchObject({amount:0,version:0});
 await a.ok('ledger.budget.save',{...scope,memberIds:[bm.id,am.id],amount:2000000,version:0});
 expect(await a.ok('ledger.budget.read',{...scope,memberIds:[am.id,bm.id]})).toMatchObject({amount:2000000,version:1});
 const responses=await Promise.all([a.req(api+'ledger.budget.save',{...scope,amount:1200000,version:1}),a.req(api+'ledger.budget.save',{...scope,amount:1400000,version:1})]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
 expect((await a.req(api+'ledger.budget.save',{...scope,amount:100,version:0})).status).toBe(409);
 expect(await a.ok('ledger.budget.save',{...scope,amount:0,version:2})).toMatchObject({amount:0,version:3});
 for(const extra of [{memberIds:[xm.id]},{memberIds:[am.id,am.id]},{memberIds:[]},{month:'2027-13'},{amount:-1},{amount:1.5},{amount:1000000001},{profileId:bm.id}])expect((await a.req(api+'ledger.budget.save',{...scope,amount:100,version:3,...extra})).status).toBe(400);
 const code=await a.ok('invite.issue',{consent:true});await child.ok('child.signup',{loginId:'budget_child',name:'예산 어린이',password:'child-fixture-password',code:code.code});
 expect((await child.req(api+'ledger.budget.read',{...scope,memberIds:[(await child.ok('me')).id]})).status).toBe(403);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'SELECT * FROM app_private.workspace_ledger_budgets');})).rejects.toMatchObject({code:'42501'});
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.workspace_command_v133('workspace.me','{}')");})).rejects.toMatchObject({code:'42501'});
});
it('persists ledger metadata, monthly settlement and legacy edits without exposing finances to children',async()=>{
 const a=await parent('ledger-a'),b=await parent('ledger-b'),child=new Browser();let invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});invite=await a.ok('invite.issue',{consent:true});await child.ok('child.signup',{loginId:'ledger_child',name:'어린이',password:'child-fixture-password',code:invite.code});
 const data={...payload('월급','FEE').data,amount:3000000,ledgerFlow:'INCOME',ledgerCategory:'SALARY',ledgerMethod:'TRANSFER',feeFrequency:'MONTHLY',paid:true};
 const made=await a.ok('items.create',{kind:'FEE',data});expect((await b.ok('items.get',{id:made.id})).data).toMatchObject({ledgerFlow:'INCOME',ledgerCategory:'SALARY',ledgerMethod:'TRANSFER'});
 const feb={from:'2027-02-01',to:'2027-02-28',kind:'FEE'},before=await a.ok('items.list',feb);expect(before.items[0].fee.paid).toBe(false);await a.ok('fees.payment',{id:made.id,version:1,month:'2027-02',paid:true});expect((await a.ok('items.list',feb)).items[0].fee.paid).toBe(true);
 const oldData={...data};delete (oldData as Record<string,unknown>).ledgerFlow;delete (oldData as Record<string,unknown>).ledgerCategory;delete (oldData as Record<string,unknown>).ledgerMethod;
 await a.ok('items.update',{kind:'FEE',id:made.id,version:2,data:{...oldData,title:'기존 화면 수정'}});expect((await a.ok('items.get',{id:made.id})).data.ledgerFlow).toBe('INCOME');
 expect((await child.ok('items.list',feb)).items).toEqual([]);expect((await child.req(api+'items.create',{kind:'FEE',data})).status).toBe(403);expect((await b.req(api+'items.update',{kind:'FEE',id:made.id,version:3,data})).status).toBe(403);
});
it('allows personal CRUD without a family and makes ownership unforgeable',async()=>{
 const a=await parent('personal-a'),b=await parent('personal-b');expect((await a.ok('me')).family).toBeNull();
 for(const kind of ['EVENT','REPEAT','FEE','NOTE','CHAT']){const input=payload('A '+kind,kind),created=await a.ok('items.create',input);const item=await a.ok('items.get',{id:created.id});expect(item.mine).toBe(true);expect((await b.ok('items.list',listing)).items).toEqual([]);expect((await b.req(api+'items.get',{id:item.id})).status).toBe(404);expect((await b.req(api+'items.update',{...input,id:item.id,version:1})).status).toBe(403);expect((await b.req(api+'items.delete',{id:item.id,version:1})).status).toBe(403);await a.ok('items.update',{...input,id:item.id,version:1,data:{...input.data,title:'바뀐 내 자료'}});expect((await a.req(api+'items.delete',{id:item.id,version:1})).status).toBe(409);await a.ok('items.delete',{id:item.id,version:2});}
 expect((await a.req(api+'items.create',{...payload('위조'),ownerId:(await b.ok('me')).id})).status).toBe(400);
});
it('parent-issued number joins A/B/C, shared reads are mutual, and only each author can write',async()=>{
 const a=await parent('host-a'),b=await parent('member-b'),c=new Browser();const ar=await a.ok('items.create',payload('A 자료')),br=await b.ok('items.create',payload('B 학원비','FEE'));
 const codeB=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:codeB.code});const next=await a.ok('invite.issue',{consent:true});
 expect((await c.req(api+'child.signup',{loginId:'seojun_1',name:'가상 서준',password:'child-fixture-password',code:'invalid'})).status).toBe(400);
 await c.ok('child.signup',{loginId:'seojun_1',name:'가상 서준',password:'child-fixture-password',code:next.code});const cr=await c.ok('items.create',payload('C 반복','REPEAT'));
 for(const user of [a,b])expect((await user.ok('items.list',listing)).items).toHaveLength(3);expect((await c.ok('items.list',listing)).items).toHaveLength(2);
 const meA=await a.ok('me'),meB=await b.ok('me'),meC=await c.ok('me');expect(meA.family.isHost).toBe(true);expect(meC.family.hostId).toBe(meA.id);expect(meC.role).toBe('CHILD');
 expect((await a.req(api+'items.update',{...payload('호스트 위조'),id:cr.id,version:1})).status).toBe(403);expect((await a.req(api+'items.delete',{id:br.id,version:1})).status).toBe(403);
 expect((await c.req(api+'invite.issue',{consent:true})).status).toBe(403);expect((await b.req(api+'invite.issue',{consent:true})).status).toBe(403);expect((await b.req(api+'family.remove',{familyId:meA.family.id,profileId:meC.id,version:1})).status).toBe(403);
 const unused=await a.ok('invite.issue',{consent:true});await a.ok('family.remove',{familyId:meA.family.id,profileId:meB.id,version:1});
 expect((await a.ok('items.list',listing)).items.map((x:{id:string})=>x.id).sort()).toEqual([ar.id,cr.id].sort());expect((await b.ok('items.list',listing)).items.map((x:{id:string})=>x.id)).toEqual([br.id]);expect((await b.ok('me')).family).toBeNull();
 expect((await b.req(api+'family.join',{code:unused.code})).status).toBe(400);await b.ok('items.update',{...payload('B 학원비','FEE'),id:br.id,version:1,data:{...payload('B 학원비','FEE').data,amount:200000}});
 await a.ok('family.remove',{familyId:meA.family.id,profileId:meC.id,version:1});expect((await c.ok('items.list',listing)).items.map((x:{id:string})=>x.id)).toEqual([cr.id]);await c.ok('items.update',{...payload('C 혼자 사용','REPEAT'),id:cr.id,version:1});
 const fresh=new Browser();await fresh.ok('child.login',{loginId:'seojun_1',password:'child-fixture-password'});expect((await fresh.ok('me')).family).toBeNull();expect((await fresh.ok('items.list',listing)).items).toHaveLength(1);expect((await a.req(api+'items.get',{id:cr.id})).status).toBe(404);
});
it('rejects missing, expired or reused parent codes and preserves strict role/session boundaries',async()=>{
 const a=await parent('codes-a'),anonymous=new Browser(),b=await parent('codes-b');
 expect((await anonymous.req(api+'invite.issue',{consent:true})).status).toBe(401);
 expect((await anonymous.req(api+'child.signup',{loginId:'child_x',name:'가상',password:'password-2026'})).status).toBe(400);
 const first=await a.ok('invite.issue',{consent:true}),second=await a.ok('invite.issue',{consent:true});expect((await b.req(api+'family.join',{code:first.code})).status).toBe(400);
 await query(database.db,"UPDATE app_private.workspace_invites SET expires_at=now()-interval '1 minute' WHERE revoked_at IS NULL");expect((await b.req(api+'family.join',{code:second.code})).status).toBe(400);
 const valid=await a.ok('invite.issue',{consent:true});await anonymous.ok('child.signup',{loginId:'child_x',name:'가상',password:'password-2026',code:valid.code});expect((await b.req(api+'family.join',{code:valid.code})).status).toBe(400);
 expect((await a.req(api+'child.login',{loginId:'child_x',password:'password-2026'})).status).toBe(403);expect((await new Browser().req(api+'child.login',{loginId:'child_x',password:'wrong'})).status).toBe(401);
 expect((await b.req(api+'items.create',payload('외부'),{Origin:'https://attacker.example'})).status).toBe(403);
 for(const name of ['workspace_profiles','workspace_links','workspace_items','workspace_sessions','workspace_invites'])await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,`SELECT * FROM app_private.${name}`);})).rejects.toMatchObject({code:'42501'});
});

it('assignee must be self or an active family member and never becomes the author',async()=>{
 const a=await parent('assignee-a'),b=await parent('assignee-b'),outsider=await parent('assignee-x');const am=await a.ok('me'),bm=await b.ok('me'),xm=await outsider.ok('me');
 const input=payload('대상 지정');await a.ok('items.create',{...input,data:{...input.data,assigneeId:am.id}});
 expect((await a.req(api+'items.create',{...input,data:{...input.data,assigneeId:bm.id}})).status).toBe(400);
 const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 for(const kind of ['EVENT','REPEAT','FEE','NOTE']){const value=payload('가족 대상 '+kind,kind);const item=await a.ok('items.create',{...value,data:{...value.data,assigneeId:bm.id}});const read=await b.ok('items.get',{id:item.id});expect(read.data.assigneeId).toBe(bm.id);expect(read.ownerId).toBe(am.id);expect(read.mine).toBe(false);expect((await b.req(api+'items.delete',{id:item.id,version:1})).status).toBe(403);}
 expect((await a.req(api+'items.create',{...input,data:{...input.data,assigneeId:xm.id}})).status).toBe(400);
 const me=await a.ok('me');await a.ok('family.remove',{familyId:me.family.id,profileId:bm.id,version:me.family.members.find((m:{id:string})=>m.id===bm.id).version});expect((await a.req(api+'items.create',{...input,data:{...input.data,assigneeId:bm.id}})).status).toBe(400);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.workspace_command_v76('workspace.me','{}')");})).rejects.toMatchObject({code:'42501'});
});

it('switches a signed-in parent atomically, preserves records, and protects populated host families',async()=>{
 const a=await parent('switch-a'),b=await parent('switch-b'),c=await parent('switch-c');
 await b.ok('invite.issue',{consent:true});const before=await b.ok('me'),own=await b.ok('items.create',payload('전환 후에도 내 자료'));
 const leaveCurrent={familyId:before.family.id,version:before.family.members[0].version};
 expect((await b.req(api+'family.join',{code:'000000',leaveCurrent})).status).toBe(400);expect((await b.ok('me')).family.id).toBe(before.family.id);
 const invite=await a.ok('invite.issue',{consent:true});expect((await b.req(api+'family.join',{code:invite.code})).status).toBe(400);
 expect((await b.req(api+'family.join',{code:invite.code,leaveCurrent:{...leaveCurrent,version:999}})).status).toBe(409);
 await b.ok('family.join',{code:invite.code,leaveCurrent});expect((await b.ok('me')).family.id).toBe((await a.ok('me')).family.id);expect((await b.ok('items.get',{id:own.id})).mine).toBe(true);
 const target=await c.ok('invite.issue',{consent:true}),host=await a.ok('me');expect((await a.req(api+'family.join',{code:target.code,leaveCurrent:{familyId:host.family.id,version:host.family.members.find((m:{id:string})=>m.id===host.id).version}})).status).toBe(400);expect((await a.ok('me')).family.members).toHaveLength(2);
});
it('group messages paginate across months, deduplicate retries and respect removals and author-only edits',async()=>{
 const a=await parent('chat-a'),b=await parent('chat-b'),x=await parent('chat-x');const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 const key=crypto.randomUUID(),first=await a.ok('chat.send',{text:'월 경계 테스트',clientMessageId:key});expect((await a.ok('chat.send',{text:'월 경계 테스트',clientMessageId:key})).id).toBe(first.id);expect((await a.req(api+'chat.send',{text:'다른 본문',clientMessageId:key})).status).toBe(409);
 await query(database.db,"UPDATE app_private.workspace_items SET created_at='2025-01-01T01:01:00Z' WHERE id=$1",[first.id]);
 await b.ok('chat.send',{text:'오늘 메시지',clientMessageId:crypto.randomUUID()});
 const newest=await a.ok('chat.list',{limit:1});expect(newest.items[0].data.note).toBe('오늘 메시지');expect(newest.hasMore).toBe(true);const older=await a.ok('chat.list',{limit:1,before:newest.nextCursor});expect(older.items[0].id).toBe(first.id);expect(older.hasMore).toBe(false);expect(older.items[0].createdAt).toContain('2025-01-01');
 expect((await x.ok('chat.list',{})).items).toHaveLength(0);expect((await a.ok('chat.list',{query:'월 경계'})).items).toHaveLength(1);expect((await b.req(api+'items.delete',{id:first.id,version:1})).status).toBe(403);
 await a.ok('items.delete',{id:first.id,version:1});expect((await a.ok('chat.list',{})).items).toHaveLength(1);await a.ok('chat.send',{text:'월 경계 테스트',clientMessageId:key});expect((await a.ok('chat.list',{})).items).toHaveLength(1);
 const host=await a.ok('me'),member=await b.ok('me');await a.ok('family.remove',{familyId:host.family.id,profileId:member.id,version:1});expect((await a.ok('chat.list',{})).items).toHaveLength(0);expect((await b.ok('chat.list',{})).items).toHaveLength(1);
});
it('accepts all-day schedules and rejects invalid color and timed ranges',async()=>{
 const a=await parent('all-day');const input=payload('종일 일정');await a.ok('items.create',{...input,data:{...input.data,allDay:true,startTime:'00:00',endTime:'00:00',color:3}});expect((await a.req(api+'items.create',{...input,data:{...input.data,color:99}})).status).toBe(400);expect((await a.req(api+'items.create',{...input,data:{...input.data,endTime:'15:00'}})).status).toBe(400);
});

it('monthly tuition clamps month-end, separates each payment and lets the designated parent mark only payments',async()=>{
 const a=await parent('fee-a'),b=await parent('fee-b'),x=await parent('fee-x');const bm=await b.ok('me');const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 const input={kind:'FEE',data:{...payload('월말 피아노','FEE').data,date:'2027-01-31',feeFrequency:'MONTHLY',feePayerId:bm.id}};
 const created=await a.ok('items.create',input);
 const months=async()=> (await a.ok('items.list',{from:'2027-01-01',to:'2027-04-30',kind:'FEE'})).items;
 expect((await months()).map((i:any)=>i.fee.dueDate)).toEqual(['2027-01-31','2027-02-28','2027-03-31','2027-04-30']);
 expect((await b.ok('items.list',{from:'2027-02-01',to:'2027-02-28',kind:'FEE'})).items[0].fee).toMatchObject({payerId:bm.id,payerName:'fee-b',canMarkPaid:true,paid:false});
 expect((await b.req(api+'items.update',{...input,id:created.id,version:1})).status).toBe(403);
 expect((await x.req(api+'fees.payment',{id:created.id,version:1,month:'2027-01',paid:true})).status).toBe(404);
 await b.ok('fees.payment',{id:created.id,version:1,month:'2027-01',paid:true});
 expect((await months()).map((i:any)=>i.fee.paid)).toEqual([true,false,false,false]);
 expect((await a.req(api+'fees.payment',{id:created.id,version:1,month:'2027-02',paid:true})).status).toBe(409);
 await a.ok('fees.payment',{id:created.id,version:2,month:'2027-02',paid:true});
 await a.ok('items.update',{...input,id:created.id,version:3,data:{...input.data,untilDate:'2027-03-31',amount:160000}});
 expect((await months()).map((i:any)=>i.fee.paid)).toEqual([true,true,false]);
 expect((await a.req(api+'fees.payment',{id:created.id,version:4,month:'2027-04',paid:true})).status).toBe(400);
 const host=await a.ok('me');await a.ok('family.remove',{familyId:host.family.id,profileId:bm.id,version:1});
 expect((await b.req(api+'fees.payment',{id:created.id,version:4,month:'2027-03',paid:true})).status).toBe(404);
 expect((await months())[0].fee.payerName).toBe('연결 해제된 부모');
 expect((await a.req(api+'items.update',{...input,id:created.id,version:4})).status).toBe(400);
});
it('one-off and legacy payments stay in their original month, with leap years and invalid recurrence checked',async()=>{
 const a=await parent('fee-once');const original=payload('일회 납부','FEE');const old=await a.ok('items.create',{...original,data:{...original.data,paid:true}});
 expect((await a.ok('items.get',{id:old.id})).fee.paid).toBe(true);expect((await a.ok('items.list',{from:'2026-12-01',to:'2026-12-31',kind:'FEE'})).items).toHaveLength(0);
 const input={...original,data:{...original.data,date:'2028-01-31',feeFrequency:'MONTHLY'}};await a.ok('items.create',input);
 expect((await a.ok('items.list',{from:'2028-02-01',to:'2028-02-29',kind:'FEE'})).items[0].fee.dueDate).toBe('2028-02-29');
 expect((await a.req(api+'items.create',{...input,data:{...input.data,untilDate:'2027-12-31'}})).status).toBe(400);
 expect((await a.req(api+'items.create',{...input,data:{...input.data,feeFrequency:'YEARLY'}})).status).toBe(400);
 expect((await a.req(api+'fees.payment',{id:old.id,version:1,month:'2026-13',paid:true})).status).toBe(400);
});
it('children cannot read any fee or mutate fee/payment endpoints, and cannot be chosen as payers',async()=>{
 const a=await parent('fee-parent'),child=new Browser(),outsider=await parent('fee-outsider');const code=await a.ok('invite.issue',{consent:true});await child.ok('child.signup',{loginId:'fee_child',name:'가상 자녀',password:'child-fixture-password',code:code.code});const cm=await child.ok('me'),xm=await outsider.ok('me');
 const input=payload('부모에게만 보이는 학원비','FEE'),fee=await a.ok('items.create',input);
 expect((await child.ok('items.list',listing)).items).toEqual([]);expect((await child.ok('items.list',{...listing,kind:'FEE'})).items).toEqual([]);
 expect((await child.req(api+'items.get',{id:fee.id})).status).toBe(403);
 expect((await child.req(api+'items.create',input)).status).toBe(403);
 expect((await child.req(api+'items.update',{...input,id:fee.id,version:1})).status).toBe(403);
 expect((await child.req(api+'items.delete',{id:fee.id,version:1})).status).toBe(403);
 expect((await child.req(api+'fees.payment',{id:fee.id,version:1,month:'2026-11',paid:true})).status).toBe(403);
 for(const feePayerId of [cm.id,xm.id])expect((await a.req(api+'items.create',{...input,data:{...input.data,feePayerId}})).status).toBe(400);
 for(const statement of ['SELECT * FROM app_private.workspace_fee_payments',"SELECT app_private.workspace_command_v78('workspace.me','{}')", "SELECT app_private.workspace_fee_due('{}','2026-11-01')"]){await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,statement);})).rejects.toMatchObject({code:'42501'});}
});

it('stores all-family schedules once, preserves author permissions and rejects mixed or non-schedule assignments',async()=>{
 const a=await parent('all-family-a'),b=await parent('all-family-b'),x=await parent('all-family-x'),child=new Browser();
 const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});const childInvite=await a.ok('invite.issue',{consent:true});await child.ok('child.signup',{loginId:'all_family_child',name:'가상 자녀',password:'child-fixture-password',code:childInvite.code});
 for(const kind of ['EVENT','REPEAT']){
  const input=payload('가족 전체 '+kind,kind),created=await a.ok('items.create',{...input,data:{...input.data,allMembers:true}});
  for(const reader of [a,b,child])expect((await reader.ok('items.get',{id:created.id})).data).toMatchObject({allMembers:true,title:'가족 전체 '+kind});
  expect((await x.req(api+'items.get',{id:created.id})).status).toBe(404);expect((await b.req(api+'items.delete',{id:created.id,version:1})).status).toBe(403);
  await a.ok('items.update',{...input,id:created.id,version:1,data:{...input.data,assigneeId:(await b.ok('me')).id}});expect((await a.ok('items.get',{id:created.id})).data.allMembers).toBeUndefined();
 }
 const am=await a.ok('me'),input=payload('잘못된 대상');expect((await a.req(api+'items.create',{...input,data:{...input.data,allMembers:true,assigneeId:am.id}})).status).toBe(400);
 for(const kind of ['FEE','NOTE','CHAT']){const input=payload('잘못된 전체 '+kind,kind);expect((await a.req(api+'items.create',{...input,data:{...input.data,allMembers:true}})).status).toBe(400);}
});

it('keeps calendar events and timetable repeats separate without copying or changing existing records',async()=>{
 const a=await parent('schedule-separation');
 const repeatInput=payload('학교 반복','REPEAT'),eventInput=payload('가족 기념일');
 const repeat=await a.ok('items.create',repeatInput),event=await a.ok('items.create',eventInput);
 const {serverNow:beforeTime,...original}=await a.ok('items.get',{id:repeat.id});
 expect((await a.ok('items.list',{...listing,kind:'REPEAT'})).items.map((item:{id:string})=>item.id)).toEqual([repeat.id]);
 expect((await a.ok('items.list',{...listing,kind:'EVENT'})).items.map((item:{id:string})=>item.id)).toEqual([event.id]);
 await a.ok('items.delete',{id:event.id,version:1});
 expect((await a.ok('items.list',{...listing,kind:'EVENT'})).items).toEqual([]);
 const {serverNow:afterTime,...preserved}=await a.ok('items.get',{id:repeat.id});expect(preserved).toEqual(original);
 await a.ok('items.update',{...repeatInput,id:repeat.id,version:1,data:{...repeatInput.data,title:'변경된 학교 시간표'}});
 expect((await a.ok('items.list',{...listing,kind:'EVENT'})).items).toEqual([]);
 expect((await a.ok('items.list',{...listing,kind:'REPEAT'})).items).toHaveLength(1);
});

it('persists per-account menu dots and only acknowledges the content revision actually loaded',async()=>{
 const a=await parent('updates-host'),b=await parent('updates-member'),outsider=await parent('updates-outsider');
 const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 expect((await a.ok('updates.status')).updates.family).toMatchObject({revision:1,seen:0});
 const first=await b.ok('chat.send',{text:'첫 소식',clientMessageId:crypto.randomUUID()});
 const loaded=await a.ok('chat.list');expect(loaded.updateReceipt).toMatchObject({menu:'chat',revision:1});
 expect((await a.ok('updates.status')).updates.chat).toEqual({revision:1,seen:0});
 await b.ok('chat.send',{text:'확인 중 도착한 소식',clientMessageId:crypto.randomUUID()});
 const read=await readUpdates(a,'chat',loaded.updateReceipt.revision);expect(read.updates.chat).toEqual({revision:2,seen:1});
 await readUpdates(a,'chat',2);await readUpdates(a,'chat',1);
 expect((await a.ok('updates.status')).updates.chat).toEqual({revision:2,seen:2});
 expect((await b.ok('updates.status')).updates.chat).toBeUndefined();expect((await outsider.ok('updates.status')).updates).toEqual({});
 const device=new Browser();expect((await device.req('/api/auth/sign-in/email',{email:'updates-host@example.test',password:'parent-fixture-password'})).ok).toBe(true);expect((await device.ok('updates.status')).updates.chat).toEqual({revision:2,seen:2});
 expect((await a.req(api+'updates.read',{profileId:(await a.ok('me')).id,menu:'chat',revision:999})).status).toBe(400);
 expect((await a.req(api+'updates.read',{menu:'chat',revision:2,profileId:(await b.ok('me')).id})).status).toBe(401);
 expect((await a.ok('chat.list',{query:'첫 소식'})).updateReceipt).toBeUndefined();
 await b.ok('items.delete',{id:first.id,version:1});expect((await a.ok('updates.status')).updates.chat).toEqual({revision:3,seen:2});
});
it('maps new records to their menus, excludes own writes and never notifies children about tuition',async()=>{
 const a=await parent('dot-parent-a'),b=await parent('dot-parent-b'),child=new Browser();let invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});invite=await a.ok('invite.issue',{consent:true});await child.ok('child.signup',{loginId:'dot_child',name:'알림 자녀',password:'child-fixture-password',code:invite.code});
 for(const [kind,menu] of [['EVENT','calendar'],['REPEAT','timetable'],['FEE','fees'],['NOTE','records']] as const){
  await a.ok('items.create',payload('새 항목 '+kind,kind));
  expect((await b.ok('updates.status')).updates[menu]).toEqual({revision:1,seen:0});
  expect((await a.ok('updates.status')).updates[menu]).toBeUndefined();
  const page=await b.ok('items.list',{...listing,kind});expect(page.updateReceipt).toMatchObject({menu,revision:1});
  await readUpdates(b,menu,page.updateReceipt.revision);
  expect((await b.ok('updates.status')).updates[menu]).toEqual({revision:1,seen:1});
 }
 expect((await child.ok('updates.status')).updates.fees).toBeUndefined();expect((await child.req(api+'updates.read',{profileId:(await child.ok('me')).id,menu:'fees',revision:0})).status).toBe(403);
 const host=await a.ok('me'),member=await b.ok('me');await a.ok('family.remove',{familyId:host.family.id,profileId:member.id,version:1});const before=(await b.ok('updates.status')).updates;
 await a.ok('items.create',payload('연결 해제 후'));expect((await b.ok('updates.status')).updates).toEqual(before);
 expect((await new Browser().req(api+'updates.status')).status).toBe(401);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'SELECT * FROM app_private.workspace_menu_updates');})).rejects.toMatchObject({code:'42501'});
});
it('payment changes notify the author but not the payer, and duplicate message retries do not add updates',async()=>{
 const a=await parent('dot-author'),b=await parent('dot-payer'),bm=await b.ok('me');const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 const item=await a.ok('items.create',{...payload('납부 알림','FEE'),data:{...payload('납부 알림','FEE').data,feePayerId:bm.id}});
 await readUpdates(b,'fees',1);await b.ok('fees.payment',{id:item.id,version:1,month:'2026-11',paid:true});
 expect((await a.ok('updates.status')).updates.fees).toEqual({revision:1,seen:0});expect((await b.ok('updates.status')).updates.fees).toEqual({revision:1,seen:1});
 const input={text:'중복 전송 확인',clientMessageId:crypto.randomUUID()};await a.ok('chat.send',input);await a.ok('chat.send',input);expect((await b.ok('updates.status')).updates.chat).toEqual({revision:1,seen:0});
});

it('persists calendar recurrence across months/years while preserving family, author and timetable boundaries',async()=>{
 const a=await parent('calendar-repeat-a'),b=await parent('calendar-repeat-b'),x=await parent('calendar-repeat-x');const code=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:code.code});
 const input={kind:'EVENT',data:{...payload('생일').data,date:'2024-02-29',calendarFrequency:'YEARLY',allDay:true}};
 const made=await a.ok('items.create',input),future={from:'2027-02-01',to:'2027-02-28',kind:'EVENT'};
 expect((await b.ok('items.list',future)).items.map((i:{id:string})=>i.id)).toEqual([made.id]);
 expect((await b.ok('items.list',{...future,kind:'REPEAT'})).items).toEqual([]);expect((await x.ok('items.list',future)).items).toEqual([]);
 expect((await b.ok('updates.status')).updates.calendar).toEqual({revision:1,seen:0});expect((await b.ok('items.list',future)).updateReceipt).toMatchObject({menu:'calendar',revision:1});
 expect((await b.req(api+'items.update',{...input,id:made.id,version:1})).status).toBe(403);
 await a.ok('items.update',{...input,id:made.id,version:1,data:{...input.data,calendarFrequency:'DAILY',untilDate:'2024-03-03'}});
 expect((await a.ok('items.get',{id:made.id})).data.calendarFrequency).toBe('DAILY');expect((await a.ok('items.list',future)).items).toEqual([]);
 expect((await a.ok('items.list',{kind:'EVENT',from:'2024-03-01',to:'2024-03-03'})).items).toHaveLength(1);
 await a.ok('items.update',{...input,id:made.id,version:2,data:{...input.data,calendarFrequency:'ONCE'}});
 expect((await a.ok('items.list',{kind:'EVENT',from:'2024-03-01',to:'2024-03-31'})).items).toEqual([]);
 await a.ok('items.delete',{id:made.id,version:3});expect((await a.ok('items.list',{kind:'EVENT',from:'2024-02-01',to:'2024-02-29'})).items).toEqual([]);
});
it('rejects invalid calendar recurrence, but allows all four repeat choices with an optional end',async()=>{
 const a=await parent('calendar-repeat-validation'),input=payload('정기 모임');
 for(const calendarFrequency of ['DAILY','WEEKLY','MONTHLY','YEARLY'])await a.ok('items.create',{...input,data:{...input.data,calendarFrequency,weekdays:calendarFrequency==='WEEKLY'?[1,3]:[]}});
 for(const extra of [{calendarFrequency:'HOURLY'},{calendarFrequency:'WEEKLY',weekdays:[]},{calendarFrequency:'WEEKLY',weekdays:[1,1]},{calendarFrequency:'DAILY',untilDate:'2026-01-01'}])expect((await a.req(api+'items.create',{...input,data:{...input.data,...extra}})).status).toBe(400);
 expect((await a.req(api+'items.create',{...payload('시간표','REPEAT'),data:{...payload('시간표','REPEAT').data,calendarFrequency:'MONTHLY'}})).status).toBe(400);
});

it('saves fixed weekly school schedules without date limits, validates weekdays clearly and preserves family authorization',async()=>{
 const a=await parent('fixed-a'),b=await parent('fixed-b'),outside=await parent('fixed-outside');
 const invitation=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invitation.code});
 const target=(await b.ok('me')).id,child=new Browser(),childInvite=await a.ok('invite.issue',{consent:true});
 await child.ok('child.signup',{loginId:'fixed_child',name:'가상 자녀',password:'child-fixture-2026',code:childInvite.code});
 const data={title:'유치원',date:'2026-11-02',assigneeId:(await child.ok('me')).id,weekdays:[1,2,3,4,5],startTime:'09:00',endTime:'16:20',place:'',note:'',paid:false};
 const created=await a.ok('items.create',{kind:'REPEAT',data});
 expect((await a.ok('items.get',{id:created.id})).data.untilDate).toBeUndefined();
 for(const month of ['2020-01','2026-12','2030-01']){
  const list=await b.ok('items.list',{kind:'REPEAT',from:month+'-01',to:month+'-28'});
  expect(list.items.map((i:{id:string})=>i.id)).toContain(created.id);expect(list.updateReceipt.menu).toBe('timetable');
 }
 expect((await b.ok('items.list',{...listing,kind:'EVENT'})).items).toHaveLength(0);
 expect((await outside.ok('items.list',{...listing,kind:'REPEAT'})).items).toHaveLength(0);
 expect((await b.req(api+'items.update',{kind:'REPEAT',data,id:created.id,version:1})).status).toBe(403);
 for(const weekdays of [[],[1,1],[8]]){
  const bad=await a.req(api+'items.create',{kind:'REPEAT',data:{...data,weekdays}});expect(bad.status).toBe(400);expect((await bad.json()).error.message).toContain('반복 요일');
 }
 const badTime=await a.req(api+'items.create',{kind:'REPEAT',data:{...data,endTime:'08:00'}});expect(badTime.status).toBe(400);expect((await badTime.json()).error.message).toContain('종료 시간');
 // Legacy rows keep their stored metadata but no longer disappear at their old end date.
 await query(database.db,"UPDATE app_private.workspace_items SET data=data||'{\"untilDate\":\"2026-12-31\"}'::jsonb WHERE id=$1",[created.id]);
 expect((await a.ok('items.list',{kind:'REPEAT',from:'2031-01-01',to:'2031-01-31'})).items.map((i:{id:string})=>i.id)).toContain(created.id);
 expect((await a.ok('items.get',{id:created.id})).data.untilDate).toBe('2026-12-31');
 await a.ok('items.update',{kind:'REPEAT',data:{...data,weekdays:[2,4]},id:created.id,version:1});
 const updated=await a.ok('items.get',{id:created.id});expect(updated.data.weekdays).toEqual([2,4]);expect(updated.data.untilDate).toBeUndefined();
 const family=(await a.ok('me')).family;await a.ok('family.remove',{familyId:family.id,profileId:target,version:1});
 expect((await b.ok('items.list',{...listing,kind:'REPEAT'})).items).toHaveLength(0);
 await a.ok('items.delete',{id:created.id,version:2});expect((await a.ok('items.list',{...listing,kind:'REPEAT'})).items).toHaveLength(0);
});

it('persists calendar start/end dates and includes overlapping periods in lists without widening permissions',async()=>{
 const a=await parent('range-owner'),b=await parent('range-family'),x=await parent('range-outsider');const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 const base=payload('연말 여행'),input={...base,data:{...base.data,date:'2026-12-31',endDate:'2027-01-02',startTime:'22:00',endTime:'04:00',calendarFrequency:'ONCE'}};
 const created=await a.ok('items.create',input),window={from:'2027-01-01',to:'2027-01-31',kind:'EVENT'};
 expect((await a.ok('items.list',window)).items.map((r:any)=>r.id)).toEqual([created.id]);
 expect((await b.ok('items.list',window)).items[0]).toMatchObject({id:created.id,mine:false,data:{endDate:'2027-01-02'}});
 expect((await x.ok('items.list',window)).items).toEqual([]);expect((await b.req(api+'items.update',{...input,id:created.id,version:1})).status).toBe(403);
 expect((await a.ok('items.list',{from:'2027-01-03',to:'2027-01-31'})).items).toEqual([]);
 for(const data of [{...input.data,endDate:'2026-12-30'},{...input.data,endDate:input.data.date},{...input.data,endDate:'2027-02-30'}])expect((await a.req(api+'items.create',{kind:'EVENT',data})).status).toBe(400);
 expect((await a.req(api+'items.create',{kind:'REPEAT',data:{...input.data,calendarFrequency:undefined,weekdays:[0]}})).status).toBe(400);
 await a.ok('items.update',{...input,id:created.id,version:1,data:{...input.data,endDate:'2027-01-04'}});expect((await a.ok('items.get',{id:created.id})).data.endDate).toBe('2027-01-04');
 const old=await a.ok('items.create',base);expect((await a.ok('items.get',{id:old.id})).data.endDate).toBe(base.data.date);
 const repeated=await a.ok('items.create',{kind:'EVENT',data:{...base.data,date:'2028-01-31',endDate:'2028-02-02',calendarFrequency:'MONTHLY',untilDate:'2028-02-29'}});
 expect((await a.ok('items.list',{kind:'EVENT',from:'2028-03-01',to:'2028-03-02'})).items.map((r:any)=>r.id)).toEqual([repeated.id]);
 expect((await a.ok('items.list',{kind:'EVENT',from:'2028-03-03',to:'2028-03-04'})).items).toEqual([]);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.workspace_command_v110('workspace.me','{}')");})).rejects.toMatchObject({code:'42501'});
});

it('keeps timetable start-view preferences per authenticated account across new sessions',async()=>{
 const a=await parent('pref-parent-a'),b=await parent('pref-parent-b'),x=await parent('pref-outsider'),am=await a.ok('me'),bm=await b.ok('me'),xm=await x.ok('me');
 expect(am.timetableMemberId).toBe(am.id);expect(bm.timetableMemberId).toBe(bm.id);
 expect((await new Browser().req(api+'timetable.preference.save',{memberId:am.id})).status).toBe(401);
 expect((await a.req(api+'timetable.preference.save',{memberId:bm.id})).status).toBe(400);
 const code=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:code.code});
 expect(await a.ok('timetable.preference.save',{memberId:bm.id})).toMatchObject({memberId:bm.id});
 await b.ok('timetable.preference.save',{memberId:am.id});
 const device=new Browser();expect((await device.req('/api/auth/sign-in/email',{email:'pref-parent-a@example.test',password:'parent-fixture-password'})).ok).toBe(true);
 expect((await device.ok('me')).timetableMemberId).toBe(bm.id);expect((await b.ok('me')).timetableMemberId).toBe(am.id);
 for(const value of [{memberId:'all'},{memberId:xm.id},{memberId:crypto.randomUUID()},{memberId:am.id,profileId:bm.id}])expect((await a.req(api+'timetable.preference.save',value)).status).toBe(400);
 expect((await a.ok('me')).timetableMemberId).toBe(bm.id);expect((await x.ok('me')).timetableMemberId).toBe(xm.id);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'SELECT timetable_member_id FROM app_private.workspace_profiles');})).rejects.toMatchObject({code:'42501'});
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.workspace_command_v111('workspace.me','{}')");})).rejects.toMatchObject({code:'42501'});
});
it('supports child preferences and falls back to self when a saved family member disconnects',async()=>{
 const a=await parent('pref-child-parent'),c=new Browser(),invite=await a.ok('invite.issue',{consent:true});
 await c.ok('child.signup',{loginId:'pref_child',name:'선택 자녀',password:'child-fixture-password',code:invite.code});const am=await a.ok('me'),cm=await c.ok('me');expect(cm.timetableMemberId).toBe(cm.id);
 await c.ok('timetable.preference.save',{memberId:am.id});await a.ok('timetable.preference.save',{memberId:cm.id});
 await c.ok('logout');expect((await c.req(api+'timetable.preference.save',{memberId:cm.id})).status).toBe(401);
 const device=new Browser();await device.ok('child.login',{loginId:'pref_child',password:'child-fixture-password'});expect((await device.ok('me')).timetableMemberId).toBe(am.id);
 await a.ok('family.remove',{familyId:am.family.id,profileId:cm.id,version:am.family.members.find((m:any)=>m.id===cm.id).version});
 expect((await a.ok('me')).timetableMemberId).toBe(am.id);expect((await device.ok('me')).timetableMemberId).toBe(cm.id);
 expect((await a.req(api+'timetable.preference.save',{memberId:cm.id})).status).toBe(400);expect((await device.req(api+'timetable.preference.save',{memberId:am.id})).status).toBe(400);
});

it('stores multiple timetable members per account and rejects an invalid combination atomically',async()=>{
 const a=await parent('multi-a'),b=await parent('multi-b'),x=await parent('multi-x');const am=await a.ok('me'),bm=await b.ok('me'),xm=await x.ok('me');
 const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 expect(am.timetableMemberIds).toEqual([am.id]);
 // Legacy saved choices remain readable before backfill and old clients still work.
 await query(database.db,'UPDATE app_private.workspace_profiles SET timetable_member_id=$1,timetable_member_ids=NULL WHERE id=$2',[bm.id,am.id]);
 expect((await a.ok('me')).timetableMemberIds).toEqual([bm.id]);
 expect(await a.ok('timetable.preference.save',{memberIds:[am.id,bm.id]})).toMatchObject({memberIds:[am.id,bm.id]});
 const device=new Browser();expect((await device.req('/api/auth/sign-in/email',{email:'multi-a@example.test',password:'parent-fixture-password'})).ok).toBe(true);
 expect((await device.ok('me')).timetableMemberIds).toEqual([am.id,bm.id]);expect((await b.ok('me')).timetableMemberIds).toEqual([bm.id]);
 for(const value of [{memberIds:[]},{memberIds:[am.id,am.id]},{memberIds:[am.id,'all']},{memberIds:[am.id,xm.id]},{memberIds:[am.id,crypto.randomUUID()]},{memberIds:[am.id],memberId:am.id},{memberIds:[am.id],profileId:bm.id},{memberIds:'all'},{memberIds:[null]}]){
  expect((await a.req(api+'timetable.preference.save',value)).status).toBe(400);expect((await a.ok('me')).timetableMemberIds).toEqual([am.id,bm.id]);
 }
 expect((await new Browser().req(api+'timetable.preference.save',{memberIds:[am.id,bm.id]})).status).toBe(401);
 await b.ok('timetable.preference.save',{memberIds:[am.id]});expect((await a.ok('me')).timetableMemberIds).toEqual([am.id,bm.id]);
 await a.ok('timetable.preference.save',{memberId:bm.id});expect((await a.ok('me')).timetableMemberIds).toEqual([bm.id]);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.workspace_command_v112('workspace.me','{}')");})).rejects.toMatchObject({code:'42501'});
});
it('saves calendar and fee member combinations independently with account isolation and atomic validation',async()=>{
 const a=await parent('filter-a'),b=await parent('filter-b'),x=await parent('filter-x'),am=await a.ok('me'),bm=await b.ok('me'),xm=await x.ok('me');
 const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});
 await a.ok('member-filter.preference.save',{scope:'calendar',memberIds:[am.id,bm.id]});await a.ok('member-filter.preference.save',{scope:'fees',memberIds:[bm.id]});
 expect((await a.ok('me')).memberFilterPreferences).toMatchObject({calendar:[am.id,bm.id],fees:[bm.id],timetable:[am.id]});expect((await b.ok('me')).memberFilterPreferences.calendar).toEqual([bm.id]);
 for(const data of [{scope:'calendar',memberIds:[]},{scope:'calendar',memberIds:[am.id,am.id]},{scope:'calendar',memberIds:[am.id,xm.id]},{scope:'calendar',memberIds:[am.id],profileId:bm.id},{scope:'unknown',memberIds:[am.id]}]){expect((await a.req(api+'member-filter.preference.save',data)).status).toBe(400);expect((await a.ok('me')).memberFilterPreferences.calendar).toEqual([am.id,bm.id]);}
 await a.ok('member-filter.preference.save',{scope:'timetable',memberIds:[bm.id,am.id]});expect((await a.ok('me')).timetableMemberIds).toEqual([bm.id,am.id]);
 const otherDevice=new Browser();await otherDevice.req('/api/auth/sign-in/email',{email:'filter-a@example.test',password:'parent-fixture-password'});expect((await otherDevice.ok('me')).memberFilterPreferences.fees).toEqual([bm.id]);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.workspace_command_v113('workspace.me','{}')");})).rejects.toMatchObject({code:'42501'});
});
it('restores child calendar combinations, excludes disconnected people and denies child fee preferences',async()=>{
 const a=await parent('filter-child-parent'),c=new Browser(),invite=await a.ok('invite.issue',{consent:true});await c.ok('child.signup',{loginId:'filter_child',name:'필터 자녀',password:'child-fixture-password',code:invite.code});const am=await a.ok('me'),cm=await c.ok('me');
 await c.ok('member-filter.preference.save',{scope:'calendar',memberIds:[am.id,cm.id]});expect((await c.ok('me')).memberFilterPreferences.calendar).toEqual([am.id,cm.id]);
 expect((await c.req(api+'member-filter.preference.save',{scope:'fees',memberIds:[cm.id]})).status).toBe(403);expect((await c.ok('me')).memberFilterPreferences.fees).toBeUndefined();
 await a.ok('family.remove',{familyId:am.family.id,profileId:cm.id,version:am.family.members.find((m:any)=>m.id===cm.id).version});expect((await c.ok('me')).memberFilterPreferences.calendar).toEqual([cm.id]);
});
it('keeps remaining selections after family disconnection and restores child combinations on a new login',async()=>{
 const a=await parent('multi-child-parent'),c=new Browser(),invite=await a.ok('invite.issue',{consent:true});
 await c.ok('child.signup',{loginId:'multi_child',name:'다중 자녀',password:'child-fixture-password',code:invite.code});const am=await a.ok('me'),cm=await c.ok('me');
 await a.ok('timetable.preference.save',{memberIds:[cm.id,am.id]});await c.ok('timetable.preference.save',{memberIds:[am.id,cm.id]});
 await c.ok('logout');const device=new Browser();await device.ok('child.login',{loginId:'multi_child',password:'child-fixture-password'});expect((await device.ok('me')).timetableMemberIds).toEqual([am.id,cm.id]);
 await a.ok('family.remove',{familyId:am.family.id,profileId:cm.id,version:am.family.members.find((m:any)=>m.id===cm.id).version});
 expect((await a.ok('me')).timetableMemberIds).toEqual([am.id]);expect((await device.ok('me')).timetableMemberIds).toEqual([cm.id]);
 expect((await a.req(api+'timetable.preference.save',{memberIds:[am.id,cm.id]})).status).toBe(400);
 // Deleted targets are excluded even if their IDs remain in the stored array.
 await query(database.db,'UPDATE app_private.workspace_profiles SET timetable_member_ids=$1 WHERE id=$2',[[crypto.randomUUID()],am.id]);expect((await a.ok('me')).timetableMemberIds).toEqual([am.id]);
});

it('retires approval-number and role-specific public signup while accepting group links',async()=>{
 app=workspaceApp(false);
 const host=await parent('unified-host'),guest=await parent('unified-guest');
 for(const [op,input] of [
  ['invite.issue',{consent:true}],['family.join',{code:'123456'}],['child.signup',{}],['invite.link.signup',{}],
  ['invite.link.issue',{kind:'CHILD',guardianApplicationId:crypto.randomUUID(),consent:true}]
 ] as const){
  const response=await host.req(api+op,input);
  expect(response.status).toBe(410);
  expect((await response.json()).error.code).toBe('FLOW_REPLACED');
 }
 expect((await guest.ok('me')).family).toBeNull();
 const link=await host.ok('invite.link.issue',{consent:true});
 expect(new URL(link.url).pathname).toBe('/invite');
 expect((await host.ok('invite.link.options')).pending).toMatchObject([{id:link.id}]);
 await guest.ok('invite.link.inspect',{token:new URL(link.url).hash.slice(1)});
 expect((await guest.ok('me')).family).toBeNull();
 await guest.ok('invite.link.accept',{inviteId:link.id});
 expect((await guest.ok('me')).family.id).toBe((await host.ok('me')).family.id);
});

it('issues independent adult links, resumes after login, and switches groups only on explicit acceptance',async()=>{
 const host=await parent('link-host'),guest=new Browser(),other=await parent('link-other');
 const own=await other.ok('invite.link.issue',{kind:'PARENT',consent:true});
 const first=await host.ok('invite.link.issue',{kind:'PARENT',consent:true});
 const second=await host.ok('invite.link.issue',{kind:'PARENT',consent:true});
 const secretOf=(url:string)=>new URL(url).hash.slice(1);
 expect(first.url).toMatch(/^http:\/\/localhost:4173\/invite#[A-Za-z0-9_-]{43}$/);
 expect((await host.ok('invite.link.options')).pending.map((i:{id:string})=>i.id)).toEqual(expect.arrayContaining([first.id,second.id]));
 const response=await guest.req(api+'invite.link.inspect',{token:secretOf(first.url)});
 expect(response.status).toBe(200);
 expect(response.headers.get('Cache-Control')).toBe('no-store');
 expect(response.headers.getSetCookie().join(';')).toMatch(/HttpOnly; SameSite=Lax/i);
 const preview=await response.json();
 expect(preview).toMatchObject({id:first.id,kind:'PARENT',viewer:'GUEST'});
 expect(preview).not.toHaveProperty('familyName');
 expect((await guest.req(api+'invite.link.accept',{inviteId:first.id})).status).toBe(401);
 expect((await guest.req(api+'invite.link.inspect',{token:secretOf(first.url)},{Origin:'https://another.example'})).status).toBe(403);
 guest.cookies.forEach((value,key)=>other.cookies.set(key,value));
 const before=await other.ok('me');
 expect((await other.ok('invite.link.inspect')).familyName).toBeDefined();
 expect((await other.req(api+'invite.link.accept',{inviteId:second.id})).status).toBe(404);
 expect((await other.req(api+'invite.link.accept',{inviteId:first.id})).status).toBe(400);
 expect((await other.ok('me')).family.id).toBe(before.family.id);
 await other.ok('invite.link.accept',{inviteId:first.id,leaveCurrent:{familyId:before.family.id,version:before.family.members[0].version}});
 expect((await other.ok('me')).family.id).toBe((await host.ok('me')).family.id);
 expect((await guest.req(api+'invite.link.inspect',{token:secretOf(first.url)})).status).toBe(404);
 expect((await guest.req(api+'invite.link.inspect',{token:secretOf(own.url)})).status).toBe(404);
 await guest.ok('invite.link.inspect',{token:secretOf(second.url)});
 expect((await guest.req(api+'invite.link.signup',{inviteId:second.id,name:'가상 아이',loginId:'badrole',password:'fixture-password'})).status).toBe(404);
 await host.ok('invite.link.revoke',{inviteId:second.id});
 expect((await guest.req(api+'invite.link.inspect',{token:secretOf(second.url)})).status).toBe(404);
 const expired=await host.ok('invite.link.issue',{kind:'PARENT',consent:true});
 await query(database.db,"UPDATE app_private.workspace_invites SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
 expect((await guest.req(api+'invite.link.inspect',{token:secretOf(expired.url)})).status).toBe(404);
});

it('binds child signup to verified legal guardian evidence and atomically consumes it',async()=>{
 const host=await parent('link-guardian'),reviewer=await parent('link-reviewer'),other=await parent('link-unrelated'),child=new Browser();
 const [applicant]=await query<{id:string}>(database.db,'SELECT id FROM iharu_auth.members WHERE auth_user_id IN (SELECT id FROM iharu_auth."user" WHERE email=$1)',['link-guardian@example.test']);
 const [verifier]=await query<{id:string}>(database.db,'SELECT id FROM iharu_auth.members WHERE auth_user_id IN (SELECT id FROM iharu_auth."user" WHERE email=$1)',['link-reviewer@example.test']);
 expect(reviewer.cookies.size).toBeGreaterThan(0);
 const [guardian]=await query<{id:string}>(database.db,`INSERT INTO app_private.guardian_applications
  (applicant_id,request_key,target_label,relationship,state,reviewer_id,evidence_ref,verified_subject_ref,verified_birth_date)
  VALUES($1,gen_random_uuid(),'가상 아이','LEGAL_GUARDIAN','APPROVED',$2,'review:fixture','child:fixture',DATE '2018-03-02') RETURNING id`,[applicant.id,verifier.id]);
 const data={kind:'CHILD',guardianApplicationId:guardian.id,consent:true};
 expect((await host.ok('invite.link.options')).childRegistrationReady).toBe(false);
 expect((await host.req(api+'invite.link.issue',data)).status).toBe(400);
 await query(database.db,"UPDATE app_private.family_release SET child_deletion_verified_at=now(),verification_reference='fixture-deletion-only'");
 try{
  expect((await host.ok('invite.link.options')).children).toEqual([{id:guardian.id,label:'가상 아이'}]);
  expect((await other.req(api+'invite.link.issue',data)).status).toBe(400);
  const link=await host.ok('invite.link.issue',data),token=new URL(link.url).hash.slice(1);
  expect(await child.ok('invite.link.inspect',{token})).toMatchObject({id:link.id,kind:'CHILD',viewer:'GUEST'});
  await other.ok('invite.link.inspect',{token});
  expect((await other.req(api+'invite.link.accept',{inviteId:link.id})).status).toBe(404);
  await child.ok('invite.link.signup',{inviteId:link.id,name:'가상 서준',loginId:'linked_child',password:'fixture-password'});
  expect(await child.ok('me')).toMatchObject({name:'가상 서준',role:'CHILD',family:{id:(await host.ok('me')).family.id}});
  const [consent]=await query<{evidence_ref:string;policy_version:string}>(database.db,"SELECT evidence_ref,policy_version FROM app.child_consents WHERE consenter_id=$1",[applicant.id]);
  expect(consent).toEqual({evidence_ref:'review:fixture',policy_version:'guardian-link-1'});
  expect((await host.ok('invite.link.options')).children).toEqual([]);
  expect((await new Browser().req(api+'invite.link.inspect',{token})).status).toBe(404);
 }finally{
  await query(database.db,"UPDATE app_private.family_release SET child_deletion_verified_at=NULL,verification_reference=NULL");
 }
});

it('keeps timeline notes and flags private, recurring dates separate, and prunes deleted entries',async()=>{
 const host=await parent('timeline-host'),member=await parent('timeline-member'),outsider=await parent('timeline-outsider'),child=new Browser();
 const invite=await host.ok('invite.issue',{consent:true});await member.ok('family.join',{code:invite.code});
 const childInvite=await host.ok('invite.issue',{consent:true});
 await child.ok('child.signup',{loginId:'timeline_child',name:'타임라인 테스트',password:'child-fixture-password',code:childInvite.code});
 const oneOff=payload('공유 약속'),event=await host.ok('items.create',oneOff);
 const repeat=await host.ok('items.create',payload('매주 일정','REPEAT'));
 const fee=await host.ok('items.create',payload('거래','FEE'));
 const target={itemId:event.id,date:'2026-11-07'};
 expect((await outsider.ok('timeline.read',listing)).items).toEqual([]);
 expect((await outsider.req(api+'timeline.annotate',{...target,saved:true})).status).toBe(404);
 expect((await child.ok('timeline.read',listing)).items.map((item:{kind:string})=>item.kind)).not.toContain('FEE');
 expect((await child.req(api+'timeline.annotate',{itemId:fee.id,date:target.date,saved:true})).status).toBe(404);
 expect((await member.ok('timeline.read',listing)).items.map((item:{id:string})=>item.id)).toEqual([repeat.id,event.id,fee.id]);
 await member.ok('timeline.annotate',{...target,reviewed:true});
 await member.ok('timeline.annotate',{...target,saved:true});
 expect(await member.ok('timeline.annotate',{...target,note:'나만의 메모'})).toMatchObject({reviewed:true,saved:true,note:'나만의 메모'});
 expect((await host.ok('timeline.read',listing)).annotations).toEqual([]);
 expect((await member.req(api+'timeline.annotate',{...target,date:'2026-11-10',saved:true})).status).toBe(400);
 await member.ok('timeline.annotate',{itemId:repeat.id,date:'2026-11-09',note:'월요일 메모'});
 expect((await member.req(api+'timeline.annotate',{itemId:repeat.id,date:'2026-11-10',saved:true})).status).toBe(400);
 await member.ok('timeline.annotate',{itemId:repeat.id,date:'2026-11-16',reviewed:true});
 expect((await member.ok('timeline.read',listing)).annotations).toEqual(expect.arrayContaining([
  expect.objectContaining({itemId:repeat.id,date:'2026-11-09',reviewed:false,note:'월요일 메모'}),
  expect.objectContaining({itemId:repeat.id,date:'2026-11-16',reviewed:true,note:''}),
 ]));
 await host.ok('items.update',{...oneOff,id:event.id,version:1,data:{...oneOff.data,date:'2026-11-11'}});
 expect((await member.ok('timeline.read',listing)).annotations).toContainEqual({itemId:event.id,date:'2026-11-11',reviewed:true,saved:true,note:'나만의 메모'});
 await member.ok('timeline.annotate',{itemId:event.id,date:'2026-11-11',note:''});
 expect((await member.ok('timeline.read',listing)).annotations).toContainEqual({itemId:event.id,date:'2026-11-11',reviewed:true,saved:true,note:''});
 await host.ok('items.delete',{id:event.id,version:2});
 expect(await query(database.db,'SELECT item_id FROM app_private.workspace_timeline_annotations WHERE item_id=$1',[event.id])).toEqual([]);
 const owner=await host.ok('me'),viewer=await member.ok('me');
 await host.ok('family.remove',{familyId:owner.family.id,profileId:viewer.id,version:1});
 expect((await member.ok('timeline.read',listing)).annotations).toEqual([]);
 expect((await member.req(api+'timeline.annotate',{itemId:repeat.id,date:'2026-11-09',saved:true})).status).toBe(404);
});
