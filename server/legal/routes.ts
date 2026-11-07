import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {getCookie} from 'hono/cookie';
import {z} from 'zod';
import {legalDraftSchema,privacyKinds} from '../../shared/legal.js';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyService} from '../family/service.js';
const empty=z.object({}).strict(),version=z.number().int().min(0),reason=z.string().trim().min(3).max(300);
const specs:Record<string,z.ZodType>={state:empty,accept:z.object({publicationId:z.uuid(),terms:z.literal(true),privacy:z.literal(true),adult:z.literal(true)}).strict(),
 'request.create':z.object({kind:z.enum(Object.keys(privacyKinds) as [string,...string[]]),detail:z.string().trim().min(3).max(2000)}).strict(),
 'admin.read':empty,'admin.save':z.object({version,draft:legalDraftSchema,reason}).strict(),'admin.publish':z.object({version,reviewed:z.literal(true),reason}).strict(),
 'admin.requests':empty,'admin.resolve':z.object({id:z.uuid(),version,status:z.enum(['REVIEWING','COMPLETED','REJECTED']),response:z.string().trim().min(10).max(2000),reason}).strict()};
const messages:Record<string,string>={AUTH_REQUIRED:'로그인이 필요합니다.',ADMIN_REQUIRED:'최고관리자만 이용할 수 있습니다.',INVALID_INPUT:'입력 내용을 확인해 주세요.',VERSION_CONFLICT:'다른 작업으로 변경되었습니다. 다시 불러와 주세요.',POLICY_INCOMPLETE:'운영자·책임자·문의 이메일과 모든 고지 항목을 작성해 주세요.',POLICY_CHANGED:'동의 문서가 변경되었습니다. 다시 읽고 동의해 주세요.',PARENT_REQUIRED:'법적 동의는 성인 계정에서 진행해 주세요.',REAUTH_REQUIRED:'게시하려면 내 계정에서 본인 인증을 다시 진행해 주세요.',NOT_FOUND:'요청을 찾을 수 없습니다.',RATE_LIMITED:'잠시 후 다시 시도해 주세요.'};
export function legalRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();
 app.use('/api/v1/legal/*',bodyLimit({maxSize:120000,onError:c=>c.json({error:{code:'INVALID_INPUT',message:messages.INVALID_INPUT}},413)}));
 app.get('/api/v1/legal/public',async c=>{const family=await runtime();if(!family)return c.json({error:{code:'UNAVAILABLE'}},503);return c.json(await family.command({requestId:c.get('requestId')},'legal.public',{}));});
 for(const op of Object.keys(specs))app.post('/api/v1/legal/'+op,async c=>{
  const fail=(code:string,status:400|401|403|404|409|429|503=400)=>c.json({error:{code,message:messages[code]||'요청을 처리하지 못했습니다.'}},status);
  const svc=auth();if(!svc)return fail('AUTH_REQUIRED',401);if(c.req.header('Origin')!==svc.settings.origin)return fail('INVALID_INPUT',403);
  const parsed=specs[op].safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return fail('INVALID_INPUT');
  try{const session=await currentSession(svc,c.req.raw),family=await runtime();if(!family)return fail('UNAVAILABLE',503);
   if(session&&(session.guard.assurance!=='HIGH'||!session.user.emailVerified))return fail('AUTH_REQUIRED',401);
   const token=getCookie(c,svc.settings.origin.startsWith('https:')?'__Host-iharu-space':'iharu-space');if(!session&&!token)return fail('AUTH_REQUIRED',401);
   await svc.policy.takeLimits([{key:'legal:'+ (session?.guard.member_id||family.digest(token||'')),windowMs:60000,limit:op==='request.create'?5:60}]);
   return c.json(await family.command({requestId:c.get('requestId'),...(session?{memberId:session.guard.member_id,sessionId:session.session.id}:{workspaceHash:family.digest(`workspace:${token}`)})},'legal.'+op,parsed.data as Record<string,unknown>));
  }catch(e){const err=e as {message?:string;body?:{code?:string}},code=err.body?.code||err.message||'';if(messages[code])return fail(code,code==='AUTH_REQUIRED'?401:['ADMIN_REQUIRED','PARENT_REQUIRED','REAUTH_REQUIRED'].includes(code)?403:['VERSION_CONFLICT','POLICY_CHANGED'].includes(code)?409:code==='NOT_FOUND'?404:code==='RATE_LIMITED'?429:400);console.error(JSON.stringify({code:'LEGAL_FAILED',requestId:c.get('requestId')}));return fail('UNAVAILABLE',503);}
 });return app;
}
