import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {testDatabase} from './helpers/auth-db';
import {createAuthService} from '../server/auth/service';
import {createApp} from '../server/app';
import {FamilyService} from '../server/family/service';
import {query} from '../server/auth/database';
const origin='http://localhost:4173',secret='admin-fixture-only-not-a-production-secret-0001',password='admin-fixture-password-2026';
let database:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
const mail:{to:string;url:string}[]=[];
class Browser{
 cookies=new Map<string,string>();
 async req(path:string,data:object={},headers:Record<string,string>={}){const r=await app.request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...headers},body:JSON.stringify(data)});for(const cookie of r.headers.getSetCookie()){const [v]=cookie.split(';'),n=v.indexOf('=');if(v.slice(n+1))this.cookies.set(v.slice(0,n),v.slice(n+1));else this.cookies.delete(v.slice(0,n));}return r;}
 async ws(op:string,data:object={}){const r=await this.req('/api/v1/workspace/'+op,data);expect(r.status,await r.clone().text()).toBeLessThan(300);return r.json();}
 async admin(op:string,data:object={}){const r=await this.req('/api/v1/admin/'+op,data);expect(r.status,await r.clone().text()).toBe(200);return r.json();}
}
async function parent(name:string,admin=false){const b=new Browser(),email=name+'@example.test';expect((await b.req('/api/auth/sign-up/email',{name,email,password,callbackURL:'/login?verified=1'})).ok).toBe(true);await app.request(mail.find(m=>m.to===email)!.url);const login=await b.req('/api/auth/sign-in/email',{email,password});expect(login.ok,await login.clone().text()).toBe(true);await b.ws('me');
 const [m]=await query<{id:string}>(database.db,'SELECT m.id FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE u.email=$1',[email]);if(admin)await query(database.db,'INSERT INTO app_private.system_admins(member_id) VALUES($1)',[m.id]);return {b,id:m.id,email};}
beforeAll(async()=>{database=await testDatabase();for(const file of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await database.engine.exec(await readFile('db/migrations/'+file,'utf8'));},30000);
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets,app_private.system_events,app_private.system_request_logs,app_private.system_member_controls CASCADE');mail.length=0;const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>new FamilyService(database.db,secret,'app_runtime'));});
afterAll(async()=>{await database.db.destroy();});
it('denies anonymous, ordinary parent, family host, child and forged role claims',async()=>{
 const {b:root}=await parent('root',true),{b:host}=await parent('host');
 expect((await new Browser().req('/api/v1/admin/overview')).status).toBe(401);expect(await host.admin('access')).toEqual({allowed:false});
 const code=await host.ws('invite.issue',{consent:true}),child=new Browser();await child.ws('child.signup',{loginId:'admin_child',name:'자녀',password,code:code.code});
 for(const b of [host,child])expect((await b.req('/api/v1/admin/members')).status).toBe(b===child?401:403);
 expect((await host.req('/api/v1/admin/overview',{role:'SUPER_ADMIN'})).status).toBe(400);
 expect((await root.req('/api/v1/admin/members',{}, {Origin:'https://attacker.example'})).status).toBe(403);
 expect((await root.admin('access')).allowed).toBe(true);
});
it('groups all related parents and children while searching a family member, and includes unlinked accounts',async()=>{
 const {b:root}=await parent('root',true),{b:other}=await parent('second'),{id:solo}=await parent('solo');
 const invite=await root.ws('invite.issue',{consent:true});await other.ws('family.join',{code:invite.code});const next=await root.ws('invite.issue',{consent:true}),child=new Browser();await child.ws('child.signup',{loginId:'group_child',name:'가상 서하',password,code:next.code});
 const result=await root.admin('members',{query:'가상 서하'});expect(result.matchedMembers).toBe(1);expect(result.groups).toHaveLength(1);expect(result.groups[0].members).toHaveLength(3);expect(result.groups[0].members[0].host).toBe(true);
 expect((await root.admin('members',{query:'solo'})).groups[0].members[0].id).toBe(solo);
 const overview=await root.admin('overview');expect(overview).toMatchObject({members:4,parents:3,children:1,families:1,admins:1});
});
it('grants and revokes system roles with fresh authentication and immediate session authorization checks',async()=>{
 const {b:root,id:rootId}=await parent('root',true),{b:target,id}=await parent('target');
 expect((await root.req('/api/v1/admin/role.set',{id:rootId,version:1,active:false,reason:'마지막 관리자 해제 검증'})).status).toBe(400);
 await root.req('/api/account/reauthenticate',{password});
 const granted=await root.admin('role.set',{id,version:0,active:true,reason:'운영 담당자 권한 부여'});expect(granted.superAdmin).toBe(true);expect((await target.admin('access')).allowed).toBe(true);
 expect((await root.req('/api/v1/admin/role.set',{id,version:0,active:false,reason:'오래된 화면 충돌 검증'})).status).toBe(409);
 await root.admin('role.set',{id,version:1,active:false,reason:'운영 담당 종료로 해제'});expect((await target.admin('access')).allowed).toBe(false);expect((await target.req('/api/v1/admin/logs')).status).toBe(403);
 const history=await root.admin('history',{category:'ADMIN',targetId:id});expect(history.items).toHaveLength(2);expect(history.items[0].reason).toBe('운영 담당 종료로 해제');
});
it('updates member names with optimistic locking and requires an auditable reason',async()=>{
 const {b:root}=await parent('root',true),{b:target,id}=await parent('target');
 expect((await root.req('/api/v1/admin/member.update',{id,version:0,name:'새 이름',reason:'x'})).status).toBe(400);
 const changed=await root.admin('member.update',{id,version:0,name:'수정된 이름',reason:'회원 요청에 따른 이름 변경'});expect(changed).toMatchObject({name:'수정된 이름',version:1});expect((await target.ws('me')).name).toBe('수정된 이름');
 expect((await root.req('/api/v1/admin/member.update',{id,version:0,name:'충돌',reason:'동시 변경 충돌 검증'})).status).toBe(409);
 const h=await root.admin('history',{targetId:id});expect(h.items[0].details).toEqual({before:{name:'target',status:'ACTIVE',superAdmin:false},after:{name:'수정된 이름',status:'ACTIVE',superAdmin:false}});
});
it('suspends and restores a parent while preserving data and preventing administrator lockout',async()=>{
 const {b:root,id:rootId}=await parent('root',true),{b:target,id,email}=await parent('target');
 const item=await target.ws('items.create',{kind:'NOTE',data:{title:'보존할 메모',date:'2026-11-08'}});
 await root.admin('member.update',{id,version:0,status:'SUSPENDED',reason:'이용 정지 기능 검증'});expect((await target.req('/api/v1/workspace/me')).status).toBe(401);
 await root.admin('member.update',{id,version:1,status:'ACTIVE',reason:'이용 재개 기능 검증'});await target.req('/api/auth/sign-in/email',{email,password});expect((await target.ws('items.get',{id:item.id})).data.title).toBe('보존할 메모');
 expect((await root.req('/api/v1/admin/member.update',{id:rootId,version:0,status:'SUSPENDED',reason:'자기 계정 보호 검증'})).status).toBe(400);
 expect((await root.req('/api/v1/admin/member.sessions.revoke',{id:rootId,version:0,reason:'현재 관리자 세션 보호'})).status).toBe(400);
 const before=await root.admin('member',{id});await root.admin('member.sessions.revoke',{id,version:before.version,reason:'분실 기기 세션 종료 검증'});expect((await target.req('/api/v1/workspace/me')).status).toBe(401);
});
it('suspends child sessions and password login, then restores access without deleting family records',async()=>{
 const {b:root}=await parent('root',true),child=new Browser();const code=await root.ws('invite.issue',{consent:true});await child.ws('child.signup',{loginId:'pause_child',name:'정지 검증 자녀',password,code:code.code});
 const list=await root.admin('members',{query:'pause_child'}),m=list.groups[0].members.find((x:{kind:string})=>x.kind==='CHILD');
 await root.admin('member.update',{id:m.id,version:0,status:'SUSPENDED',reason:'자녀 계정 보호 검증'});expect((await child.req('/api/v1/workspace/me')).status).toBe(401);expect((await new Browser().req('/api/v1/workspace/child.login',{loginId:'pause_child',password})).status).toBe(401);
 await root.admin('member.update',{id:m.id,version:1,status:'ACTIVE',reason:'자녀 계정 정상 이용 재개'});const fresh=new Browser();await fresh.ws('child.login',{loginId:'pause_child',password});expect((await fresh.ws('me')).family).not.toBeNull();
});
it('records request outcomes without request bodies or credential data, and denies direct table/helper access',async()=>{
 const {b:root}=await parent('root',true);const marker='never-log-this-secret-637281';await new Browser().req('/api/auth/sign-in/email',{email:'missing@example.test',password:marker});
 const logs=await root.admin('logs');expect(logs.items.some((x:{status:number})=>x.status===401)).toBe(true);expect(JSON.stringify(logs)).not.toContain(marker);expect(logs.items.every((x:{requestId:string})=>x.requestId)).toBe(true);
 for(const statement of ['SELECT * FROM app_private.system_admins','SELECT * FROM app_private.system_member_directory','SELECT * FROM app_private.system_events','SELECT * FROM app_private.system_request_logs',"SELECT app_private.system_member_json('00000000-0000-0000-0000-000000000001')","SELECT app_private.workspace_command_v82('workspace.me','{}')","SELECT app_private.child_account_command_v82('childaccount.parent','{}')"]){await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,statement);})).rejects.toMatchObject({code:'42501'});}
});
it('rejects stale reauthentication and unverified role targets',async()=>{
 const {b:root}=await parent('root',true),{id}=await parent('target');await query(database.db,"UPDATE iharu_auth.session_guard SET reauthenticated_at=now()-interval '10 minutes'");
 expect((await root.req('/api/v1/admin/role.set',{id,version:0,active:true,reason:'재인증 만료 검증'})).status).toBe(403);await root.req('/api/account/reauthenticate',{password});
 await query(database.db,'UPDATE iharu_auth."user" SET "emailVerified"=false WHERE id=(SELECT auth_user_id FROM iharu_auth.members WHERE id=$1)',[id]);expect((await root.req('/api/v1/admin/role.set',{id,version:0,active:true,reason:'미인증 계정 권한 검증'})).status).toBe(400);
});
