import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createPublicKey,generateKeyPairSync,randomUUID,verify} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {testDatabase} from './helpers/auth-db';
import {query} from '../server/auth/database';
import {readRealtimeConfig,signRealtimeTicket} from '../server/messages/realtime';
import {startChatRealtime,type ClientFactory} from '../web/src/chat-realtime';
import {FamilyService} from '../server/family/service';
import {MessageService} from '../server/messages/service';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk={...pair.privateKey.export({format:'jwk'}),kid:randomUUID()};
const env={REALTIME_SUPABASE_URL:'https://realtime-fixture.supabase.co',REALTIME_PUBLISHABLE_KEY:'sb_publishable_fixture',REALTIME_SIGNING_JWK:JSON.stringify(jwk)};
const config=readRealtimeConfig(env)!;
it('signs a verifiable 180-second receive ticket without leaking credentials or accepting privileged API keys',()=>{
 const now=Date.now(),ticket={ticket:randomUUID(),principal:randomUUID(),topic:`child:${randomUUID()}:chat:2`,expiresAt:new Date(now+600000).toISOString()};
 const result=signRealtimeTicket(ticket,config,now),[header,body,signature]=result.token.split('.');
 expect(verify('sha256',Buffer.from(header+'.'+body),{key:createPublicKey(pair.privateKey),dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url'))).toBe(true);
 const claims=JSON.parse(Buffer.from(body,'base64url').toString());expect(claims.exp-claims.iat).toBe(180);expect(claims).toMatchObject({sub:ticket.principal,jti:ticket.ticket,role:'authenticated',purpose:'iharu_chat'});
 expect(JSON.stringify(result)).not.toContain(jwk.d);expect(readRealtimeConfig({})).toBeNull();
 for(const change of [{REALTIME_PUBLISHABLE_KEY:'sb_secret_forbidden'},{REALTIME_SUPABASE_URL:'https://attacker.test'},{REALTIME_SIGNING_JWK:'not-a-key'},{REALTIME_SIGNING_JWK:JSON.stringify({...jwk,crv:'P-384'})}])expect(()=>readRealtimeConfig({...env,...change})).toThrow('REALTIME_CONFIG_INVALID');
 expect(()=>signRealtimeTicket({...ticket,expiresAt:new Date(now-1000).toISOString()},config,now)).toThrow('REALTIME_TICKET_EXPIRED');
});

describe('receive-only database authorization and transactional broadcast outbox',()=>{
 let database:Awaited<ReturnType<typeof testDatabase>>,family:FamilyService,service:MessageService;
 let cid:string,fid:string,did:string,actor:{deviceHash:string;requestId:string};
 beforeAll(async()=>{database=await testDatabase();await database.engine.exec(await readFile('tests/helpers/realtime-provider.sql','utf8'));for(const name of (await readdir('db/migrations')).sort())await database.engine.exec(await readFile('db/migrations/'+name,'utf8'));family=new FamilyService(database.db,'isolated-realtime-fixture-only-00000000001','app_runtime');service=new MessageService(family);},30000);
 beforeEach(async()=>{
  await database.engine.exec('TRUNCATE app.families,iharu_auth."user",realtime.messages CASCADE');cid=randomUUID();fid=randomUUID();did=randomUUID();const mid=randomUUID(),uid=randomUUID();
  await query(database.db,'INSERT INTO iharu_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'fixture\',$2,true,now(),now())',[uid,uid+'@example.test']);
  await query(database.db,'INSERT INTO iharu_auth.members(id,auth_user_id,access_ready) VALUES($1,$2,true)',[mid,uid]);
  await query(database.db,'INSERT INTO app.families(id,name,owner_id) VALUES($1,\'fixture\',$2)',[fid,mid]);
  await query(database.db,"INSERT INTO app.children(id,family_id,nickname,birth_date,consenter_id) VALUES($1,$2,'virtual','2018-03-02',$3)",[cid,fid,mid]);
  await query(database.db,"INSERT INTO app.child_consents(child_id,family_id,purpose,consenter_id,policy_version,evidence_ref) VALUES($1,$2,'general',$3,'6.1','fixture-only')",[cid,fid,mid]);
  await query(database.db,'INSERT INTO app.rooms(family_id,child_id) VALUES($1,$2)',[fid,cid]);
  actor={deviceHash:family.digest('device:fixture-'+did),requestId:randomUUID()};
  await query(database.db,"INSERT INTO app.child_devices(id,family_id,child_id,label,token_hash) VALUES($1,$2,$3,'virtual',$4)",[did,fid,cid,actor.deviceHash]);
 });
 afterAll(async()=>{await database?.db.destroy();});
 async function ticket(){return service.command<{ticket:string;principal:string;topic:string;expiresAt:string}>(actor,'realtime',{childId:cid});}
 const claims=(t:{ticket:string;principal:string})=>({role:'authenticated',purpose:'iharu_chat',jti:t.ticket,sub:t.principal});
 async function allowed(t:Awaited<ReturnType<typeof ticket>>,topic=t.topic,c=claims(t)){
  return database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE authenticated');return (await query<{ok:boolean}>(tx,'SELECT app_private.realtime_allowed($1,$2::jsonb) ok',[topic,JSON.stringify(c)]))[0].ok;});
 }
 it('binds a ticket to the live child, principal, current epoch, consent and expiry',async()=>{
  const t=await ticket();expect(await allowed(t)).toBe(true);expect(await allowed(t,t.topic.replace(cid,randomUUID()))).toBe(false);expect(await allowed(t,t.topic,{...claims(t),sub:randomUUID()})).toBe(false);
  await query(database.db,"UPDATE app.child_devices SET status='REVOKED' WHERE id=$1",[did]);expect(await allowed(t)).toBe(false);await expect(ticket()).rejects.toThrow('NOT_FOUND');
  expect((await query<{epoch:number}>(database.db,'SELECT epoch FROM app.rooms WHERE child_id=$1',[cid]))[0].epoch).toBe(2);
 });
 it('enqueues only change ID/version, rejects forged client broadcast and replays no duplicate events',async()=>{
  const t=await ticket(),input={childId:cid,key:randomUUID(),kind:'TEXT',body:'private body never broadcast',clientMessageId:randomUUID()};
  await service.command(actor,'send',input);await service.command(actor,'send',input);
  const sent=await query<{payload:Record<string,unknown>;private:boolean;topic:string}>(database.db,'SELECT payload,private,topic FROM realtime.messages');expect(sent).toHaveLength(1);expect(Object.keys(sent[0].payload).sort()).toEqual(['message_event_id','version']);expect(sent[0].topic).toBe(t.topic);expect(sent[0].private).toBe(true);
  expect((await query<{state:string}>(database.db,'SELECT state FROM app_private.message_jobs'))[0].state).toBe('DONE');
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE authenticated');await query(tx,"SELECT set_config('request.jwt.claims',$1,true),set_config('realtime.topic',$2,true)",[JSON.stringify(claims(t)),t.topic]);await query(tx,"INSERT INTO realtime.messages VALUES($1,'{}','change',$2,true,'broadcast')",[randomUUID(),t.topic]);})).rejects.toThrow(/row-level security/);
 });
 it('keeps message storage on provider failure; bounded worker retry delivers once and skips old epochs',async()=>{
  await database.engine.exec("CREATE FUNCTION realtime.reject_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'provider failure';END $$;CREATE TRIGGER reject_fixture BEFORE INSERT ON realtime.messages FOR EACH ROW EXECUTE FUNCTION realtime.reject_fixture();");
  await service.command(actor,'send',{childId:cid,key:randomUUID(),kind:'TEXT',body:'durable',clientMessageId:randomUUID()});
  expect((await query<{state:string}>(database.db,'SELECT state FROM app_private.message_jobs'))[0].state).toBe('PENDING');expect(await query(database.db,'SELECT id FROM app.messages')).toHaveLength(1);
  await database.engine.exec('DROP TRIGGER reject_fixture ON realtime.messages;DROP FUNCTION realtime.reject_fixture();');
  const run=()=>database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE worker_runtime');return query<{data:{enqueued:number}}>(tx,'SELECT app_private.realtime_flush() data');});
  expect((await run())[0].data.enqueued).toBe(1);expect((await run())[0].data.enqueued).toBe(0);
  await query(database.db,"UPDATE app_private.message_jobs SET state='PENDING'");await query(database.db,"UPDATE app.child_devices SET status='REVOKED' WHERE id=$1",[did]);expect((await run())[0].data.enqueued).toBe(0);expect((await query<{state:string}>(database.db,"SELECT j.state FROM app_private.message_jobs j JOIN app_private.message_changes e ON e.id=j.event_id WHERE e.kind='CREATED'"))[0].state).toBe('CANCELLED');
 });
 it('emits one read change and makes reconnect refresh read state without treating repeated receipt as a new event',async()=>{
  await service.command(actor,'send',{childId:cid,key:randomUUID(),kind:'TEXT',body:'read fixture',clientMessageId:randomUUID()});
  const snap=await service.command<{data:{snapshotCursor:string;receipt:string}}>(actor,'list',{childId:cid});
  await service.command(actor,'read',{childId:cid,receipt:snap.data.receipt,lastReadSeq:1});await service.command(actor,'read',{childId:cid,receipt:snap.data.receipt,lastReadSeq:1});
  const changes=await service.command<{data:{readsChanged:boolean}}>(actor,'changes',{childId:cid,cursor:snap.data.snapshotCursor});expect(changes.data.readsChanged).toBe(true);
  expect(await query(database.db,"SELECT id FROM app_private.message_changes WHERE kind='READ'")).toHaveLength(1);
 });
});

it('refreshes a short token, catches up after connection, falls back on failure and ignores a hidden-room response',async()=>{
 vi.useFakeTimers();
 try{
  const token=()=>({data:signRealtimeTicket({ticket:randomUUID(),principal:randomUUID(),topic:`child:${randomUUID()}:chat:1`,expiresAt:new Date(Date.now()+180000).toISOString()},config)});
  let stateCallback:(s:string)=>void=()=>{},eventCallback:(e:unknown)=>void=()=>{};
  const channel={on:vi.fn((_type,_filter,fn)=>{eventCallback=fn;return channel;}),subscribe:vi.fn(fn=>{stateCallback=fn;return channel;})};
  const client={setAuth:vi.fn(async()=>{}),channel:vi.fn(()=>channel),disconnect:vi.fn()};
  const loadToken=vi.fn(async()=>token()),change=vi.fn(),status=vi.fn(),denied=vi.fn();
  const connection=startChatRealtime({loadToken,change,status,denied},(async()=>client) as unknown as ClientFactory);
  connection.setActive(true);await vi.advanceTimersByTimeAsync(0);stateCallback('SUBSCRIBED');expect(status).toHaveBeenLastCalledWith('LIVE');expect(change).toHaveBeenCalledTimes(1);
  eventCallback({payload:{message_event_id:randomUUID(),version:1}});await vi.advanceTimersByTimeAsync(80);expect(change).toHaveBeenCalledTimes(2);
  eventCallback({payload:{body:'unexpected payload'}});await vi.advanceTimersByTimeAsync(80);expect(change).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(150000);expect(loadToken).toHaveBeenCalledTimes(2);expect(client.setAuth).toHaveBeenCalledTimes(2);
  stateCallback('CHANNEL_ERROR');expect(status).toHaveBeenLastCalledWith('POLLING');await vi.advanceTimersByTimeAsync(15000);expect(loadToken).toHaveBeenCalledTimes(3);
  connection.setActive(false);const before=change.mock.calls.length;stateCallback('SUBSCRIBED');expect(change).toHaveBeenCalledTimes(before);expect(client.disconnect).toHaveBeenCalled();connection.close();
 }finally{vi.useRealTimers();}
});

