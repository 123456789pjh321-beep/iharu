import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './helpers/auth-db';
import {createAuthService} from '../server/auth/service';
import {createApp} from '../server/app';
import {FamilyService} from '../server/family/service';
import {query} from '../server/auth/database';
const origin='http://localhost:4173',secret='isolated-p03-test-never-use-for-production-001';
let database:Awaited<ReturnType<typeof testDatabase>>,family:FamilyService,app:ReturnType<typeof createApp>;
const mail:{to:string;url:string;kind:string}[]=[];
class Browser{
 cookies=new Map<string,string>(); memberId=''; sessionId='';
 async req(path:string,body?:object,method=body?'POST':'GET',headers:Record<string,string>={}){
 const r=await app.request(origin+path,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...headers},...(body?{body:JSON.stringify(body)}:{})});
 for(const cookie of r.headers.getSetCookie()){const [part]=cookie.split(';'),i=part.indexOf('=');if(part.slice(i+1))this.cookies.set(part.slice(0,i),part.slice(i+1));else this.cookies.delete(part.slice(0,i));}return r;
 }
 async ok(path:string,body?:object,method?:string){const r=await this.req(path,body,method);expect(r.status,await r.clone().text()).toBeLessThan(300);return r.json();}
 actor(){return {memberId:this.memberId,sessionId:this.sessionId,requestId:randomUUID()};}
}
async function parent(email:string,ready=true){const b=new Browser();await b.ok('/api/auth/sign-up/email',{ageAtLeast14:true,email,password:'p03-parent-fixture-password',name:email.split('@')[0],callbackURL:'/login?verified=1'});const link=[...mail].reverse().find(m=>m.to===email)!;await b.req(link.url.replace(origin,''));await b.ok('/api/auth/sign-in/email',{email,password:'p03-parent-fixture-password'});
 const [row]=await query<{id:string;session:string}>(database.db,'SELECT m.id,s.id AS session FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id JOIN iharu_auth.session s ON s."userId"=u.id WHERE u.email=$1',[email]);b.memberId=row.id;b.sessionId=row.session;
 if(ready)await query(database.db,'UPDATE iharu_auth.members SET access_ready=true WHERE id=$1',[b.memberId]);return b;}
async function create(b:Browser,name='가상 가족'){return (await b.ok('/api/v1/families',{name})).id as string;}
async function join(owner:Browser,other:Browser,fid:string){const invite=await owner.ok(`/api/v1/families/${fid}/invites`,{});const pending=await other.ok('/api/v1/invites/accept',{token:new URL(invite.inviteUrl).hash.slice(1)});await owner.ok(`/api/v1/memberships/${pending.membershipId}/approve`,{expectedVersion:1});return pending.membershipId as string;}
async function register(b:Browser,fid:string,location=false,nickname='가상 아이'){
 const d=await b.ok(`/api/v1/families/${fid}/child-registration-drafts`,{});
 // Isolated fixture only. The production API exposes no fake verification callback.
 await query(database.db,"SELECT app_private.record_relationship_result($1,$2,$3,'2018-03-02','virtual-fixture',true)",[d.id,randomUUID(),randomUUID()]);
 const proof=await b.ok(`/api/v1/child-registration-drafts/${d.id}/consent-proofs`,{general:true,location,policyVersion:'6.1'});
 const child=await b.ok(`/api/v1/families/${fid}/children`,{draftId:d.id,proofId:proof.proofId,nickname,birthDate:'2018-03-02'});return {id:child.id as string,draftId:d.id,proofId:proof.proofId};
}
async function grant(owner:Browser,childId:string,target:Browser,flags:Record<string,boolean>={},expectedVersion=0){return owner.ok(`/api/v1/children/${childId}/grants/${target.memberId}`,{daily:false,chat:false,location:false,tuitionRead:false,tuitionWrite:false,...flags,expectedVersion},'PUT');}
async function pair(owner:Browser,childId:string,device=new Browser()){
 const p=await device.ok('/api/v1/device-pairings',{label:'아이 태블릿'});const resolved=await owner.ok('/api/v1/device-pairings/resolve',{code:p.code});await owner.ok(`/api/v1/device-pairings/${p.id}/approve`,{childId,expectedVersion:resolved.version});return {device,p,exchangeKey:randomUUID()};}
beforeAll(async()=>{database=await testDatabase();for(const f of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await database.engine.exec(await readFile(`db/migrations/${f}`,'utf8'));},30000);
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets CASCADE');await query(database.db,"UPDATE app_private.family_release SET child_deletion_verified_at=now(),verification_reference='isolated-test-fixture'");mail.length=0;const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});family=new FamilyService(database.db,secret,'app_runtime');app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>family);});
afterAll(async()=>{await database.db.destroy();});
describe('P03 family policy under the non-owner app_runtime role',()=>{
 it('does not turn email login, client claims or unconnected verification into child access',async()=>{
  const b=await parent('not-ready@example.test',false);
  expect((await b.req('/api/v1/me')).status).toBe(403);expect((await b.ok('/api/v1/setup')).realChildRegistrationEnabled).toBe(false);
  await query(database.db,'UPDATE iharu_auth.members SET access_ready=true WHERE id=$1',[b.memberId]);const fid=await create(b);
  const d=await b.ok(`/api/v1/families/${fid}/child-registration-drafts`,{});
  expect((await b.req(`/api/v1/child-registration-drafts/${d.id}/verification-sessions`,{})).status).toBe(503);
  expect((await b.req(`/api/v1/child-registration-drafts/${d.id}/consent-proofs`,{general:true,location:false,policyVersion:'6.1'})).status).toBe(400);
  expect((await b.req(`/api/v1/families/${fid}/children`,{state:'VERIFIED',nickname:'forged'})).status).toBe(400);
  expect((await query(database.db,'SELECT * FROM app.children')).length).toBe(0);
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.record_relationship_result($1,'forged','forged','2018-03-02','forged',true)",[d.id]);})).rejects.toMatchObject({code:'42501'});
 });
 it('F01 reports contact and database readiness without changing authorization',async()=>{
  const b=await parent('f01-api@example.test',false);
  expect(await b.ok('/api/v1/setup')).toMatchObject({accountReady:false,emailVerified:true,emailDeliveryAvailable:true,databaseReady:true,relationshipVerification:'MANUAL_REVIEW',realChildRegistrationEnabled:false});
  await query(database.db,'UPDATE iharu_auth."user" SET "emailVerified"=false WHERE email=$1',['f01-api@example.test']);
  expect(await b.ok('/api/v1/setup')).toMatchObject({accountReady:false,emailVerified:false});
  expect((await b.req('/api/v1/families',{name:'blocked'})).status).toBe(403);
  const original=family.db;family=new FamilyService({executeQuery:async()=>{throw new Error('private database failure');}} as never,secret);
  const r=await b.ok('/api/v1/setup');
  expect(r.databaseReady).toBe(false);expect(JSON.stringify(r)).not.toContain('private database');
  family=new FamilyService(original,secret,'app_runtime');
 });
 it('requires participation approval AND child-specific grant; owner transfer never confers child visibility',async()=>{
  const a=await parent('a@example.test'),b=await parent('b@example.test');const fid=await create(a);const first=await register(a,fid),sibling=await register(a,fid,false,'가상 동생');
  const i=await a.ok(`/api/v1/families/${fid}/invites`,{});const accepted=await b.ok('/api/v1/invites/accept',{token:new URL(i.inviteUrl).hash.slice(1)});
  expect((await b.ok('/api/v1/me')).families).toHaveLength(0);expect((await b.req(`/api/v1/families/${fid}/children`)).status).toBe(404);
  await a.ok(`/api/v1/memberships/${accepted.membershipId}/approve`,{expectedVersion:1});expect((await b.ok(`/api/v1/families/${fid}/children`)).children).toEqual([]);
  await a.ok(`/api/v1/families/${fid}/owner`,{memberId:b.memberId,expectedVersion:1});expect((await b.ok(`/api/v1/families/${fid}/children`)).children).toEqual([]);
  await grant(a,first.id,b,{daily:true});const list=await b.ok(`/api/v1/families/${fid}/children`);expect(list.children.map((c:{id:string})=>c.id)).toEqual([first.id]);expect(JSON.stringify(list)).not.toContain(sibling.id);
  expect((await b.req(`/api/v1/children/${first.id}/grants`)).status).toBe(404);
 });
 it('replaces old invitation links, binds acceptance to one member, and rejects stale ownership versions',async()=>{
  const a=await parent('a@example.test'),b=await parent('b@example.test'),c=await parent('c@example.test');const fid=await create(a);
  const old=await a.ok(`/api/v1/families/${fid}/invites`,{}),fresh=await a.ok(`/api/v1/families/${fid}/invites`,{});
  expect((await b.req('/api/v1/invites/accept',{token:new URL(old.inviteUrl).hash.slice(1)})).status).toBe(400);
  await b.ok('/api/v1/invites/accept',{token:new URL(fresh.inviteUrl).hash.slice(1)});
  expect((await c.req('/api/v1/invites/accept',{token:new URL(fresh.inviteUrl).hash.slice(1)})).status).toBe(400);
  expect((await a.req(`/api/v1/families/${fid}/owner`,{memberId:b.memberId,expectedVersion:0})).status).toBe(409);
 });
 it('consumes a proof once, binds birth date and family, and creates room+consents+grant atomically',async()=>{
  const a=await parent('a@example.test');const fid=await create(a),other=await create(a,'가상 다른 가족');
  const d=await a.ok(`/api/v1/families/${fid}/child-registration-drafts`,{});
  await query(database.db,"UPDATE app_private.child_registration_drafts SET state='VERIFIED',subject_ref='virtual-child-1',birth_date='2018-03-02',evidence_ref='virtual' WHERE id=$1",[d.id]);
  const proof=await a.ok(`/api/v1/child-registration-drafts/${d.id}/consent-proofs`,{general:true,location:false,policyVersion:'6.1'});
  const input={draftId:d.id,proofId:proof.proofId,nickname:'가상 아이',birthDate:'2018-03-02'};
  expect((await a.req(`/api/v1/families/${fid}/children`,{...input,birthDate:'2019-01-01'})).status).toBe(400);
  expect((await a.req(`/api/v1/families/${other}/children`,input)).status).toBe(404);
  const ch=await a.ok(`/api/v1/families/${fid}/children`,input);expect((await a.req(`/api/v1/families/${fid}/children`,input)).status).toBe(400);
  expect((await query(database.db,'SELECT * FROM app.rooms WHERE child_id=$1',[ch.id])).length).toBe(1);
  expect((await query(database.db,'SELECT * FROM app.child_consents WHERE child_id=$1',[ch.id])).length).toBe(1);
  expect((await a.ok(`/api/v1/children/${ch.id}/grants`)).grants[0]).toMatchObject({daily:true,chat:true,location:false,tuitionRead:true,tuitionWrite:true});
 });
 it('isolates family A/B in SQL RLS, denies missing context, and enforces composite family foreign keys',async()=>{
  const a=await parent('a@example.test'),b=await parent('b@example.test');const fa=await create(a),fb=await create(b);const ca=await register(a,fa),cb=await register(b,fb);
  await database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');expect(await query(tx,'SELECT id FROM app.children')).toEqual([]);await query(tx,"SELECT set_config('iharu.member_id',$1,true),set_config('iharu.session_id',$2,true)",[a.memberId,a.sessionId]);expect((await query<{id:string}>(tx,'SELECT id FROM app.children')).map(c=>c.id)).toEqual([ca.id]);});
  expect((await a.req(`/api/v1/children/${cb.id}/devices`)).status).toBe(404);
  await expect(query(database.db,"INSERT INTO app.child_grants(family_id,child_id,member_id,approved_by) VALUES($1,$2,$3,$3)",[fa,cb.id,a.memberId])).rejects.toMatchObject({code:'23503'});
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"UPDATE app.children SET nickname='stolen'");})).rejects.toBeDefined();
 });
 it('revokes only the affected grant immediately and retains siblings, chat and device access',async()=>{
  const a=await parent('a@example.test'),b=await parent('b@example.test');const fid=await create(a);await join(a,b,fid);const c=await register(a,fid),sibling=await register(a,fid);
  await query(database.db,'UPDATE app.rooms SET last_seq=9 WHERE child_id=$1',[c.id]);
  await grant(a,c.id,b,{daily:true,chat:true});await grant(a,sibling.id,b,{daily:true});
  expect(Number((await query<{starts_seq:string}>(database.db,'SELECT starts_seq FROM app.child_grants WHERE child_id=$1 AND member_id=$2',[c.id,b.memberId]))[0].starts_seq)).toBe(10);
  await grant(a,c.id,b,{chat:true},1);
  await database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT set_config('iharu.member_id',$1,true),set_config('iharu.session_id',$2,true)",[b.memberId,b.sessionId]);const [r]=await query<{daily:boolean;chat:boolean;sibling:boolean}>(tx,"SELECT app_private.child_allowed($1,'daily') AS daily,app_private.child_allowed($1,'chat') AS chat,app_private.child_allowed($2,'daily') AS sibling",[c.id,sibling.id]);expect(r).toEqual({daily:false,chat:true,sibling:true});});
  expect((await query(database.db,"SELECT * FROM app_private.outbox WHERE kind='INDEPENDENT_JOURNAL'")).length).toBeGreaterThan(0);
 });
 it('requires the starting device proof and returns the same cookie on response-loss retry',async()=>{
  const a=await parent('a@example.test');const fid=await create(a),ch=await register(a,fid);const {device,p,exchangeKey}=await pair(a,ch.id);const attacker=new Browser();
  expect((await attacker.req(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey})).status).toBe(403);
  expect((await attacker.req(`/api/v1/device-pairings/${p.id}/status`,{})).status).toBe(403);
  await device.ok(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey});const cookie=device.cookies.get('iharu-child');
  await device.ok(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey});expect(device.cookies.get('iharu-child')).toBe(cookie);
  expect((await query(database.db,'SELECT id FROM app.child_devices')).length).toBe(1);
  expect(JSON.stringify(await query(database.db,'SELECT * FROM app_private.device_pairings'))).not.toContain(cookie);
  const session=await device.ok('/api/v1/child-session');expect(session).toMatchObject({childId:ch.id,nickname:'가상 아이'});
  expect((await device.req(`/api/v1/children/${ch.id}/grants`)).status).toBe(401);
  const other=await parent('other-parent@example.test');await join(a,other,fid);other.cookies.set('iharu-child',cookie!);
  expect((await other.ok(`/api/v1/families/${fid}/children`)).children).toEqual([]);
  expect((await a.req('/api/v1/device-pairings',{label:'signed-in-adult'})).status).toBe(403);
  await a.ok(`/api/v1/children/${ch.id}/devices/${session.id}`,{},'DELETE');expect((await device.req('/api/v1/child-session')).status).toBe(401);
  expect((await device.req(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey})).status).toBe(400);
 });
 it('enforces expiry, changed exchange key, new-code invalidation, and maximum two active devices',async()=>{
  const a=await parent('a@example.test');const fid=await create(a),ch=await register(a,fid);const first=await pair(a,ch.id);
  await first.device.ok(`/api/v1/device-pairings/${first.p.id}/exchange`,{exchangeKey:first.exchangeKey});
  expect((await first.device.req(`/api/v1/device-pairings/${first.p.id}/exchange`,{exchangeKey:randomUUID()})).status).toBe(400);
  const second=await pair(a,ch.id);await second.device.ok(`/api/v1/device-pairings/${second.p.id}/exchange`,{exchangeKey:second.exchangeKey});
  const extra=new Browser(),p=await extra.ok('/api/v1/device-pairings',{label:'세 번째'});expect((await a.req(`/api/v1/device-pairings/${p.id}/approve`,{childId:ch.id,expectedVersion:1})).status).toBe(400);
  await extra.ok('/api/v1/device-pairings',{label:'새 번호'});expect((await extra.req(`/api/v1/device-pairings/${p.id}/status`,{})).status).toBe(400);
  await query(database.db,"UPDATE app_private.device_pairings SET retry_until=now()-interval '1 second' WHERE id=$1",[first.p.id]);expect((await first.device.req(`/api/v1/device-pairings/${first.p.id}/exchange`,{exchangeKey:first.exchangeKey})).status).toBe(400);
 });
 it('location withdrawal retains general access; general withdrawal disables child session and queues deletion+independent journal',async()=>{
  const a=await parent('a@example.test');const fid=await create(a),ch=await register(a,fid,true);const {device,p,exchangeKey}=await pair(a,ch.id);await device.ok(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey});
  await a.ok(`/api/v1/children/${ch.id}/consents/revoke`,{purpose:'location',expectedVersion:1});expect((await device.ok('/api/v1/child-session')).locationAllowed).toBe(false);
  expect((await a.ok(`/api/v1/families/${fid}/children`)).children).toHaveLength(1);
  await a.ok(`/api/v1/children/${ch.id}/consents/revoke`,{purpose:'general',expectedVersion:2});expect((await device.req('/api/v1/child-session')).status).toBe(401);expect((await a.ok(`/api/v1/families/${fid}/children`)).children).toEqual([]);
  expect((await query(database.db,'SELECT state FROM app_private.deletion_requests'))[0]).toEqual({state:'REVOKED'});expect((await query(database.db,"SELECT * FROM app_private.outbox WHERE kind='DELETE_CHILD'")).length).toBe(1);
 });
 it('limits adults and children under family locks, rejects writes without read, and rejects untrusted origin',async()=>{
  const a=await parent('a@example.test');const fid=await create(a);for(let i=0;i<5;i++)await register(a,fid,false,`가상${i}`);
  expect((await a.req(`/api/v1/families/${fid}/child-registration-drafts`,{})).status).toBe(400);
  expect((await a.req('/api/v1/families',{name:'CSRF'},'POST',{Origin:'https://evil.example'})).status).toBe(403);
  const b=await parent('b@example.test');await join(a,b,fid);const ch=(await a.ok(`/api/v1/families/${fid}/children`)).children[0];
  expect((await a.req(`/api/v1/children/${ch.id}/grants/${b.memberId}`,{daily:false,chat:false,location:false,tuitionRead:false,tuitionWrite:true,expectedVersion:0},'PUT')).status).toBe(400);
  for(let i=0;i<3;i++){const p=await parent(`extra${i}@example.test`);await join(a,p,fid);}
  expect((await a.req(`/api/v1/families/${fid}/invites`,{})).status).toBe(400);
 });
 it('rechecks session assurance and ready state in SQL independently of HTTP',async()=>{
  const a=await parent('a@example.test');const fid=await create(a);await register(a,fid);
  await query(database.db,"UPDATE iharu_auth.session_guard SET assurance='LOW' WHERE session_id=$1",[a.sessionId]);
  await expect(family.command(a.actor(),'me')).rejects.toMatchObject({message:'ACCESS_NOT_READY'});expect((await a.req('/api/v1/me')).status).toBe(403);
 });
});

describe('F03 guardian verification',()=>{
 const endpoint='/api/v1/guardian-verification';
 async function apply(b:Browser,label='첫째',requestKey=randomUUID()){
  return b.ok(`${endpoint}/submit`,{targetLabel:label,relationship:'PARENT',requestKey});
 }
 async function reviewer(email:string){const b=await parent(email,false);await query(database.db,'INSERT INTO app_private.guardian_reviewers(member_id) VALUES($1)',[b.memberId]);return b;}
 async function list(b:Browser){return (await b.ok(`${endpoint}/list`)).applications;}
 async function start(b:Browser,id:string){return b.ok(`${endpoint}/review`,{id,expectedVersion:1,state:'REVIEWING'});}
 it('accepts before family access readiness, persists once on retry, isolates applicants and blocks forged reviewer claims',async()=>{
  const a=await parent('f03-a@example.test',false),b=await parent('f03-b@example.test',false),key=randomUUID();
  const first=await apply(a,'첫째',key);expect((await apply(a,'첫째',key)).id).toBe(first.id);
  expect(await list(a)).toHaveLength(1);expect(await list(b)).toEqual([]);
  expect((await a.req(`${endpoint}/queue`)).status).toBe(403);
  expect((await a.req(`${endpoint}/submit`,{targetLabel:'둘째',relationship:'PARENT',requestKey:randomUUID(),state:'APPROVED'})).status).toBe(400);
  expect((await a.req(`${endpoint}/review`,{id:first.id,state:'REVIEWING',expectedVersion:1})).status).toBe(403);
  expect((await a.req('/api/v1/me')).status).toBe(403);
  expect((await a.ok(`${endpoint}/list`)).reviewAvailable).toBe(false);
 });
 it('requires actual target-bound evidence, rejects self approval and stale transitions, keeps family access closed',async()=>{
  const a=await parent('f03-owner@example.test',false),r=await reviewer('f03-reviewer@example.test');const own=await apply(r);
  expect((await r.req(`${endpoint}/review`,{id:own.id,state:'REVIEWING',expectedVersion:1})).status).toBe(403);
  const application=await apply(a);await start(r,application.id);const item=(await list(a))[0];
  const approval={id:item.id,expectedVersion:2,state:'APPROVED',targetId:item.targetId,evidenceRef:'test-case-0001',subjectRef:'test-subject-0001',evidenceChecked:true};
  expect((await r.req(`${endpoint}/review`,{...approval,targetId:randomUUID()})).status).toBe(400);
  expect((await r.req(`${endpoint}/review`,{...approval,evidenceChecked:false})).status).toBe(400);
  await r.ok(`${endpoint}/review`,approval);
  expect((await list(a))[0].state).toBe('APPROVED');
  expect((await r.req(`${endpoint}/review`,approval)).status).toBe(409);
  expect((await a.req('/api/v1/me')).status).toBe(403);
  expect((await query(database.db,'SELECT id FROM app.children')).length).toBe(0);
  expect(await query(database.db,'SELECT state FROM app_private.guardian_application_events WHERE application_id=$1 ORDER BY created_at',[item.id])).toEqual([{state:'RECEIVED'},{state:'REVIEWING'},{state:'APPROVED'}]);
  expect(JSON.stringify(await list(a))).not.toContain('test-case');
 });
 it('delivers rejection reason and permits a fresh application after rejection or expiration',async()=>{
  const a=await parent('f03-rejected@example.test',false),r=await reviewer('f03-reject-reviewer@example.test');const first=await apply(a);await start(r,first.id);
  await r.ok(`${endpoint}/review`,{id:first.id,expectedVersion:2,state:'REJECTED',reason:'신청 대상과 증빙 대상이 일치하지 않습니다.'});
  expect((await list(a))[0]).toMatchObject({state:'REJECTED',reason:'신청 대상과 증빙 대상이 일치하지 않습니다.'});
  const next=await apply(a);await query(database.db,"UPDATE app_private.guardian_applications SET expires_at=now()-interval '1 second' WHERE id=$1",[next.id]);
  expect((await list(a)).find((i:{id:string})=>i.id===next.id).state).toBe('EXPIRED');
  const replacement=await apply(a);expect(replacement.id).not.toBe(next.id);
 });
 it('prevents evidence replay, other reviewers overwriting a claim, and revoked reviewer decisions',async()=>{
  const a=await parent('f03-replay@example.test',false),r=await reviewer('f03-r1@example.test'),other=await reviewer('f03-r2@example.test');
  const first=await apply(a,'첫째'),second=await apply(a,'둘째');await start(r,first.id);
  expect((await other.req(`${endpoint}/review`,{id:first.id,expectedVersion:2,state:'REJECTED',reason:'권한 없이 처리 시도'})).status).toBe(403);
  await start(r,second.id);const items=await list(a);
  const approve=(id:string)=>({id,expectedVersion:2,state:'APPROVED',targetId:items.find((i:{id:string})=>i.id===id).targetId,evidenceRef:'test-once-0001',subjectRef:'test-subject-0001',evidenceChecked:true});
  await r.ok(`${endpoint}/review`,approve(first.id));expect((await r.req(`${endpoint}/review`,approve(second.id))).status).toBe(409);
  await query(database.db,'UPDATE app_private.guardian_reviewers SET enabled=false WHERE member_id=$1',[r.memberId]);
  expect((await r.req(`${endpoint}/review`,{id:second.id,expectedVersion:2,state:'REJECTED',reason:'권한 해제 후 처리 시도'})).status).toBe(403);
 });
 it('checks SQL session assurance, recent authentication, role ACLs and HTTP origin independently',async()=>{
  const a=await parent('f03-security@example.test',false);
  expect((await a.req(`${endpoint}/submit`,{targetLabel:'첫째',relationship:'PARENT',requestKey:randomUUID()},'POST',{Origin:'https://evil.example'})).status).toBe(403);
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'SELECT * FROM app_private.guardian_applications');})).rejects.toMatchObject({code:'42501'});
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'INSERT INTO app_private.guardian_reviewers(member_id) VALUES($1)',[a.memberId]);})).rejects.toMatchObject({code:'42501'});
  await query(database.db,"UPDATE iharu_auth.session_guard SET reauthenticated_at=now()-interval '6 minutes' WHERE session_id=$1",[a.sessionId]);
  await expect(family.command(a.actor(),'guardian.submit',{targetLabel:'첫째',relationship:'PARENT',requestKey:randomUUID()})).rejects.toMatchObject({message:'REAUTH_REQUIRED'});
  expect((await a.req(`${endpoint}/submit`,{targetLabel:'첫째',relationship:'PARENT',requestKey:randomUUID()})).status).toBe(403);
  await query(database.db,"UPDATE iharu_auth.session_guard SET assurance='LOW' WHERE session_id=$1",[a.sessionId]);
  await expect(family.command(a.actor(),'guardian.list')).rejects.toMatchObject({message:'ACCESS_NOT_READY'});
 });
});

describe('P07-F04 approved family onboarding',()=>{
 const base='/api/v1/guardian-verification';
 async function approval(applicant:Browser,reviewer:Browser,label='첫째'){
  const application=await applicant.ok(`${base}/submit`,{targetLabel:label,relationship:'PARENT',requestKey:randomUUID()});
  await reviewer.ok(`${base}/review`,{id:application.id,expectedVersion:1,state:'REVIEWING'});
  const item=(await applicant.ok(`${base}/list`)).applications.find((a:{id:string})=>a.id===application.id);
  await reviewer.ok(`${base}/review`,{id:item.id,expectedVersion:2,state:'APPROVED',targetId:item.targetId,evidenceRef:`fixture-${randomUUID()}`,subjectRef:`fixture-${randomUUID()}`,evidenceChecked:true});
  return {...item,version:3};
 }
 async function staff(){const b=await parent('f04-staff@example.test',false);await query(database.db,'INSERT INTO app_private.guardian_reviewers(member_id) VALUES($1)',[b.memberId]);return b;}
 async function bindDate(r:Browser,item:{id:string;targetId:string;version:number}){return r.ok(`${base}/birth-date`,{id:item.id,targetId:item.targetId,expectedVersion:item.version,birthDate:'2018-03-02',evidenceChecked:true});}
 it('keeps registration closed at SQL and HTTP boundaries until OPS02; family creation still follows a genuine approval',async()=>{
  const a=await parent('f04-gated@example.test',false),r=await staff();const item=await approval(a,r);
  await query(database.db,'UPDATE app_private.family_release SET child_deletion_verified_at=NULL,verification_reference=NULL');
  expect(await a.ok('/api/v1/setup')).toMatchObject({canCreateFamily:true,realChildRegistrationEnabled:false,registrationBlocker:'DELETION_NOT_READY'});
  const fid=await create(a);const draft=await a.ok(`/api/v1/families/${fid}/child-registration-drafts`,{});
  const response=await r.req(`${base}/birth-date`,{id:item.id,targetId:item.targetId,expectedVersion:3,birthDate:'2018-03-02',evidenceChecked:true});expect((await response.json()).error.code).toBe('REGISTRATION_NOT_READY');
  const blocked=await a.req(`/api/v1/child-registration-drafts/${draft.id}/approval`,{applicationId:item.id,targetId:item.targetId});expect((await blocked.json()).error.code).toBe('REGISTRATION_NOT_READY');
  await expect(family.command(a.actor(),'consent.proof',{draftId:draft.id,general:true,location:false,policyVersion:'6.1'})).rejects.toMatchObject({message:'REGISTRATION_NOT_READY'});
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'UPDATE app_private.family_release SET child_deletion_verified_at=now()');})).rejects.toMatchObject({code:'42501'});
  expect(await query(database.db,'SELECT id FROM app.children')).toEqual([]);
 });
 it('connects only the approved applicant and target, persists the draft across reloads, and consumes the result once',async()=>{
  const a=await parent('f04-complete@example.test',false),other=await parent('f04-other@example.test'),r=await staff(),item=await approval(a,r);
  await bindDate(r,item);const fid=await create(a),foreign=await create(other),draft=await a.ok(`/api/v1/families/${fid}/child-registration-drafts`,{}),otherDraft=await other.ok(`/api/v1/families/${foreign}/child-registration-drafts`,{});
  expect((await other.req(`/api/v1/child-registration-drafts/${otherDraft.id}/approval`,{applicationId:item.id,targetId:item.targetId})).status).toBe(400);
  expect((await a.req(`/api/v1/child-registration-drafts/${draft.id}/approval`,{applicationId:item.id,targetId:randomUUID()})).status).toBe(400);
  await a.ok(`/api/v1/child-registration-drafts/${draft.id}/approval`,{applicationId:item.id,targetId:item.targetId});
  expect(await a.ok(`/api/v1/child-registration-drafts/${draft.id}`)).toMatchObject({state:'VERIFIED',birthDate:'2018-03-02'});
  expect((await a.ok(`/api/v1/families/${fid}/child-registration-drafts`,{})).id).toBe(draft.id);
  const proof=await a.ok(`/api/v1/child-registration-drafts/${draft.id}/consent-proofs`,{general:true,location:false,policyVersion:'6.1'});
  const input={draftId:draft.id,proofId:proof.proofId,nickname:'가상 아이',birthDate:'2018-03-02'};
  expect((await a.req(`/api/v1/families/${fid}/children`,{...input,birthDate:'2019-03-02'})).status).toBe(400);
  const child=await a.ok(`/api/v1/families/${fid}/children`,input);
  expect((await a.req(`/api/v1/families/${fid}/children`,input)).status).toBe(400);
  expect((await a.ok(`${base}/list`)).applications[0].consumed).toBe(true);
  const next=await a.ok(`/api/v1/families/${fid}/child-registration-drafts`,{});
  expect((await a.req(`/api/v1/child-registration-drafts/${next.id}/approval`,{applicationId:item.id,targetId:item.targetId})).status).toBe(400);
  expect(await query(database.db,'SELECT id FROM app.children')).toEqual([{id:child.id}]);
 });
 it('does not let an approval bound in one family be transferred into another draft',async()=>{
  const a=await parent('f04-bound@example.test',false),r=await staff(),item=await approval(a,r);await bindDate(r,item);
  const first=await create(a),second=await create(a,'다른 가상 가족'),d1=await a.ok(`/api/v1/families/${first}/child-registration-drafts`,{}),d2=await a.ok(`/api/v1/families/${second}/child-registration-drafts`,{});
  await a.ok(`/api/v1/child-registration-drafts/${d1.id}/approval`,{applicationId:item.id,targetId:item.targetId});
  const denied=await a.req(`/api/v1/child-registration-drafts/${d2.id}/approval`,{applicationId:item.id,targetId:item.targetId});expect((await denied.json()).error.code).toBe('VERIFICATION_REUSED');
  await query(database.db,"UPDATE app_private.guardian_applications SET expires_at=now()-interval '1 second' WHERE id=$1",[item.id]);
  expect((await a.req(`/api/v1/child-registration-drafts/${d1.id}/consent-proofs`,{general:true,location:false,policyVersion:'6.1'})).status).toBe(400);
 });
 it('lets verified invitees request membership; pending and active membership reveal no child until an explicit grant',async()=>{
  const owner=await parent('f04-owner@example.test'),guest=await parent('f04-guest@example.test',false);const fid=await create(owner),ch=await register(owner,fid),sibling=await register(owner,fid,false,'가상 동생');
  const invalid=await guest.req('/api/v1/invites/accept',{token:'x'.repeat(43)});expect(invalid.status).toBe(400);expect((await guest.ok('/api/v1/setup')).accountReady).toBe(false);
  const invitation=await owner.ok(`/api/v1/families/${fid}/invites`,{}),pending=await guest.ok('/api/v1/invites/accept',{token:new URL(invitation.inviteUrl).hash.slice(1)});
  expect(await guest.ok('/api/v1/me')).toMatchObject({families:[],pending:[{id:fid,name:'가상 가족'}]});
  expect((await guest.req(`/api/v1/families/${fid}/children`)).status).toBe(404);
  await owner.ok(`/api/v1/memberships/${pending.membershipId}/approve`,{expectedVersion:1});
  expect((await guest.ok(`/api/v1/families/${fid}/children`)).children).toEqual([]);
  await grant(owner,ch.id,guest,{daily:true});const visible=await guest.ok(`/api/v1/families/${fid}/children`);expect(visible.children).toHaveLength(1);expect(JSON.stringify(visible)).not.toContain(sibling.id);
  await grant(owner,ch.id,guest,{},1);expect((await guest.ok(`/api/v1/families/${fid}/children`)).children).toEqual([]);
 });
 it('requires the assigned reviewer, current target, current version and OPS02 for birth-date confirmation',async()=>{
  const a=await parent('f04-date@example.test',false),r=await staff(),item=await approval(a,r);
  const payload={id:item.id,targetId:item.targetId,expectedVersion:3,birthDate:'2018-03-02',evidenceChecked:true};
  expect((await a.req(`${base}/birth-date`,payload)).status).toBe(403);
  expect((await r.req(`${base}/birth-date`,{...payload,targetId:randomUUID()})).status).toBe(400);
  expect((await r.req(`${base}/birth-date`,{...payload,birthDate:'2999-01-01'})).status).toBe(400);
  await r.ok(`${base}/birth-date`,payload);expect((await r.req(`${base}/birth-date`,payload)).status).toBe(409);
  const json=JSON.stringify(await a.ok(`${base}/list`));expect(json).not.toContain('2018-03-02');expect(json).toContain('birthDateVerified');
 });
});

describe('P07-F05 proof-bound device and chat flow',()=>{
 it('shows the approved child only to the starting browser and refuses a different target or reassignment',async()=>{
  const owner=await parent('f05-owner@example.test'),other=await parent('f05-other@example.test');const fid=await create(owner),first=await register(owner,fid,false,'첫째'),second=await register(owner,fid,false,'둘째');const device=new Browser();
  const p=await device.ok('/api/v1/device-pairings',{label:'가상 아이 기기'});
  expect(await device.ok(`/api/v1/device-pairings/${p.id}/status`,{})).not.toHaveProperty('child');
  expect((await other.req(`/api/v1/device-pairings/${p.id}/approve`,{childId:first.id,expectedVersion:1})).status).toBe(404);
  await owner.ok(`/api/v1/device-pairings/${p.id}/approve`,{childId:first.id,expectedVersion:1});
  await owner.ok(`/api/v1/device-pairings/${p.id}/approve`,{childId:first.id,expectedVersion:1});
  expect((await owner.req(`/api/v1/device-pairings/${p.id}/approve`,{childId:second.id,expectedVersion:1})).status).toBe(400);
  expect(await device.ok(`/api/v1/device-pairings/${p.id}/status`,{})).toMatchObject({status:'APPROVED',child:{id:first.id,nickname:'첫째',familyName:'가상 가족'}});
  const key=randomUUID();const wrong=await device.req(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey:key,childId:second.id});expect((await wrong.json()).error.code).toBe('PAIRING_TARGET_CHANGED');
  expect(await query(database.db,'SELECT id FROM app.child_devices')).toHaveLength(0);
  await device.ok(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey:key,childId:first.id});
  expect((await device.ok('/api/v1/child-session')).childId).toBe(first.id);
 });
 it('invalidates an approved old code on renewal and lets only the originating proof cancel',async()=>{
  const owner=await parent('f05-renew@example.test'),fid=await create(owner),child=await register(owner,fid);const {p,device,exchangeKey}=await pair(owner,child.id);
  const old=new Browser();old.cookies=new Map(device.cookies);const renewed=await device.ok('/api/v1/device-pairings',{label:'다시 받은 번호'});
  expect((await old.req(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey})).status).toBe(400);
  expect((await owner.req('/api/v1/device-pairings/resolve',{code:p.code})).status).toBe(400);
  const attacker=new Browser();expect((await attacker.req(`/api/v1/device-pairings/${renewed.id}/cancel`,{})).status).toBe(403);
  await device.ok(`/api/v1/device-pairings/${renewed.id}/cancel`,{});
  expect(device.cookies.has('iharu-pair')).toBe(false);
  expect((await owner.req(`/api/v1/device-pairings/${renewed.id}/approve`,{childId:child.id,expectedVersion:1})).status).toBe(400);
 });
 it('keeps the two-minute exchange retry available at code expiry but never replaces a connected device silently',async()=>{
  const owner=await parent('f05-retry@example.test'),fid=await create(owner),child=await register(owner,fid);const {p,device,exchangeKey}=await pair(owner,child.id);
  await device.ok(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey});const cookie=device.cookies.get('iharu-child');
  await query(database.db,"UPDATE app_private.device_pairings SET expires_at=now()-interval '1 second' WHERE id=$1",[p.id]);
  expect((await device.ok(`/api/v1/device-pairings/${p.id}/status`,{})).status).toBe('EXCHANGED');
  await device.ok(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey});expect(device.cookies.get('iharu-child')).toBe(cookie);
  expect((await(await device.req('/api/v1/device-pairings',{label:'덮어쓰기'})).json()).error.code).toBe('DEVICE_ALREADY_CONNECTED');
  await device.ok('/api/v1/child-session/logout',{});
  expect((await device.req(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey})).status).toBe(400);
  expect((await device.req('/api/v1/child-session')).status).toBe(401);
 });
 it('uses only the child principal on child chat, even when guardian cookies are also present, and clears access after revoke',async()=>{
  const owner=await parent('f05-chat@example.test'),fid=await create(owner),first=await register(owner,fid,false,'첫째'),second=await register(owner,fid,false,'둘째');const h={'X-Iharu-Actor':'child'};
  expect((await owner.req('/api/v1/chat-rooms',undefined,'GET',h)).status).toBe(401);
  const {p,device,exchangeKey}=await pair(owner,first.id);await device.ok(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey});const session=await device.ok('/api/v1/child-session');
  for(const [k,v] of owner.cookies)device.cookies.set(k,v);
  const rooms=await(await device.req('/api/v1/chat-rooms',undefined,'GET',h)).json();expect(rooms.data.map((r:{childId:string})=>r.childId)).toEqual([first.id]);
  expect((await device.req(`/api/v1/children/${second.id}/messages`,undefined,'GET',h)).status).toBe(404);
  const body={kind:'STICKER',catalogId:'arrived',catalogVersion:2,clientMessageId:randomUUID()};
  expect((await device.req(`/api/v1/children/${second.id}/messages`,body,'POST',{...h,'Idempotency-Key':randomUUID()})).status).toBe(404);
  await owner.ok(`/api/v1/children/${first.id}/devices/${session.id}`,{},'DELETE');
  expect((await device.req('/api/v1/chat-rooms',undefined,'GET',h)).status).toBe(401);
  expect((await device.req(`/api/v1/children/${first.id}/messages`,body,'POST',{...h,'Idempotency-Key':randomUUID()})).status).toBe(401);
 });
 it('expires unexchanged approvals and rejects code guessing beyond the lookup limit',async()=>{
  const owner=await parent('f05-expiry@example.test'),fid=await create(owner),child=await register(owner,fid);const {p,device,exchangeKey}=await pair(owner,child.id);
  await query(database.db,"UPDATE app_private.device_pairings SET expires_at=now()-interval '1 second' WHERE id=$1",[p.id]);
  expect((await device.ok(`/api/v1/device-pairings/${p.id}/status`,{})).status).toBe('EXPIRED');
  expect((await device.req(`/api/v1/device-pairings/${p.id}/exchange`,{exchangeKey})).status).toBe(400);
  for(let n=0;n<4;n++)expect((await owner.req('/api/v1/device-pairings/resolve',{code:'000000'})).status).toBe(400);
  expect((await owner.req('/api/v1/device-pairings/resolve',{code:p.code})).status).toBe(429);
 });
});

