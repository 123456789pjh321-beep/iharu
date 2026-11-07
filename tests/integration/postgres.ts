import {childPasswordHash} from '../../server/child-accounts/routes.js';
// CI-only disposable PostgreSQL. Never run against a Supabase/Preview/production database.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {Kysely,PostgresDialect} from 'kysely';
import {openAuthDatabase,query,type AuthDatabase} from '../../server/auth/database.js';
import {createAuthService} from '../../server/auth/service.js';
import {createApp} from '../../server/app.js';
import {MessageService} from '../../server/messages/service.js';
import {DailyService} from '../../server/daily/service.js';
import {ScheduleService} from '../../server/schedules/service.js';
import {addDays,koreaToday,type CalendarData,type ChangePreview} from '../../shared/schedules.js';
import {FamilyService,type FamilyActor} from '../../server/family/service.js';
import {assertWorkerDatabaseRole} from '../../server/schedules/worker.js';
import {assertFamilyDatabaseRole} from '../../server/family/database.js';

const raw=process.env.IHARU_CI_DATABASE_URL;
if(!raw||process.env.CI!=='true')throw new Error('CI_DATABASE_REQUIRED');
const url=new URL(raw);
if(url.hostname!=='127.0.0.1'||url.pathname!=='/iharu_ci'||url.protocol!=='postgresql:')throw new Error('DISPOSABLE_LOCAL_DATABASE_REQUIRED');
const admin=new Pool({connectionString:raw,max:1,statement_timeout:15000});
const connections:AuthDatabase[]=[];
let passed=0;
async function check(name:string,fn:()=>Promise<void>){await fn();passed++;console.log(`PASS ${name}`);}
function runtimeURL(role:string,password:string){const u=new URL(raw!);u.username=role;u.password=password;return u.toString();}
function openApp(url:string){const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:5000,statement_timeout:10000});const db=new Kysely<Record<string,never>>({dialect:new PostgresDialect({pool})});connections.push(db);return db;}
try{
 const existing=await admin.query("SELECT 1 FROM pg_namespace WHERE nspname IN ('app','iharu_auth')");assert.equal(existing.rowCount,0,'Disposable database must be empty; existing schemas are never deleted.');
 const authPassword=randomBytes(24).toString('hex'),appPassword=randomBytes(24).toString('hex');
 await admin.query(`CREATE ROLE auth_runtime LOGIN PASSWORD '${authPassword}' NOSUPERUSER NOBYPASSRLS`);
 // Runtime roles exist before the role-aware migrations; no test connection is a schema owner.
 await admin.query(`CREATE ROLE app_runtime LOGIN PASSWORD '${appPassword}' NOSUPERUSER NOBYPASSRLS`);
 // Match managed Postgres: the DDL caller is not a superuser and only has SET
 // membership in the NOLOGIN function owner. An ACL REVOKE after OWNER changes
 // otherwise emits a warning and can leave PUBLIC execute grants in place.
 await admin.query('CREATE ROLE migration_admin NOLOGIN NOSUPERUSER NOBYPASSRLS CREATEROLE');
 await admin.query('GRANT CREATE ON DATABASE iharu_ci TO migration_admin');
 await admin.query('CREATE ROLE iharu_policy NOLOGIN NOSUPERUSER NOBYPASSRLS');
 await admin.query('GRANT iharu_policy TO migration_admin WITH INHERIT FALSE, SET TRUE');
 const migration=await admin.connect();
 try{
  await migration.query('BEGIN');await migration.query('SET LOCAL ROLE migration_admin');
  await migration.query(await readFile('tests/helpers/realtime-provider.sql','utf8'));
  for(const name of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort()){await migration.query('SET LOCAL ROLE migration_admin');await migration.query(await readFile(`db/migrations/${name}`,'utf8'));}
  await migration.query('COMMIT');
 }catch(e){await migration.query('ROLLBACK');throw e;}finally{migration.release();}
 await admin.query("UPDATE app_private.family_release SET child_deletion_verified_at=now(),verification_reference='disposable-postgres-fixture'");
 const authdb=openAuthDatabase(runtimeURL('auth_runtime',authPassword));connections.push(authdb);
 const db1=openApp(runtimeURL('app_runtime',appPassword)),db2=openApp(runtimeURL('app_runtime',appPassword));
 const secret=randomBytes(32).toString('hex'),family1=new FamilyService(db1,secret),family2=new FamilyService(db2,secret),origin='http://localhost:4173';
 const svc=createAuthService({origin,secret,databaseUrl:'test-only',mail:{key:'test-only',from:'test@example.test'},sms:null,social:{}},authdb,{sendMail:async()=>{},sendSms:async()=>{}});
 const app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>family1);
 await check('runtime role guard accepts the isolated app role without auth schema access',async()=>{
  await assertFamilyDatabaseRole(db1);
  await assert.rejects(query(db1,'SELECT id FROM iharu_auth.members LIMIT 1'),{code:'42501'});
  await assert.rejects(assertFamilyDatabaseRole(authdb));
 });
 await check('non-superuser migrations restrict verification and maintenance to their intended roles',async()=>{
  const [acl]=await query<{verify:boolean;maintain:boolean;command:boolean}>(db1,`SELECT has_function_privilege(current_user,'app_private.record_relationship_result(uuid,text,text,date,text,boolean)','EXECUTE') AS verify,has_function_privilege(current_user,'app_private.expire_family_secrets()','EXECUTE') AS maintain,has_function_privilege(current_user,'app_private.family_command(text,jsonb)','EXECUTE') AS command`);
  assert.deepEqual(acl,{verify:false,maintain:false,command:true});
  await assert.rejects(query(db1,'SELECT app_private.record_relationship_result($1,$2,$3,$4,$5,$6)',[randomUUID(),'ci-denied','ci-denied','2018-03-02','ci-denied',true]),{code:'42501'});
  await assert.rejects(query(db1,'SELECT app_private.expire_family_secrets()'),{code:'42501'});
 });
 const workerPassword=randomBytes(24).toString('hex');
 await admin.query(`CREATE ROLE worker_ci LOGIN PASSWORD '${workerPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB`);
 await admin.query('GRANT worker_runtime TO worker_ci');
 const worker1=openApp(runtimeURL('worker_ci',workerPassword)),worker2=openApp(runtimeURL('worker_ci',workerPassword));
 await check('P07-F07 concurrent worker claims serialize and only the current lease can finish',async()=>{
  await assertWorkerDatabaseRole(worker1);
  await assert.rejects(assertWorkerDatabaseRole(db1));
  const claims=await Promise.all([worker1,worker2].map(db=>query<{data:{state:string;token?:string}}>(db,"SELECT app_private.cron_claim('manual') data")));
  const winners=claims.flat().filter(r=>r.data.state==='CLAIMED');assert.equal(winners.length,1);
  const token=winners[0].data.token;
  await assert.rejects(query(db1,"SELECT app_private.cron_claim('manual')"),{code:'42501'});
  await assert.rejects(query(authdb,"SELECT app_private.cron_claim('manual')"),{code:'42501'});
  await assert.rejects(query(worker1,'SELECT * FROM app_private.cron_runs'),{code:'42501'});
  await query(worker1,"SELECT app_private.cron_step($1,'reserve')",[token]);
  await query(worker1,"SELECT app_private.cron_step($1,'retention')",[token]);
  await admin.query("UPDATE app_private.cron_runs SET lease_until=now()-interval '1 second'");
  const [replacement]=await query<{data:{token:string}}>(worker2,"SELECT app_private.cron_claim('manual') data");
  assert.notEqual(replacement.data.token,token);
  assert.equal((await query<{saved:boolean}>(worker1,"SELECT app_private.cron_finish($1,'{}',NULL) saved",[token]))[0].saved,false);
  await assert.rejects(query(worker1,"SELECT app_private.cron_step($1,'notify')",[token]),/STALE_LEASE/);
  assert.equal((await query<{saved:boolean}>(worker2,"SELECT app_private.cron_finish($1,'{}',NULL) saved",[replacement.data.token]))[0].saved,true);
  assert.equal((await admin.query('SELECT attempts FROM app_private.cron_runs ORDER BY slot DESC LIMIT 1')).rows[0].attempts,2);
 });
 await check('parallel Better Auth signup uses a real two-connection auth pool',async()=>{
  const requests=['one','two'].map(name=>app.request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'가상 보호자',email:`${name}@example.test`,password:'integration-fixture-password-2026',callbackURL:'/login?verified=1'})}));
  const results=await Promise.all(requests);for(const r of results)assert.equal(r.status,200,await r.text());
  assert.equal((await admin.query('SELECT id FROM iharu_auth.members')).rowCount,2);
 });
 const actors:FamilyActor[]=[];
 for(const name of ['one','two']){
  await admin.query('UPDATE iharu_auth."user" SET "emailVerified"=true WHERE email=$1',[`${name}@example.test`]);
  const r=await app.request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:`${name}@example.test`,password:'integration-fixture-password-2026'})});assert.equal(r.status,200);
  const row=(await admin.query('SELECT m.id,s.id AS session FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id JOIN iharu_auth.session s ON s."userId"=u.id WHERE u.email=$1',[`${name}@example.test`])).rows[0];
  await admin.query('UPDATE iharu_auth.members SET access_ready=true WHERE id=$1',[row.id]);actors.push({memberId:row.id,sessionId:row.session,requestId:randomUUID()});
 }
 const [a,b]=actors;
 const fid=(await family1.command<{id:string}>(a,'family.create',{name:'가상 A'})).id;
 const fidB=(await family2.command<{id:string}>(b,'family.create',{name:'가상 B'})).id;
 async function proof(actor:FamilyActor,familyId:string){
  const draft=await family1.command<{id:string}>(actor,'draft.create',{familyId});
  await admin.query("SELECT app_private.record_relationship_result($1,$2,$3,'2018-03-02','virtual-ci',true)",[draft.id,randomUUID(),randomUUID()]);
  const p=await family1.command<{proofId:string}>(actor,'consent.proof',{draftId:draft.id,policyVersion:'6.1',general:true,location:false});
  return {familyId,draftId:draft.id,proofId:p.proofId,nickname:'가상 아이',birthDate:'2018-03-02'};
 }
 const enroll=await proof(a,fid);let childId='';
 await check('same proof activates exactly one child under concurrent transactions',async()=>{
  const attempts=await Promise.allSettled([family1.command<{id:string}>(a,'child.activate',enroll),family2.command<{id:string}>(a,'child.activate',enroll)]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);const success=attempts.find(r=>r.status==='fulfilled');assert(success?.status==='fulfilled');childId=success.value.id;
  assert.equal((await admin.query('SELECT id FROM app.children WHERE family_id=$1',[fid])).rowCount,1);assert.equal((await admin.query('SELECT id FROM app.rooms WHERE child_id=$1',[childId])).rowCount,1);
 });
 await check('RLS isolates families and clears transaction-local identity on a reused connection',async()=>{
  await family2.command(b,'child.activate',await proof(b,fidB));
  for(const [actor,count] of [[a,1],[b,1]] as const){await db1.transaction().execute(async tx=>{await query(tx,"SELECT set_config('iharu.member_id',$1,true),set_config('iharu.session_id',$2,true)",[actor.memberId,actor.sessionId]);const rows=await query<{family_id:string}>(tx,'SELECT family_id FROM app.children');assert.equal(rows.length,count);assert.equal(rows[0].family_id,actor===a?fid:fidB);});}
  assert.equal((await query(db1,'SELECT id FROM app.children')).length,0);
  await assert.rejects(query(db1,"UPDATE app.children SET nickname='forbidden'"),{code:'42501'});
  await assert.rejects(query(authdb,'SELECT * FROM app.children'),{code:'42501'});
 });
 await check('owner changes reject the second concurrent stale version without granting child access',async()=>{
  const tokenHash=family1.digest('ci-invite');await family1.command(a,'invite.create',{familyId:fid,tokenHash});const pending=await family2.command<{membershipId:string}>(b,'invite.accept',{tokenHash});await family1.command(a,'member.approve',{membershipId:pending.membershipId,expectedVersion:1});
  const results=await Promise.allSettled([family1.command(a,'owner.transfer',{familyId:fid,memberId:b.memberId,expectedVersion:1}),family2.command(a,'owner.transfer',{familyId:fid,memberId:b.memberId,expectedVersion:1})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const list=await family2.command<{children:unknown[]}>(b,'children.list',{familyId:fid});assert.equal(list.children.length,0);
 });
 async function pairing(){const proofHash=family1.digest(randomUUID());const p=await family1.command<{id:string}>({requestId:randomUUID()},'pair.start',{codeHash:family1.digest(randomUUID()),proofHash,label:'가상 기기',previousProofHash:''});await family1.command(a,'pair.approve',{pairingId:p.id,childId,expectedVersion:1});return {pairingId:p.id,proofHash,exchangeKey:randomUUID()};}
 const anonymous={requestId:randomUUID()};
 await check('response-loss exchange races return one device and the same encrypted response',async()=>{
  const p=await pairing();const result=await Promise.all([family1.command<{sealed:string}>(anonymous,'pair.exchange',{...p,deviceHash:family1.digest('device-1'),sealed:family1.seal('cookie-1')}),family2.command<{sealed:string}>(anonymous,'pair.exchange',{...p,deviceHash:family1.digest('device-2'),sealed:family1.seal('cookie-2')})]);assert.equal(result[0].sealed,result[1].sealed);assert.equal((await admin.query('SELECT id FROM app.child_devices WHERE child_id=$1',[childId])).rowCount,1);
 });
 await check('concurrent different pairings cannot exceed two active devices',async()=>{
  const p=await pairing(),q=await pairing();const result=await Promise.allSettled([family1.command(anonymous,'pair.exchange',{...p,deviceHash:family1.digest('device-3'),sealed:family1.seal('cookie-3')}),family2.command(anonymous,'pair.exchange',{...q,deviceHash:family1.digest('device-4'),sealed:family1.seal('cookie-4')})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);const rejected=result.find(r=>r.status==='rejected');assert(rejected?.status==='rejected');assert.equal(rejected.reason.message,'DEVICE_LIMIT');assert.equal((await admin.query('SELECT id FROM app.child_devices WHERE child_id=$1',[childId])).rowCount,2);
 });
 const schedules1=new ScheduleService(family1),schedules2=new ScheduleService(family2);
 const scheduleToday=koreaToday(),scheduleDate=addDays(scheduleToday,1),scheduleEnd=addDays(scheduleToday,40);
 const schedulePayload={childId,title:'가상 반복 일정',place:'가상 교실',date:scheduleDate,untilDate:scheduleEnd,startTime:'15:00',endTime:'16:00',frequency:'WEEKLY',weekdays:[0,1,2,3,4,5,6],holidayPolicy:'ASK',key:randomUUID()};
 await check('P04 concurrent retries create one series and expansion preserves unique occurrence IDs',async()=>{
  const results=await Promise.all([schedules1.command(a,'create',schedulePayload),schedules2.command(a,'create',schedulePayload)]);assert.deepEqual(results[0],results[1]);
  assert.equal((await admin.query('SELECT id FROM app.schedule_series WHERE child_id=$1',[childId])).rowCount,1);
  const lists=await Promise.all([schedules1.command<CalendarData>(a,'calendar',{familyId:fid,from:scheduleToday,to:scheduleEnd,limit:50}),schedules2.command<CalendarData>(a,'calendar',{familyId:fid,from:scheduleToday,to:scheduleEnd,limit:50})]);
  assert.equal(lists[0].occurrences.length,40);assert.deepEqual(lists[0].occurrences.map(o=>o.id),lists[1].occurrences.map(o=>o.id));
 });
 await check('P04 simultaneous confirmed edits accept only one expected version and replay its response',async()=>{
  const calendar=await schedules1.command<CalendarData>(a,'calendar',{familyId:fid,from:scheduleToday,to:scheduleEnd,limit:50}),o=calendar.occurrences[0];
  const inputs=['동시 수정 A','동시 수정 B'].map(title=>({occurrenceId:o.id,scope:'ONE',effectiveDate:o.anchorDate,expectedVersion:o.resourceVersion,changes:{title}}));
  const previews=await Promise.all(inputs.map((p,i)=>(i?schedules2:schedules1).command<ChangePreview>(a,'preview',p)));
  const bodies=inputs.map((p,i)=>({...p,previewToken:previews[i].previewToken,key:randomUUID()}));
  const edits=await Promise.allSettled(bodies.map((p,i)=>(i?schedules2:schedules1).command(a,'change',p)));
  assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);const failed=edits.find(r=>r.status==='rejected');assert(failed?.status==='rejected');assert.equal(failed.reason.message,'VERSION_CONFLICT');
  const index=edits.findIndex(r=>r.status==='fulfilled'),success=edits[index];assert(success.status==='fulfilled');assert.deepEqual(await schedules2.command(a,'change',bodies[index]),success.value);
 });
 await check('P04 schedule roles deny cross-family access, direct writes and worker function execution',async()=>{
  const visible=await schedules2.command<CalendarData>(b,'calendar',{familyId:fid,from:scheduleToday,to:scheduleEnd,limit:50});assert.equal(visible.occurrences.length,0);
  assert.equal((await query(db1,'SELECT id FROM app.occurrences')).length,0);
  await assert.rejects(query(db1,"UPDATE app.occurrences SET title='denied'"),{code:'42501'});
  const [acl]=await query<{worker:boolean}>(db1,"SELECT has_function_privilege(current_user,'app_private.schedule_maintenance()','EXECUTE') worker");assert.equal(acl.worker,false);
  await assert.rejects(admin.query('INSERT INTO app.schedule_series(family_id,child_id,first_date,last_date) VALUES($1,$2,$3,$3)',[fidB,childId,scheduleDate]),{code:'23503'});
 });
 const daily1=new DailyService(family1),daily2=new DailyService(family2);
 await check('P05 parallel checkin retries and semantic replay create one durable record',async()=>{
  const payload={childId,kind:'ARRIVED',happenedAt:new Date().toISOString(),clientEventId:randomUUID(),occurrenceId:null,confirmRepeat:false,key:randomUUID()};
  const [x,y]=await Promise.all([daily1.command(a,'checkin.create',payload),daily2.command(a,'checkin.create',payload)]);assert.deepEqual(x,y);
  const record=(x as {data:{id:string}}).data;
  const replay=await daily2.command<{data:{id:string}}>(a,'checkin.create',{...payload,key:randomUUID()});assert.equal(replay.data.id,record.id);
  assert.equal((await admin.query('SELECT id FROM app.checkins WHERE child_id=$1',[childId])).rowCount,1);
  const corrections=await Promise.allSettled([daily1.command(a,'checkin.correct',{id:record.id,expectedVersion:1,reason:'가상 정정 A',replacement:null,key:randomUUID()}),daily2.command(a,'checkin.correct',{id:record.id,expectedVersion:1,reason:'가상 정정 B',replacement:null,key:randomUUID()})]);
  assert.equal(corrections.filter(r=>r.status==='fulfilled').length,1);const rejected=corrections.find(r=>r.status==='rejected');assert(rejected?.status==='rejected');assert.equal(rejected.reason.message,'VERSION_CONFLICT');
  assert.equal((await admin.query("SELECT id FROM app_private.daily_events WHERE target_id=$1 AND kind='VOIDED'",[record.id])).rowCount,1);
 });
 await check('P05 child completion races preserve one task version and cancel the reminder',async()=>{
  const task=await daily1.command<{data:{id:string}}>(a,'task.create',{childId,title:'가상 할 일',dueAt:new Date(Date.now()+3600000).toISOString(),key:randomUUID()});
  const hash=(await admin.query("SELECT token_hash FROM app.child_devices WHERE child_id=$1 AND status='ACTIVE' LIMIT 1",[childId])).rows[0].token_hash;
  const childActor={requestId:randomUUID(),deviceHash:hash};
  const results=await Promise.allSettled([daily1.command(a,'task.action',{id:task.data.id,action:'COMPLETE',expectedVersion:1,key:randomUUID()}),daily2.command(childActor,'task.action',{id:task.data.id,action:'COMPLETE',expectedVersion:1,key:randomUUID()})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await admin.query('SELECT version FROM app.tasks WHERE id=$1',[task.data.id])).rows[0].version,2);
  assert.equal((await admin.query("SELECT id FROM app_private.daily_jobs WHERE target_id=$1 AND state='PENDING'",[task.data.id])).rowCount,0);
  await assert.rejects(daily2.command(childActor,'task.action',{id:task.data.id,action:'REOPEN',expectedVersion:2,key:randomUUID()}),{message:'FORBIDDEN'});
 });
 await check('P05 pickup acceptance is assigned-member only and daily grant withdrawal resets it atomically',async()=>{
  await family1.command(a,'grants.put',{childId,memberId:b.memberId,daily:true,chat:false,location:false,tuitionRead:false,tuitionWrite:false,expectedVersion:0});
  const pickup=await daily1.command<{data:{id:string}}>(a,'pickup.create',{childId,scheduledAt:new Date().toISOString(),assigneeMemberId:b.memberId,key:randomUUID()});
  await assert.rejects(daily1.command(a,'pickup.action',{id:pickup.data.id,action:'ACCEPT',expectedVersion:1,key:randomUUID()}),{message:'INVALID_STATE'});
  const results=await Promise.allSettled([daily1.command(b,'pickup.action',{id:pickup.data.id,action:'ACCEPT',expectedVersion:1,key:randomUUID()}),daily2.command(b,'pickup.action',{id:pickup.data.id,action:'ACCEPT',expectedVersion:1,key:randomUUID()})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  await family1.command(a,'grants.put',{childId,memberId:b.memberId,daily:false,chat:false,location:false,tuitionRead:false,tuitionWrite:false,expectedVersion:1});
  const row=(await admin.query('SELECT state,assignee_member_id,version FROM app.pickups WHERE id=$1',[pickup.data.id])).rows[0];assert.deepEqual(row,{state:'PROPOSED',assignee_member_id:null,version:3});
  await assert.rejects(daily2.command(b,'pickup.get',{id:pickup.data.id}),{message:'NOT_FOUND'});
  assert.equal((await admin.query("SELECT id FROM app_private.daily_jobs WHERE target_id=$1 AND state='PENDING'",[pickup.data.id])).rowCount,1);
 });
 await check('P05 runtime cannot execute helpers, maintenance, or bypass family-scoped reads',async()=>{
  assert.equal((await query(db1,'SELECT id FROM app.checkins')).length,0);
  await assert.rejects(query(db1,'SELECT app_private.daily_maintenance()'),{code:'42501'});
  await assert.rejects(query(db1,'SELECT app_private.daily_dto($1,$2)',['TASK',randomUUID()]),{code:'42501'});
  await assert.rejects(query(db1,"UPDATE app.pickups SET state='HANDED_OVER'"),{code:'42501'});
  await assert.rejects(daily2.command(b,'child.today',{childId}),{message:'NOT_FOUND'});
 });
 const chat1=new MessageService(family1),chat2=new MessageService(family2);
 await check('P06 simultaneous response-loss retries allocate one sequence and one event',async()=>{
  const payload={childId,kind:'STICKER',catalogId:'arrived',catalogVersion:2,clientMessageId:randomUUID(),key:randomUUID()};
  const [x,y]=await Promise.all([chat1.command<{data:{id:string}}>(a,'send',payload),chat2.command<{data:{id:string}}>(a,'send',payload)]);assert.equal(x.data.id,y.data.id);
  assert.equal((await admin.query('SELECT id FROM app.messages')).rowCount,1);assert.equal((await admin.query('SELECT id FROM app_private.message_changes')).rowCount,1);
  await assert.rejects(chat1.command(a,'send',{...payload,catalogId:'help'}),{message:'KEY_REUSED'});
 });
 await check('P06 distinct simultaneous sends serialize the rate limit, deletion replay stays redacted',async()=>{
  await admin.query("UPDATE app.messages SET created_at=now()-interval '2 seconds'");
  const payload={childId,kind:'TEXT',body:'isolated concurrency test',clientMessageId:randomUUID(),key:randomUUID()};
  const other={...payload,clientMessageId:randomUUID(),key:randomUUID()};
  const results=await Promise.allSettled([chat1.command<{data:{id:string}}>(a,'send',payload),chat2.command<{data:{id:string}}>(a,'send',other)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const index=results.findIndex(r=>r.status==='fulfilled'),r=results[index];assert(r.status==='fulfilled');
  const failed=results.find(r=>r.status==='rejected');assert(failed?.status==='rejected');assert.equal(failed.reason.message,'RATE_LIMITED');
  const list=await chat1.command<{data:{snapshotCursor:string}}>(a,'list',{childId});await chat1.command(a,'delete',{id:r.value.data.id,expectedVersion:1,key:randomUUID()});
  const replay=await chat2.command<{data:{displayText:null;body:null}}>(a,'send',index?other:payload);assert.equal(replay.data.displayText,null);assert.equal(replay.data.body,null);
  const changes=await chat2.command<{data:{items:{deletedAt:string;displayText:null}[]}}>(a,'changes',{childId,cursor:list.data.snapshotCursor});assert(changes.data.items[0].deletedAt);assert.equal(changes.data.items[0].displayText,null);
 });
 await check('P07-F08 provider retry is exactly once under concurrent workers and runtime roles cannot publish',async()=>{
  await admin.query("CREATE FUNCTION realtime.reject_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated provider unavailable';END $$;CREATE TRIGGER reject_fixture BEFORE INSERT ON realtime.messages FOR EACH ROW EXECUTE FUNCTION realtime.reject_fixture()");
  await admin.query("UPDATE app.messages SET created_at=now()-interval '2 seconds'");
  const sent=await chat1.command<{data:{id:string}}>(a,'send',{childId,kind:'TEXT',body:'isolated realtime retry',clientMessageId:randomUUID(),key:randomUUID()});
  const event=(await admin.query('SELECT id FROM app_private.message_changes WHERE message_id=$1',[sent.data.id])).rows[0].id;
  assert.equal((await admin.query('SELECT state FROM app_private.message_jobs WHERE event_id=$1',[event])).rows[0].state,'PENDING');
  await admin.query('DROP TRIGGER reject_fixture ON realtime.messages;DROP FUNCTION realtime.reject_fixture()');
  await Promise.all([worker1,worker2].map(db=>query(db,'SELECT app_private.realtime_flush()')));
  const delivered=(await admin.query('SELECT payload,private FROM realtime.messages WHERE id=$1',[event])).rows;
  assert.equal(delivered.length,1);assert.equal(delivered[0].private,true);assert.deepEqual(Object.keys(delivered[0].payload).sort(),['message_event_id','version']);
  assert.equal((await admin.query('SELECT state FROM app_private.message_jobs WHERE event_id=$1',[event])).rows[0].state,'DONE');
  await assert.rejects(query(db1,'SELECT app_private.realtime_flush()'),{code:'42501'});
  await assert.rejects(query(worker1,'SELECT app_private.realtime_ticket($1)',[childId]),{code:'42501'});
  await assert.rejects(query(db1,'SELECT * FROM app_private.realtime_tickets'),{code:'42501'});
 });
 await check('P06 chat grant starts at new messages and low-privilege roles cannot read message tables',async()=>{
  await family1.command(a,'grants.put',{childId,memberId:b.memberId,daily:false,chat:true,location:false,tuitionRead:false,tuitionWrite:false,expectedVersion:2});
  const list=await chat2.command<{data:{items:unknown[];snapshotCursor:string}}>(b,'list',{childId});assert.equal(list.data.items.length,0);
  const ticket=await chat2.command<{ticket:string;principal:string;topic:string}>(b,'realtime',{childId});
  const claims=JSON.stringify({role:'authenticated',purpose:'iharu_chat',jti:ticket.ticket,sub:ticket.principal});
  assert.equal((await admin.query('SELECT app_private.realtime_allowed($1,$2::jsonb) ok',[ticket.topic,claims])).rows[0].ok,true);
  await family1.command(a,'grants.put',{childId,memberId:b.memberId,daily:false,chat:false,location:false,tuitionRead:false,tuitionWrite:false,expectedVersion:3});
  assert.equal((await admin.query('SELECT app_private.realtime_allowed($1,$2::jsonb) ok',[ticket.topic,claims])).rows[0].ok,false);
  await assert.rejects(chat2.command(b,'realtime',{childId}),{message:'NOT_FOUND'});
  await assert.rejects(chat2.command(b,'changes',{childId,cursor:list.data.snapshotCursor}),{message:'NOT_FOUND'});
  await assert.rejects(query(db1,'SELECT * FROM app.messages'),{code:'42501'});await assert.rejects(query(db1,'SELECT app_private.message_maintenance()'),{code:'42501'});
  await assert.rejects(query(db1,'SELECT app_private.message_dto($1,$2,1)',[randomUUID(),a.memberId]),{code:'42501'});
 });
 await check('committed general withdrawal immediately denies both runtime connections and records durable work',async()=>{
  await family1.command(a,'consent.revoke',{childId,purpose:'general',expectedVersion:1});
  const hash=(await admin.query('SELECT token_hash FROM app.child_devices WHERE child_id=$1 LIMIT 1',[childId])).rows[0].token_hash;
  await assert.rejects(family2.command({requestId:randomUUID(),deviceHash:hash},'child.session'),{message:'DEVICE_REQUIRED'});
  assert.equal((await admin.query("SELECT id FROM app_private.outbox WHERE kind='DELETE_CHILD'")).rowCount,1);
  assert.equal((await family2.command<{children:unknown[]}>(a,'children.list',{familyId:fid})).children.length,0);
 });
 await check('F03 concurrent duplicate submission and competing decisions remain atomic under runtime roles',async()=>{
  await admin.query("UPDATE iharu_auth.session_guard SET reauthenticated_at=now() WHERE session_id IN ($1,$2)",[a.sessionId,b.sessionId]);
  const input={requestKey:randomUUID(),targetLabel:'guardian-ci-target',relationship:'PARENT'};
  const [x,y]=await Promise.all([family1.command<{id:string}>(a,'guardian.submit',input),family2.command<{id:string}>(a,'guardian.submit',input)]);assert.equal(x.id,y.id);
  await assert.rejects(query(db1,'SELECT * FROM app_private.guardian_applications'),{code:'42501'});
  await assert.rejects(family2.command(b,'guardian.queue'),{message:'FORBIDDEN'});
  await admin.query('INSERT INTO app_private.guardian_reviewers(member_id) VALUES($1)',[b.memberId]);
  await family2.command(b,'guardian.review',{id:x.id,state:'REVIEWING',expectedVersion:1});
  const decisions=await Promise.allSettled([family1.command(b,'guardian.review',{id:x.id,state:'REJECTED',expectedVersion:2,reason:'isolated competing decision A'}),family2.command(b,'guardian.review',{id:x.id,state:'REJECTED',expectedVersion:2,reason:'isolated competing decision B'})]);
  assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await admin.query('SELECT id FROM app_private.guardian_application_events WHERE application_id=$1',[x.id])).rowCount,3);
 });
 async function f05Pair(){
  const child=(await family1.command<{id:string}>(b,'child.activate',await proof(b,fidB))).id;
  const proofHash=family1.digest(randomUUID()),p=await family1.command<{id:string}>(anonymous,'pair.start',{proofHash,codeHash:family1.digest(randomUUID()),label:'F05 concurrency',previousProofHash:''});
  await family1.command(b,'pair.approve',{pairingId:p.id,childId:child,expectedVersion:1});return {child,params:{pairingId:p.id,proofHash,exchangeKey:randomUUID(),deviceHash:family1.digest(randomUUID()),sealed:family1.seal(randomUUID())}};
 }
 await check('F05 simultaneous cancellation and exchange produce one terminal outcome without reviving a cancelled pairing',async()=>{
  const {child,params}=await f05Pair();const outcomes=await Promise.allSettled([family1.command(anonymous,'pair.cancel',params),family2.command(anonymous,'pair.exchange',params)]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  const row=(await admin.query('SELECT state FROM app_private.device_pairings WHERE id=$1',[params.pairingId])).rows[0];
  assert.equal((await admin.query('SELECT id FROM app.child_devices WHERE child_id=$1',[child])).rowCount,row.state==='EXCHANGED'?1:0);
  if(row.state==='REVOKED')await assert.rejects(family2.command(anonymous,'pair.exchange',params),{message:'PAIRING_INVALID'});
 });
 await check('F05 consent withdrawal racing exchange cannot deadlock or leave a usable device',async()=>{
  const {child,params}=await f05Pair();const outcomes=await Promise.allSettled([family1.command(b,'consent.revoke',{childId:child,purpose:'general',expectedVersion:1}),family2.command(anonymous,'pair.exchange',params)]);
  assert.equal(outcomes[0].status,'fulfilled');
  if(outcomes[1].status==='rejected')assert.equal(outcomes[1].reason.message,'PAIRING_INVALID');
  await assert.rejects(family2.command({requestId:randomUUID(),deviceHash:params.deviceHash},'child.session'),{message:'DEVICE_REQUIRED'});
  assert.equal((await admin.query("SELECT id FROM app.child_devices WHERE child_id=$1 AND status='ACTIVE'",[child])).rowCount,0);
 });
 await check('F06 concurrent timetable retries and consent withdrawal preserve durable deduplication',async()=>{
  const child=(await family1.command<{id:string}>(b,'child.activate',await proof(b,fidB))).id;
  const input={childId:child,from:scheduleDate,to:scheduleEnd,rowIds:['logos','reading']};
  const preview=await schedules1.command<{previewToken:string}>(b,'template.preview',input);
  const payload={...input,previewToken:preview.previewToken,key:randomUUID()};
  const [x,y]=await Promise.all([schedules1.command<{created:number;existing:number}>(b,'template.import',payload),schedules2.command(b,'template.import',payload)]);assert.deepEqual(x,y);assert.equal(x.created,2);
  const fresh=await schedules2.command<{previewToken:string}>(b,'template.preview',input);
  assert.equal((await schedules1.command<{created:number;existing:number}>(b,'template.import',{...input,previewToken:fresh.previewToken,key:randomUUID()})).existing,2);
  assert.equal((await admin.query('SELECT id FROM app.schedule_series WHERE child_id=$1',[child])).rowCount,2);
  await assert.rejects(query(db1,'SELECT * FROM app_private.schedule_template_imports'),{code:'42501'});
  const [acl]=await query<{public_execute:boolean}>(db1,"SELECT EXISTS(SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a WHERE p.oid='app_private.schedule_template_command(text,jsonb)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute");assert.equal(acl.public_execute,false);
  await family1.command(b,'consent.revoke',{childId:child,purpose:'general',expectedVersion:1});
  await assert.rejects(schedules2.command(b,'template.import',payload),{message:'NOT_FOUND'});
 });
 await check('UI75 concurrent parent approvals create one child and prevent code reuse',async()=>{
  const parents:FamilyActor[]=[];
  for(const name of ['child-parent-c','child-parent-d']){
   const email=name+'@example.test';
   const registered=await app.request(origin+'/api/auth/sign-up/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,name:'가상 부모',password:'isolated-parent-child-password',callbackURL:'/login?verified=1'})});assert.equal(registered.status,200);
   await admin.query('UPDATE iharu_auth."user" SET "emailVerified"=true WHERE email=$1',[email]);
   const login=await app.request(origin+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password:'isolated-parent-child-password'})});assert.equal(login.status,200);
   const row=(await admin.query('SELECT m.id,s.id AS session FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id JOIN iharu_auth.session s ON s."userId"=u.id WHERE u.email=$1',[email])).rows[0];parents.push({memberId:row.id,sessionId:row.session,requestId:randomUUID()});
  }
  const anonymous={requestId:randomUUID()},codeHash=family1.digest('child-code:123456'),proofHash=family1.digest('signup:ci-proof'),loginId='i'+randomBytes(5).toString('hex');
  await family1.command(anonymous,'childaccount.register',{loginId,name:'가상 동시 승인',passwordHash:await childPasswordHash('fixture-child-password'),codeHash,proofHash});
  const preview=await family1.command<{requestId:string}>(parents[0],'childaccount.resolve',{codeHash});
  const answers=await Promise.allSettled([family1.command(parents[0],'childaccount.approve',{codeHash,requestId:preview.requestId,consent:true}),family2.command(parents[1],'childaccount.approve',{codeHash,requestId:preview.requestId,consent:true})]);
  assert.equal(answers.filter(x=>x.status==='fulfilled').length,1);assert.equal(answers.filter(x=>x.status==='rejected').length,1);
  const rows=(await admin.query('SELECT child_id,approved_by FROM app_private.child_accounts WHERE login_id=$1',[loginId])).rows;assert.equal(rows.length,1);assert.ok(rows[0].child_id);
  const raw1=family1.token(),raw2=family2.token();
  const finishes=await Promise.all([family1.command<{sealed:string}>(anonymous,'childaccount.finish',{proofHash,deviceHash:family1.digest('device:'+raw1),sealed:family1.seal(raw1)}),family2.command<{sealed:string}>(anonymous,'childaccount.finish',{proofHash,deviceHash:family2.digest('device:'+raw2),sealed:family2.seal(raw2)})]);
  assert.equal(finishes[0].sealed,finishes[1].sealed);assert.equal((await admin.query('SELECT id FROM app.child_devices WHERE child_id=$1',[rows[0].child_id])).rowCount,1);
  await assert.rejects(query(db1,'SELECT * FROM app_private.child_accounts'),{code:'42501'});
 });
 console.log(`PostgreSQL integration: ${passed} scenarios passed`);
}finally{for(const db of connections)await db.destroy();await admin.end();}


