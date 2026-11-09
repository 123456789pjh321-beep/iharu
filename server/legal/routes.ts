import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {getCookie} from 'hono/cookie';
import {z} from 'zod';
import {legalDraftSchema,legalFieldLabels,legalRequiredFields,serviceIntroSchema,privacyKinds} from '../../shared/legal.js';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyService} from '../family/service.js';
const empty=z.object({}).strict(),version=z.number().int().min(0),reason=z.string().trim().min(3).max(300);
const specs:Record<string,z.ZodType>={state:empty,accept:z.object({publicationId:z.uuid(),terms:z.literal(true),privacy:z.literal(true),adult:z.literal(true)}).strict(),
 'request.create':z.object({kind:z.enum(Object.keys(privacyKinds) as [string,...string[]]),detail:z.string().trim().min(3).max(2000)}).strict(),
 'admin.read':empty,'admin.save':z.object({version,draft:legalDraftSchema,reason}).strict(),'admin.publish':z.object({version,reviewed:z.literal(true),reason}).strict(),
 'admin.service.save':z.object({version,draft:serviceIntroSchema,reason}).strict(),'admin.service.publish':z.object({version,reviewed:z.literal(true),reason}).strict(),
 'admin.requests':empty,'admin.resolve':z.object({id:z.uuid(),version,status:z.enum(['REVIEWING','COMPLETED','REJECTED']),response:z.string().trim().min(10).max(2000),reason}).strict()};
const messages:Record<string,string>={AUTH_REQUIRED:'로그인이 필요합니다.',ADMIN_REQUIRED:'최고관리자만 이용할 수 있습니다.',INVALID_INPUT:'입력 내용을 확인해 주세요.',VERSION_CONFLICT:'다른 작업으로 변경되었습니다. 입력한 내용은 유지됩니다. 최신 저장본을 확인한 뒤 다시 저장해 주세요.',POLICY_INCOMPLETE:'게시 전에 필수 항목과 확인 필요 표시를 점검해 주세요.',SERVICE_INCOMPLETE:'서비스 소개 제목은 3자 이상, 본문은 20자 이상 작성하고 확인 필요 표시를 해결해 주세요.',POLICY_CHANGED:'동의 문서가 변경되었습니다. 다시 읽고 동의해 주세요.',PARENT_REQUIRED:'법적 동의는 성인 계정에서 진행해 주세요.',REAUTH_REQUIRED:'게시하려면 내 계정에서 본인 인증을 다시 진행해 주세요.',NOT_FOUND:'요청을 찾을 수 없습니다.',RATE_LIMITED:'잠시 후 다시 시도해 주세요.'};
export function legalRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();
 app.use('/api/v1/legal/*',bodyLimit({maxSize:524288,onError:c=>c.json({error:{code:'INVALID_INPUT',message:'문서가 너무 큽니다. 이용약관·처리방침은 각각 30,000자, 나머지 문서는 각각 10,000자 이내로 작성해 주세요.'}},413)}));
 for(const [path,op] of [['public','legal.public'],['service','legal.service.public']])app.get('/api/v1/legal/'+path,async c=>{c.header('Cache-Control','no-store');try{const family=await runtime();if(!family)return c.json({error:{code:'UNAVAILABLE'}},503);return c.json(await family.command({requestId:c.get('requestId')},op,{}));}catch{return c.json({error:{code:'UNAVAILABLE',message:'최신 안내를 불러오지 못했습니다. 다시 시도해 주세요.'}},503);}});
 for(const op of Object.keys(specs))app.post('/api/v1/legal/'+op,async c=>{
  const fail=(code:string,status:400|401|403|404|409|429|503=400)=>c.json({error:{code,message:messages[code]||'요청을 처리하지 못했습니다.'}},status);
  const svc=auth();if(!svc)return fail('AUTH_REQUIRED',401);if(c.req.header('Origin')!==svc.settings.origin)return fail('INVALID_INPUT',403);
  const parsed=specs[op].safeParse(await c.req.json().catch(()=>null));if(!parsed.success){const labels=[...new Set(parsed.error.issues.map(issue=>legalFieldLabels[issue.path[1] as keyof typeof legalFieldLabels]||({'reason':'저장·게시 사유','version':'저장 버전','title':'서비스 소개 제목','body':'서비스 소개 본문'} as Record<string,string>)[String(issue.path.at(-1))]).filter(Boolean))];return c.json({error:{code:'INVALID_INPUT',message:labels.length?labels.join(', ')+'의 형식과 글자 수를 확인해 주세요.':messages.INVALID_INPUT}},400);}
  try{const session=await currentSession(svc,c.req.raw),family=await runtime();if(!family)return fail('UNAVAILABLE',503);
   if(session&&(session.guard.assurance!=='HIGH'||!session.user.emailVerified))return fail('AUTH_REQUIRED',401);
   const token=getCookie(c,svc.settings.origin.startsWith('https:')?'__Host-iharu-space':'iharu-space');if(!session&&!token)return fail('AUTH_REQUIRED',401);
   await svc.policy.takeLimits([{key:'legal:'+ (session?.guard.member_id||family.digest(token||'')),windowMs:60000,limit:op==='request.create'?5:60}]);
   return c.json(await family.command({requestId:c.get('requestId'),...(session?{memberId:session.guard.member_id,sessionId:session.session.id}:{workspaceHash:family.digest(`workspace:${token}`)})},'legal.'+op,parsed.data as Record<string,unknown>));
  }catch(e){const err=e as {message?:string;detail?:string;body?:{code?:string}},code=err.body?.code||err.message||'';if(code==='POLICY_INCOMPLETE'){let fields:string[]=[];try{const raw:unknown=JSON.parse(err.detail||'[]');if(Array.isArray(raw))fields=raw.filter((v):v is keyof typeof legalFieldLabels=>typeof v==='string'&&legalRequiredFields.includes(v as keyof typeof legalFieldLabels));}catch{/* Only known field names may leave the database error. */}return c.json({error:{code,message:messages[code]+(fields.length?' 확인할 항목: '+fields.map(field=>legalFieldLabels[field as keyof typeof legalFieldLabels]).join(', '):''),fields}},400);}if(messages[code])return fail(code,code==='AUTH_REQUIRED'?401:['ADMIN_REQUIRED','PARENT_REQUIRED','REAUTH_REQUIRED'].includes(code)?403:['VERSION_CONFLICT','POLICY_CHANGED'].includes(code)?409:code==='NOT_FOUND'?404:code==='RATE_LIMITED'?429:400);console.error(JSON.stringify({code:'LEGAL_FAILED',requestId:c.get('requestId')}));return fail('UNAVAILABLE',503);}
 });return app;
}
