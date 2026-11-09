import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {z} from 'zod';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyService} from '../family/service.js';

const empty=z.object({}).strict(),id=z.uuid(),version=z.number().int().min(0),reason=z.string().trim().min(3).max(300);
const page={page:z.number().int().min(1).max(10000).default(1),pageSize:z.number().int().min(1).max(100).default(12),query:z.string().trim().max(100).default('')};
const period={from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional()};
const specs:Record<string,z.ZodType>={
 access:empty,overview:empty,roles:empty,
 members:z.object({...page,kind:z.enum(['ALL','PARENT','CHILD']).default('ALL'),status:z.enum(['ALL','ACTIVE','SUSPENDED','DELETION_PENDING']).default('ALL')}).strict(),
 member:z.object({id}).strict(),
 history:z.object({...page,...period,category:z.enum(['ALL','ADMIN','MEMBER','FAMILY','SCHEDULE','AUTH','LEGACY']).default('ALL'),targetId:id.optional()}).strict(),
 logs:z.object({...page,...period,level:z.enum(['ALL','INFO','WARN','ERROR']).default('ALL')}).strict(),
 'member.update':z.object({id,version,reason,name:z.string().trim().min(1).max(24).optional(),status:z.enum(['ACTIVE','SUSPENDED']).optional()}).strict().refine(p=>p.name!==undefined||p.status!==undefined),
 'member.sessions.revoke':z.object({id,version,reason}).strict(),
 'role.set':z.object({id,version,reason,active:z.boolean()}).strict(),
};
const messages:Record<string,string>={ADMIN_REQUIRED:'최고관리자만 이용할 수 있습니다.',AUTH_REQUIRED:'로그인이 필요합니다.',INVALID_INPUT:'입력 내용을 확인해 주세요.',REASON_REQUIRED:'변경 사유를 3자 이상 입력해 주세요.',NOT_FOUND:'회원 정보를 찾을 수 없습니다.',VERSION_CONFLICT:'다른 작업으로 정보가 변경됐습니다. 새로고침 후 확인해 주세요.',REAUTH_REQUIRED:'권한을 변경하려면 비밀번호를 다시 확인해 주세요.',LAST_ADMIN:'마지막 최고관리자 권한은 해제할 수 없습니다.',SELF_PROTECTED:'현재 사용 중인 관리자 계정에는 이 작업을 할 수 없습니다.',ADMIN_ACCOUNT_PROTECTED:'최고관리자는 권한을 먼저 해제한 후 이용 정지할 수 있습니다.',MEMBER_NOT_ACTIVE:'탈퇴 처리 중인 계정은 변경할 수 없습니다.',ROLE_TARGET_INVALID:'이메일 인증을 마친 정상 일반사용자 계정만 최고관리자로 지정할 수 있습니다.',RATE_LIMITED:'잠시 후 다시 시도해 주세요.'};
export function adminRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();
 app.use('/api/v1/admin/*',bodyLimit({maxSize:8192,onError:c=>c.json({error:{code:'INVALID_INPUT',message:messages.INVALID_INPUT}},413)}));
 for(const op of Object.keys(specs))app.post('/api/v1/admin/'+op,async c=>{
  const fail=(code:string,status:400|401|403|404|409|429|503)=>c.json({error:{code,message:messages[code]||'관리 정보를 불러오지 못했습니다.'},requestId:c.get('requestId')},status);
  const svc=auth();if(!svc)return fail('AUTH_REQUIRED',401);
  if(c.req.header('Origin')!==svc.settings.origin)return fail('INVALID_INPUT',403);
  const parsed=specs[op].safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return fail('INVALID_INPUT',400);
  try{
   const s=await currentSession(svc,c.req.raw);if(!s)return fail('AUTH_REQUIRED',401);
   if(s.guard.assurance!=='HIGH'||!s.user.emailVerified||s.user.email.endsWith('@identity.iharu.invalid'))return fail('ADMIN_REQUIRED',403);
   await svc.policy.takeLimits([{key:'system-admin:'+s.guard.member_id,windowMs:60000,limit:150}]);
   const family=await runtime();if(!family)return fail('UNAVAILABLE',503);
   const result=await family.command({memberId:s.guard.member_id,sessionId:s.session.id,requestId:c.get('requestId')},'admin.'+op,parsed.data as Record<string,unknown>);
   return c.json(result);
  }catch(e){const err=e as {message?:string;body?:{code?:string}};const code=err.body?.code||err.message||'';
   if(messages[code])return fail(code,code==='AUTH_REQUIRED'?401:code==='NOT_FOUND'?404:code==='VERSION_CONFLICT'?409:code==='RATE_LIMITED'?429:['ADMIN_REQUIRED','REAUTH_REQUIRED'].includes(code)?403:400);
   console.error(JSON.stringify({code:'ADMIN_FAILED',requestId:c.get('requestId')}));return fail('UNAVAILABLE',503);
  }
 });return app;
}
