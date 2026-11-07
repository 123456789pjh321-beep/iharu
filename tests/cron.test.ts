import {beforeAll,beforeEach,afterAll,describe,it,expect,vi} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './helpers/auth-db';
import {query,type AuthDatabase} from '../server/auth/database';
import {scheduleCron} from '../server/schedules/cron';
import {runCronTick} from '../server/schedules/tick';
import {runHolidayMaintenance} from '../server/schedules/worker';
import {koreaToday} from '../shared/schedules';
let database:Awaited<ReturnType<typeof testDatabase>>;
const year=Number(koreaToday().slice(0,4));
const supplier=async(y:number)=>({items:[{date:`${y}-01-01`,name:'격리 공휴일',isHoliday:true}],hash:'a'.repeat(64)});
const holidays:typeof runHolidayMaintenance=(db,key,_,hasTime)=>runHolidayMaintenance(db,key,supplier,hasTime);
const claim=async()=> (await query<{data:{state:string;token:string}}>(database.db,"SELECT app_private.cron_claim('manual') AS data"))[0].data;
beforeAll(async()=>{database=await testDatabase();for(const name of (await readdir('db/migrations')).sort())await database.engine.exec(await readFile('db/migrations/'+name,'utf8'));},30000);
beforeEach(async()=>{await database.engine.exec('TRUNCATE app_private.cron_runs,app_private.schedule_jobs,app_private.holiday_sync_runs,app_private.holiday_years,app_private.schedule_idempotency CASCADE');});
afterAll(async()=>{await database.db.destroy();});
describe('P07-F07 cron lease and maintenance',()=>{
 it('fails closed before DB access and distinguishes invalid config in secret-free logs',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),worker=vi.fn(async()=>null);
  const secret='fixture-cron-secret-32-characters-only';
  for(const configured of [undefined,'short',secret+'\n',secret]){
   const app=scheduleCron(worker,runCronTick,{CRON_SECRET:configured});
   expect((await app.request('/api/cron/tick')).status).toBe(401);
   expect((await app.request('/api/cron/tick?secret='+secret)).status).toBe(401);
  }
  expect(worker).not.toHaveBeenCalled();expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);warn.mockRestore();
 });
 it('handles missing/failed DB safely, rejects wrong methods and authenticates all legacy paths',async()=>{
  const error=vi.spyOn(console,'error').mockImplementation(()=>{}),info=vi.spyOn(console,'info').mockImplementation(()=>{});
  const secret='fixture-cron-secret-32-characters-only',headers={Authorization:`Bearer ${secret}`};
  expect((await scheduleCron(async()=>null,runCronTick,{CRON_SECRET:secret}).request('/api/cron/tick',{headers})).status).toBe(503);
  const run=vi.fn(async()=>({state:'DONE'})),app=scheduleCron(async()=>database.db,run,{CRON_SECRET:secret});
  for(const path of ['/api/cron/tick','/api/internal/schedule-maintenance','/api/internal/notification-maintenance'])expect((await app.request(path,{headers})).status).toBe(200);
  expect(run).toHaveBeenCalledTimes(3);expect((await app.request('/api/cron/tick',{method:'POST',headers})).status).toBe(404);
  expect((await scheduleCron(async()=>{throw Error('private-url');},run,{CRON_SECRET:secret}).request('/api/cron/tick',{headers})).status).toBe(503);
  expect(JSON.stringify(error.mock.calls)).not.toContain('private-url');error.mockRestore();info.mockRestore();
 });
 it('records successful data updates once and prevents duplicate ticks',async()=>{
  const result=await runCronTick(database.db,'fixture','manual',holidays);
  expect(result.state).toBe('DONE');expect((await runCronTick(database.db,'fixture','manual',holidays)).state).toBe('ALREADY_DONE');
  expect((await query(database.db,'SELECT * FROM app_private.holidays')).length).toBeGreaterThan(0);
  expect((await query<{result:{retention:{state:string}}}>(database.db,'SELECT result FROM app_private.cron_runs'))[0].result.retention.state).toBe('DONE');
 });
 it('recovers an expired lease and rejects the stale finisher and stale step',async()=>{
  const first=await claim();expect((await claim()).state).toBe('BUSY');
  await query(database.db,"UPDATE app_private.cron_runs SET lease_until=now()-interval '1 second'");
  const second=await claim();expect(second.token).not.toBe(first.token);
  expect((await query<{saved:boolean}>(database.db,"SELECT app_private.cron_finish($1,'{}',NULL) saved",[first.token]))[0].saved).toBe(false);
  await expect(query(database.db,"SELECT app_private.cron_step($1,'retention')",[first.token])).rejects.toThrow('STALE_LEASE');
  expect((await query<{saved:boolean}>(database.db,"SELECT app_private.cron_finish($1,'{}',NULL) saved",[second.token]))[0].saved).toBe(true);
 });
 it('retains the cache on provider failure and marks absent configuration degraded',async()=>{
  expect((await runCronTick(database.db,undefined)).state).toBe('DEGRADED');
  await runHolidayMaintenance(database.db,'fixture',supplier);
  await query(database.db,"UPDATE app_private.holiday_sync_runs SET state='FAILED',retry_after=now()-interval '1 second'");
  await runHolidayMaintenance(database.db,'fixture',async()=>{throw Error('upstream-secret');});
  expect((await query<{state:string;last_success_at:unknown}>(database.db,'SELECT state,last_success_at FROM app_private.holiday_years'))[0]).toMatchObject({state:'FAILED',last_success_at:expect.anything()});
  expect((await query(database.db,'SELECT * FROM app_private.holidays')).length).toBeGreaterThan(0);
  expect((await runHolidayMaintenance(database.db,'fixture',supplier))[0].state).toBe('ALREADY_CLAIMED');
 });
 it('recovers expired holiday claims and fences old supplier responses',async()=>{
  const [a]=await query<{token:string}>(database.db,'SELECT app_private.holiday_claim($1) token',[year]);
  await query(database.db,"UPDATE app_private.holiday_sync_runs SET lease_until=now()-interval '1 second'");
  const [b]=await query<{token:string}>(database.db,'SELECT app_private.holiday_claim($1) token',[year]);expect(a.token).not.toBe(b.token);
  await expect(query(database.db,"SELECT app_private.holiday_finish($1,$2,'[]','',NULL)",[year,a.token])).rejects.toThrow('STALE_LEASE');
 });
 it('bounds retention, resumes the same daily job and removes abandoned old leases',async()=>{
  await query(database.db,"INSERT INTO app_private.schedule_idempotency(actor_id,key,operation,payload,expires_at) SELECT $1::uuid,i::text,'fixture','{}',now()-interval '1 day' FROM generate_series(1,205) i",[randomUUID()]);
  await query(database.db,"INSERT INTO app_private.holiday_sync_runs(year,run_date,state,lease_until) VALUES($1,current_date-10,'LEASED',now()-interval '1 day')",[year]);
  const c=await claim();
  const [a]=await query<{data:{state:string;counts:{schedule_idempotency:number;holiday_sync_runs:number}}}>(database.db,"SELECT app_private.cron_step($1,'retention') data",[c.token]);
  expect(a.data).toMatchObject({state:'MORE',counts:{schedule_idempotency:200,holiday_sync_runs:1}});
  const [b]=await query<{data:{state:string;counts:{schedule_idempotency:number}}}>(database.db,"SELECT app_private.cron_step($1,'retention') data",[c.token]);expect(b.data).toMatchObject({state:'DONE',counts:{schedule_idempotency:5}});
  expect((await query<{data:{state:string}}>(database.db,"SELECT app_private.cron_step($1,'retention') data",[c.token]))[0].data.state).toBe('ALREADY_DONE');
 });
 it('records failed work for retry and stops starting work at the deadline',async()=>{
  await expect(runCronTick(database.db,'fixture','manual',async()=>{throw Error('private provider detail');})).rejects.toThrow('MAINTENANCE_FAILED');
  expect((await query<{state:string;error_code:string}>(database.db,'SELECT state,error_code FROM app_private.cron_runs'))[0]).toEqual({state:'FAILED',error_code:'MAINTENANCE_FAILED'});
  let calls=0;const result=await runCronTick(database.db,'fixture','manual',holidays,()=>calls++===0?0:40_000);expect(result).toMatchObject({deferred:'DEADLINE'});
 });
 it('denies application roles access to cron data and command execution',async()=>{
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE app_runtime');await query(tx,"SELECT app_private.cron_claim('manual')");})).rejects.toMatchObject({code:'42501'});
  await expect(database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE worker_runtime');await query(tx,'SELECT * FROM app_private.cron_runs');})).rejects.toMatchObject({code:'42501'});
  await database.db.transaction().execute(async tx=>{await query(tx,'SET LOCAL ROLE worker_runtime');expect((await runCronTick(tx as AuthDatabase,'fixture','manual',holidays)).state).toBe('DONE');});
 });
});

