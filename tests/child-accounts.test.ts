import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {testDatabase} from './helpers/auth-db';
import {createAuthService} from '../server/auth/service';
import {createApp} from '../server/app';
import {FamilyService} from '../server/family/service';
import {query} from '../server/auth/database';
const origin='http://localhost:4173',secret='child-account-isolated-fixture-secret-never-production';
let db:Awaited<ReturnType<typeof testDatabase>>,app:ReturnType<typeof createApp>;
const mails:{to:string;url:string}[]=[];
class Browser{
 cookies=new Map<string,string>();
 async req(path:string,body:object={},headers:Record<string,string>={}){const r=await app.request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; '),...headers},body:JSON.stringify(body)});for(const cookie of r.headers.getSetCookie()){const [part]=cookie.split(';'),i=part.indexOf('=');if(part.slice(i+1))this.cookies.set(part.slice(0,i),part.slice(i+1));else this.cookies.delete(part.slice(0,i));}return r;}
 async ok(path:string,body:object={}){const r=await this.req(path,body);expect(r.status,await r.clone().text()).toBeLessThan(300);return r.json();}
}
async function parent(email:string){const b=new Browser();await b.ok('/api/auth/sign-up/email',{email,name:'가상 보호자',password:'isolated-parent-password',callbackURL:'/login?verified=1'});await app.request(mails.find(m=>m.to===email)!.url);await b.ok('/api/auth/sign-in/email',{email,password:'isolated-parent-password'});return b;}
const api='/api/v1/child-accounts/';
beforeAll(async()=>{db=await testDatabase();for(const f of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await db.engine.exec(await readFile(`db/migrations/${f}`,'utf8'));const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},db.db,{sendMail:async m=>{mails.push(m);},sendSms:async()=>{}});app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>new FamilyService(db.db,secret,'app_runtime'));},30000);
afterAll(async()=>{await db.db.destroy();});
it('requires a real signed-in parent, confirms the exact child and creates a family without review or child email',async()=>{
 const child=new Browser(),p=await parent('child-parent-one@example.test'),other=await parent('child-parent-two@example.test');
 const registered=await child.ok(api+'register',{name:'가상 자녀',password:'child-secret-2026'});expect(registered.code).toMatch(/^\d{6}$/);expect(registered.loginId).toMatch(/^i[a-z0-9]{10}$/);
 expect((await child.req(api+'resolve',{code:registered.code})).status).toBe(401);
 expect((await child.req(api+'finish')).status).toBe(400);
 const resolved=await p.ok(api+'resolve',{code:registered.code});expect(resolved.name).toBe('가상 자녀');
 expect((await p.req(api+'approve',{code:registered.code,requestId:crypto.randomUUID(),consent:true})).status).toBe(400);
 expect((await p.req(api+'approve',{code:registered.code,requestId:resolved.requestId,consent:false})).status).toBe(400);
 const approved=await p.ok(api+'approve',{code:registered.code,requestId:resolved.requestId,consent:true});expect(approved.status).toBe('APPROVED');
 expect((await other.req(api+'approve',{code:registered.code,requestId:resolved.requestId,consent:true})).status).toBe(400);
 const own=await p.ok(api+'parent'),others=await other.ok(api+'parent');expect(own.families[0].children[0].nickname).toBe('가상 자녀');expect(others.families).toEqual([]);
 const invite=await p.ok(`/api/v1/families/${own.families[0].id}/invites`,{});await other.ok('/api/v1/invites/accept',{token:new URL(invite.inviteUrl).hash.slice(1)});const waiting=await other.ok(api+'parent');expect(waiting.families).toEqual([]);expect(waiting.pending).toHaveLength(1);
 expect((await child.ok(api+'status')).status).toBe('APPROVED');
 const signupProof=child.cookies.get('iharu-child-signup')!;
 const finished=await child.req(api+'finish');expect(finished.headers.getSetCookie().join(';')).toContain('HttpOnly');expect((await finished.json()).status).toBe('CONNECTED');
 const deviceCookie=child.cookies.get('iharu-child');expect(deviceCookie).toBeTruthy();
 // Losing the first response and replaying the original signup proof returns the same device session.
 const replay=new Browser();replay.cookies.set('iharu-child-signup',signupProof);await replay.ok(api+'finish');expect(replay.cookies.get('iharu-child')).toBe(deviceCookie);
 const [count]=await query<{n:number}>(db.db,'SELECT count(*)::integer AS n FROM app.child_devices WHERE child_id=$1',[approved.childId]);expect(count.n).toBe(1);
 const [stored]=await query<{password_hash:string;birth_date:null}>(db.db,'SELECT a.password_hash,c.birth_date FROM app_private.child_accounts a JOIN app.children c ON c.id=a.child_id WHERE a.login_id=$1',[registered.loginId]);expect(stored.password_hash).not.toContain('child-secret');expect(stored.birth_date).toBeNull();
 const fresh=new Browser();expect((await fresh.req(api+'login',{loginId:registered.loginId,password:'wrong-password'})).status).toBe(401);
 expect((await fresh.ok(api+'login',{loginId:registered.loginId,password:'child-secret-2026'})).status).toBe('CONNECTED');
 const [consent]=await query<{location:boolean}>(db.db,"SELECT EXISTS(SELECT 1 FROM app.child_consents WHERE child_id=$1 AND purpose='location') AS location",[approved.childId]);expect(consent.location).toBe(false);
 await p.ok(`/api/v1/children/${approved.childId}/consents/revoke`,{purpose:'general',expectedVersion:1});expect((await new Browser().req(api+'login',{loginId:registered.loginId,password:'child-secret-2026'})).status).toBe(400);
});
it('renews and expires codes, prevents role mixing, and rejects forged fields and cross-origin calls',async()=>{
 const c=new Browser(),p=await parent('child-parent-three@example.test');
 const start=await c.ok(api+'register',{name:'동명이인',password:'child-other-2026'});
 const renew=await c.ok(api+'renew');expect(renew.code).not.toBe(start.code);
 expect((await p.req(api+'resolve',{code:start.code})).status).toBe(400);
 await query(db.db,"UPDATE app_private.child_accounts SET code_expires_at=now()-interval '1 second' WHERE login_id=$1",[start.loginId]);
 expect((await p.req(api+'resolve',{code:renew.code})).status).toBe(400);expect((await c.ok(api+'status')).status).toBe('EXPIRED');
 expect((await p.req(api+'register',{name:'혼합',password:'child-other-2026'})).status).toBe(403);
 expect((await c.req(api+'register',{name:'위조',password:'child-other-2026',approved:true})).status).toBe(400);
 expect((await c.req(api+'renew',{}, {Origin:'https://attacker.example'})).status).toBe(403);
 const next=await c.ok(api+'login',{loginId:start.loginId,password:'child-other-2026'});expect(next.status).toBe('WAITING');expect(next.code).toMatch(/^\d{6}$/);
});
it('keeps credentials and approval tables inaccessible to the runtime role',async()=>{
 for(const table of ['child_accounts','parent_declarations'])await expect(db.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,`SELECT * FROM app_private.${table}`);})).rejects.toMatchObject({code:'42501'});
});
