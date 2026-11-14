import {timingSafeEqual} from 'node:crypto';
import webpush from 'web-push';
import {waitUntil} from '@vercel/functions';
import {Hono} from 'hono';
import {z} from 'zod';
import type {FamilyService} from '../family/service.js';
import {query} from '../auth/database.js';

export type PushConfig={publicKey:string;privateKey:string;secret:string;subject:string};
export function pushConfig(env:NodeJS.ProcessEnv=process.env):PushConfig|null{
 const publicKey=env.PUSH_VAPID_PUBLIC_KEY,privateKey=env.PUSH_VAPID_PRIVATE_KEY,secret=env.PUSH_CRON_SECRET;
 if(!publicKey||!privateKey||!secret||secret.length<32)return null;
 return {publicKey,privateKey,secret,subject:'https://myiharu.com/notification-settings'};
}
// The endpoint is a bearer credential. Never log it, follow redirects, or accept arbitrary hosts.
export function allowedPushEndpoint(value:string){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash&&
 (u.hostname==='fcm.googleapis.com'||u.hostname==='web.push.apple.com'||u.hostname==='updates.push.services.mozilla.com'||/^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))&&u.pathname.length>1;}catch{return false;}
}
const endpoint=z.string().max(2048).refine(allowedPushEndpoint);
export const pushSpecs:Record<string,z.ZodType>={
 'push.settings':z.object({endpoint:endpoint.optional()}).strict(),
 'push.settings.save':z.object({calendarChanges:z.boolean(),calendarReminders:z.boolean(),chat:z.boolean(),reminderMinutes:z.union([z.literal(0),z.literal(5),z.literal(10),z.literal(30),z.literal(60),z.literal(1440),z.literal(10080)]),preview:z.boolean(),endpoint:endpoint.optional()}).strict(),
 'push.subscribe':z.object({endpoint,p256dh:z.string().regex(/^B[A-Za-z0-9_-]{86}=?$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/)}).strict(),
 'push.unsubscribe':z.object({endpoint}).strict(),'push.test':z.object({endpoint}).strict(),
};
type Lease={id:string;leaseToken:string};
type Delivery={subscription:webpush.PushSubscription;payload:Record<string,unknown>;ttl:number};
export async function pushCommand<T>(family:FamilyService,config:PushConfig,op:string,input:object={}):Promise<T>{
 return family.db.transaction().execute(async tx=>{
  if(family.testRole)await query(tx,'SET LOCAL ROLE app_runtime');
  const [row]=await query<{data:T}>(tx,'SELECT app_private.workspace_push_worker($1,$2,$3::jsonb) AS data',[config.secret,op,JSON.stringify(input)]);return row.data;
 });
}
export type PushSender=(delivery:Delivery,config:PushConfig)=>Promise<number>;
export const sendWebPush:PushSender=async(d,config)=>{
 if(!allowedPushEndpoint(d.subscription.endpoint))return 400;
 const r=await webpush.sendNotification(d.subscription,JSON.stringify(d.payload),{
  vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey},TTL:Math.min(d.ttl,900),urgency:'normal',timeout:6000,
 });return r.statusCode;
};
export async function dispatchPush(family:FamilyService,config:PushConfig,{plan=false,limit=20,sender=sendWebPush}:{plan?:boolean;limit?:number;sender?:PushSender}={}){
 if(plan)await pushCommand(family,config,'plan');
 const batch=await pushCommand<Lease[]>(family,config,'claim',{limit});let accepted=0,failed=0;
 // Keep due-time order for each batch. Push services may still delay device delivery.
 const deadline=Date.now()+40000;
 for(const lease of batch){
  if(Date.now()>deadline)break; // Remaining leases expire and are retried by the next worker.
  const delivery=await pushCommand<Delivery|null>(family,config,'delivery',lease);if(!delivery)continue;
  let status=0,retryAfter=60;
  try{status=await sender(delivery,config);}catch(e){const err=e as {statusCode?:number;headers?:Record<string,string>};status=Number.isInteger(err.statusCode)?err.statusCode!:0;const value=err.headers?.['retry-after'];if(value){const n=Number(value);retryAfter=Number.isFinite(n)?n:Math.ceil((Date.parse(value)-Date.now())/1000);if(!Number.isFinite(retryAfter))retryAfter=60;}}
  await pushCommand(family,config,'complete',{...lease,status,retryAfter});if(status>=200&&status<300)accepted++;else failed++;
 }return {claimed:batch.length,accepted,failed};
}
export function schedulePushDispatch(family:FamilyService){
 const config=pushConfig();if(!config)return;
 waitUntil(dispatchPush(family,config,{limit:10}).catch(()=>{console.error(JSON.stringify({code:'PUSH_DISPATCH_FAILED'}));}));
}
export function pushCron(runtime:()=>Promise<FamilyService|null>){
 const app=new Hono();
 app.on(['GET','POST'],'/api/cron/push',async c=>{
  const config=pushConfig();if(!config)return c.json({error:{code:'PUSH_UNAVAILABLE'}},503);
  const actual=Buffer.from(c.req.header('Authorization')||''),expected=Buffer.from('Bearer '+config.secret);
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return c.json({error:{code:'FORBIDDEN'}},403);
  const family=await runtime();if(!family)return c.json({error:{code:'PUSH_UNAVAILABLE'}},503);
  try{return c.json(await dispatchPush(family,config,{plan:true,limit:20}));}catch{console.error(JSON.stringify({code:'PUSH_CRON_FAILED'}));return c.json({error:{code:'PUSH_FAILED'}},503);}
 });return app;
}
