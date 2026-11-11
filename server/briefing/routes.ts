import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {z} from 'zod';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyService} from '../family/service.js';
import {briefingPreferenceInput,briefingReportInput,briefingReviewInput,briefingSystemInput} from '../../shared/briefing.js';
const specs:Record<string,z.ZodType>={read:z.object({saved:z.boolean().optional(),cursor:z.object({updatedAt:z.iso.datetime({offset:true}),id:z.uuid()}).strict().optional()}).strict(),'preferences.save':briefingPreferenceInput,feedback:z.object({postId:z.uuid(),action:z.enum(['saved','helpful','hidden']),value:z.boolean()}).strict(),'admin.read':z.object({}).strict(),'admin.save':briefingSystemInput,report:briefingReportInput,'admin.reports':z.object({}).strict(),'admin.report.resolve':briefingReviewInput};
const messages:Record<string,string>={AUTH_REQUIRED:'로그인 후 내 브리핑을 확인해 주세요.',PARENT_REQUIRED:'AI 브리핑은 일반사용자 계정에서 이용할 수 있어요.',ADMIN_REQUIRED:'최고관리자만 브리핑을 관리할 수 있어요.',CONSENT_REQUIRED:'AI 활용 동의와 기준 지역을 확인해 주세요.',INVALID_INPUT:'입력 내용을 확인해 주세요.',VERSION_CONFLICT:'설정이 먼저 변경됐어요. 새로고침 후 다시 확인해 주세요.',REAUTH_REQUIRED:'로그인한 계정으로 본인 확인을 다시 진행해 주세요.',NOT_FOUND:'이 항목을 더 이상 확인할 수 없어요. 새로고침해 주세요.',REPORT_RESOLVED:'이미 처리된 신고예요. 목록을 다시 확인해 주세요.',RATE_LIMITED:'잠시 후 다시 시도해 주세요.',LEGAL_ACCEPTANCE_REQUIRED:'개인정보 관리에서 약관을 먼저 확인해 주세요.'};
export function briefingRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();app.use('/api/v1/briefing/*',bodyLimit({maxSize:4096,onError:c=>c.json({error:{code:'INVALID_INPUT',message:messages.INVALID_INPUT}},413)}));
 for(const [op,schema] of Object.entries(specs))app.post('/api/v1/briefing/'+op,async c=>{
  const fail=(code:string,status:400|401|403|404|409|429|503)=>c.json({error:{code,message:messages[code]||'브리핑을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.'}},status);
  const svc=auth();if(!svc)return fail('AUTH_REQUIRED',401);if(c.req.header('Origin')!==svc.settings.origin)return fail('INVALID_INPUT',403);
  const parsed=schema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return fail('INVALID_INPUT',400);
  try{const session=await currentSession(svc,c.req.raw);if(!session)return fail('AUTH_REQUIRED',401);if(session.guard.assurance!=='HIGH'||!session.user.emailVerified)return fail('PARENT_REQUIRED',403);
   await svc.policy.takeLimits([{key:'briefing:'+session.guard.member_id,windowMs:60000,limit:60}]);const family=await runtime();if(!family)return fail('UNAVAILABLE',503);
   return c.json(await family.command({memberId:session.guard.member_id,sessionId:session.session.id,requestId:c.get('requestId')},'briefing.'+op,parsed.data as Record<string,unknown>));
  }catch(e){const err=e as {message?:string;body?:{code?:string}},code=err.body?.code||err.message||'';if(messages[code])return fail(code,code==='AUTH_REQUIRED'?401:code==='NOT_FOUND'?404:['VERSION_CONFLICT','REPORT_RESOLVED'].includes(code)?409:code==='RATE_LIMITED'?429:['ADMIN_REQUIRED','PARENT_REQUIRED','REAUTH_REQUIRED','LEGAL_ACCEPTANCE_REQUIRED'].includes(code)?403:400);console.error(JSON.stringify({code:'BRIEFING_REQUEST_FAILED',requestId:c.get('requestId')}));return fail('UNAVAILABLE',503);}
 });return app;
}
