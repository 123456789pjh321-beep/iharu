import {Hono} from 'hono';
import {pushSpecs,pushConfig,schedulePushDispatch} from '../push/service.js';
import {bodyLimit} from 'hono/body-limit';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {randomInt} from 'node:crypto';
import {z} from 'zod';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyService,FamilyActor} from '../family/service.js';
import {childPasswordHash,childPasswordMatches} from '../child-accounts/routes.js';
import {workspaceMenus} from '../../shared/workspace-updates.js';
import {chatRoomInput,memberFilterScopes,workspaceItemInput,workspaceKind,workspaceValidationMessage} from '../../shared/workspace.js';
const errors:Record<string,string>={GROUP_REQUIRED:'그룹을 연결한 뒤 대화방을 만들 수 있어요.',ROOM_MEMBER_INVALID:'현재 그룹에 연결된 구성원을 선택해 주세요.',ROOM_READ_ONLY:'대화할 구성원이 그룹에서 나갔어요. 새로운 대화방을 만들어 주세요.',LEGAL_ACCEPTANCE_REQUIRED:'개인정보 관리에서 게시된 이용약관과 개인정보처리방침을 먼저 확인해 주세요.',FEE_PARENT_REQUIRED:'가계부는 일반사용자만 이용할 수 있어요.',FEE_PAYER_INVALID:'현재 연결된 일반사용자를 처리 담당자로 선택해 주세요.',FEE_PAYER_ONLY:'작성자 또는 지정된 담당자만 거래 상태를 바꿀 수 있어요.',ASSIGNEE_INVALID:'현재 연결된 그룹 구성원을 선택해 주세요.',AUTH_REQUIRED:'먼저 로그인해 주세요.',PARENT_REQUIRED:'일반사용자만 승인번호를 발급할 수 있어요.',HOST_ONLY:'이 그룹의 호스트만 번호 발급과 구성원 제외를 할 수 있어요.',HOST_HAS_MEMBERS:'먼저 연결된 구성원을 제외한 뒤 그룹을 나갈 수 있어요.',OWN_CODE:'내가 발급한 번호로 내 그룹에 참여할 수 없어요.',ALREADY_LINKED:'이미 다른 그룹에 연결되어 있어요. 현재 그룹을 나온 뒤 새 번호를 입력해 주세요.',INVITE_INVALID:'승인번호가 만료되었거나 이미 사용됐어요. 일반사용자 호스트에게 새 번호를 받아 주세요.',ID_TAKEN:'이미 사용 중인 어린이 ID예요. 다른 ID를 사용하거나 로그인해 주세요.',LOGIN_INVALID:'어린이 ID 또는 비밀번호가 맞지 않아요.',ROLE_CONFLICT:'일반사용자가 로그인한 기기예요. 어린이 기기에서 가입·로그인해 주세요.',AUTHOR_ONLY:'작성한 사람만 수정·삭제할 수 있어요. 호스트도 다른 사람의 자료를 변경할 수 없어요.',VERSION_CONFLICT:'자료가 먼저 변경됐어요. 새로고침 후 다시 확인해 주세요.',NOT_FOUND:'자료가 없거나 그룹 공유가 해제되었어요.',INVALID_INPUT:'입력한 날짜·시간·금액과 항목을 확인해 주세요.',RATE_LIMITED:'시도 횟수가 많아요. 잠시 후 다시 이용해 주세요.'};
export function workspaceRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();app.use('/api/v1/workspace/*',bodyLimit({maxSize:16384,onError:c=>c.json({error:{code:'INVALID_INPUT',message:errors.INVALID_INPUT}},413)}));
 const empty=z.object({}).strict(),loginId=z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{3,19}$/),password=z.string().max(128),code=z.string().regex(/^\d{6}$/),version=z.number().int().positive();
 const budgetScope={month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),memberIds:z.array(z.uuid()).min(1).max(100).refine(ids=>new Set(ids).size===ids.length)};
 const specs:Record<string,z.ZodType>={'ledger.budget.read':z.object(budgetScope).strict(),'ledger.budget.save':z.object({...budgetScope,amount:z.number().int().min(0).max(1000000000),version:z.number().int().min(0).max(2147483646)}).strict(),...pushSpecs,'chat.rooms':empty,'chat.room.create':chatRoomInput,me:empty,'member-filter.preference.save':z.object({scope:z.enum(memberFilterScopes),memberIds:z.array(z.uuid()).min(1).max(100).refine(ids=>new Set(ids).size===ids.length)}).strict(),'timetable.preference.save':z.union([z.object({memberIds:z.array(z.uuid()).min(1).max(100).refine(ids=>new Set(ids).size===ids.length)}).strict(),z.object({memberId:z.uuid()}).strict()]),logout:empty,'updates.status':empty,'updates.read':z.object({profileId:z.uuid(),menu:z.enum(workspaceMenus),revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)}).strict(),'child.signup':z.object({loginId,name:z.string().trim().min(1).max(24),password:password.min(8),code}).strict(),'child.login':z.object({loginId,password:password.min(1)}).strict(),'invite.issue':z.object({consent:z.literal(true)}).strict(),'family.join':z.object({code,leaveCurrent:z.object({familyId:z.uuid(),version}).strict().optional()}).strict(),'chat.list':z.object({roomId:z.uuid().optional(),limit:z.number().int().min(1).max(100).default(50),before:z.object({createdAt:z.iso.datetime({offset:true}),id:z.uuid()}).strict().optional(),query:z.string().trim().max(100).optional()}).strict(),'chat.send':z.object({roomId:z.uuid().optional(),text:z.string().trim().min(1).max(5000),clientMessageId:z.uuid()}).strict(),'family.remove':z.object({familyId:z.uuid(),profileId:z.uuid(),version}).strict(),'family.leave':z.object({familyId:z.uuid(),version}).strict(),'items.list':z.object({from:z.iso.date(),to:z.iso.date(),kind:workspaceKind.optional()}).strict().refine(x=>x.from<=x.to&&Date.parse(x.to)-Date.parse(x.from)<=370*86400000),'fees.payment':z.object({id:z.uuid(),version,month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),paid:z.boolean()}).strict(),'items.get':z.object({id:z.uuid()}).strict(),'items.create':workspaceItemInput,'items.update':workspaceItemInput.safeExtend({id:z.uuid(),version}),'items.delete':z.object({id:z.uuid(),version}).strict()};
 for(const op of Object.keys(specs))app.post('/api/v1/workspace/'+op,async c=>{
  const fail=(key:string,status:400|401|403|404|409|429|503=400)=>c.json({error:{code:key,message:errors[key]||'자료를 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'},requestId:c.get('requestId')},status);
  const svc=auth();if(!svc)return fail(op.startsWith('child.')?'UNAVAILABLE':'AUTH_REQUIRED',op.startsWith('child.')?503:401);if(c.req.header('Origin')!==svc.settings.origin)return fail('INVALID_INPUT',403);
  const parsed=specs[op].safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return op==='items.create'||op==='items.update'?c.json({error:{code:'INVALID_INPUT',message:workspaceValidationMessage(parsed.error.issues)},requestId:c.get('requestId')},400):fail('INVALID_INPUT');const input=parsed.data as Record<string,unknown>;
  if((op==='push.subscribe'||op==='push.test')&&!pushConfig())return fail('UNAVAILABLE',503);
  try{
   const session=await currentSession(svc,c.req.raw),childAuth=op==='child.signup'||op==='child.login';
   if(childAuth&&session)return fail('ROLE_CONFLICT',403);
   if(session&&(session.guard.assurance!=='HIGH'||!session.user.emailVerified||session.user.email.endsWith('@identity.iharu.invalid')))return fail('AUTH_REQUIRED',401);
   const secure=svc.settings.origin.startsWith('https:'),cookieName=secure?'__Host-iharu-space':'iharu-space',legacyName=secure?'__Host-iharu-child':'iharu-child',cookie={path:'/',httpOnly:true,secure,sameSite:'strict' as const};
   const token=getCookie(c,cookieName),family=await runtime();if(!family)return fail('UNAVAILABLE',503);
   const actor:FamilyActor={requestId:c.get('requestId'),...(session?{memberId:session.guard.member_id,sessionId:session.session.id}:token?{workspaceHash:family.digest(`workspace:${token}`)}:{})};
   if(!childAuth&&!session&&!token)return fail('AUTH_REQUIRED',401);
   const ip=process.env.VERCEL?c.req.header('x-vercel-forwarded-for')||'unknown':'local';
   await svc.policy.takeLimits([{key:`workspace:${childAuth?op:'requests'}:${session?.guard.member_id||ip}`,windowMs:childAuth?600000:60000,limit:childAuth?10:200},...(op==='invite.issue'||op==='family.join'||op==='chat.room.create'?[{key:`workspace:code:${session?.guard.member_id||ip}`,windowMs:600000,limit:20}]:[]),...(op==='child.login'?[{key:`workspace:login:${input.loginId}`,windowMs:600000,limit:10}]:[])]);
   let data={...input},raw='';
   if(childAuth){
    raw=family.token();data={loginId:input.loginId,tokenHash:family.digest(`workspace:${raw}`),deviceHash:family.digest(`device:${raw}`)};
    if(op==='child.signup')data={...data,name:input.name,passwordHash:await childPasswordHash(input.password as string),codeHash:family.digest(`workspace-code:${input.code}`),proofHash:family.digest(`unused-proof:${family.token()}`),unusedCodeHash:family.digest(`unused-code:${family.token()}`)};
    else{
     const credentials=await family.command<{passwordHash?:string}>({requestId:c.get('requestId')},'workspace.credentials',{loginId:input.loginId});
     if(!await childPasswordMatches(input.password as string,credentials.passwordHash||'scrypt:00000000000000000000000000000000:'+''.padStart(128,'0')))return fail('LOGIN_INVALID',401);
     data.passwordHash=credentials.passwordHash;
    }
   }
   if(op==='family.join')data={codeHash:family.digest(`workspace-code:${input.code}`),...(input.leaveCurrent?{leaveCurrent:input.leaveCurrent}:{})};
   if(op==='items.update'&&input.kind==='FEE'){
    const incoming=input.data as Record<string,unknown>;
    if(incoming.ledgerFlow===undefined){
     let existing:{data?:Record<string,unknown>};
     try{existing=await family.command(actor,'workspace.items.get',{id:input.id});}catch(e){const err=e as {message?:string;body?:{code?:string}};if((err.body?.code||err.message)==='NOT_FOUND')return fail('AUTHOR_ONLY',403);throw e;}
     const old=existing.data||{};data={...data,data:{...incoming,...Object.fromEntries(['ledgerFlow','ledgerCategory','ledgerMethod'].filter(key=>old[key]!==undefined).map(key=>[key,old[key]]))}};
    }
   }
   let issued='';if(op==='invite.issue'){issued=String(randomInt(1000000)).padStart(6,'0');data={...data,codeHash:family.digest(`workspace-code:${issued}`)};}
   let result:Record<string,unknown>;
   for(let attempt=0;;attempt++){try{result=await family.command(actor,'workspace.'+op,data);break;}catch(e){if((e as {code?:string}).code!=='23505'||attempt>=2||op!=='invite.issue')throw e;issued=String(randomInt(1000000)).padStart(6,'0');data.codeHash=family.digest(`workspace-code:${issued}`);}}
   if(childAuth){setCookie(c,cookieName,raw,{...cookie,maxAge:30*86400});if(result.legacyDevice)setCookie(c,legacyName,raw,{...cookie,maxAge:30*86400});else deleteCookie(c,legacyName,cookie);return c.json({status:'CONNECTED',name:result.name,loginId:result.loginId});}
   if(op==='logout'){deleteCookie(c,cookieName,cookie);deleteCookie(c,legacyName,cookie);}
   if(['chat.send','items.create','items.update','items.delete','push.test'].includes(op))schedulePushDispatch(family);
   return c.json({...result,...(op.startsWith('push.')?{pushAvailable:!!pushConfig(),publicKey:pushConfig()?.publicKey||null}:{}),...(issued?{code:issued}:{}),serverNow:new Date().toISOString()});
  }catch(e){const err=e as {message?:string;body?:{code?:string};code?:string};const key=err.body?.code||err.message||'';if(key==='ID_TAKEN'||(op==='child.signup'&&err.code==='23505'))return fail('ID_TAKEN',409);if(errors[key])return fail(key,key==='AUTH_REQUIRED'||key==='LOGIN_INVALID'?401:['LEGAL_ACCEPTANCE_REQUIRED','PARENT_REQUIRED','HOST_ONLY','AUTHOR_ONLY','FEE_PARENT_REQUIRED','FEE_PAYER_ONLY'].includes(key)?403:key==='NOT_FOUND'?404:key==='VERSION_CONFLICT'?409:key==='RATE_LIMITED'?429:400);console.error(JSON.stringify({code:'WORKSPACE_FAILED',requestId:c.get('requestId')}));return fail('UNAVAILABLE',503);}
 });return app;
}
