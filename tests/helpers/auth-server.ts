// Isolated browser-test entry point. Never imported by the production server or API bundle.
import { Hono } from 'hono';
import { AsyncLocalStorage } from 'node:async_hooks';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile,readdir } from 'node:fs/promises';
import { testDatabase } from './auth-db.js';
import { createAuthService } from '../../server/auth/service.js';
import { FamilyService } from '../../server/family/service.js';
import { query } from '../../server/auth/database.js';
import { createApp } from '../../server/app.js';

const { db,engine }=await testDatabase();
for(const file of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await engine.exec(await readFile(`db/migrations/${file}`,'utf8'));
await query(db,"UPDATE app_private.family_release SET child_deletion_verified_at=now(),verification_reference='isolated-browser-fixture'");
const outbox:{to:string;url:string;kind:string}[]=[];
const svc=createAuthService({origin:'http://127.0.0.1:4174',secret:'isolated-browser-fixture-never-use-in-production-001',databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},db,{sendMail:async data=>{outbox.push(data);},sendSms:async()=>{throw new Error('NO_SMS_IN_BROWSER_FIXTURE');}});
// Named fixture clients represent separate test devices' IP buckets. The production
// policy and quotas stay intact; this entry point is never shipped in the API bundle.
const fixtureClient=new AsyncLocalStorage<string>();
const takeLimits=svc.policy.takeLimits.bind(svc.policy);
svc.policy.takeLimits=rules=>takeLimits(rules.map(rule=>fixtureClient.getStore()&&rule.key.endsWith(':local')?{...rule,key:rule.key+':fixture:'+fixtureClient.getStore()}:rule));
const family=new FamilyService(db,svc.settings.secret,'app_runtime');
const app=new Hono();
// PGlite is a single SQL connection. Serialize whole fixture requests, not nested auth hooks.
// Actual multi-connection contention is a separate Supabase integration check.
let queue=Promise.resolve(),lastAuthAt=0;
app.use('*',async(c,next)=>{const previous=queue;let unlock!:()=>void;queue=new Promise<void>(r=>{unlock=r;});await previous;try{
 // All unrelated browser fixtures share the local IP bucket (60 auth requests/minute).
 // Pace fixture requests within the real limit rather than weakening production policy.
 if(c.req.method==='POST'&&c.req.path.startsWith('/api/auth/')){const delay=1100-(Date.now()-lastAuthAt);if(delay>0)await new Promise(r=>setTimeout(r,delay));lastAuthAt=Date.now();}
 const client=c.req.header('x-fixture-client');
 if(client&&/^[a-z0-9-]{1,64}$/.test(client))await fixtureClient.run(client,()=>next());else await next();}finally{unlock();}});
app.post('/__test__/ready',async c=>{const {email}=await c.req.json();if(typeof email!=='string'||!email.endsWith('@example.test'))return c.json({},400);await query(db,'UPDATE iharu_auth.members SET access_ready=true WHERE auth_user_id IN (SELECT id FROM iharu_auth."user" WHERE email=$1)',[email]);return c.json({ok:true});});
app.post('/__test__/verify-draft',async c=>{const {draftId,birthDate='2018-03-02'}=await c.req.json();if(!['2018-03-02','2019-03-02'].includes(birthDate))return c.json({},400);await query(db,"SELECT app_private.record_relationship_result($1,$2,$3,$4::date,'virtual-browser-fixture',true)",[draftId,crypto.randomUUID(),crypto.randomUUID(),birthDate]);return c.json({ok:true});});
app.post('/__test__/reviewer',async c=>{const {email}=await c.req.json();if(typeof email!=='string'||!email.endsWith('@example.test'))return c.json({},400);await query(db,'INSERT INTO app_private.guardian_reviewers(member_id) SELECT m.id FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE u.email=$1 ON CONFLICT DO NOTHING',[email]);return c.json({ok:true});});
app.post('/__test__/system-admin',async c=>{const {email}=await c.req.json();if(typeof email!=='string'||!email.endsWith('@example.test'))return c.json({},400);await query(db,'INSERT INTO app_private.system_admins(member_id) SELECT m.id FROM iharu_auth.members m JOIN iharu_auth."user" u ON u.id=m.auth_user_id WHERE u.email=$1 AND u."emailVerified" ON CONFLICT DO NOTHING',[email]);return c.json({ok:true});});
app.get('/__test__/mail',c=>c.json(outbox));
app.route('/',createApp({environment:'local',demoEnabled:false},()=>svc,async()=>family));
app.get('/service',serveStatic({path:'./dist/service.html'}));
app.get('/guide',serveStatic({path:'./dist/guide.html'}));
app.use('*',serveStatic({root:'./dist'}));
app.get('*',serveStatic({path:'./dist/index.html'}));
const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:4174});
async function stop(){server.close();await db.destroy();process.exit(0);}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});

