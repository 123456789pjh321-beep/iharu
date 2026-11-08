import type {WorkspaceItem,WorkspaceMember} from './workspace.js';
import {addDays} from './schedules.js';

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
 const {data}=item,frequency=data.calendarFrequency||'ONCE';
 if(frequency==='ONCE')return data.date===date;
 if(date<data.date||(data.untilDate&&date>data.untilDate))return false;
 if(frequency==='DAILY')return true;
 if(frequency==='WEEKLY')return data.weekdays.includes(new Date(date+'T12:00:00Z').getUTCDay());
 const [year,month,day]=date.split('-').map(Number),[,anchorMonth,anchorDay]=data.date.split('-').map(Number);
 const dueDay=Math.min(anchorDay,new Date(Date.UTC(year,month,0)).getUTCDate());
 return day===dueDay&&(frequency==='MONTHLY'||month===anchorMonth);
}
export function scheduleAssignee(item:WorkspaceItem,members:WorkspaceMember[]){
 return item.data.allMembers?'전체':members.find(m=>m.id===(item.data.assigneeId||item.ownerId))?.name||(item.data.assigneeId?'연결 해제된 구성원':item.ownerName);
}
export function matchesMember(item:WorkspaceItem,member:string){return member==='all'||item.data.allMembers===true||(item.data.assigneeId||item.ownerId)===member;}
export function dailySchedules(items:WorkspaceItem[],date:string,member='all'){
 return items.filter(item=>visibleOn(item,date)&&matchesMember(item,member)).sort(compareScheduleTime);
}
export function schedulePhase(item:WorkspaceItem,date:string,today:string,time:string){
 if(date!==today||item.data.allDay||!item.data.startTime||!item.data.endTime)return null;
 return time>=item.data.endTime?'past':time>=item.data.startTime?'current':'upcoming';
}

export function compareScheduleTime(a:WorkspaceItem,b:WorkspaceItem){return Number(!!b.data.allDay)-Number(!!a.data.allDay)||(a.data.startTime||'99:99').localeCompare(b.data.startTime||'99:99')||(a.data.endTime||'99:99').localeCompare(b.data.endTime||'99:99')||a.data.title.localeCompare(b.data.title,'ko')||a.id.localeCompare(b.id);}
export function chronologicalSchedules(items:WorkspaceItem[]){return [...items].sort((a,b)=>a.data.date.localeCompare(b.data.date)||compareScheduleTime(a,b));}

export function timeMinutes(time:string){const [hours,minutes]=time.split(':').map(Number);return hours*60+minutes;}
export function timeLabel(minutes:number){return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
/** Weekly timetable always spans 06:00 through the end of the day (24:00). */
export const timetableRange={start:360,end:1440} as const;
/** Greedy interval packing: simultaneous events get separate columns in one time grid. */
export function timetableLayout(items:WorkspaceItem[],range?:{start:number;end:number}){
 const rows=items.filter(i=>!i.data.allDay&&i.data.startTime&&i.data.endTime&&i.data.endTime>i.data.startTime).sort(compareScheduleTime).map(item=>({item,start:timeMinutes(item.data.startTime!),end:timeMinutes(item.data.endTime!),column:0,columns:1})).filter(row=>!range||row.end>range.start&&row.start<range.end).map(row=>range?{...row,start:Math.max(row.start,range.start),end:Math.min(row.end,range.end)}:row);
 let group:typeof rows=[],ends:number[]=[],groupEnd=-1;
 const finish=()=>{for(const row of group)row.columns=ends.length;group=[];ends=[];};
 for(const row of rows){if(row.start>=groupEnd){finish();groupEnd=-1;}let column=ends.findIndex(end=>end<=row.start);if(column<0)column=ends.length;row.column=column;ends[column]=row.end;group.push(row);groupEnd=Math.max(groupEnd,row.end);}
 finish();return rows;
}
