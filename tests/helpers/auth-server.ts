import {publicPaths} from '../../shared/public-content.js';
// Isolated browser-test entry point. Never imported by the production server or API bundle.
import { Hono } from 'hono';
import { AsyncLocalStorage } from 'node:async_hooks';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile,readdir } from 'node:fs/promises';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer as createHttpsServer} from 'node:https';
import { testDatabase } from './auth-db.js';
import { createAuthService } from '../../server/auth/service.js';
import { FamilyService } from '../../server/family/service.js';
import { query } from '../../server/auth/database.js';
import { createApp } from '../../server/app.js';

// The legal publication suite has its own database so consent gates never affect other suites.
const fixturePort=process.env.IHARU_FIXTURE_PORT==='4175'?4175:4174;
const fixtureOrigin='http://127.0.0.1:'+fixturePort;
const { db,engine }=await testDatabase();
for(const file of (await readdir('db/migrations')).filter(n=>/^\d+_[a-z0-9_]+\.sql$/.test(n)).sort())await engine.exec(await readFile(`db/migrations/${file}`,'utf8'));
await query(db,"UPDATE app_private.family_release SET child_deletion_verified_at=now(),verification_reference='isolated-browser-fixture'");
const outbox:{to:string;url:string;kind:string}[]=[];
const svc=createAuthService({origin:fixtureOrigin,secret:'isolated-browser-fixture-never-use-in-production-001',databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{google:{clientId:'isolated-browser-google',clientSecret:'isolated-browser-only'}}},db,{sendMail:async data=>{outbox.push(data);},sendSms:async()=>{throw new Error('NO_SMS_IN_BROWSER_FIXTURE');}});
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
app.post('/__test__/reauth-state',async c=>{const {email,socialOnly}=await c.req.json();if(typeof email!=='string'||!email.endsWith('@example.test')||typeof socialOnly!=='boolean')return c.json({},400);if(socialOnly)await query(db,'UPDATE iharu_auth.account SET "providerId"=$2,password=NULL WHERE "userId" IN (SELECT id FROM iharu_auth."user" WHERE email=$1)',[email,'google']);await query(db,"UPDATE iharu_auth.session_guard SET reauthenticated_at=now()-interval '10 minutes' WHERE session_id IN (SELECT s.id FROM iharu_auth.session s JOIN iharu_auth.\"user\" u ON u.id=s.\"userId\" WHERE u.email=$1)",[email]);return c.json({ok:true});});
app.post('/__test__/briefing-seed',async c=>{
 const {email}=await c.req.json();if(typeof email!=='string'||!email.endsWith('@example.test'))return c.json({},400);
 const [profile]=await query<{id:string}>(db,'SELECT p.id FROM app_private.workspace_profiles p JOIN iharu_auth."user" u ON u.id=(SELECT auth_user_id FROM iharu_auth.members WHERE id=p.member_id) WHERE u.email=$1',[email]);if(!profile)return c.json({},404);
 const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10),until=new Date(Date.now()+9*3600000+6*86400000).toISOString().slice(0,10);
 const items=[{fingerprint:'1'.repeat(64),contentHash:'2'.repeat(64),category:'FACILITY',title:'방문 전에 도서관 이용 시간을 확인하세요',summary:'등록한 독서 일정과 시설 이용 안내를 함께 확인해요. 출발 전에 공식 공지를 살펴보세요.',reason:'도서관 일정이 등록되어 있어요.',action:'공식 공지에서 운영 시간을 확인해 주세요.',sourceUrl:'https://www.suwon.go.kr/',sourceName:'수원시 공식 공지 (격리 검증)',evidenceQuote:'브라우저 검사를 위한 가상 공지입니다.',validFrom:day,validUntil:until,matchKey:'수원중앙도서관',score:95,urgent:false},{fingerprint:'3'.repeat(64),contentHash:'4'.repeat(64),category:'EVENT',title:'우리 지역 문화 프로그램을 확인해 보세요',summary:'새로운 지역 프로그램을 사진과 함께 확인하는 화면 검증용 소식입니다.',reason:'문화 활동 일정이 있어요.',action:'관심 있는 프로그램을 원문에서 확인해 주세요.',sourceUrl:'https://www.suwon.go.kr/',sourceName:'수원시 문화 소식 (격리 검증)',evidenceQuote:'브라우저 검사를 위한 가상 공지입니다.',validFrom:day,validUntil:until,matchKey:'문화센터',score:85,urgent:false}];
 await query(db,"UPDATE app_private.briefing_preferences SET enabled=true,region='경기도 수원시',consent_version='briefing-2026-11-10-v1',enabled_at=now()-interval '2 days',last_checked_at=now(),last_state='DONE' WHERE profile_id=$1",[profile.id]);
 await query(db,"INSERT INTO app_private.briefing_posts(profile_id,day,kind,region,items,owners) VALUES($1,$2,'REGULAR','경기도 수원시',$3::jsonb,ARRAY[$1::uuid]) ON CONFLICT(profile_id,day,kind) DO UPDATE SET items=excluded.items",[profile.id,day,JSON.stringify(items)]);return c.json({ok:true});
});
app.get('/__test__/mail',c=>c.json(outbox));
// An actual second origin lets bfcache tests navigate without browser request interception,
// which disables the browser cache. The real auth router still issues OAuth state.
const providerOrigin='https://127.0.0.1:'+(fixturePort+100),providerTls=mkdtempSync(join(tmpdir(),'iharu-oauth-fixture-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(providerTls,'key.pem'),'-out',join(providerTls,'cert.pem'),'-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-days','1'],{stdio:'ignore'});
const providerServer=serve({hostname:'127.0.0.1',port:fixturePort+100,createServer:createHttpsServer,serverOptions:{key:readFileSync(join(providerTls,'key.pem')),cert:readFileSync(join(providerTls,'cert.pem'))},fetch:()=>new Response('<p>Isolated external authorization fixture</p>',{headers:{'Content-Type':'text/html; charset=utf-8'}})});
// Vercel serves the public SPA shell separately from private API responses. Match
// that distinction for this cache test; all personal/auth API responses keep no-store.
app.use('/today/calendar',async(c,next)=>{await next();if(c.req.header('x-fixture-oauth-return')==='1'&&c.res.headers.get('Content-Type')?.startsWith('text/html'))c.header('Cache-Control','private, max-age=0, must-revalidate');});
app.use('/api/auth/sign-in/social',async(c,next)=>{await next();if(c.req.header('x-fixture-oauth-return')!=='1'||!c.res.ok)return;const result=await c.res.clone().json();if(typeof result.url!=='string')return;const headers=new Headers(c.res.headers);headers.delete('Content-Length');c.res=new Response(JSON.stringify({...result,url:providerOrigin+'/authorize'}),{status:c.res.status,headers});});
app.route('/',createApp({environment:'local',demoEnabled:false},()=>svc,async()=>family,()=>null,{encryptionKey:()=>'c7'.repeat(32),fetcher:async()=>new Response(JSON.stringify({data:[{id:'isolated-browser-fixture-model'}]}),{status:200})}));
for(const path of publicPaths)app.get(path,serveStatic({path:'./dist'+path+'.html'}));
app.use('*',serveStatic({root:'./dist'}));
app.get('*',serveStatic({path:'./dist/index.html'}));
const server=serve({fetch:app.fetch,hostname:'127.0.0.1',port:fixturePort});
async function stop(){server.close();providerServer.close();rmSync(providerTls,{recursive:true,force:true});await db.destroy();process.exit(0);}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});

