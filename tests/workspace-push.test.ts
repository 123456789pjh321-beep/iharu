import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {createECDH,randomBytes,createHash} from 'node:crypto';
import {testDatabase} from './helpers/auth-db';
import {createAuthService} from '../server/auth/service';
import {createApp} from '../server/app';
import {FamilyService} from '../server/family/service';
import {query} from '../server/auth/database';
import {allowedPushEndpoint,dispatchPush,pushCommand,pushSpecs,type PushConfig} from '../server/push/service';
import {visibleOn} from '../shared/workspace-schedules';
import type {WorkspaceItem} from '../shared/workspace';
const origin='http://localhost:4173',secret='push-fixture-auth-only-not-production-0000001';
const config:PushConfig={secret:'push-worker-fixture-secret-0000000000000001',publicKey:'fixture',privateKey:'fixture',subject:origin};
let database:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>,family:FamilyService;
const mail:{to:string;url:string}[]=[];
class Browser{cookies=new Map<string,string>();async req(op:string,data:object={}){const path=op.startsWith('/')?op:'/api/v1/workspace/'+op;const r=await app.request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')},body:JSON.stringify(data)});for(const cookie of r.headers.getSetCookie()){const [value]=cookie.split(';'),n=value.indexOf('=');if(value.slice(n+1))this.cookies.set(value.slice(0,n),value.slice(n+1));else this.cookies.delete(value.slice(0,n));}return r;}async ok(op:string,data:object={}){const r=await this.req(op,data);expect(r.status,await r.clone().text()).toBeLessThan(300);return r.json();}}
async function parent(name:string){const b=new Browser(),email=name+'@example.test';await b.ok('/api/auth/sign-up/email',{email,name,password:'fixture-password-012345',callbackURL:'/login?verified=1'});await app.request(mail.find(m=>m.to===email)!.url);await b.ok('/api/auth/sign-in/email',{email,password:'fixture-password-012345'});return b;}
function subscription(name:string){const key=createECDH('prime256v1');key.generateKeys();return{endpoint:'https://fcm.googleapis.com/fcm/send/'+name,p256dh:key.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')};}
async function subscribe(b:Browser,name:string){const sub=subscription(name);const me=await b.ok('me');
 // Call the database boundary as the same verified session; no real VAPID credentials in tests.
 if(me.role==='CHILD'){await family.command({requestId:crypto.randomUUID(),workspaceHash:family.digest('workspace:'+b.cookies.get('iharu-space'))},'workspace.push.subscribe',sub);return sub;}
 const [row]=await query<{session_id:string}>(database.db,'SELECT s.id AS session_id FROM iharu_auth.session s JOIN iharu_auth.members m ON m.auth_user_id=s."userId" JOIN app_private.workspace_profiles p ON p.member_id=m.id WHERE p.id=$1 ORDER BY s."createdAt" DESC LIMIT 1',[me.id]);
 const [profile]=await query<{member_id:string}>(database.db,'SELECT member_id FROM app_private.workspace_profiles WHERE id=$1',[me.id]);
 await family.command({requestId:crypto.randomUUID(),memberId:profile.member_id,sessionId:row.session_id},'workspace.push.subscribe',sub);return sub;}
async function linked(){const a=await parent('push-host'),b=await parent('push-member');const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});return{a,b};}
const event=(title='가족 행사',kind='EVENT')=>({kind,data:{title,date:'2026-11-09',weekdays:kind==='REPEAT'?[1]:[],startTime:'09:00',endTime:'10:00',place:'',note:'private fixture',paid:false,...(kind==='FEE'?{amount:20000}:{})}});
const saved={calendarChanges:true,calendarReminders:true,chat:true,reminderMinutes:10,preview:false};
beforeAll(async()=>{database=await testDatabase();for(const file of(await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await database.engine.exec(await readFile('db/migrations/'+file,'utf8'));await query(database.db,'INSERT INTO app_private.workspace_push_config(secret_hash) VALUES($1)',[createHash('sha256').update(config.secret).digest('hex')]);},30000);
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets CASCADE');mail.length=0;const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});family=new FamilyService(database.db,secret,'app_runtime');app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>family,undefined,undefined,{legacyInviteFixtures:true});});
afterAll(async()=>{await database.db.destroy();});
it('limits private-room push recipients and revalidates membership before delivery',async()=>{
 const {a,b}=await linked(),c=await parent('push-unselected'),invitation=await a.ok('invite.issue',{consent:true});await c.ok('family.join',{code:invitation.code});
 await subscribe(b,'room-selected');await subscribe(c,'room-unselected');
 const bm=await b.ok('me'),am=await a.ok('me');
 const room=await a.ok('chat.room.create',{memberIds:[bm.id],name:'',clientRequestId:crypto.randomUUID()});
 await a.ok('chat.send',{roomId:room.id,text:'선택한 사람만 받는 알림',clientMessageId:crypto.randomUUID()});
 const rows=await query<{profile_id:string}>(database.db,"SELECT s.profile_id FROM app_private.workspace_push_outbox q JOIN app_private.workspace_push_subscriptions s ON s.id=q.subscription_id WHERE q.reason='chat'");
 expect(rows.map(row=>row.profile_id)).toEqual([bm.id]);
 const jobs=await pushCommand<{id:string;leaseToken:string}[]>(family,config,'claim');expect(jobs).toHaveLength(1);
 await a.ok('family.remove',{familyId:am.family.id,profileId:bm.id,version:1});
 expect(await pushCommand(family,config,'delivery',jobs[0])).toBeNull();
});
it('requires authenticated settings, blocks arbitrary push targets and denies direct table/worker access',async()=>{
 expect((await new Browser().req('push.settings')).status).toBe(401);const a=await parent('push-auth');expect(await a.ok('push.settings')).toMatchObject({...saved,deviceCount:0,pushAvailable:false});
 for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://127.0.0.1/a','https://user@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://web.push.apple.com/a#leak'])expect(allowedPushEndpoint(url)).toBe(false);
 for(const url of ['https://fcm.googleapis.com/fcm/send/fixture','https://updates.push.services.mozilla.com/wpush/v2/fixture','https://web.push.apple.com/fixture'])expect(allowedPushEndpoint(url)).toBe(true);
 expect(pushSpecs['push.subscribe'].safeParse({...subscription('bad'),endpoint:'https://internal.test/a'}).success).toBe(false);
 await expect(pushCommand(family,{...config,secret:'wrong-worker-secret-000000000000000'},'claim')).rejects.toThrow('FORBIDDEN');
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'SELECT * FROM app_private.workspace_push_subscriptions');})).rejects.toMatchObject({code:'42501'});
});
it('delivers only new calendar and chat to opted-in family recipients, with private content hidden by default',async()=>{
 const{a,b}=await linked(),x=await parent('push-outsider');await subscribe(a,'a');await subscribe(b,'b');await subscribe(x,'x');
 for(const kind of ['EVENT','REPEAT','FEE','NOTE'])await a.ok('items.create',event('private title',kind));const key=crypto.randomUUID();await a.ok('chat.send',{text:'private message',clientMessageId:key});await a.ok('chat.send',{text:'private message',clientMessageId:key});
 const delivered:any[]=[];expect(await dispatchPush(family,config,{sender:async d=>{delivered.push(d);return 201;}})).toEqual({claimed:2,accepted:2,failed:0});
 expect(delivered.every(d=>d.subscription.endpoint.endsWith('/b'))).toBe(true);expect(delivered.map(d=>d.payload.url).sort()).toEqual(['/chat','/today/calendar']);expect(JSON.stringify(delivered.map(d=>d.payload))).not.toContain('private');
 expect(await dispatchPush(family,config,{sender:async()=>{throw Error('duplicate');}})).toEqual({claimed:0,accepted:0,failed:0});
});
it('cancels pending notifications after preferences, read receipts, family removal and logout',async()=>{
 const{a,b}=await linked();await subscribe(b,'b');await a.ok('chat.send',{text:'already read',clientMessageId:crypto.randomUUID()});const list=await b.ok('chat.list',{});await b.ok('updates.read',list.updateReceipt);
 const forbidden=async()=>{throw new Error('must not send');};expect((await dispatchPush(family,config,{sender:forbidden})).claimed).toBe(0);
 await a.ok('items.create',event());await b.ok('push.settings.save',{...saved,calendarChanges:false});expect((await dispatchPush(family,config,{sender:forbidden})).claimed).toBe(0);
 await a.ok('chat.send',{text:'disconnect',clientMessageId:crypto.randomUUID()});const am=await a.ok('me'),bm=await b.ok('me');await a.ok('family.remove',{familyId:am.family.id,profileId:bm.id,version:1});expect((await dispatchPush(family,config,{sender:forbidden})).claimed).toBe(0);
 const invite=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invite.code});await a.ok('chat.send',{text:'logout',clientMessageId:crypto.randomUUID()});await b.ok('/api/auth/sign-out',{});expect((await dispatchPush(family,config,{sender:forbidden})).claimed).toBe(0);
});
it('rechecks permission after claiming, retires expired endpoints and retries transient failures without duplicate claims',async()=>{
 const{a,b}=await linked(),sub=await subscribe(b,'b');await a.ok('chat.send',{text:'queued',clientMessageId:crypto.randomUUID()});const leases=await pushCommand<any[]>(family,config,'claim');expect(leases).toHaveLength(1);expect(await pushCommand(family,config,'claim')).toEqual([]);
 await b.ok('push.unsubscribe',{endpoint:sub.endpoint});expect(await pushCommand(family,config,'delivery',leases[0])).toBeNull();await subscribe(b,'b');await a.ok('chat.send',{text:'gone',clientMessageId:crypto.randomUUID()});await dispatchPush(family,config,{sender:async()=>410});expect(await b.ok('push.settings',{endpoint:sub.endpoint})).toMatchObject({deviceEnabled:false,deviceCount:0});
 await subscribe(b,'retry');await a.ok('chat.send',{text:'retry',clientMessageId:crypto.randomUUID()});await dispatchPush(family,config,{sender:async()=>503});expect((await dispatchPush(family,config,{sender:async()=>201})).claimed).toBe(0);await query(database.db,"UPDATE app_private.workspace_push_outbox SET due_at=now()-interval '1 second' WHERE state='pending'");expect((await dispatchPush(family,config,{sender:async()=>201})).accepted).toBe(1);
});
it('matches calendar month-end/leap-year/weekday recurrence and queues each due reminder once',async()=>{
 const matrices=[{date:'2026-01-31',calendarFrequency:'MONTHLY',weekdays:[]},{date:'2024-02-29',calendarFrequency:'YEARLY',weekdays:[]},{date:'2026-01-01',calendarFrequency:'WEEKLY',weekdays:[0,1]},{date:'2026-02-28',calendarFrequency:'DAILY',untilDate:'2026-03-02',weekdays:[]},{date:'2026-03-01',weekdays:[]}];
 for(const data of matrices)for(const date of ['2026-02-28','2026-03-01','2026-03-02','2026-03-03','2028-02-29']){const[row]=await query<{yes:boolean}>(database.db,'SELECT app_private.workspace_push_occurs($1::jsonb,$2::date) yes',[JSON.stringify(data),date]);expect(row.yes).toBe(visibleOn({kind:'EVENT',data} as WorkspaceItem,date));}
 const a=await parent('push-reminder');await subscribe(a,'reminder');const[clock]=await query<{day:string;time:string;end:string}>(database.db,"SELECT to_char((now()+interval '10 minutes') AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') AS day,to_char((now()+interval '10 minutes') AT TIME ZONE 'Asia/Seoul','HH24:MI') AS time,to_char((now()+interval '11 minutes') AT TIME ZONE 'Asia/Seoul','HH24:MI') AS end");
 await a.ok('items.create',{kind:'EVENT',data:{...event().data,date:clock.day,startTime:clock.time,endTime:clock.end,calendarFrequency:'DAILY'}});await query(database.db,"UPDATE app_private.workspace_push_subscriptions SET created_at=now()-interval '1 hour'");
 const deliveries:any[]=[];expect((await dispatchPush(family,config,{plan:true,sender:async d=>{deliveries.push(d);return 201;}})).accepted).toBe(1);expect(deliveries[0].payload.title).toContain('일정 알림');expect((await dispatchPush(family,config,{plan:true,sender:async()=>201})).claimed).toBe(0);
});
it('supports child sessions and stops delivery as soon as the child logs out',async()=>{
 const a=await parent('push-child-host'),child=new Browser();const invite=await a.ok('invite.issue',{consent:true});await child.ok('child.signup',{loginId:'push_child',name:'가상 자녀',password:'fixture-child-password',code:invite.code});await subscribe(child,'child');
 await a.ok('chat.send',{text:'child delivery',clientMessageId:crypto.randomUUID()});const deliveries:any[]=[];expect((await dispatchPush(family,config,{sender:async d=>{deliveries.push(d);return 201;}})).accepted).toBe(1);expect(deliveries[0].subscription.endpoint.endsWith('/child')).toBe(true);
 await a.ok('chat.send',{text:'after logout',clientMessageId:crypto.randomUUID()});await child.ok('logout');expect((await dispatchPush(family,config,{sender:async()=>{throw Error('revoked');}})).claimed).toBe(0);
});
it('clears old-account queued notifications when a shared endpoint changes owner',async()=>{
 const{a,b}=await linked(),x=await parent('push-new-owner');await subscribe(b,'shared');await a.ok('chat.send',{text:'old family',clientMessageId:crypto.randomUUID()});await subscribe(x,'shared');expect((await dispatchPush(family,config,{sender:async()=>{throw Error('old account');}})).claimed).toBe(0);expect((await b.ok('push.settings')).deviceCount).toBe(0);expect((await x.ok('push.settings')).deviceCount).toBe(1);
});
it('cancels stale versions, sends deletion updates, and exposes preview text only after opt-in',async()=>{
 const{a,b}=await linked();await subscribe(b,'versions');await b.ok('push.settings.save',{...saved,preview:true});const input=event('changed title'),created=await a.ok('items.create',input);await a.ok('items.update',{...input,id:created.id,version:1,data:{...input.data,title:'new title'}});const messages:any[]=[];expect((await dispatchPush(family,config,{sender:async d=>{messages.push(d.payload);return 201;}})).accepted).toBe(1);expect(messages[0].body).toBe('new title');await a.ok('items.delete',{id:created.id,version:2});expect((await dispatchPush(family,config,{sender:async d=>{messages.push(d.payload);return 201;}})).accepted).toBe(1);expect(messages[1].body).not.toContain('new title');
});

it('sends start reminders only once for a multi-day event, never on continuation days',async()=>{
 const data={...event().data,date:'2026-12-31',endDate:'2027-01-02',startTime:'22:00',endTime:'04:00'};
 for(const day of ['2026-12-31','2027-01-01','2027-01-02']){const [row]=await query<{yes:boolean}>(database.db,'SELECT app_private.workspace_push_occurs($1::jsonb,$2::date) yes',[JSON.stringify(data),day]);expect(row.yes).toBe(day==='2026-12-31');expect(visibleOn({kind:'EVENT',data} as WorkspaceItem,day)).toBe(true);}
});
it('stops queued and subsequent private-room push after a participant leaves while keeping remaining delivery',async()=>{
 const {a,b}=await linked(),c=await parent('push-room-remains'),invite=await a.ok('invite.issue',{consent:true});await c.ok('family.join',{code:invite.code});await subscribe(b,'room-left');await subscribe(c,'room-stays');const bm=await b.ok('me'),cm=await c.ok('me'),room=await a.ok('chat.room.create',{memberIds:[bm.id,cm.id],name:'알림 종료 검증',clientRequestId:crypto.randomUUID()});
 await a.ok('chat.send',{roomId:room.id,text:'나가기 전에 대기 중인 알림',clientMessageId:crypto.randomUUID()});const jobs=await pushCommand<{id:string;leaseToken:string}[]>(family,config,'claim');expect(jobs).toHaveLength(2);await b.ok('chat.room.leave',{roomId:room.id});const deliveries=[];for(const job of jobs){const delivery=await pushCommand<any>(family,config,'delivery',job);if(delivery)deliveries.push(delivery);}expect(deliveries).toHaveLength(1);expect(deliveries[0].subscription.endpoint.endsWith('/room-stays')).toBe(true);
 const after=await a.ok('chat.send',{roomId:room.id,text:'남은 사람에게만 알림',clientMessageId:crypto.randomUUID()});const recipients=await query<{profile_id:string}>(database.db,'SELECT s.profile_id FROM app_private.workspace_push_outbox q JOIN app_private.workspace_push_subscriptions s ON s.id=q.subscription_id WHERE q.item_id=$1',[after.id]);expect(recipients.map(r=>r.profile_id)).toEqual([cm.id]);
});
