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
 for(const user of [a,b,c])expect((await user.ok('items.list',listing)).items).toHaveLength(3);
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
