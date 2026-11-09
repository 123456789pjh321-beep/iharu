import {Hono,type Context} from 'hono';
import {getCookie} from 'hono/cookie';
import {z} from 'zod';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyActor,FamilyService} from '../family/service.js';
import {id,version} from '../../shared/family.js';
import {localDate} from '../../shared/schedules.js';
import {checkinInput,correctionInput,taskInput,taskEditInput,taskActionInput,learningInput,learningEditInput,pickupInput,pickupActionInput,recordRange} from '../../shared/daily.js';
import {DailyService} from './service.js';
type Env={Variables:{requestId:string}};
const messages:Record<string,string>={DEVICE_REQUIRED:'기기 연결이 끝났어요. 일반사용자와 다시 연결해 주세요.',AUTH_REQUIRED:'먼저 로그인하거나 아이 기기를 연결해 주세요.',ACCESS_NOT_READY:'계정 확인과 그룹 연결을 먼저 마쳐 주세요.',FORBIDDEN:'이 작업을 할 수 있는 일반사용자가 확인해 주세요.',NOT_FOUND:'기록이나 공유 범위를 다시 확인해 주세요.',INVALID_INPUT:'입력한 내용과 날짜를 다시 확인해 주세요.',INVALID_RANGE:'기록은 최근 90일 안에서 조회해 주세요.',VERSION_CONFLICT:'그룹이 내용을 변경했어요. 새로 불러온 뒤 다시 확인해 주세요.',KEY_REUSED:'이전 요청과 내용이 달라요. 내용을 확인하고 다시 시도해 주세요.',REPEAT_CONFIRM_REQUIRED:'1분 안에 같은 등하원 기록이 있어요. 한 번 더 남길까요?',INVALID_STATE:'현재 상태에서는 진행할 수 없어요. 최신 기록을 확인해 주세요.',INVALID_ASSIGNEE:'일정을 공유받은 그룹만 담당할 수 있어요.',PICKUP_EXISTS:'이 일정의 픽업 요청이 이미 있어요.',RATE_LIMITED:'잠시 쉬었다 다시 시도해 주세요.',UNAVAILABLE:'연결이 원활하지 않아요. 입력한 내용은 그대로 두고 다시 시도해 주세요.'};
export function dailyRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>){
 const app=new Hono<Env>();
 const fail=(c:Context<Env>,code:string,status:400|401|403|404|409|422|429|503)=>{if(status===429)c.header('Retry-After','60');return c.json({error:{code,message:messages[code]||messages.INVALID_INPUT},meta:{requestId:c.get('requestId'),serverNow:new Date().toISOString()}},status);};
 function endpoint(op:string,schema:z.ZodType,path:(c:Context<Env>)=>Record<string,unknown>,write=false,created=false){return async(c:Context<Env>)=>{
  const svc=auth();if(!svc)return fail(c,'AUTH_REQUIRED',401);
  const family=await runtime();if(!family)return fail(c,'UNAVAILABLE',503);
  const session=c.req.header('X-Iharu-Actor')==='child'?null:await currentSession(svc,c.req.raw),actor:FamilyActor={requestId:c.get('requestId')};
  if(session){if(session.guard.assurance!=='HIGH'||!session.user.emailVerified||!session.guard.access_ready||session.user.email.endsWith('@identity.iharu.invalid'))return fail(c,'ACCESS_NOT_READY',403);actor.memberId=session.guard.member_id;actor.sessionId=session.session.id;}
  else{const token=getCookie(c,svc.settings.origin.startsWith('https:')?'__Host-iharu-child':'iharu-child');if(!token)return fail(c,'AUTH_REQUIRED',401);actor.deviceHash=family.digest(`device:${token}`);}
  if(write&&c.req.header('Origin')!==svc.settings.origin)return fail(c,'FORBIDDEN',403);
  let raw:unknown;try{raw=write?await c.req.json():c.req.query();}catch{return fail(c,'INVALID_INPUT',400);}
  const input=schema.safeParse(raw),params=path(c);if(!input.success||Object.values(params).some(v=>!id.safeParse(v).success))return fail(c,'INVALID_INPUT',422);
  const key=c.req.header('Idempotency-Key');if(write&&(!key||!/^[-a-zA-Z0-9_]{8,128}$/.test(key)))return fail(c,'INVALID_INPUT',422);
  try{
   if(actor.deviceHash)await family.command(actor,'child.session');
   if(write)await svc.policy.takeLimits([{key:`daily:${actor.memberId||actor.deviceHash}`,windowMs:60000,limit:60}]);
   const result=await new DailyService(family).command(actor,op,{...(input.data as object),...params,...(write?{key}:{})});return c.json(result,created?201:200);
  }catch(e){const error=e as {message?:string;code?:string;constraint?:string;body?:{code?:string}};let code=error.body?.code||error.message||'';
   if(['23514','23503','22P02','22007','22008'].includes(error.code||''))code='INVALID_INPUT';if(error.code==='23505')code=error.constraint==='one_active_pickup'?'PICKUP_EXISTS':'KEY_REUSED';
   if(messages[code])return fail(c,code,code==='DEVICE_REQUIRED'?401:code==='NOT_FOUND'?404:code==='FORBIDDEN'?403:code==='RATE_LIMITED'?429:code==='ACCESS_NOT_READY'?403:['VERSION_CONFLICT','KEY_REUSED','REPEAT_CONFIRM_REQUIRED','INVALID_STATE','PICKUP_EXISTS'].includes(code)?409:422);
   console.error(JSON.stringify({code:'DAILY_COMMAND_FAILED',requestId:c.get('requestId')}));return fail(c,'UNAVAILABLE',503);
  }
 };}
 const empty=z.object({}).strict(),child=(c:Context<Env>)=>({childId:c.req.param('childId')}),target=(c:Context<Env>)=>({id:c.req.param('id')});
 app.get('/api/v1/families/:familyId/today',endpoint('today',z.object({date:localDate.optional(),childId:id.optional()}).strict(),c=>({familyId:c.req.param('familyId')})));
 app.get('/api/v1/children/:childId/today',endpoint('child.today',z.object({date:localDate.optional()}).strict(),child));
 app.get('/api/v1/children/:childId/daily-members',endpoint('members',empty,child));
 app.post('/api/v1/children/:childId/checkins',endpoint('checkin.create',checkinInput,child,true,true));
 app.post('/api/v1/checkins/:id/corrections',endpoint('checkin.correct',correctionInput,target,true,true));
 app.get('/api/v1/children/:childId/records',endpoint('records',recordRange,child));
 for(const [route,kind] of [['tasks','task'],['learning-entries','learning'],['pickups','pickup'],['checkins','checkin']] as const){
  app.get(`/api/v1/${route}/:id`,endpoint(`${kind}.get`,empty,target));
  if(kind!=='checkin')app.get(`/api/v1/children/:childId/${route}`,endpoint(`${kind}.list`,recordRange,child));
 }
 app.post('/api/v1/children/:childId/tasks',endpoint('task.create',taskInput,child,true,true));
 app.patch('/api/v1/tasks/:id',endpoint('task.edit',taskEditInput,target,true));
 app.post('/api/v1/tasks/:id/actions',endpoint('task.action',taskActionInput,target,true));
 app.post('/api/v1/children/:childId/learning-entries',endpoint('learning.create',learningInput,child,true,true));
 app.patch('/api/v1/learning-entries/:id',endpoint('learning.edit',learningEditInput,target,true));
 app.delete('/api/v1/learning-entries/:id',endpoint('learning.delete',z.object({expectedVersion:version}).strict(),target,true));
 app.post('/api/v1/children/:childId/pickups',endpoint('pickup.create',pickupInput,child,true,true));
 app.post('/api/v1/pickups/:id/actions',endpoint('pickup.action',pickupActionInput,target,true));
 return app;
}

