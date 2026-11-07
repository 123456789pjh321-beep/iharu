import {Hono,type Context} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {getCookie} from 'hono/cookie';
import {z} from 'zod';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyActor,FamilyService} from '../family/service.js';
import {id,version} from '../../shared/family.js';

import {sendMessage,listMessages,readMessage} from '../../shared/messages.js';
import {readRealtimeConfig,signRealtimeTicket,type RealtimeConfig} from './realtime.js';
import {MessageService} from './service.js';
type Env={Variables:{requestId:string}};
const messages:Record<string,string>={DEVICE_REQUIRED:'기기 연결이 끝났어요. 보호자와 다시 연결해 주세요.',CATALOG_VERSION_UNSUPPORTED:'그림 목록이 바뀌었어요. 그림을 다시 골라 주세요.',CATALOG_ITEM_UNAVAILABLE:'지금 보낼 수 없는 그림이에요. 다른 그림을 골라 주세요.',SYNC_RESET_REQUIRED:'대화를 새로 불러와 주세요.',INVALID_READ_RECEIPT:'화면에 보인 메시지만 읽음으로 남길 수 있어요.',AUTH_REQUIRED:'먼저 로그인하거나 아이 기기를 연결해 주세요.',ACCESS_NOT_READY:'계정 확인과 가족 연결을 먼저 마쳐 주세요.',FORBIDDEN:'이 작업을 할 수 있는 보호자가 확인해 주세요.',NOT_FOUND:'기록이나 공유 범위를 다시 확인해 주세요.',INVALID_INPUT:'입력한 내용과 날짜를 다시 확인해 주세요.',INVALID_RANGE:'기록은 최근 90일 안에서 조회해 주세요.',VERSION_CONFLICT:'가족이 내용을 변경했어요. 새로 불러온 뒤 다시 확인해 주세요.',KEY_REUSED:'이전 요청과 내용이 달라요. 내용을 확인하고 다시 시도해 주세요.',REPEAT_CONFIRM_REQUIRED:'1분 안에 같은 등하원 기록이 있어요. 한 번 더 남길까요?',INVALID_STATE:'현재 상태에서는 진행할 수 없어요. 최신 기록을 확인해 주세요.',INVALID_ASSIGNEE:'일정을 공유받은 가족만 담당할 수 있어요.',PICKUP_EXISTS:'이 일정의 픽업 요청이 이미 있어요.',RATE_LIMITED:'잠시 쉬었다 다시 시도해 주세요.',UNAVAILABLE:'연결이 원활하지 않아요. 입력한 내용은 그대로 두고 다시 시도해 주세요.'};
export function messageRoutes(auth:()=>AuthService|null,runtime:()=>Promise<FamilyService|null>,realtime:()=>RealtimeConfig|null=readRealtimeConfig){
 const app=new Hono<Env>();
 app.use('/api/v1/*',bodyLimit({maxSize:16384,onError:c=>c.json({error:{code:'PAYLOAD_TOO_LARGE',message:'메시지는 2,000자까지 보낼 수 있어요.'}},413)}));
 const fail=(c:Context<Env>,code:string,status:400|401|403|404|409|422|429|503)=>{if(status===429)c.header('Retry-After','60');return c.json({error:{code,message:messages[code]||messages.INVALID_INPUT},meta:{requestId:c.get('requestId'),serverNow:new Date().toISOString()}},status);};
 function endpoint(op:string,schema:z.ZodType,path:(c:Context<Env>)=>Record<string,unknown>,write=false,created=false){return async(c:Context<Env>)=>{
  const svc=auth();if(!svc)return fail(c,'AUTH_REQUIRED',401);
  const session=c.req.header('X-Iharu-Actor')==='child'?null:await currentSession(svc,c.req.raw),actor:FamilyActor={requestId:c.get('requestId')};
  if(session&&(session.guard.assurance!=='HIGH'||!session.user.emailVerified||!session.guard.access_ready||session.user.email.endsWith('@identity.iharu.invalid')))return fail(c,'ACCESS_NOT_READY',403);
  const family=await runtime();if(!family)return fail(c,'UNAVAILABLE',503);
  if(session){if(session.guard.assurance!=='HIGH'||!session.user.emailVerified||!session.guard.access_ready||session.user.email.endsWith('@identity.iharu.invalid'))return fail(c,'ACCESS_NOT_READY',403);actor.memberId=session.guard.member_id;actor.sessionId=session.session.id;}
  else{const token=getCookie(c,svc.settings.origin.startsWith('https:')?'__Host-iharu-child':'iharu-child');if(!token)return fail(c,'AUTH_REQUIRED',401);actor.deviceHash=family.digest(`device:${token}`);}
  if(write&&c.req.header('Origin')!==svc.settings.origin)return fail(c,'FORBIDDEN',403);
  let raw:unknown;try{raw=write?await c.req.json():c.req.query();}catch{return fail(c,'INVALID_INPUT',400);}
  if(op==='send'&&raw&&typeof raw==='object'&&!('kind' in raw))raw={...raw,kind:'TEXT'};
  const input=schema.safeParse(raw),params=path(c);if(!input.success||Object.values(params).some(v=>!id.safeParse(v).success))return fail(c,'INVALID_INPUT',422);
  const key=c.req.header('Idempotency-Key');if(write&&(!key||!/^[-a-zA-Z0-9_]{8,128}$/.test(key)))return fail(c,'INVALID_INPUT',422);
  try{
   if(actor.deviceHash)await family.command(actor,'child.session');
   if(write)await svc.policy.takeLimits([{key:`message:${actor.memberId||actor.deviceHash}`,windowMs:60000,limit:60}]);
   const result=await new MessageService(family).command(actor,op,{...(input.data as object),...params,...(write?{key}:{})});if(op==='realtime'){const config=realtime();return c.json({data:config?signRealtimeTicket(result,config):{state:'POLLING'}});}
   return c.json(result,created?201:200);
  }catch(e){const error=e as {message?:string;code?:string;constraint?:string;body?:{code?:string}};let code=error.body?.code||error.message||'';
   if(['23514','23503','22P02','22007','22008'].includes(error.code||''))code='INVALID_INPUT';if(error.code==='23505')code=error.constraint==='one_active_pickup'?'PICKUP_EXISTS':'KEY_REUSED';
   if(messages[code])return fail(c,code,code==='DEVICE_REQUIRED'?401:code==='NOT_FOUND'?404:code==='FORBIDDEN'?403:code==='RATE_LIMITED'?429:code==='ACCESS_NOT_READY'?403:['VERSION_CONFLICT','KEY_REUSED','SYNC_RESET_REQUIRED','CATALOG_VERSION_UNSUPPORTED'].includes(code)?409:422);
   console.error(JSON.stringify({code:'MESSAGE_COMMAND_FAILED',requestId:c.get('requestId')}));return fail(c,'UNAVAILABLE',503);
  }
 };}
 app.get('/api/v1/notifications',endpoint('notifications.list',z.object({before:id.optional()}).strict(),()=>({})));
 app.put('/api/v1/notifications/:id/read',endpoint('notifications.read',z.object({expectedVersion:version}).strict(),c=>({id:c.req.param('id')}),true));
 const empty=z.object({}).strict(),child=(c:Context<Env>)=>({childId:c.req.param('childId')});
 app.post('/api/v1/children/:childId/realtime-token',endpoint('realtime',empty,child,true));
 app.get('/api/v1/chat-rooms',endpoint('rooms',empty,()=>({})));
 app.get('/api/v1/children/:childId/messages',endpoint('list',listMessages,child));
 app.get('/api/v1/children/:childId/message-changes',endpoint('changes',z.object({cursor:id,limit:z.coerce.number().int().min(1).max(50).optional()}).strict(),child));
 app.post('/api/v1/children/:childId/messages',endpoint('send',sendMessage,child,true,true));
 app.put('/api/v1/children/:childId/read-cursor',endpoint('read',readMessage,child,true));
 app.delete('/api/v1/messages/:id',endpoint('delete',z.object({expectedVersion:version}).strict(),c=>({id:c.req.param('id')}),true));
 return app;
}

