import {legalInitialDraft,legacyLegalDraft,legalPublicationGaps,normalizeLegalDraft,serviceIntroDefault} from '../shared/legal';
import {beforeAll,beforeEach,afterAll,it,expect,describe} from 'vitest';
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
beforeEach(async()=>{await database.engine.exec('TRUNCATE app.families,iharu_auth."user",iharu_auth.verification,iharu_auth.rate_buckets,app_private.system_events,app_private.system_request_logs,app_private.system_member_controls CASCADE');await database.engine.exec("TRUNCATE app_private.legal_publications CASCADE; UPDATE app_private.legal_settings SET draft='{}',version=0,service_draft='{}',service_version=0,service_publication=NULL");mail.length=0;const svc=createAuthService({origin,secret,databaseUrl:'unused',mail:{key:'fixture',from:'test@example.test'},sms:null,social:{}},database.db,{sendMail:async m=>{mail.push(m);},sendSms:async()=>{}});app=createApp({environment:'local',demoEnabled:false},()=>svc,async()=>new FamilyService(database.db,secret,'app_runtime'),undefined,undefined,{legacyInviteFixtures:true});});
afterAll(async()=>{await database.db.destroy();});
const draft={...legalInitialDraft,operatorName:'테스트 운영자',privacyOfficer:'테스트 담당자',contactEmail:'privacy@example.test',children:'검증용 어린이 안내와 법정대리인 확인 절차',processors:'검증용 수탁자 없음',transfers:'검증용 국외 이전 없음',retention:'검증용 탈퇴 시 삭제 기준',reviewNotes:'DO-NOT-PUBLISH-INTERNAL'};
async function legal(b:Browser,op:string,data:object={}){const r=await b.req('/api/v1/legal/'+op,data);expect(r.status,await r.clone().text()).toBe(200);return r.json();}
async function publish(b:Browser,version=0){await legal(b,'admin.save',{version,draft,reason:'테스트 초안 저장'});await b.req('/api/account/reauthenticate',{password});await legal(b,'admin.publish',{version:version+1,reviewed:true,reason:'실제 고지 검토 완료'});return (await legal(b,'state')).publication;}
describe('legal content and privacy operations',{timeout:15000},()=>{
it('keeps drafts private and denies anonymous/ordinary/forged administrative operations',async()=>{const {b:root}=await parent('root',true),{b:user}=await parent('reader');expect((await (await app.request(origin+'/api/v1/legal/public')).json()).publication).toBeNull();expect((await new Browser().req('/api/v1/legal/admin.read')).status).toBe(401);expect((await user.req('/api/v1/legal/admin.read')).status).toBe(403);expect((await root.req('/api/v1/legal/admin.save',{version:0,draft,reason:'변경 사유'},{Origin:'https://bad.example'})).status).toBe(403);await legal(root,'admin.save',{version:0,draft,reason:'검토 중 초안'});expect((await (await app.request(origin+'/api/v1/legal/public')).json()).publication).toBeNull();expect((await root.req('/api/v1/legal/admin.save',{version:0,draft,reason:'충돌 확인'})).status).toBe(409);});
it('refuses incomplete publication and snapshots reviewed documents without internal notes',async()=>{const {b:root}=await parent('root',true);await legal(root,'admin.save',{version:0,draft:legalInitialDraft,reason:'미완료 문서'});await root.req('/api/account/reauthenticate',{password});expect((await root.req('/api/v1/legal/admin.publish',{version:1,reviewed:true,reason:'정보 없는 게시 검증'})).status).toBe(400);const pub=await publish(root,1);expect(pub.version).toBe(1);expect(JSON.stringify(await (await app.request(origin+'/api/v1/legal/public')).json())).not.toContain('DO-NOT-PUBLISH');await legal(root,'admin.save',{version:3,draft:{...draft,operatorName:'다음 초안'},reason:'초안만 변경'});expect((await legal(root,'state')).publication.document.operatorName).toBe('테스트 운영자');});
it('enforces published consent on writes, records versions and invalidates outdated agreement',async()=>{const {b:root}=await parent('root',true),{b:user}=await parent('reader');const pub=await publish(root);expect((await user.req('/api/v1/workspace/items.create',{kind:'NOTE',data:{date:'2026-11-08',title:'보류'}})).status).toBe(403);expect((await user.req('/api/v1/legal/accept',{publicationId:pub.id,terms:true,privacy:false,adult:true})).status).toBe(400);await legal(user,'accept',{publicationId:pub.id,terms:true,privacy:true,adult:true});await legal(user,'accept',{publicationId:pub.id,terms:true,privacy:true,adult:true});expect((await legal(user,'state')).consents).toHaveLength(1);await user.ws('items.create',{kind:'NOTE',data:{date:'2026-11-08',title:'저장'}});await publish(root,2);expect((await user.req('/api/v1/legal/accept',{publicationId:pub.id,terms:true,privacy:true,adult:true})).status).toBe(409);expect((await legal(user,'state')).accepted).toBe(false);});
it('isolates requests by authenticated account and versions administrator responses',async()=>{const {b:root}=await parent('root',true),{b:one}=await parent('requester'),{b:two}=await parent('outsider');const req=await legal(one,'request.create',{kind:'DELETE',detail:'내 계정 삭제를 요청합니다'});expect((await legal(two,'state')).requests).toEqual([]);expect((await one.req('/api/v1/legal/admin.resolve',{id:req.id,version:1,status:'COMPLETED',response:'조치를 마쳤다는 허위 응답',reason:'권한 검사'})).status).toBe(403);await legal(root,'admin.resolve',{id:req.id,version:1,status:'REVIEWING',response:'요청을 접수했으며 본인 확인을 진행합니다.',reason:'본인 확인 필요'});expect((await legal(one,'state')).requests[0]).toMatchObject({status:'REVIEWING',version:2});expect((await root.req('/api/v1/legal/admin.resolve',{id:req.id,version:1,status:'COMPLETED',response:'이미 처리한 오래된 화면에서 저장',reason:'충돌 검증'})).status).toBe(409);});
it('withdrawal records remain available and do not claim deletion completed',async()=>{const {b:root}=await parent('root',true),{b:user}=await parent('reader');const pub=await publish(root);await legal(user,'accept',{publicationId:pub.id,terms:true,privacy:true,adult:true});const item=await user.ws('items.create',{kind:'NOTE',data:{date:'2026-11-08',title:'내 정보'}});const req=await legal(user,'request.create',{kind:'WITHDRAW',detail:'개인정보 처리 동의를 철회합니다'});expect(req.status).toBe('RECEIVED');const s=await legal(user,'state');expect(s.accepted).toBe(false);expect(s.consents[0].withdrawnAt).not.toBeNull();await user.ws('items.delete',{id:item.id,version:item.version});});
it('children can request help but cannot act as adult or administrator, and runtime tables stay private',async()=>{const {b:root}=await parent('root',true);const code=await root.ws('invite.issue',{consent:true}),child=new Browser();await child.ws('child.signup',{loginId:'privacy_child',name:'가상 자녀',password,code:code.code});await legal(child,'request.create',{kind:'COMPLAINT',detail:'내 정보를 지우고 싶어요'});expect((await legal(child,'state')).role).toBe('CHILD');const pub=await publish(root);expect((await child.req('/api/v1/legal/accept',{publicationId:pub.id,terms:true,privacy:true,adult:true})).status).toBe(403);expect((await child.req('/api/v1/legal/admin.requests')).status).toBe(403);for(const table of ['legal_settings','legal_publications','legal_acceptances','privacy_requests']){await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,'SELECT * FROM app_private.'+table);})).rejects.toThrow(/permission denied/);}});

it('saves long Korean legal documents and returns the committed version without a second read',async()=>{
 const {b:root}=await parent('large',true);
 const large={...draft,terms:'가'.repeat(30000),privacy:'나'.repeat(30000),children:'다'.repeat(10000),processors:'라'.repeat(10000),transfers:'마'.repeat(10000),retention:'바'.repeat(10000),reviewNotes:'사'.repeat(10000)};
 expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(120000);
 for(const endpoint of ['/api/auth/sign-in/email','/api/account/reauthenticate'])expect((await root.req(endpoint,{text:'가'.repeat(6000)})).status).toBe(413);
 expect((await root.req('/api/v1/legal/admin.save',{version:0,draft:large,reason:'가'.repeat(200000)})).status).toBe(413);
 const saved=await legal(root,'admin.save',{version:0,draft:large,reason:'긴 한글 문서 저장'});
 expect(saved.status).toBe('SAVED');expect(saved.config.version).toBe(1);expect(saved.config.draft.terms).toHaveLength(30000);
 const second=await legal(root,'admin.save',{version:saved.config.version,draft:{...large,operatorName:'다시 저장한 운영자'},reason:'바로 이어서 저장'});
 expect(second.config.version).toBe(2);expect((await legal(root,'admin.read')).draft.operatorName).toBe('다시 저장한 운영자');
 expect((await root.req('/api/v1/legal/admin.save',{version:2,draft:{...large,businessNumber:'1'.repeat(41)},reason:'입력 제한 검증'})).status).toBe(400);
});
it('reports exact publication gaps and refuses unconfirmed text even through direct API calls',async()=>{
 const {b:root}=await parent('gaps',true);
 await legal(root,'admin.save',{version:0,draft:{...draft,processors:'',transfers:'[확인 필요: 계약 국가]',retention:''},reason:'검토 전 초안 저장'});
 await root.req('/api/account/reauthenticate',{password});
 const result=await root.req('/api/v1/legal/admin.publish',{version:1,reviewed:true,reason:'미확인 문서 게시 시도'});expect(result.status).toBe(400);
 expect((await result.json()).error.fields).toEqual(['processors','transfers','retention']);
 expect((await(await app.request(origin+'/api/v1/legal/public')).json()).publication).toBeNull();
 expect(legalPublicationGaps({...draft,transfers:'[확인 필요: 국가]'}).map(g=>g.field)).toEqual(['transfers']);
 expect(normalizeLegalDraft({...draft,operatorName:'  운영자  '}).operatorName).toBe('운영자');
});
it('independently versions service introduction and keeps private edits out of both public documents and acceptance',async()=>{
 const {b:root}=await parent('intro-admin',true),{b:user}=await parent('intro-reader');
 const pub=await publish(root);await legal(user,'accept',{publicationId:pub.id,terms:true,privacy:true,adult:true});
 expect((await user.req('/api/v1/legal/admin.service.save',{version:0,draft:serviceIntroDefault,reason:'권한 확인'})).status).toBe(403);
 const saved=await legal(root,'admin.service.save',{version:0,draft:{...serviceIntroDefault,title:'새로운 서비스 소개'},reason:'서비스 소개 저장 검증'});
 expect(saved.config.service.version).toBe(1);expect(saved.config.version).toBe(2);
 expect((await(await app.request(origin+'/api/v1/legal/service')).json()).publication).toBeNull();
 expect((await root.req('/api/v1/legal/admin.service.publish',{version:0,reviewed:true,reason:'이전 버전 게시'})).status).toBe(409);
 const posted=await legal(root,'admin.service.publish',{version:1,reviewed:true,reason:'확인한 소개 게시'});expect(posted.status).toBe('PUBLISHED');
 const read=await app.request(origin+'/api/v1/legal/service');expect(read.headers.get('Cache-Control')).toBe('no-store');expect((await read.json()).publication.document.title).toBe('새로운 서비스 소개');
 await legal(root,'admin.service.save',{version:2,draft:{...serviceIntroDefault,title:'공개하면 안 되는 다음 초안'},reason:'다음 버전 비공개 저장'});
 expect((await(await app.request(origin+'/api/v1/legal/service')).json()).publication.document.title).toBe('새로운 서비스 소개');
 const state=await legal(user,'state');expect(state.accepted).toBe(true);expect(state.publication.id).toBe(pub.id);
});
it('upgrades only untouched legacy defaults while preserving custom documents and operator details',async()=>{
 const customized={...legacyLegalDraft,operatorName:'기존 운영자',contactEmail:'real@example.test',terms:'직접 작성한 약관은 보존해야 합니다'};
 await query(database.db,'UPDATE app_private.legal_settings SET draft=$1,version=5',[JSON.stringify(customized)]);
 const migration=await readFile('db/migrations/20261109132148_legal_content_save.sql','utf8');
 await database.engine.exec(migration.slice(migration.indexOf('-- Upgrade only untouched')));
 const [settings]=await query<{draft:typeof draft;version:number}>(database.db,'SELECT draft,version FROM app_private.legal_settings');
 expect(settings.version).toBe(6);expect(settings.draft.operatorName).toBe('기존 운영자');expect(settings.draft.contactEmail).toBe('real@example.test');expect(settings.draft.terms).toBe(customized.terms);expect(settings.draft.privacy).toBe(legalInitialDraft.privacy);expect(settings.draft.processors).toContain('[확인 필요');
 await database.engine.exec(migration.slice(migration.indexOf('-- Upgrade only untouched')));
 expect((await query<{version:number}>(database.db,'SELECT version FROM app_private.legal_settings'))[0].version).toBe(6);
});

});
