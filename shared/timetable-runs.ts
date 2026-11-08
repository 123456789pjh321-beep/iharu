import {addDays} from './schedules.js';
import {scheduleIdentity} from './calendar-layout.js';
import type {timetableLayout} from './workspace-schedules.js';
type TimedRow=ReturnType<typeof timetableLayout>[number];
export type TimetableRun={key:string;firstColumn:number;lastColumn:number;start:number;end:number;days:{date:string;item:TimedRow['item']}[]};
/** Join presentation only; preserve each source and never cover a parallel event lane. */
export function timetableRuns(lanes:{date:string;layout:TimedRow[]}[]){
 const runs:TimetableRun[]=[],active=new Map<string,TimetableRun>();
 lanes.forEach(({date,layout},column)=>{
  for(const row of layout){
   if(row.columns!==1)continue;
   const identity=scheduleIdentity(row.item);let run=active.get(identity);
   if(!run||run.lastColumn!==column-1||addDays(run.days.at(-1)!.date,1)!==date){run={key:identity+':'+date,firstColumn:column,lastColumn:column,start:row.start,end:row.end,days:[]};runs.push(run);}
   run.lastColumn=column;run.days.push({date,item:row.item});active.set(identity,run);
  }
 });
 return runs.filter(run=>run.days.length>1);
}
