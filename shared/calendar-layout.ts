import {addDays} from './schedules.js';
import type {WorkspaceItem} from './workspace.js';
import {compareScheduleTime,dailySchedules} from './workspace-schedules.js';

/** Merge presentation only. Keep every source item and date for editing/permissions. */
export function scheduleIdentity(item:WorkspaceItem){
 const d=item.data;
 return JSON.stringify([item.ownerId,!!item.mine,d.allMembers?'all':d.assigneeId||item.ownerId,d.title,!!d.allDay,d.allDay?'':d.startTime,d.allDay?'':d.endTime,d.place,d.note,d.color??null]);
}
export type CalendarRun={key:string;start:number;end:number;lane:number;days:{date:string;items:WorkspaceItem[]}[];continuesBefore:boolean;continuesAfter:boolean};
export function calendarWeekLayout(items:WorkspaceItem[],dates:string[],limit=3){
 const runs:CalendarRun[]=[],active=new Map<string,CalendarRun>();
 dates.forEach((date,column)=>{
  const groups=new Map<string,WorkspaceItem[]>();
  for(const item of dailySchedules(items,date)){const key=scheduleIdentity(item);groups.set(key,[...(groups.get(key)||[]),item]);}
  for(const [key,group] of groups){
   let run=active.get(key);
   if(!run||run.end!==column-1||addDays(run.days.at(-1)!.date,1)!==date){run={key:key+':'+date,start:column,end:column,lane:0,days:[],continuesBefore:false,continuesAfter:false};runs.push(run);}
   run.end=column;run.days.push({date,items:group});active.set(key,run);
  }
 });
 // Long runs first so one repeated schedule stays on the same row across the week.
 runs.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||compareScheduleTime(a.days[0].items[0],b.days[0].items[0])||a.start-b.start);
 const lanes:boolean[][]=[];
 for(const run of runs){
  let lane=lanes.findIndex(occupied=>!occupied.slice(run.start,run.end+1).some(Boolean));
  if(lane<0){lane=lanes.length;lanes.push(Array(dates.length).fill(false));}
  run.lane=lane;for(let col=run.start;col<=run.end;col++)lanes[lane][col]=true;
  const key=scheduleIdentity(run.days[0].items[0]);
  run.continuesBefore=run.start===0&&dailySchedules(items,addDays(dates[0],-1)).some(item=>scheduleIdentity(item)===key);
  run.continuesAfter=run.end===dates.length-1&&dailySchedules(items,addDays(dates.at(-1)!,1)).some(item=>scheduleIdentity(item)===key);
 }
 const hidden=dates.map((_,column)=>runs.filter(run=>run.lane>=limit&&run.start<=column&&run.end>=column).reduce((count,run)=>count+run.days[column-run.start].items.length,0));
 return {runs:runs.filter(run=>run.lane<limit),hidden,rows:Math.min(limit,Math.max(1,lanes.length))};
}
