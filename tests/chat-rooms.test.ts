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
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets CASCADE');mail.length=0;const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>new FamilyService(database.db,secret,'app_runtime'),undefined,undefined,{legacyInviteFixtures:true});});
afterAll(async()=>{await database.db.destroy();});
async function group(){const a=await parent('room-a'),b=await parent('room-b'),c=await parent('room-c');for(const member of [b,c]){const invitation=await a.ok('invite.issue',{consent:true});await member.ok('family.join',{code:invitation.code});}return {a,b,c,am:await a.ok('me'),bm:await b.ok('me'),cm:await c.ok('me')};}
const create=(memberIds:string[],name='')=>({memberIds,name,clientRequestId:crypto.randomUUID()});
const send=(roomId:string,text:string)=>({roomId,text,clientMessageId:crypto.randomUUID()});
it('isolates direct rooms from the default chat, other members, generic reads and notification badges',async()=>{
 const {a,b,c,bm}=await group(),outside=await parent('room-outside');
 const room=await a.ok('chat.room.create',create([bm.id]));
 const direct=await a.ok('chat.send',send(room.id,'두 사람만 보는 메시지'));
 const shared=await a.ok('chat.send',{text:'모두 보는 메시지',clientMessageId:crypto.randomUUID()});
 expect((await a.ok('chat.rooms')).items[0]).toMatchObject({id:room.id,name:'room-b',kind:'DIRECT',canSend:true});
 expect((await b.ok('chat.list',{roomId:room.id})).items.map((i:{id:string})=>i.id)).toEqual([direct.id]);
 expect((await b.ok('chat.list')).items.map((i:{id:string})=>i.id)).toEqual([shared.id]);
 expect((await c.ok('chat.rooms')).items).toEqual([]);
 for(const person of [c,outside]){
  expect((await person.req(api+'chat.list',{roomId:room.id})).status).toBe(404);
  expect((await person.req(api+'chat.send',send(room.id,'권한 없음'))).status).toBe(404);
  expect((await person.req(api+'items.get',{id:direct.id})).status).toBe(404);
  expect((await person.ok('items.list',{...listing,kind:'CHAT'})).items.some((i:{id:string})=>i.id===direct.id)).toBe(false);
 }
 expect((await b.ok('items.get',{id:direct.id})).mine).toBe(false);
 expect((await b.req(api+'items.delete',{id:direct.id,version:1})).status).toBe(403);
 expect((await a.req(api+'items.update',{...payload('종류 변조','NOTE'),id:direct.id,version:1})).status).toBe(400);
 expect((await b.ok('updates.status')).updates.chat.revision).toBe(2);
 expect((await c.ok('updates.status')).updates.chat.revision).toBe(1);
});
it('reuses a direct room from either participant, rejects changed retries and scopes message idempotency to the room',async()=>{
 const {a,b,bm,am,cm}=await group(),input=create([bm.id]),room=await a.ok('chat.room.create',input);
 expect((await a.ok('chat.room.create',input)).id).toBe(room.id);
 expect((await b.ok('chat.room.create',create([am.id]))).id).toBe(room.id);
 expect((await a.req(api+'chat.room.create',{...input,memberIds:[cm.id]})).status).toBe(409);
 const second=await a.ok('chat.room.create',create([cm.id])),message=send(room.id,'재시도');
 const first=await a.ok('chat.send',message);expect((await a.ok('chat.send',message)).id).toBe(first.id);
 expect((await a.req(api+'chat.send',{...message,roomId:second.id})).status).toBe(409);
 expect((await a.req(api+'chat.send',{text:message.text,clientMessageId:message.clientMessageId})).status).toBe(409);
 await b.ok('chat.send',send(room.id,'다음 메시지'));
 const page=await a.ok('chat.list',{roomId:room.id,limit:1});expect(page.hasMore).toBe(true);
 expect((await a.ok('chat.list',{roomId:room.id,limit:1,before:page.nextCursor})).items[0].id).toBe(first.id);
 expect((await a.ok('chat.list',{roomId:second.id,query:'재시도'})).items).toEqual([]);
});
it('revokes removed members immediately and never restores their old rooms after rejoining',async()=>{
 const {a,b,am,bm}=await group(),room=await a.ok('chat.room.create',create([bm.id]));
 const item=await b.ok('chat.send',send(room.id,'연결 중 보낸 메시지'));
 await a.ok('family.remove',{familyId:am.family.id,profileId:bm.id,version:1});
 expect((await b.ok('chat.rooms')).items).toEqual([]);
 for(const [op,data] of [['chat.list',{roomId:room.id}],['chat.send',send(room.id,'재전송')],['items.get',{id:item.id}],['items.delete',{id:item.id,version:1}]] as const)expect((await b.req(api+op,data)).status).toBe(404);
 expect((await a.ok('chat.list',{roomId:room.id})).items[0].id).toBe(item.id);
 expect((await a.ok('chat.rooms')).items[0].canSend).toBe(false);
 expect((await a.req(api+'chat.send',send(room.id,'나간 구성원에게 전송'))).status).toBe(400);
 const invitation=await a.ok('invite.issue',{consent:true});await b.ok('family.join',{code:invitation.code});
 expect((await b.ok('chat.rooms')).items).toEqual([]);
 expect((await b.req(api+'chat.list',{roomId:room.id})).status).toBe(404);
 const next=await a.ok('chat.room.create',create([bm.id]));expect(next.id).not.toBe(room.id);
 expect((await b.ok('chat.list',{roomId:next.id})).items).toEqual([]);
});
it('lets a child create individual and selected-member rooms without adding unselected users',async()=>{
 const {a,b,c,bm,cm}=await group(),child=new Browser(),invitation=await a.ok('invite.issue',{consent:true});
 await child.ok('child.signup',{loginId:'room_child',name:'어린이',password:'child-fixture-password',code:invitation.code});
 const room=await child.ok('chat.room.create',create([bm.id,cm.id],'주말 모임'));
 expect((await child.ok('chat.rooms')).items[0]).toMatchObject({kind:'GROUP',name:'주말 모임'});
 await child.ok('chat.send',send(room.id,'선택한 구성원에게만'));
 for(const member of [b,c])expect((await member.ok('chat.list',{roomId:room.id})).items).toHaveLength(1);
 expect((await a.ok('chat.rooms')).items).toEqual([]);
 expect((await a.req(api+'chat.list',{roomId:room.id})).status).toBe(404);
});
it('validates membership, authentication, CSRF, room identifiers and database permissions',async()=>{
 const {a,am,bm}=await group(),outside=await parent('invalid-outside'),xm=await outside.ok('me');
 for(const members of [[],[am.id],[bm.id,bm.id],[xm.id]])expect((await a.req(api+'chat.room.create',create(members))).status).toBe(400);
 expect((await outside.req(api+'chat.room.create',create([bm.id]))).status).toBe(400);
 expect((await new Browser().req(api+'chat.rooms')).status).toBe(401);
 expect((await a.req(api+'chat.room.create',create([bm.id]),{Origin:'https://outside.example'})).status).toBe(403);
 expect((await a.req(api+'chat.list',{roomId:'bad-id'})).status).toBe(400);
 for(const table of ['workspace_chat_rooms','workspace_chat_members'])await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,`SELECT * FROM app_private.${table}`);})).rejects.toMatchObject({code:'42501'});
 for(const call of ["workspace_room_member(NULL,NULL)","workspace_command_v129('workspace.me','{}')"])await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'SELECT app_private.'+call);})).rejects.toMatchObject({code:'42501'});
});
it('lets an invited participant leave only their own room, preserves default chat and never restores old history',async()=>{
 const {a,b,c,am,bm}=await group(),request=create([bm.id]),room=await a.ok('chat.room.create',request),first=await a.ok('chat.send',send(room.id,'보존할 이전 대화')),own=await b.ok('chat.send',send(room.id,'나가기 전 내 메시지'));
 for(const data of [{},{roomId:null},{roomId:'bad'},{roomId:room.id,profileId:am.id}])expect((await b.req(api+'chat.room.leave',data)).status).toBe(400);
 expect((await new Browser().req(api+'chat.room.leave',{roomId:room.id})).status).toBe(401);expect((await c.req(api+'chat.room.leave',{roomId:room.id})).status).toBe(404);expect((await b.req(api+'chat.room.leave',{roomId:room.id},{Origin:'https://outside.example'})).status).toBe(403);
 expect(await b.ok('chat.room.leave',{roomId:room.id})).toMatchObject({id:room.id,left:true});const [stamp]=await query<{stamp:string}>(database.db,'SELECT left_at::text AS stamp FROM app_private.workspace_chat_members WHERE room_id=$1 AND profile_id=$2',[room.id,bm.id]);expect(stamp.stamp).toBeTruthy();await b.ok('chat.room.leave',{roomId:room.id});expect((await query<{stamp:string}>(database.db,'SELECT left_at::text AS stamp FROM app_private.workspace_chat_members WHERE room_id=$1 AND profile_id=$2',[room.id,bm.id]))[0]).toEqual(stamp);
 expect((await b.ok('chat.rooms')).items).toEqual([]);for(const [op,data] of [['chat.list',{roomId:room.id}],['chat.send',send(room.id,'전송 차단')],['items.get',{id:first.id}],['items.get',{id:own.id}],['items.delete',{id:own.id,version:1}]] as const)expect((await b.req(api+op,data)).status).toBe(404);expect((await b.ok('items.list',{...listing,kind:'CHAT'})).items).toEqual([]);
 expect((await a.ok('chat.list',{roomId:room.id})).items.map((i:{id:string})=>i.id)).toEqual([first.id,own.id]);expect((await a.ok('chat.rooms')).items[0]).toMatchObject({id:room.id,canSend:false});expect((await a.req(api+'chat.send',send(room.id,'나간 사람에게 보내기'))).status).toBe(400);
 expect((await a.ok('chat.room.create',request)).id).toBe(room.id);expect((await b.ok('chat.rooms')).items).toEqual([]);expect((await b.ok('me')).family.id).toBe(am.family.id);await b.ok('chat.send',{text:'기본 단체 대화 유지',clientMessageId:crypto.randomUUID()});expect((await a.ok('chat.list')).items[0].data.note).toBe('기본 단체 대화 유지');
 const next=await b.ok('chat.room.create',create([am.id]));expect(next.id).not.toBe(room.id);expect((await b.ok('chat.list',{roomId:next.id})).items).toEqual([]);expect((await b.ok('chat.rooms')).items.map((r:{id:string})=>r.id)).toEqual([next.id]);expect((await b.req(api+'chat.list',{roomId:room.id})).status).toBe(404);
 await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.workspace_command_v135('workspace.me','{}')");})).rejects.toMatchObject({code:'42501'});
});
it('lets the room creator leave while remaining participants continue without sending updates to the leaver',async()=>{
 const {a,b,c,am,bm,cm}=await group(),room=await a.ok('chat.room.create',create([bm.id,cm.id],'남은 사람 대화'));const first=await a.ok('chat.send',send(room.id,'방장도 나갈 수 있어요'));await a.ok('chat.room.leave',{roomId:room.id});const [before]=await query<{revision:string}>(database.db,"SELECT coalesce((SELECT revision FROM app_private.workspace_menu_updates WHERE profile_id=$1 AND menu='chat'),0)::text AS revision",[am.id]);
 expect((await b.ok('chat.rooms')).items[0].canSend).toBe(true);expect((await b.ok('chat.rooms')).items[0].members.filter((m:{active:boolean})=>m.active)).toHaveLength(2);const next=await b.ok('chat.send',send(room.id,'두 사람은 계속 대화'));expect((await c.ok('chat.list',{roomId:room.id})).items.map((i:{id:string})=>i.id)).toEqual([first.id,next.id]);expect((await a.req(api+'chat.list',{roomId:room.id})).status).toBe(404);
 expect((await query<{revision:string}>(database.db,"SELECT coalesce((SELECT revision FROM app_private.workspace_menu_updates WHERE profile_id=$1 AND menu='chat'),0)::text AS revision",[am.id]))[0]).toEqual(before);expect((await a.ok('me')).family.id).toBe(am.family.id);
 await b.ok('chat.room.leave',{roomId:room.id});expect((await c.ok('chat.rooms')).items[0].canSend).toBe(false);await c.ok('chat.room.leave',{roomId:room.id});expect((await c.ok('chat.rooms')).items).toEqual([]);expect((await a.ok('chat.rooms')).items).toEqual([]);
});
it('allows children to leave optional rooms they joined or created without leaving the sharing group',async()=>{
 const {a,b,c,bm,cm}=await group(),child=new Browser(),invitation=await a.ok('invite.issue',{consent:true});await child.ok('child.signup',{loginId:'leaving_child',name:'나가기 어린이',password:'child-fixture-password',code:invitation.code});const me=await child.ok('me');
 const direct=await a.ok('chat.room.create',create([me.id]));await child.ok('chat.room.leave',{roomId:direct.id});expect((await child.ok('chat.rooms')).items).toEqual([]);
 const own=await child.ok('chat.room.create',create([bm.id,cm.id],'어린이 만든 방'));await child.ok('chat.room.leave',{roomId:own.id});expect((await b.ok('chat.rooms')).items[0].canSend).toBe(true);await c.ok('chat.send',send(own.id,'어린이가 나간 뒤 대화'));expect((await child.req(api+'chat.list',{roomId:own.id})).status).toBe(404);expect((await child.ok('me')).family.id).toBe(me.family.id);await child.ok('chat.send',{text:'기본 단체 대화는 유지',clientMessageId:crypto.randomUUID()});
});
