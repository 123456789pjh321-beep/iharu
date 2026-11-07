import {query,type AuthDatabase} from '../auth/database.js';
import {runHolidayMaintenance} from './worker.js';

type Summary=Record<string,unknown>&{degraded:boolean};
// SQL statements have timeouts; the 45s deadline fits inside the 60s function.
// This tick delivers in-app records. External Push/Realtime are later patches.
export async function runCronTick(db:AuthDatabase,key:string|undefined,source:'scheduled'|'manual'='manual',
 holidays=runHolidayMaintenance,clock=Date.now){
 const deadline=clock()+45_000;
 const [claim]=await query<{data:{state:string;token?:string}}>(db,'SELECT app_private.cron_claim($1) AS data',[source]);
 if(!claim.data.token)return {state:claim.data.state};
 const token=claim.data.token,result:Summary={degraded:false};
 const step=async(name:string)=>{
  if(deadline-clock()<10_000){result.deferred='DEADLINE';return undefined;}
  const [row]=await query<{data:Record<string,unknown>}>(db,'SELECT app_private.cron_step($1,$2) AS data',[token,name]);
  result[name]=row.data;return row.data;
 };
 try{
  await step('reserve');
  const delivery=await step('notify');
  if(!delivery?.backlog&&deadline-clock()>=10_000){
   const status=await holidays(db,key,undefined,()=>deadline-clock()>=10_000);
   result.holidays=status;result.degraded=status.some(h=>['NOT_CONFIGURED','FAILED','DEFERRED'].includes(h.state));
   const health=await step('holiday_status');
   const years=health?.years as {state:string}[]|undefined;
   result.degraded=result.degraded||!!years?.some(y=>y.state!=='READY');
   await step('expand');
   await step('secrets');
   await step('messages');
   await step('retention');
  }else result.deferred=delivery?.backlog?'INBOX_BACKLOG':'DEADLINE';
  const [finished]=await query<{saved:boolean}>(db,'SELECT app_private.cron_finish($1,$2::jsonb,NULL) AS saved',[token,JSON.stringify(result)]);
  if(!finished.saved)throw new Error('STALE_LEASE');
  return {state:result.degraded?'DEGRADED':'DONE',...result};
 }catch{
  await query(db,'SELECT app_private.cron_finish($1,$2::jsonb,$3)',[token,JSON.stringify(result),'MAINTENANCE_FAILED']).catch(()=>{});
  throw new Error('MAINTENANCE_FAILED');
 }
}

