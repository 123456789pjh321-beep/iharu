import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './helpers/auth-db';
import {createAuthService} from '../server/auth/service';
import {createApp} from '../server/app';
import {FamilyService} from '../server/family/service';
import {query} from '../server/auth/database';

import {messageListSchema} from '../shared/messages';
import {messageCatalog} from '../shared/message-catalog';
const origin='http://localhost:4173',secret='isolated-p05-daily-fixture-never-production-001';
let database:Awaited<ReturnType<typeof testDatabase>>,family:FamilyService,app:ReturnType<typeof createApp>;
const mail:{to:string;url:string}[]=[];

class Browser{
 cookies=new Map<string,string>();memberId='';sessionId='';
 async req(path:string,body?:object,method=body?'POST':'GET',key:string=randomUUID()){
  const r=await app.request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json','Idempotency-Key':key,Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},...(body?{body:JSON.stringify(body)}:{})});
  for(const cookie of r.headers.getSetCookie()){const [part]=cookie.split(';'),i=part.indexOf('=');this.cookies.set(part.slice(0,i),part.slice(i+1));}return r;
 }
 async ok(path:string,body?:object,method?:string,key?:string){const r=await this.req(path,body,method,key);expect(r.status,await r.clone().text()).toBeLessThan(300);return r.json();}
}
async function parent(email:string){const b=new Browser();await b.ok('/api/auth/sign-up/email',{email,password:'p04-fixture-parent-password',name:'가상 보호자',callbackURL:'/login?verified=1'});await b.req(mail.find(m=>m.to===email)!.url.replace(origin,''));await b.ok('/api/auth/sign-in/email',{email,password:'p04-fixture-parent-password'});
 const [row]=await query<{id:string;sid:string}>(database.db,'SELECT m.id,s.id sid FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id JOIN iharu_auth.session s ON s."userId"=u.id WHERE u.email=$1',[email]);b.memberId=row.id;b.sessionId=row.sid;await query(database.db,'UPDATE iharu_auth.members SET access_ready=true WHERE id=$1',[row.id]);return b;}
async function setup(email='daily-a@example.test'){
 const b=await parent(email),fid=(await b.ok('/api/v1/families',{name:'가상 가족'})).id;
 const draft=await b.ok(`/api/v1/families/${fid}/child-registration-drafts`,{});
 await query(database.db,"SELECT app_private.record_relationship_result($1,$2,$3,'2018-03-02','p04-fixture',true)",[draft.id,randomUUID(),randomUUID()]);
 const proof=await b.ok(`/api/v1/child-registration-drafts/${draft.id}/consent-proofs`,{general:true,location:false,policyVersion:'6.1'});
 const cid=(await b.ok(`/api/v1/families/${fid}/children`,{draftId:draft.id,proofId:proof.proofId,nickname:'서준',birthDate:'2018-03-02'})).id as string;
 return {b,fid,cid};
}
beforeAll(async()=>{database=await testDatabase();for(const name of (await readdir('db/migrations')).sort())await database.engine.exec(await readFile('db/migrations/'+name,'utf8'));},30000);
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets,app_private.holiday_years,app_private.holiday_sync_runs,app_private.schedule_jobs,app_private.schedule_idempotency CASCADE');await query(database.db,"UPDATE app_private.family_release SET child_deletion_verified_at=now(),verification_reference='isolated-test-fixture'");mail.length=0;const auth=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});family=new FamilyService(database.db,secret,'app_runtime');app=createApp({environment:'local',demoEnabled:false},()=>auth,async()=>family);});
afterAll(async()=>{await database.db.destroy();});
async function kid(cid:string,fid:string){const token=randomUUID();await query(database.db,"INSERT INTO app.child_devices(family_id,child_id,label,token_hash) VALUES($1,$2,'가상 아이 기기',$3)",[fid,cid,family.digest('device:'+token)]);const b=new Browser();b.cookies.set('iharu-child',token);return b;}
const picture=(extra:object={})=>({kind:'STICKER',catalogId:'arrived',catalogVersion:2,clientMessageId:randomUUID(),...extra});
async function ageMessages(){await query(database.db,"UPDATE app.messages SET created_at=now()-interval '2 seconds'");}
describe('P06 child-scoped conversation',()=>{
 it('persists server snapshots once, rejects forged input and never changes attendance',async()=>{
  const {b,cid}=await setup(),path=`/api/v1/children/${cid}/messages`,input=picture(),key=randomUUID();
  const first=(await b.ok(path,input,'POST',key)).data;expect(first).toMatchObject({displayText:'도착했어요',emoji:'🏫',seq:1,readByOther:false});
  expect((await b.ok(path,input,'POST',key)).data).toEqual(first);expect((await b.ok(path,input)).data.id).toBe(first.id);
  expect((await b.req(path,{...input,catalogId:'help'},'POST',key)).status).toBe(409);
  expect((await b.req(path,picture({emoji:'fake'}))).status).toBe(422);
  expect((await b.req(path,picture({body:'fake'}))).status).toBe(422);
  expect((await b.req(path,{kind:'TEXT',body:'hello',catalogId:'hello',clientMessageId:randomUUID()})).status).toBe(422);
  expect((await b.req(path,picture())).status).toBe(429);
  expect((await query(database.db,'SELECT * FROM app.checkins')).length).toBe(0);
  expect((await query(database.db,'SELECT * FROM app.messages')).length).toBe(1);
  expect((await query(database.db,'SELECT * FROM app_private.message_jobs')).length).toBe(1);
 });
 it('keeps v1 immutable, accepts v2, rejects missing versions and items',async()=>{
  const {b,cid}=await setup(),path=`/api/v1/children/${cid}/messages`;
  const old=(await b.ok(path,picture({catalogId:'soon',catalogVersion:1}))).data;expect(old.displayText).toBe('조금 뒤에요');await ageMessages();
  const fresh=(await b.ok(path,picture({catalogId:'soon'}))).data;expect(fresh.displayText).toBe('조금 뒤예요');await ageMessages();
  expect((await b.req(path,picture({catalogVersion:3}))).status).toBe(409);expect((await b.req(path,picture({catalogId:'unknown'}))).status).toBe(422);
  expect(messageCatalog(1)).toHaveLength(36);expect(messageCatalog(2)).toHaveLength(36);
  expect((await b.ok(path)).data.items[0].displayText).toBe('조금 뒤에요');
 });
 it('deletes snapshots permanently, including an idempotent send replay and change cursors',async()=>{
  const {b,cid}=await setup(),path=`/api/v1/children/${cid}/messages`,input=picture(),key=randomUUID();
  const m=(await b.ok(path,input,'POST',key)).data,list=messageListSchema.parse(await b.ok(path));
  await b.ok(`/api/v1/messages/${m.id}`,{expectedVersion:1},'DELETE');
  expect((await b.ok(path,input,'POST',key)).data).toMatchObject({displayText:null,body:null,emoji:null,catalogId:null});
  expect((await b.ok(path,input)).data.displayText).toBeNull();
  const changes=await b.ok(`/api/v1/children/${cid}/message-changes?cursor=${list.data.snapshotCursor}`);expect(changes.data.items[0].deletedAt).toBeTruthy();expect(changes.data.items[0].displayText).toBeNull();
  const raw=(await query<{body:null;label_snapshot:null}>(database.db,'SELECT body,label_snapshot FROM app.messages'))[0];expect(raw).toEqual({body:null,label_snapshot:null});
  const idem=JSON.stringify(await query(database.db,'SELECT * FROM app_private.message_keys'));expect(idem).not.toContain('도착');
 });
 it('isolates child devices and families, and marks read only for a fetched visible sequence',async()=>{
  const a=await setup(),other=await setup('chat-b@example.test'),child=await kid(a.cid,a.fid),path=`/api/v1/children/${a.cid}/messages`;
  const m=(await a.b.ok(path,picture())).data;expect((await other.b.req(path)).status).toBe(404);expect((await child.req(`/api/v1/children/${other.cid}/messages`)).status).toBe(404);
  const list=(await child.ok(path)).data;expect(list.items[0].mine).toBe(false);
  expect((await child.req(`/api/v1/children/${a.cid}/read-cursor`,{receipt:list.receipt,lastReadSeq:99},'PUT')).status).toBe(422);
  expect((await a.b.req(`/api/v1/children/${a.cid}/read-cursor`,{receipt:list.receipt,lastReadSeq:1},'PUT')).status).toBe(422);
  await child.ok(`/api/v1/children/${a.cid}/read-cursor`,{receipt:list.receipt,lastReadSeq:1},'PUT');expect((await a.b.ok(path)).data.items[0].readByOther).toBe(true);
  expect((await child.req(`/api/v1/messages/${m.id}`,{expectedVersion:1},'DELETE')).status).toBe(403);
  await query(database.db,"UPDATE app.child_devices SET status='REVOKED' WHERE child_id=$1",[a.cid]);expect((await child.req(path)).status).toBe(401);expect((await a.b.ok(path)).data.items[0].readByOther).toBe(false);
 });
 it('starts shared guardians at grant sequence, resets old cursors after revoke and blocks direct SQL',async()=>{
  const a=await setup(),b=await parent('shared@example.test'),path=`/api/v1/children/${a.cid}/messages`;const old=(await a.b.ok(path,picture())).data;
  const invite=await a.b.ok(`/api/v1/families/${a.fid}/invites`,{}),joined=await b.ok('/api/v1/invites/accept',{token:new URL(invite.inviteUrl).hash.slice(1)});await a.b.ok(`/api/v1/memberships/${joined.membershipId}/approve`,{expectedVersion:1});
  const grant=(chat:boolean,expectedVersion:number)=>a.b.ok(`/api/v1/children/${a.cid}/grants/${b.memberId}`,{daily:false,chat,location:false,tuitionRead:false,tuitionWrite:false,expectedVersion},'PUT');await grant(true,0);
  const start=(await b.ok(path)).data;expect(start.items).toEqual([]);await a.b.ok(`/api/v1/messages/${old.id}`,{expectedVersion:1},'DELETE');const changes=(await b.ok(`/api/v1/children/${a.cid}/message-changes?cursor=${start.snapshotCursor}&limit=1`)).data;expect(changes.items).toEqual([]);expect(changes.hasMore).toBe(false);await ageMessages();await a.b.ok(path,picture({catalogId:'thanks'}));const visible=(await b.ok(path)).data;expect(visible.items.map((m:{seq:number})=>m.seq)).toEqual([1]);
  await grant(false,1);expect((await b.req(path)).status).toBe(404);await grant(true,2);expect((await b.req(`/api/v1/children/${a.cid}/message-changes?cursor=${visible.snapshotCursor}`)).status).toBe(409);expect((await b.ok(path)).data.items).toEqual([]);
  await database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await expect(query(tx,'SELECT * FROM app.messages')).rejects.toMatchObject({code:'42501'});});
 });
 it('paginates in order, bounds bodies and expires content after 90 days',async()=>{
  const {b,cid}=await setup(),path=`/api/v1/children/${cid}/messages`;for(let i=0;i<3;i++){await ageMessages();await b.ok(path,{body:'메모 '+i,clientMessageId:randomUUID()});}
  const page=(await b.ok(path+'?limit=2')).data;expect(page.items.map((m:{seq:number})=>m.seq)).toEqual([2,3]);expect(page.hasMore).toBe(true);
  expect((await b.ok(path+'?beforeSeq=2&limit=2')).data.items[0].seq).toBe(1);
  expect((await b.req(path,{kind:'TEXT',body:'x'.repeat(17000),clientMessageId:randomUUID()})).status).toBe(413);
  await query(database.db,"UPDATE app.messages SET created_at=now()-interval '91 days'");expect((await b.ok(path)).data.items).toEqual([]);await query(database.db,'SELECT app_private.message_maintenance()');expect(await query(database.db,'SELECT * FROM app.messages')).toEqual([]);
 });
});

describe('P07 permission-aware inbox',()=>{
 it('creates one inbox item in the message transaction, isolates recipients and removes deleted content',async()=>{
  const {b,cid,fid}=await setup(),child=await kid(cid,fid),other=await parent('inbox-other@example.test');
  const path=`/api/v1/children/${cid}/messages`,input=picture(),key=randomUUID();
  const msg=(await child.ok(path,input,'POST',key)).data;
  await child.ok(path,input,'POST',key);
  const inbox=(await b.ok('/api/v1/notifications')).data;
  expect(inbox.items).toHaveLength(1);expect(JSON.stringify(inbox)).not.toContain('도착했어요');
  expect((await other.ok('/api/v1/notifications')).data.items).toHaveLength(0);
  expect((await child.req('/api/v1/notifications')).status).toBe(403);
  const item=inbox.items[0];
  expect((await other.req(`/api/v1/notifications/${item.id}/read`,{expectedVersion:1},'PUT')).status).toBe(404);
  await b.ok(`/api/v1/notifications/${item.id}/read`,{expectedVersion:1},'PUT');
  await b.ok(`/api/v1/notifications/${item.id}/read`,{expectedVersion:1},'PUT');
  expect((await b.ok('/api/v1/notifications')).data.items[0].readAt).toBeTruthy();
  const messages=(await b.ok(path)).data;expect(messages.items[0].readByOther).toBe(false);
  await child.ok(`/api/v1/messages/${msg.id}`,{expectedVersion:1},'DELETE');
  expect((await b.ok('/api/v1/notifications')).data.items).toHaveLength(0);
  await database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await expect(query(tx,'SELECT * FROM app_private.notifications')).rejects.toThrow();});
 });
 it('hides notifications after grant change and expires old inbox records',async()=>{
  const {b,cid,fid}=await setup(),child=await kid(cid,fid);
  await child.ok(`/api/v1/children/${cid}/messages`,picture());
  expect((await b.ok('/api/v1/notifications')).data.items).toHaveLength(1);
  await query(database.db,'UPDATE app.child_grants SET chat=false,version=version+1 WHERE child_id=$1 AND member_id=$2',[cid,b.memberId]);
  expect((await b.ok('/api/v1/notifications')).data.items).toHaveLength(0);
  await query(database.db,'UPDATE app.child_grants SET chat=true,version=version+1 WHERE child_id=$1 AND member_id=$2',[cid,b.memberId]);
  expect((await b.ok('/api/v1/notifications')).data.items).toHaveLength(0);
  await query(database.db,"UPDATE app_private.notifications SET created_at=now()-interval '31 days'");
  await query(database.db,'SELECT app_private.retention_maintenance()');
  expect(await query(database.db,'SELECT id FROM app_private.notifications')).toHaveLength(0);
 });
});


it('P07 reminder worker is transactional, idempotent and skips expired work',async()=>{
 const {b,cid}=await setup();
 const task=(await b.ok(`/api/v1/children/${cid}/tasks`,{title:'가상 준비물',dueAt:new Date(Date.now()+3600000).toISOString()})).data;
 await query(database.db,"UPDATE app_private.daily_jobs SET available_at=now()-interval '1 minute' WHERE target_id=$1",[task.id]);
 await database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE worker_runtime');await query(tx,'SELECT app_private.notification_maintenance()');await query(tx,'SELECT app_private.notification_maintenance()');});
 const items=(await b.ok('/api/v1/notifications')).data.items;
 expect(items.filter((x:{kind:string})=>x.kind==='TASK_DUE')).toHaveLength(1);
 const next=(await b.ok(`/api/v1/children/${cid}/tasks`,{title:'가상 만료',dueAt:new Date(Date.now()+3600000).toISOString()})).data;
 await query(database.db,"UPDATE app_private.daily_jobs SET available_at=now()-interval '2 hours' WHERE target_id=$1",[next.id]);
 await query(database.db,'SELECT app_private.notification_maintenance()');
 expect((await b.ok('/api/v1/notifications')).data.items.filter((x:{kind:string})=>x.kind==='TASK_DUE')).toHaveLength(1);
 expect((await query<{state:string}>(database.db,'SELECT state FROM app_private.daily_jobs WHERE target_id=$1',[next.id]))[0].state).toBe('EXPIRED');
});

it('P07-F08 token endpoint applies the same live parent/child scope before returning fallback, and rechecks withdrawn grants',async()=>{
 const a=await setup(),other=await setup('realtime-other@example.test'),child=await kid(a.cid,a.fid);
 const route=`/api/v1/children/${a.cid}/realtime-token`;
 expect((await a.b.ok(route,{})).data.state).toBe('POLLING');expect((await child.ok(route,{})).data.state).toBe('POLLING');
 expect((await other.b.req(route,{})).status).toBe(404);
 const [t]=await query<{id:string;principal_id:string;epoch:number}>(database.db,'SELECT id,principal_id,epoch FROM app_private.realtime_tickets WHERE member_id=$1',[a.b.memberId]);
 const topic=`child:${a.cid}:chat:${t.epoch}`,claims=JSON.stringify({jti:t.id,sub:t.principal_id,role:'authenticated',purpose:'iharu_chat'});
 const allowed=async()=> (await query<{ok:boolean}>(database.db,'SELECT app_private.realtime_allowed($1,$2::jsonb) ok',[topic,claims]))[0].ok;
 expect(await allowed()).toBe(true);
 await query(database.db,'UPDATE app_private.realtime_tickets SET expires_at=now() WHERE id=$1',[t.id]);expect(await allowed()).toBe(false);
 await query(database.db,"UPDATE app_private.realtime_tickets SET expires_at=now()+interval '1 minute' WHERE id=$1",[t.id]);
 await query(database.db,'UPDATE iharu_auth.members SET access_ready=false WHERE id=$1',[a.b.memberId]);expect(await allowed()).toBe(false);expect((await a.b.req(route,{})).status).toBe(403);
});

