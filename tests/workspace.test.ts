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
async function parent(name:string){const b=new Browser(),email=name+'@example.test';const signup=await b.req('/api/auth/sign-up/email',{email,name,password:'parent-fixture-password',callbackURL:'/login?verified=1'});expect(signup.ok).toBe(true);await app.request(mail.find(m=>m.to===email)!.url);expect((await b.req('/api/auth/sign-in/email',{email,password:'parent-fixture-password'})).ok).toBe(true);return b;}
const payload=(title:string,kind='EVENT')=>({kind,data:{title,date:'2026-11-07',weekdays:[],startTime:'16:00',endTime:'17:00',place:'',note:'내 자료',paid:false,...(kind==='FEE'?{amount:150000}:{}),...(kind==='REPEAT'?{untilDate:'2026-12-07',weekdays:[1,3,5]}:{})}});
const listing={from:'2026-11-01',to:'2026-11-30'};
beforeAll(async()=>{database=await testDatabase();for(const file of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await database.engine.exec(await readFile('db/migrations/'+file,'utf8'));},30000);
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets CASCADE');mail.length=0;const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>new FamilyService(database.db,secret,'app_runtime'));});
afterAll(async()=>{await database.db.destroy();});
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
