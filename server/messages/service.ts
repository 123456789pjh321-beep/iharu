import {query} from '../auth/database.js';
import type {FamilyActor,FamilyService} from '../family/service.js';
export class MessageService {
 constructor(readonly family:FamilyService){}
 async command<T=Record<string,unknown>>(actor:FamilyActor,op:string,input:Record<string,unknown>={}):Promise<T>{
  return this.family.db.transaction().execute(async tx=>{
   if(this.family.testRole){if(this.family.testRole!=='app_runtime')throw new Error('INVALID_TEST_ROLE');await query(tx,'SET LOCAL ROLE app_runtime');}
   await query(tx,"SELECT set_config('iharu.member_id',$1,true),set_config('iharu.session_id',$2,true),set_config('iharu.device_hash',$3,true),set_config('iharu.request_id',$4,true)",[actor.memberId||'',actor.sessionId||'',actor.deviceHash||'',actor.requestId]);
   return (await query<{data:T}>(tx,op==='realtime'?'SELECT app_private.realtime_ticket(($2::jsonb->>\'childId\')::uuid) AS data WHERE $1::text=\'realtime\'':op.startsWith('notifications.')?'SELECT app_private.notification_command($1,$2::jsonb) AS data':'SELECT app_private.message_command($1,$2::jsonb) AS data',[op,JSON.stringify(input)]))[0].data;
  });
 }
}

