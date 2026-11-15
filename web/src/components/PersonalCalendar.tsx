import {CalendarWeekRow} from './CalendarWeekRow';
import {CalendarGrid,monthWeeks} from './CalendarGrid';
import {CalendarDaySheet} from './CalendarDaySheet';
import {useHolidays} from './useHolidays';
import {useState} from 'react';
import {useMemberPreference,type MemberPreferenceProps} from './MemberPreferenceFilter';
import {CalendarMemberPreferenceFilter} from './CalendarMemberPreferenceFilter';
import {DateNavigator,WorkspaceToolbar} from './WorkspaceToolbar';
import {WorkspaceTopBarActions} from './WorkspaceTopBar';
import {PersonalTimetable} from './PersonalTimetable';
export {calendarColors,eventColor} from './scheduleColors';
import {addDays,koreaToday} from '../../../shared/schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {dailySchedules,matchesMember} from '../../../shared/workspace-schedules';
export {visibleOn} from '../../../shared/workspace-schedules';
import {PeriodPager,shiftMonth} from './PeriodPager';
import {calendarWeekLayout} from '../../../shared/calendar-layout';
import {Icon} from './Icon';
const calendarViews=[['month','월간','calendar'],['week','주간','calendarWeek'],['day','일간','calendarDay']] as const;

export function PersonalCalendar({viewerId,defaultMemberIds,saveDefaultMembers,preview=false,month,day,items,members,loading=false,setMonth,setDay,create,edit,guestCreate=false}:MemberPreferenceProps&{month:string;day:string;items:WorkspaceItem[];members:WorkspaceMember[];loading?:boolean;guestCreate?:boolean;setMonth:(v:string)=>void;setDay:(v:string)=>void;create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void}){
 const holidays=useHolidays(month),[detail,setDetail]=useState<string|null>(null);
 const [view,setView]=useState<typeof calendarViews[number][0]>('month'),selection=useMemberPreference(members,{viewerId,defaultMemberIds,saveDefaultMembers}),member=selection.memberIds;
 const selectDay=(date:string)=>{setDay(date);setMonth(date.slice(0,7));};
 const today=koreaToday();
 const weekStart=addDays(day,-new Date(day+'T12:00:00Z').getUTCDay());
 const shown=items.filter(i=>i.kind==='EVENT'&&matchesMember(i,member));
 const move=(delta:number)=>{if(view!=='month'){selectDay(addDays(day,delta*(view==='week'?7:1)));}else{const date=new Date(Number(month.slice(0,4)),Number(month.slice(5))-1+delta,1),m=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');setMonth(m);setDay(m+'-01');}};
 const renderPage=(offset:number)=>{
  const pageMonth=view==='month'?shiftMonth(month,offset):addDays(day,offset*(view==='week'?7:1)).slice(0,7);
  if(view==='day')return <PersonalTimetable embedded day={addDays(day,offset)} items={shown} members={members} loading={loading} setDay={selectDay} create={create} edit={edit}/>;
  const datesByWeek=view==='week'?[Array.from({length:7},(_,n)=>addDays(weekStart,offset*7+n))]:monthWeeks(pageMonth);
  const weeks=datesByWeek.map(dates=>({dates,layout:calendarWeekLayout(shown,dates,view==='week'?10:3)}));
  // Reserve the same date/holiday and event space for every row. A short viewport
  // scrolls the complete grid instead of letting a holiday row enlarge and clip it.
  const lanes=Math.max(...weeks.map(week=>week.layout.runs.length?week.layout.rows:0)),overflow=weeks.some(week=>week.layout.hidden.some(Boolean));
  const rowMinimum=Math.max(view==='week'?300:0,64+lanes*28+(overflow?28:4));
  return <CalendarGrid key={weeks[0].dates[0]} weekCount={weeks.length} rowMinimum={rowMinimum} weekly={view==='week'}>
   {weeks.map(week=><CalendarWeekRow key={week.dates[0]} dates={week.dates} layout={week.layout} members={members} month={pageMonth} day={day} today={today} holidayName={holidays.name} openDay={date=>{selectDay(date);if(guestCreate)create(date);else setDetail(date);}} edit={(item,date)=>{setDay(date);edit(item);}}/>)}
  </CalendarGrid>;
 };
 return <section className="direct-calendar" aria-label="일정 달력">
 <WorkspaceToolbar title="달력" navigation={<DateNavigator type={view==='day'?'date':'month'} value={view==='day'?day:month} inputLabel={view==='day'?'달력 날짜 선택':'달력 월 선택'} onChange={value=>selectDay(view==='day'?value:value+'-01')}/>}/>
 {!!members.length&&<CalendarMemberPreferenceFilter preview={preview} members={members} selection={selection} label="달력 구성원 필터"/>}
 <WorkspaceTopBarActions label="달력 보기">
  {calendarViews.map(([key,label,icon])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>
   <Icon name={icon}/><span>{label}</span>
  </button>)}
 </WorkspaceTopBarActions>
 <PeriodPager period={view==='month'?month:view==='week'?weekStart:day} view={view} onMove={move} renderPage={renderPage}/>
 {holidays.unavailable&&<p className="holiday-status" role="status">이 연도의 공휴일 정보를 확인하지 못했어요.</p>}
 {detail&&<CalendarDaySheet date={detail} holiday={holidays.name(detail)} items={dailySchedules(shown,detail)} members={members} loading={loading} close={()=>setDetail(null)} create={()=>{setDetail(null);create(detail);}} edit={item=>{setDetail(null);edit(item);}}/>}
 </section>;
}
