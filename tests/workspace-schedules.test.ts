import {expect,it} from 'vitest';
import {chronologicalSchedules,dailySchedules,matchesMember,scheduleAssignee,schedulePhase,timetableRange,timetableLayout,timetableWeekDates,timeLabel,timeMinutes} from '../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../shared/workspace';
const members:WorkspaceMember[]=[{id:'parent',name:'부모',kind:'PARENT',host:true,version:1},{id:'child',name:'서준',kind:'CHILD',host:false,version:1}];
function event(id:string,startTime:string,extra:Partial<WorkspaceItem['data']>={}):WorkspaceItem{return {id,kind:'EVENT',data:{title:id,date:'2026-11-08',startTime,endTime:'18:00',weekdays:[],place:'',note:'',paid:false,...extra},ownerId:'parent',ownerName:'부모',mine:true,version:1};}
it('orders day views and editor lists by time, with all-day first and stable equal-time ties',()=>{
 const rows=[event('17','17:00'),event('14','14:15'),event('09','09:00'),event('all','23:00',{allDay:true}),event('13','13:50'),event('16','16:00'),event('other','08:00',{date:'2026-11-09'})];
 expect(dailySchedules(rows,'2026-11-08').map(i=>i.id)).toEqual(['all','09','13','14','16','17']);
 expect(chronologicalSchedules(rows).at(-1)?.id).toBe('other');
 expect(dailySchedules([event('b','09:00'),event('a','09:00')],'2026-11-08').map(i=>i.id)).toEqual(['a','b']);
});
it('keeps fixed timetable repeats on their weekdays across legacy date limits and member filters',()=>{
 const repeat={...event('repeat','08:30',{date:'2026-11-01',untilDate:'2026-11-15',weekdays:[0],allMembers:true}),kind:'REPEAT' as const},own=event('own','09:00'),child=event('child','10:00',{assigneeId:'child'});
 expect(dailySchedules([repeat,own,child],'2026-11-08','child').map(i=>i.id)).toEqual(['repeat','child']);
 expect(dailySchedules([repeat],'2026-11-09')).toEqual([]);expect(dailySchedules([repeat],'2026-11-22')).toHaveLength(1);expect(dailySchedules([repeat],'2026-10-25')).toHaveLength(1);expect(dailySchedules([{...repeat,data:{...repeat.data,untilDate:undefined}}],'2030-01-06')).toHaveLength(1);
 expect(scheduleAssignee(repeat,members)).toBe('전체');expect(scheduleAssignee(child,members)).toBe('서준');expect(matchesMember(own,'child')).toBe(false);
});
it('marks current time as start-inclusive and end-exclusive without treating all-day or future dates as running',()=>{
 const item=event('school','09:00',{endTime:'13:40'});
 expect(schedulePhase(item,'2026-11-08','2026-11-08','08:59')).toBe('upcoming');expect(schedulePhase(item,'2026-11-08','2026-11-08','09:00')).toBe('current');expect(schedulePhase(item,'2026-11-08','2026-11-08','13:40')).toBe('past');
 expect(schedulePhase(item,'2026-11-09','2026-11-08','10:00')).toBeNull();expect(schedulePhase({...item,data:{...item.data,allDay:true}},'2026-11-08','2026-11-08','10:00')).toBeNull();
});

it('positions event intervals by minutes and packs overlaps into separate columns',()=>{
 const rows=timetableLayout([event('school','09:00',{endTime:'13:40'}),event('parent','10:00',{endTime:'11:00'}),event('nested','10:30',{endTime:'12:00'}),event('later','14:15',{endTime:'15:00'}),event('all','00:00',{allDay:true})]);
 expect(rows.map(({start,end,column,columns})=>({start,end,column,columns}))).toEqual([{start:540,end:820,column:0,columns:3},{start:600,end:660,column:1,columns:3},{start:630,end:720,column:2,columns:3},{start:855,end:900,column:0,columns:1}]);
 expect(timetableLayout([event('first','09:00',{endTime:'10:00'}),event('second','10:00',{endTime:'11:00'})]).map(r=>r.columns)).toEqual([1,1]);
 expect(timeMinutes('14:15')).toBe(855);expect(timeLabel(855)).toBe('14:15');expect(timeLabel(1440)).toBe('24:00');
});

it('keeps every selected weekday in the same Sunday–Saturday week',()=>{
 const expected=['2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14'];
 for(const date of expected)expect(timetableWeekDates(date)).toEqual(expected);
 expect(timetableWeekDates('2027-01-01')).toEqual(['2026-12-27','2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02']);
 expect(timetableWeekDates('2028-02-29')).toEqual(['2028-02-27','2028-02-28','2028-02-29','2028-03-01','2028-03-02','2028-03-03','2028-03-04']);
});

it('clips weekly events at 08:00 and 22:00 without moving or mutating their original times',()=>{
 const before=event('before','07:00',{endTime:'08:00'}),crossing=event('crossing','07:30',{endTime:'08:30'}),morning=event('morning','08:15',{endTime:'09:00'}),late=event('late','21:30',{endTime:'23:00'});
 const rows=timetableLayout([before,crossing,morning,late],timetableRange);
 expect(rows.map(({item,start,end,column,columns})=>({id:item.id,start,end,column,columns}))).toEqual([
  {id:'crossing',start:480,end:510,column:0,columns:2},{id:'morning',start:495,end:540,column:1,columns:2},{id:'late',start:1290,end:1320,column:0,columns:1}
 ]);
 expect(crossing.data.startTime).toBe('07:30');expect(timetableLayout([before,crossing])[0].start).toBe(420);
});
it('keeps empty, filtered and all-day-only timetables within the same fixed range',()=>{
 expect(timetableRange).toEqual({start:480,end:1320});
 expect(timetableLayout([],timetableRange)).toEqual([]);
 expect(timetableLayout([event('anniversary','00:00',{allDay:true})],timetableRange)).toEqual([]);
 expect(timetableLayout([event('early','00:05',{endTime:'00:35'})],timetableRange)).toEqual([]);
});

it('expands calendar daily and weekly recurrence inclusively without turning it into timetable repeats',()=>{
 const daily=event('daily','09:00',{date:'2026-11-08',calendarFrequency:'DAILY',untilDate:'2026-11-10'});
 for(const day of ['2026-11-08','2026-11-09','2026-11-10'])expect(dailySchedules([daily],day)).toHaveLength(1);
 for(const day of ['2026-11-07','2026-11-11'])expect(dailySchedules([daily],day)).toEqual([]);
 const weekly=event('weekly','09:00',{calendarFrequency:'WEEKLY',weekdays:[1,3]});
 expect(dailySchedules([weekly],'2027-01-04')).toHaveLength(1);expect(dailySchedules([weekly],'2027-01-05')).toEqual([]);expect(dailySchedules([weekly],'2027-01-06')).toHaveLength(1);
 expect(dailySchedules([event('once','09:00')],'2027-11-08')).toEqual([]);
});
it('clamps calendar month/year boundaries without drifting the original anchor',()=>{
 const monthly=event('monthly','09:00',{date:'2027-01-31',calendarFrequency:'MONTHLY'});
 for(const day of ['2027-01-31','2027-02-28','2027-03-31','2027-04-30','2028-02-29'])expect(dailySchedules([monthly],day)).toHaveLength(1);
 for(const day of ['2027-02-27','2027-03-28','2027-03-30','2026-12-31'])expect(dailySchedules([monthly],day)).toEqual([]);
 const yearly=event('birthday','00:00',{date:'2024-02-29',calendarFrequency:'YEARLY',allDay:true,untilDate:'2028-02-29'});
 for(const day of ['2025-02-28','2028-02-29'])expect(dailySchedules([yearly],day)).toHaveLength(1);
 for(const day of ['2023-02-28','2025-03-01','2028-02-28','2029-02-28'])expect(dailySchedules([yearly],day)).toEqual([]);
});

it('shows inclusive multi-day events across month/year boundaries and clips the daily clock without changing source data',()=>{
 const trip=event('trip','22:00',{date:'2026-12-31',endDate:'2027-01-02',endTime:'04:00'});
 for(const day of ['2026-12-31','2027-01-01','2027-01-02'])expect(dailySchedules([trip],day)).toEqual([trip]);
 for(const day of ['2026-12-30','2027-01-03'])expect(dailySchedules([trip],day)).toEqual([]);
 expect(timetableLayout([trip],undefined,'2026-12-31').map(r=>[r.start,r.end])).toEqual([[1320,1440]]);
 expect(timetableLayout([trip],undefined,'2027-01-01').map(r=>[r.start,r.end])).toEqual([[0,1440]]);
 expect(timetableLayout([trip],undefined,'2027-01-02').map(r=>[r.start,r.end])).toEqual([[0,240]]);
 expect(schedulePhase(trip,'2027-01-01','2027-01-01','12:00')).toBe('current');
 expect(schedulePhase(trip,'2027-01-02','2027-01-02','04:00')).toBe('past');
 expect(trip.data).toMatchObject({date:'2026-12-31',endDate:'2027-01-02',startTime:'22:00',endTime:'04:00'});
});
it('retains recurring duration beyond the final start date and separates overnight segments',()=>{
 const monthly=event('monthly trip','12:00',{date:'2028-01-31',endDate:'2028-02-02',calendarFrequency:'MONTHLY',untilDate:'2028-02-29'});
 for(const day of ['2028-02-01','2028-02-02','2028-02-29','2028-03-01','2028-03-02'])expect(dailySchedules([monthly],day)).toHaveLength(1);
 for(const day of ['2028-02-03','2028-03-03','2028-03-31'])expect(dailySchedules([monthly],day)).toHaveLength(0);
 const daily=event('overnight','23:00',{date:'2026-11-08',endDate:'2026-11-09',endTime:'01:00',calendarFrequency:'DAILY'});
 expect(timetableLayout([daily],undefined,'2026-11-09').map(r=>[r.start,r.end])).toEqual([[0,60],[1380,1440]]);
 expect(schedulePhase(daily,'2026-11-09','2026-11-09','12:00')).toBe('upcoming');
 const long={...daily,data:{...daily.data,endDate:'2026-11-10'}};
 expect(timetableLayout([long],undefined,'2026-11-10').map(r=>[r.start,r.end])).toEqual([[0,1440]]);
 const weekly={...daily,data:{...daily.data,calendarFrequency:'WEEKLY' as const,weekdays:[0],untilDate:'2026-11-08'}};
 expect(dailySchedules([weekly],'2026-11-09')).toHaveLength(1);expect(dailySchedules([weekly],'2026-11-10')).toHaveLength(0);
 const yearly=event('yearly trip','10:00',{date:'2024-02-29',endDate:'2024-03-01',calendarFrequency:'YEARLY'});
 expect(dailySchedules([yearly],'2025-03-01')).toHaveLength(1);expect(dailySchedules([yearly],'2025-03-02')).toHaveLength(0);
});

it('unions selected member schedules without duplicating shared events and keeps overlap lanes',()=>{
 const rows=[event('parent class','09:00',{endTime:'10:00'}),event('child class','09:00',{assigneeId:'child',endTime:'10:00'}),event('other class','09:00',{assigneeId:'other'}),event('shared','11:00',{allMembers:true})];
 const selected=dailySchedules(rows,'2026-11-08',['parent','child']);
 expect(selected.map(i=>i.id).sort()).toEqual(['child class','parent class','shared']);
 expect(timetableLayout(selected).filter(r=>r.start===540).map(r=>r.columns)).toEqual([2,2]);
 expect(dailySchedules(rows,'2026-11-08',['child']).map(i=>i.id)).toEqual(['child class','shared']);
 expect(dailySchedules(rows,'2026-11-08',[])).toEqual([]);
});
