import {expect,it} from 'vitest';
import {chronologicalSchedules,dailySchedules,matchesMember,scheduleAssignee,schedulePhase,timetableBounds,timetableLayout,timetableWeekDates,timeLabel,timeMinutes} from '../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../shared/workspace';
const members:WorkspaceMember[]=[{id:'parent',name:'부모',kind:'PARENT',host:true,version:1},{id:'child',name:'서준',kind:'CHILD',host:false,version:1}];
function event(id:string,startTime:string,extra:Partial<WorkspaceItem['data']>={}):WorkspaceItem{return {id,kind:'EVENT',data:{title:id,date:'2026-11-08',startTime,endTime:'18:00',weekdays:[],place:'',note:'',paid:false,...extra},ownerId:'parent',ownerName:'부모',mine:true,version:1};}
it('orders day views and editor lists by time, with all-day first and stable equal-time ties',()=>{
 const rows=[event('17','17:00'),event('14','14:15'),event('09','09:00'),event('all','23:00',{allDay:true}),event('13','13:50'),event('16','16:00'),event('other','08:00',{date:'2026-11-09'})];
 expect(dailySchedules(rows,'2026-11-08').map(i=>i.id)).toEqual(['all','09','13','14','16','17']);
 expect(chronologicalSchedules(rows).at(-1)?.id).toBe('other');
 expect(dailySchedules([event('b','09:00'),event('a','09:00')],'2026-11-08').map(i=>i.id)).toEqual(['a','b']);
});
it('expands repeating schedules only within their dates and weekdays and includes all-family schedules in each member filter',()=>{
 const repeat={...event('repeat','08:30',{date:'2026-11-01',untilDate:'2026-11-15',weekdays:[0],allMembers:true}),kind:'REPEAT' as const},own=event('own','09:00'),child=event('child','10:00',{assigneeId:'child'});
 expect(dailySchedules([repeat,own,child],'2026-11-08','child').map(i=>i.id)).toEqual(['repeat','child']);
 expect(dailySchedules([repeat],'2026-11-09')).toEqual([]);expect(dailySchedules([repeat],'2026-11-22')).toEqual([]);
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

it('bounds a whole week by its earliest start and latest finish using whole hours',()=>{
 expect(timetableBounds([{start:560,end:780},{start:540,end:850},{start:1030,end:1090}])).toEqual({start:420,end:1200});
 expect(timetableBounds([{start:550,end:1090}])).toEqual({start:420,end:1200});
 expect(timetableBounds([{start:495,end:805}])).toEqual({start:360,end:900});
});
it('caps the visible schedule range at midnight without extending into another day',()=>{
 expect(timetableBounds([{start:5,end:35}])).toEqual({start:0,end:120});
 expect(timetableBounds([{start:1390,end:1435}])).toEqual({start:1260,end:1440});
});
it('keeps an empty or all-day-only week usable without a midnight-length grid',()=>{
 expect(timetableBounds([])).toEqual({start:540,end:1080});
 expect(timetableBounds(timetableLayout([event('anniversary','00:00',{allDay:true})]))).toEqual({start:540,end:1080});
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
