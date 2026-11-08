import {expect,it} from 'vitest';
import {calendarWeekLayout} from '../shared/calendar-layout';
import {addDays} from '../shared/schedules';
import type {WorkspaceItem} from '../shared/workspace';
const dates=Array.from({length:7},(_,i)=>addDays('2026-11-01',i));
function event(id:string,date:string,extra:Partial<WorkspaceItem['data']>={}):WorkspaceItem{return {id,kind:'EVENT',ownerId:'parent',ownerName:'부모',mine:true,version:1,data:{title:'학교',date,startTime:'09:00',endTime:'13:00',place:'학교',note:'',weekdays:[],paid:false,...extra}};}
const repeat={...event('school','2026-11-02',{untilDate:'2026-11-30',weekdays:[1,2,3,4,5]}),kind:'REPEAT' as const};
it('joins weekday occurrences into one five-day bar without changing their records',()=>{
 const layout=calendarWeekLayout([repeat],dates);
 expect(layout.runs).toHaveLength(1);expect(layout.runs[0]).toMatchObject({start:1,end:5,lane:0});
 expect(layout.runs[0].days.map(d=>d.date)).toEqual(dates.slice(1,6));expect(layout.runs[0].days.every(d=>d.items[0]===repeat)).toBe(true);
 expect(layout.hidden).toEqual([0,0,0,0,0,0,0]);
});
it('only merges matching assignee, time, title, place, note, color and owner',()=>{
 const first=event('first','2026-11-02'),next=event('next','2026-11-03');
 expect(calendarWeekLayout([first,next],dates).runs).toHaveLength(1);
 for(const data of [{assigneeId:'child'},{allMembers:true},{startTime:'10:00'},{endTime:'14:00'},{title:'학원'},{place:'다른 학교'},{note:'준비물'},{color:1},{allDay:true}])expect(calendarWeekLayout([first,{...next,data:{...next.data,...data}}],dates).runs).toHaveLength(2);
 expect(calendarWeekLayout([first,{...next,ownerId:'other',mine:false}],dates).runs).toHaveLength(2);
});
it('splits missing dates and week boundaries with continuation flags',()=>{
 expect(calendarWeekLayout([event('a','2026-11-02'),event('b','2026-11-04')],dates).runs.map(r=>[r.start,r.end])).toEqual([[1,1],[3,3]]);
 const allDays={...repeat,data:{...repeat.data,date:'2026-10-30',weekdays:[0,1,2,3,4,5,6]}};
 expect(calendarWeekLayout([allDays],dates).runs[0]).toMatchObject({start:0,end:6,continuesBefore:true,continuesAfter:true});
});
it('keeps same-day duplicate sources and counts every hidden record',()=>{
 const a=event('a','2026-11-02'),b=event('b','2026-11-02'),other=event('c','2026-11-02',{title:'별도 일정',startTime:'08:00'});
 const layout=calendarWeekLayout([a,b,other],dates,1);
 expect(layout.runs[0].days[0].items).toEqual([other]);expect(layout.hidden[1]).toBe(2);
 expect(calendarWeekLayout([a,b],dates).runs[0].days[0].items).toEqual([a,b]);
});
it('never overlaps bars sharing a lane and uses stable layout independent of input order',()=>{
 const items=[repeat,...dates.slice(1,6).map((date,i)=>event('extra'+i,date,{title:'추가 '+i,startTime:'08:00'}))];
 const {runs}=calendarWeekLayout(items,dates);
 for(const a of runs)for(const b of runs)if(a!==b&&a.lane===b.lane)expect(a.end<b.start||b.end<a.start).toBe(true);
 expect(calendarWeekLayout([...items].reverse(),dates)).toEqual(calendarWeekLayout(items,dates));
});
