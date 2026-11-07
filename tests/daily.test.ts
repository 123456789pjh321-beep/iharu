import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './helpers/auth-db';
import {createAuthService} from '../server/auth/service';
import {createApp} from '../server/app';
import {FamilyService} from '../server/family/service';
import {query} from '../server/auth/database';
import {koreaToday} from '../shared/schedules';
import {dailyTodaySchema,dailyListSchema} from '../shared/daily';
const origin='http://localhost:4173',secret='isolated-p05-daily-fixture-never-production-001';
let database:Awaited<ReturnType<typeof testDatabase>>,family:FamilyService,app:ReturnType<typeof createApp>;
const mail:{to:string;url:string}[]=[];
const today=koreaToday();
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
 const cid=(await b.ok(`/api/v1/families/${fid}/children`,{draftId:draft.id,proofId:proof.proofId,nickname:'가상 아이',birthDate:'2018-03-02'})).id as string;
 return {b,fid,cid};
}
beforeAll(async()=>{database=await testDatabase();for(const name of (await readdir('db/migrations')).sort())await database.engine.exec(await readFile('db/migrations/'+name,'utf8'));},30000);
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets,app_private.holiday_years,app_private.holiday_sync_runs,app_private.schedule_jobs,app_private.schedule_idempotency CASCADE');await query(database.db,"UPDATE app_private.family_release SET child_deletion_verified_at=now(),verification_reference='isolated-test-fixture'");mail.length=0;const auth=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});family=new FamilyService(database.db,secret,'app_runtime');app=createApp({environment:'local',demoEnabled:false},()=>auth,async()=>family);});
afterAll(async()=>{await database.db.destroy();});
const stamp=()=>new Date().toISOString();
const checkin=(extra:object={})=>({kind:'ARRIVED',happenedAt:stamp(),clientEventId:randomUUID(),...extra});
const task=(extra:object={})=>({title:'책 읽기',detail:'10쪽 읽기',...extra});
async function kid(cid:string,fid:string){const token=randomUUID();await query(database.db,"INSERT INTO app.child_devices(family_id,child_id,label,token_hash) VALUES($1,$2,'가상 아이 기기',$3)",[fid,cid,family.digest('device:'+token)]);const b=new Browser();b.cookies.set('iharu-child',token);return b;}
describe('P05 daily records on real SQL with isolated users',()=>{
 it('stores checkins once, requires repeat confirmation and atomically corrects with history',async()=>{
  const {b,cid}=await setup();const input=checkin(),key=randomUUID(),path=`/api/v1/children/${cid}/checkins`;
  const first=await b.ok(path,input,'POST',key);expect(await b.ok(path,input,'POST',key)).toEqual(first);
  expect((await b.ok(path,input)).data.id).toBe(first.data.id);
  expect((await b.req(path,{...input,kind:'DEPARTED'},'POST',key)).status).toBe(409);
  expect((await b.req(path,checkin())).status).toBe(409);
  const repeat=await b.ok(path,checkin({confirmRepeat:true}));expect(repeat.data.id).not.toBe(first.data.id);
  const fixed=await b.ok(`/api/v1/checkins/${first.data.id}/corrections`,{expectedVersion:1,reason:'종류를 잘못 눌렀어요',replacement:checkin({kind:'DEPARTED'})});
  expect(fixed.data.supersedesId).toBe(first.data.id);expect((await b.ok(`/api/v1/checkins/${first.data.id}`)).data).toMatchObject({version:2,reason:'종류를 잘못 눌렀어요'});
  expect((await b.req(`/api/v1/checkins/${first.data.id}/corrections`,{expectedVersion:1,reason:'이전 화면'})).status).toBe(409);
  expect((await b.req(path,checkin({happenedAt:new Date(Date.now()+180000).toISOString()}))).status).toBe(422);
  expect((await b.req(path,checkin({happenedAt:new Date(Date.now()-8*86400000).toISOString()}))).status).toBe(422);
  expect((await query(database.db,"SELECT * FROM app_private.daily_events WHERE kind='CORRECTED'")).length).toBe(1);
 });
 it('lets a paired child check in and complete only their own tasks, with no learning/pickup writes',async()=>{
  const a=await setup(),other=await setup('other@example.test'),child=await kid(a.cid,a.fid);
  const t=(await a.b.ok(`/api/v1/children/${a.cid}/tasks`,task())).data;
  expect((await child.ok(`/api/v1/children/${a.cid}/checkins`,checkin())).data.actorType).toBe('CHILD');
  expect((await child.ok(`/api/v1/tasks/${t.id}/actions`,{action:'COMPLETE',expectedVersion:1})).data).toMatchObject({state:'DONE',version:2});
  expect((await child.req(`/api/v1/tasks/${t.id}/actions`,{action:'REOPEN',expectedVersion:2})).status).toBe(403);
  expect((await child.req(`/api/v1/children/${a.cid}/tasks`,task())).status).toBe(403);
  expect((await child.req(`/api/v1/children/${other.cid}/checkins`,checkin())).status).toBe(404);
  expect((await child.req(`/api/v1/children/${a.cid}/learning-entries`,{learningDate:today,content:'읽었어요'})).status).toBe(403);
  const d=dailyTodaySchema.parse(await child.ok(`/api/v1/children/${a.cid}/today`));expect(d.data.tasks[0].state).toBe('DONE');
  await query(database.db,"UPDATE app.child_devices SET status='REVOKED' WHERE child_id=$1",[a.cid]);const revoked=await child.req(`/api/v1/tasks/${t.id}`);expect(revoked.status).toBe(401);expect(await revoked.json()).toMatchObject({error:{code:'DEVICE_REQUIRED'}});
 });
 it('updates tasks with expected versions, cancels stale reminders and preserves safe learning links',async()=>{
  const {b,cid}=await setup();const t=(await b.ok(`/api/v1/children/${cid}/tasks`,task({dueAt:new Date(Date.now()+3600000).toISOString(),sourceName:'학원',sourceUrl:'https://example.test/homework'}))).data;
  expect((await query(database.db,"SELECT * FROM app_private.daily_jobs WHERE kind='TASK_DUE' AND state='PENDING'")).length).toBe(1);
  const note=(await b.ok(`/api/v1/children/${cid}/learning-entries`,{learningDate:today,subject:'국어',content:'소리 내어 읽었어요',taskId:t.id})).data;
  expect(note.taskTitle).toBe(t.title);
  await b.ok(`/api/v1/tasks/${t.id}/actions`,{action:'COMPLETE',expectedVersion:1});
  expect((await query(database.db,"SELECT * FROM app_private.daily_jobs WHERE kind='TASK_DUE' AND state='PENDING'")).length).toBe(0);
  expect((await b.req(`/api/v1/tasks/${t.id}/actions`,{action:'REOPEN',expectedVersion:1})).status).toBe(409);
  await b.ok(`/api/v1/tasks/${t.id}/actions`,{action:'REOPEN',expectedVersion:2});
  await b.ok(`/api/v1/tasks/${t.id}`,task({expectedVersion:3}),'PATCH');
  await b.ok(`/api/v1/tasks/${t.id}/actions`,{action:'CANCEL',expectedVersion:4});
  expect((await b.ok(`/api/v1/learning-entries/${note.id}`)).data.taskTitle).toBeNull();
  const edited=await b.ok(`/api/v1/learning-entries/${note.id}`,{learningDate:today,content:'추가 메모',subject:'국어',expectedVersion:1},'PATCH');expect(edited.data.version).toBe(2);
  const deleteKey=randomUUID(),deleted=await b.ok(`/api/v1/learning-entries/${note.id}`,{expectedVersion:2},'DELETE',deleteKey);expect(await b.ok(`/api/v1/learning-entries/${note.id}`,{expectedVersion:2},'DELETE',deleteKey)).toEqual(deleted);expect((await b.req(`/api/v1/learning-entries/${note.id}`)).status).toBe(404);
  expect((await b.req(`/api/v1/children/${cid}/tasks`,task({sourceUrl:'javascript:alert(1)'}))).status).toBe(422);
 });
 it('requires assignee acceptance, reacceptance after reassignment, and preserves completed handover',async()=>{
  const {b,cid,fid}=await setup(),child=await kid(cid,fid);
  const p=(await b.ok(`/api/v1/children/${cid}/pickups`,{scheduledAt:stamp(),assigneeMemberId:b.memberId,place:'정문',memo:'개인 메모'})).data;
  expect((await b.req(`/api/v1/pickups/${p.id}/actions`,{action:'HANDOVER',expectedVersion:1})).status).toBe(409);
  const limited=(await child.ok(`/api/v1/pickups/${p.id}`)).data;expect(limited.memo).toBeUndefined();expect(limited.place).toBeUndefined();expect(limited.actions).toEqual([]);
  await b.ok(`/api/v1/pickups/${p.id}/actions`,{action:'ACCEPT',expectedVersion:1});
  await b.ok(`/api/v1/pickups/${p.id}/actions`,{action:'REASSIGN',assigneeMemberId:b.memberId,expectedVersion:2});
  expect((await b.ok(`/api/v1/pickups/${p.id}`)).data.state).toBe('PROPOSED');
  await b.ok(`/api/v1/pickups/${p.id}/actions`,{action:'ACCEPT',expectedVersion:3});
  await b.ok(`/api/v1/pickups/${p.id}/actions`,{action:'HANDOVER',expectedVersion:4});
  expect((await b.req(`/api/v1/pickups/${p.id}/actions`,{action:'CANCEL',reason:'다시',expectedVersion:5})).status).toBe(409);
  const annotated=await b.ok(`/api/v1/pickups/${p.id}/actions`,{action:'ANNOTATE',reason:'보호자가 정문에서 만났어요',expectedVersion:5});expect(annotated.data.state).toBe('HANDED_OVER');expect(annotated.data.history).toHaveLength(6);
 });
 it('does not let a shared guardian correct a child-device record without consenter authority',async()=>{
  const a=await setup(),b=await parent('shared@example.test'),child=await kid(a.cid,a.fid);
  const invite=await a.b.ok(`/api/v1/families/${a.fid}/invites`,{}),token=new URL(invite.inviteUrl).hash.slice(1);
  const joined=await b.ok('/api/v1/invites/accept',{token});await a.b.ok(`/api/v1/memberships/${joined.membershipId}/approve`,{expectedVersion:1});
  await a.b.ok(`/api/v1/children/${a.cid}/grants/${b.memberId}`,{daily:true,chat:false,location:false,tuitionRead:false,tuitionWrite:false,expectedVersion:0},'PUT');
  const record=(await child.ok(`/api/v1/children/${a.cid}/checkins`,checkin())).data;
  expect((await b.ok(`/api/v1/checkins/${record.id}`)).data.actions).toEqual([]);
  expect((await b.req(`/api/v1/checkins/${record.id}/corrections`,{expectedVersion:1,reason:'공유 보호자 요청'})).status).toBe(403);
 });
 it('invalidates pickup assignment with grant withdrawal and hides other family data',async()=>{
  const a=await setup(),b=await setup('another@example.test');
  const p=(await a.b.ok(`/api/v1/children/${a.cid}/pickups`,{scheduledAt:stamp(),assigneeMemberId:a.b.memberId})).data;
  expect((await b.b.req(`/api/v1/pickups/${p.id}`)).status).toBe(404);
  await query(database.db,'UPDATE app.child_grants SET daily=false WHERE child_id=$1 AND member_id=$2',[a.cid,a.b.memberId]);
  const [row]=await query<{assignee_member_id:string|null;state:string;version:number}>(database.db,'SELECT assignee_member_id,state,version FROM app.pickups WHERE id=$1',[p.id]);expect(row).toEqual({assignee_member_id:null,state:'PROPOSED',version:2});
  expect((await a.b.req(`/api/v1/pickups/${p.id}`)).status).toBe(404);
  await database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');expect(await query(tx,'SELECT id FROM app.tasks')).toEqual([]);await expect(query(tx,"INSERT INTO app.tasks(title) VALUES('denied')")).rejects.toMatchObject({code:'42501'});});
 });
 it('links records to stable occurrences and suppresses missing-arrival reminders for ASK/cancelled schedules',async()=>{
  const {b,cid,fid}=await setup();await b.ok(`/api/v1/children/${cid}/schedules`,{title:'오늘 학원',place:'교실',date:today,untilDate:today,startTime:'00:00',endTime:'23:59',frequency:'ONCE',weekdays:[new Date(today+'T00:00:00Z').getUTCDay()],holidayPolicy:'ASK'});
  const d=dailyTodaySchema.parse(await b.ok(`/api/v1/families/${fid}/today`)),o=d.data.occurrences[0];expect(o.status).toBe('NEEDS_CONFIRMATION');
  await query(database.db,'SELECT app_private.daily_maintenance()');expect((await query(database.db,"SELECT id FROM app_private.daily_jobs WHERE kind='MISSING_ARRIVAL'")).length).toBe(0);
  await query(database.db,"UPDATE app.occurrences SET status='SCHEDULED' WHERE id=$1",[o.id]);await query(database.db,'SELECT app_private.daily_maintenance()');
  expect((await query(database.db,"SELECT id FROM app_private.daily_jobs WHERE kind='MISSING_ARRIVAL' AND state='PENDING'")).length).toBe(1);
  await b.ok(`/api/v1/children/${cid}/checkins`,checkin({occurrenceId:o.id}));
  expect((await query(database.db,"SELECT id FROM app_private.daily_jobs WHERE kind='MISSING_ARRIVAL' AND state='PENDING'")).length).toBe(0);
  expect((await query<{protected_at:string}>(database.db,'SELECT protected_at FROM app.occurrences WHERE id=$1',[o.id]))[0].protected_at).not.toBeNull();
  const p=(await b.ok(`/api/v1/children/${cid}/pickups`,{scheduledAt:stamp(),occurrenceId:o.id,assigneeMemberId:b.memberId})).data;
  expect(p.state).toBe('PROPOSED');expect((await b.req(`/api/v1/children/${cid}/pickups`,{scheduledAt:stamp(),occurrenceId:o.id})).status).toBe(409);
  const records=dailyListSchema.parse(await b.ok(`/api/v1/children/${cid}/records?from=${today}&to=${today}&limit=1`));expect(records.data.items).toHaveLength(1);expect(records.meta.nextCursor).toBeTruthy();
  const next=dailyListSchema.parse(await b.ok(`/api/v1/children/${cid}/records?from=${today}&to=${today}&cursor=${records.meta.nextCursor}`));expect(next.data.items[0].id).not.toBe(records.data.items[0].id);
 });
});

 it('P07-F07 retention detaches retained learning from expired tasks and preserves current records',async()=>{
  const {b,cid}=await setup();
  const task=(await b.ok(`/api/v1/children/${cid}/tasks`,{title:'격리 보관 만료'})).data;
  await query(database.db,"UPDATE app.tasks SET state='DONE',closed_at=now()-interval '91 days' WHERE id=$1",[task.id]);
  await query(database.db,"INSERT INTO app.learning_entries(family_id,child_id,learning_date,content,task_id,created_by,updated_by) SELECT family_id,child_id,current_date,'격리 최신 기록',id,created_by,created_by FROM app.tasks WHERE id=$1",[task.id]);
  await query(database.db,'SELECT app_private.retention_maintenance()');
  expect(await query(database.db,'SELECT id FROM app.tasks WHERE id=$1',[task.id])).toHaveLength(0);
  expect((await query<{task_id:string|null}>(database.db,'SELECT task_id FROM app.learning_entries'))[0].task_id).toBeNull();
 });

