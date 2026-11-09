import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import type {AuthService} from '../auth/service.js';
import {currentSession} from '../auth/routes.js';
import type {FamilyService} from '../family/service.js';
import {applicationInput,reviewInput,birthDateInput} from '../../shared/guardian-verification.js';
const messages:Record<string,string>={REGISTRATION_NOT_READY:'아이 정보 삭제 기능 준비 후에 등록용 확인을 진행할 수 있어요.',AUTH_REQUIRED:'먼저 로그인해 주세요.',ACCESS_NOT_READY:'이메일 인증을 마친 일반사용자 계정으로 로그인해 주세요.',REAUTH_REQUIRED:'안전한 신청·심사를 위해 내 계정에서 본인 인증을 다시 해 주세요.',FORBIDDEN:'심사 권한이 없거나 담당한 신청이 아니에요.',NOT_FOUND:'신청을 찾을 수 없어요.',VERSION_CONFLICT:'신청 상태가 변경됐어요. 새로고침 후 확인해 주세요.',INVALID_STATE:'현재 상태에서는 처리할 수 없어요. 신청 상태를 다시 확인해 주세요.',EVIDENCE_REQUIRED:'해당 신청인과 아이의 관계를 확인한 심사 기록이 필요해요.',APPLICATION_LIMIT:'진행 중인 신청은 최대 5건이에요.',APPLICATION_DUPLICATE:'같은 구분 이름으로 진행 중인 신청이 있어요. 아래 신청 내역을 확인해 주세요.',EVIDENCE_DUPLICATE:'이미 사용한 심사 기록이에요. 해당 신청의 기록을 확인해 주세요.',RATE_LIMITED:'요청이 많아요. 잠시 후 다시 시도해 주세요.',INVALID_INPUT:'입력 내용을 다시 확인해 주세요.',UNAVAILABLE:'일반사용자 확인에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'};
export function guardianRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();
 app.use('/api/v1/guardian-verification/*',bodyLimit({maxSize:4096,onError:c=>c.json({error:{code:'INVALID_INPUT',message:messages.INVALID_INPUT}},413)}));
 app.all('/api/v1/guardian-verification/:action',async c=>{
  const fail=(code:string,status:400|401|403|404|409|429|503)=>c.json({error:{code,message:messages[code]},requestId:c.get('requestId')},status);
  const svc=auth();if(!svc)return fail('UNAVAILABLE',503);
  const s=await currentSession(svc,c.req.raw);if(!s)return fail('AUTH_REQUIRED',401);
  if(s.guard.assurance!=='HIGH'||!s.user.emailVerified||s.user.email.endsWith('@identity.iharu.invalid'))return fail('ACCESS_NOT_READY',403);
  const action=c.req.param('action'),method=c.req.method;
  if(!((method==='GET'&&['list','queue'].includes(action))||(method==='POST'&&['submit','review','birth-date'].includes(action))))return fail('NOT_FOUND',404);
  if(method==='POST'&&c.req.header('Origin')!==svc.settings.origin)return fail('FORBIDDEN',403);
  let input:Record<string,unknown>={};
  if(method==='POST'){
   const parsed=(action==='submit'?applicationInput:action==='birth-date'?birthDateInput:reviewInput).safeParse(await c.req.json().catch(()=>null));
   if(!parsed.success)return fail('INVALID_INPUT',400);input=parsed.data;
  }
  try{
   if(method==='POST'){
    await svc.policy.requireRecent(s.session.id);
    await svc.policy.takeLimits([{key:`guardian:${s.guard.member_id}`,windowMs:60000,limit:20}]);
   }
   const db=await runtime();if(!db)return fail('UNAVAILABLE',503);
   return c.json(await db.command({memberId:s.guard.member_id,sessionId:s.session.id,requestId:c.get('requestId')},`guardian.${action}`,input));
  }catch(e){
   const err=e as {message?:string;code?:string;body?:{code?:string}};
   const code=err.code==='23505'?'EVIDENCE_DUPLICATE':err.body?.code||err.message||'';
   if(!(code in messages)){console.error(JSON.stringify({code:'GUARDIAN_VERIFICATION_FAILED',requestId:c.get('requestId')}));return fail('UNAVAILABLE',503);}
   return fail(code,code==='NOT_FOUND'?404:['REAUTH_REQUIRED','FORBIDDEN','ACCESS_NOT_READY'].includes(code)?403:code==='RATE_LIMITED'?429:['VERSION_CONFLICT','INVALID_STATE','EVIDENCE_DUPLICATE'].includes(code)?409:400);
  }
 });return app;
}

