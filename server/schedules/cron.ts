import {runBriefingTick} from '../briefing/worker.js';
import {Hono} from 'hono';
import {timingSafeEqual} from 'node:crypto';
import {getScheduleWorker} from './worker.js';
import {runCronTick} from './tick.js';

export function validCronSecret(secret:string|undefined){return !!secret&&/^[\x21-\x7e]{32,256}$/.test(secret);}
export function scheduleCron(worker=getScheduleWorker,run=runCronTick,env=process.env,briefings=runBriefingTick){
 const app=new Hono();
 // Old paths share the minute lease during rolling deployments.
 app.on('GET',['/api/cron/briefing','/api/cron/tick','/api/internal/schedule-maintenance','/api/internal/notification-maintenance'],async c=>{
  c.header('Cache-Control','private, no-store');
  const secret=env.CRON_SECRET,actual=Buffer.from(c.req.header('Authorization')||''),expected=Buffer.from(`Bearer ${secret||''}`);
  if(!validCronSecret(secret)||actual.length!==expected.length||!timingSafeEqual(actual,expected)){
   console.warn(JSON.stringify({code:'CRON_AUTH_REJECTED',reason:!secret?'SECRET_MISSING':!validCronSecret(secret)?'SECRET_INVALID':!actual.length?'HEADER_MISSING':'HEADER_MISMATCH'}));
   return c.json({error:{code:'AUTH_REQUIRED'}},401);
  }
  try{
   const db=await worker();
   if(!db){console.error('CRON_WORKER_UNAVAILABLE');return c.json({error:{code:'WORKER_NOT_CONFIGURED'}},503);}
   const briefing=briefings(db).catch(()=>({state:'ERROR'}));
   const result=c.req.path==='/api/cron/briefing'?{state:'DONE',briefing:await briefing}:{...await run(db,env.HOLIDAY_API_KEY,c.req.header('User-Agent')==='vercel-cron/1.0'?'scheduled':'manual'),briefing:await briefing};
   console.info(JSON.stringify({code:'CRON_TICK',...result}));
   return c.json(result);
  }catch{
   console.error('CRON_TICK_FAILED');
   return c.json({error:{code:'MAINTENANCE_FAILED'}},503);
  }
 });return app;
}

