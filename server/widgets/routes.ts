import {createCipheriv,createDecipheriv,createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {z} from 'zod';
import {currentSession} from '../auth/routes.js';
import type {AuthService} from '../auth/service.js';
import type {FamilyService} from '../family/service.js';
import {addDays,koreaToday} from '../../shared/schedules.js';
import {dailySchedules,scheduleDayIntervals,timeLabel,timetableWeekDates} from '../../shared/workspace-schedules.js';
import type {WorkspaceItem,WorkspaceMe} from '../../shared/workspace.js';

const base64url=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const settings=z.object({challenge:base64url,showTitles:z.boolean()}).strict();
const grantSchema=settings.extend({sessionId:z.string().min(1).max(128),expires:z.number().int()});
type Grant=z.infer<typeof grantSchema>;
const lifetime=7*86400_000;

function key(auth:AuthService){
 return Buffer.from(auth.policy.digest('iharu/android-widget/v1'),'hex');
}

function seal(auth:AuthService,grant:Grant){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(auth),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(grant),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}

function open(auth:AuthService,raw:string,verifier:string):Grant|null{
 if(!/^Bearer [A-Za-z0-9_-]{60,700}$/.test(raw)||!base64url.safeParse(verifier).success)return null;
 try{
  const data=Buffer.from(raw.slice(7),'base64url');
  const cipher=createDecipheriv('aes-256-gcm',key(auth),data.subarray(0,12));
  cipher.setAuthTag(data.subarray(12,28));
  const grant=grantSchema.parse(JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8')));
  const actual=createHash('sha256').update(verifier).digest(),expected=Buffer.from(grant.challenge,'base64url');
  return grant.expires>+auth.policy.now()&&timingSafeEqual(actual,expected)?grant:null;
 }catch{return null;}
}

function selected(me:WorkspaceMe,scope:'calendar'|'timetable'){
 const saved=me.memberFilterPreferences?.[scope]||(scope==='timetable'?me.timetableMemberIds||(me.timetableMemberId?[me.timetableMemberId]:undefined):undefined);
 const valid=saved?.filter(id=>id===me.id||me.family?.members.some(member=>member.id===id));
 return valid?.length?valid:[me.id];
}

function snapshot(items:WorkspaceItem[],me:WorkspaceMe,today:string,showTitles:boolean){
 const month=today.slice(0,7);
 const first=timetableWeekDates(month+'-01')[0];
 const calendarMembers=selected(me,'calendar'),timetableMembers=selected(me,'timetable');
 const events=items.filter(item=>item.kind==='EVENT'),repeats=items.filter(item=>item.kind==='REPEAT');
 const calendar=Array.from({length:42},(_,index)=>{
  const date=addDays(first,index);
  return {date,count:date.startsWith(month)?dailySchedules(events,date,calendarMembers).length:0};
 });
 const timetable=timetableWeekDates(today).map(date=>{
  const schedule=dailySchedules(repeats,date,timetableMembers);
  const entries=schedule.slice(0,3).map(item=>{
   const time=scheduleDayIntervals(item,date)[0];
   return {time:time?timeLabel(time.start):'종일',...(showTitles?{title:item.data.title}:{})};
  });
  return {date,count:schedule.length,entries};
 });
 return {today,calendar,timetable};
}

export function androidWidgetRoutes(auth:()=>AuthService|null,family:()=>Promise<FamilyService|null>){
 const app=new Hono<{Variables:{requestId:string}}>();
 app.use('/api/v1/android-widget/*',bodyLimit({maxSize:2048}));
 app.post('/api/v1/android-widget/link',async c=>{
  const svc=auth();
  if(!svc)return c.json({code:'UNAVAILABLE'},503);
  if(c.req.header('Origin')!==svc.settings.origin)return c.json({code:'ORIGIN_REJECTED'},403);
  const input=settings.safeParse(await c.req.json().catch(()=>null));
  if(!input.success)return c.json({code:'INVALID_INPUT'},400);
  const session=await currentSession(svc,c.req.raw);
  if(!session||session.guard.assurance!=='HIGH'||!session.user.emailVerified||session.user.email.endsWith('@identity.iharu.invalid'))return c.json({code:'AUTH_REQUIRED'},401);
  await svc.policy.takeLimits([{key:'android-widget:link:'+session.guard.member_id,windowMs:60_000,limit:10}]);
  const expires=Math.min(+svc.policy.now()+lifetime,+new Date(session.guard.absolute_expires_at),+new Date(session.session.expiresAt));
  return c.json({grant:seal(svc,{...input.data,sessionId:session.session.id,expires})});
 });
 app.get('/api/v1/android-widget/snapshot',async c=>{
  const svc=auth();
  if(!svc)return c.json({code:'UNAVAILABLE'},503);
  const grant=open(svc,c.req.header('Authorization')||'',c.req.header('X-Iharu-Widget-Key')||'');
  if(!grant)return c.json({code:'AUTH_REQUIRED'},401);
  const guard=await svc.policy.guard(grant.sessionId,false);
  if(!guard||guard.assurance!=='HIGH')return c.json({code:'AUTH_REQUIRED'},401);
  const runtime=await family();
  if(!runtime)return c.json({code:'UNAVAILABLE'},503);
  const actor={requestId:c.get('requestId'),memberId:guard.member_id,sessionId:grant.sessionId};
  const today=koreaToday(svc.policy.now()),from=addDays(today.slice(0,7)+'-01',-7),to=addDays(from,48);
  try{
   const [me,events,repeats]=await Promise.all([
    runtime.command<WorkspaceMe>(actor,'workspace.me'),
    runtime.command<{items:WorkspaceItem[]}>(actor,'workspace.items.list',{from,to,kind:'EVENT'}),
    runtime.command<{items:WorkspaceItem[]}>(actor,'workspace.items.list',{from,to,kind:'REPEAT'}),
   ]);
   return c.json(snapshot([...events.items,...repeats.items],me,today,grant.showTitles));
  }catch(error){
   if((error as Error).message==='AUTH_REQUIRED')return c.json({code:'AUTH_REQUIRED'},401);
   return c.json({code:'UNAVAILABLE'},503);
  }
 });
 return app;
}
