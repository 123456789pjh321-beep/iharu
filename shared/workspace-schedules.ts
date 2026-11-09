import type {WorkspaceItem,WorkspaceMember} from './workspace.js';
import {addDays} from './schedules.js';
import {periodDays,shiftMonth} from './entry-input.js';

/** Last occurrence start, bounded by the recurrence limit (not the event's end date). */
export function calendarOccurrenceStart(data:WorkspaceItem['data'],date:string):string|null{
 const frequency=data.calendarFrequency||'ONCE',target=data.untilDate&&frequency!=='ONCE'&&data.untilDate<date?data.untilDate:date;
 if(target<data.date)return null;
 if(frequency==='ONCE')return data.date;
 if(frequency==='DAILY')return target;
 if(frequency==='WEEKLY'){
  for(let offset=0;offset<7;offset++){const candidate=addDays(target,-offset);if(candidate<data.date)return null;if(data.weekdays.includes(new Date(candidate+'T12:00:00Z').getUTCDay()))return candidate;}
  return null;
 }
 const [year,month]=target.split('-').map(Number),[anchorYear,anchorMonth]=data.date.split('-').map(Number);
 let months=(year-anchorYear)*12+(frequency==='MONTHLY'?month-anchorMonth:0);
 let candidate=shiftMonth(data.date,months);
 if(candidate>target){months-=frequency==='MONTHLY'?1:12;candidate=shiftMonth(data.date,months);}
 return candidate>=data.date?candidate:null;
}

/** Clip an occurrence to this day; recurring overnight events can have two disjoint segments. */
export function scheduleDayIntervals(item:WorkspaceItem,date:string){
 const d=item.data;
 if(!d.startTime||!d.endTime)return [];
 if(item.kind!=='EVENT')return [{start:timeMinutes(d.startTime),end:timeMinutes(d.endTime)}];
 const span=periodDays(d.date,d.endDate||d.date)-1,latest=calendarOccurrenceStart(d,date);
 const starts=[latest,...(latest===date&&span>0?[calendarOccurrenceStart(d,addDays(date,-1))]:[])];
 const intervals=starts.flatMap(start=>{
  if(!start)return [];
  const offset=periodDays(start,date)-1;if(offset>span)return [];
  return [{start:start===date?timeMinutes(d.startTime!):0,end:offset===span?timeMinutes(d.endTime!):1440}];
 }).filter(row=>row.end>row.start).sort((a,b)=>a.start-b.start);
 if(intervals.length===2&&intervals[0].end>=intervals[1].start)return [{start:intervals[0].start,end:Math.max(intervals[0].end,intervals[1].end)}];
 return intervals;
}

export function scheduleTimeCaption(item:WorkspaceItem,date?:string){
 const d=item.data,span=periodDays(d.date,d.endDate||d.date)-1;
 if(item.kind==='EVENT'&&span>0){const start=date?calendarOccurrenceStart(d,date)||d.date:d.date;return `${start} ${d.allDay?'':d.startTime+' '}– ${addDays(start,span)}${d.allDay?' · 종일':' '+d.endTime}`;}
 return d.allDay?'종일':`${d.startTime} – ${d.endTime}`;
}

/** The selected date stays inside a Sunday–Saturday week, including month/year edges. */
export function timetableWeekDates(date:string){
 const sunday=addDays(date,-new Date(date+'T12:00:00Z').getUTCDay());
 return Array.from({length:7},(_,offset)=>addDays(sunday,offset));
}

/** Expand occurrences after the caller chooses calendar EVENT or timetable REPEAT records. */
export function visibleOn(item:WorkspaceItem,date:string){
 // Timetable repeats are a fixed weekly template; legacy date bounds are metadata only.
 if(item.kind==='REPEAT')return item.data.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay());
 if(item.kind!=='EVENT')return false;
 const start=calendarOccurrenceStart(item.data,date);
 return !!start&&periodDays(start,date)<=periodDays(item.data.date,item.data.endDate||item.data.date);
}
export function scheduleAssignee(item:WorkspaceItem,members:WorkspaceMember[]){
 return item.data.allMembers?'전체':members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||(item.data.assigneeId?'연결 해제된 구성원':item.ownerName);
}
export function matchesMember(item:WorkspaceItem,member:string|readonly string[]){const selected=typeof member==='string'?[member]:member;return selected.includes('all')||(selected.length>0&&(item.data.allMembers===true||selected.includes(item.data.assigneeId||item.ownerId)));}
export function dailySchedules(items:WorkspaceItem[],date:string,member:string|readonly string[]='all'){
 return items.filter(item=>visibleOn(item,date)&&matchesMember(item,member)).sort(compareScheduleTime);
}
export function schedulePhase(item:WorkspaceItem,date:string,today:string,time:string){
 if(date!==today||item.data.allDay||!item.data.startTime||!item.data.endTime)return null;
 const intervals=scheduleDayIntervals(item,date),minute=timeMinutes(time);
 return intervals.some(row=>minute>=row.start&&minute<row.end)?'current':intervals.some(row=>minute<row.start)?'upcoming':'past';
}

export function compareScheduleTime(a:WorkspaceItem,b:WorkspaceItem){return Number(!!b.data.allDay)-Number(!!a.data.allDay)||(a.data.startTime||'99:99').localeCompare(b.data.startTime||'99:99')||(a.data.endTime||'99:99').localeCompare(b.data.endTime||'99:99')||a.data.title.localeCompare(b.data.title,'ko')||a.id.localeCompare(b.id);}
export function chronologicalSchedules(items:WorkspaceItem[]){return [...items].sort((a,b)=>a.data.date.localeCompare(b.data.date)||compareScheduleTime(a,b));}

export function timeMinutes(time:string){const [hours,minutes]=time.split(':').map(Number);return hours*60+minutes;}
export function timeLabel(minutes:number){return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
/** Weekly timetable always spans 06:00 through the end of the day (24:00). */
export const timetableRange={start:360,end:1440} as const;
/** Greedy interval packing: simultaneous events get separate columns in one time grid. */
export function timetableLayout(items:WorkspaceItem[],range?:{start:number;end:number},date?:string){
 const rows=items.filter(i=>!i.data.allDay&&i.data.startTime&&i.data.endTime).flatMap(item=>(date?scheduleDayIntervals(item,date):[{start:timeMinutes(item.data.startTime!),end:timeMinutes(item.data.endTime!)}]).map(interval=>({item,...interval,column:0,columns:1}))).filter(row=>row.end>row.start&&(!range||row.end>range.start&&row.start<range.end)).map(row=>range?{...row,start:Math.max(row.start,range.start),end:Math.min(row.end,range.end)}:row).sort((a,b)=>a.start-b.start||compareScheduleTime(a.item,b.item));
 let group:typeof rows=[],ends:number[]=[],groupEnd=-1;
 const finish=()=>{for(const row of group)row.columns=ends.length;group=[];ends=[];};
 for(const row of rows){if(row.start>=groupEnd){finish();groupEnd=-1;}let column=ends.findIndex(end=>end<=row.start);if(column<0)column=ends.length;row.column=column;ends[column]=row.end;group.push(row);groupEnd=Math.max(groupEnd,row.end);}
 finish();return rows;
}
