import {CalendarWeekRow} from './CalendarWeekRow';
import {CalendarGrid,monthWeeks} from './CalendarGrid';
import {CalendarDaySheet} from './CalendarDaySheet';
import {useHolidays} from './useHolidays';
import {useState} from 'react';
import {useMemberPreference,type MemberPreferenceProps} from './MemberPreferenceFilter';
import {CalendarMemberPreferenceFilter} from './CalendarMemberPreferenceFilter';
import {DateNavigator,WorkspaceToolbar} from './WorkspaceToolbar';
import {WorkspaceTopBarSlot} from './WorkspaceTopBar';
import {WorkspaceViewPicker} from './WorkspaceViewPicker';
import {PersonalTimetable} from './PersonalTimetable';
import {useCalendarWeather,WeatherDateButton,WeatherDialog,WeatherToolbar} from './CalendarWeather';
export {calendarColors,eventColor} from './scheduleColors';
import {addDays,koreaToday} from '../../../shared/schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {dailySchedules,matchesMember,timetableWeekDates} from '../../../shared/workspace-schedules';
export {visibleOn} from '../../../shared/workspace-schedules';
import {PeriodPager,shiftMonth} from './PeriodPager';
import {calendarWeekLayout} from '../../../shared/calendar-layout';
import {calendarDayBadge} from '../../../shared/calendar-day-badge';
const calendarViews=[['month','월간','calendar'],['week','주간','calendarWeek'],['day','일간','calendarDay']] as const;
type CalendarView=typeof calendarViews[number][0];
const weatherRowHeight=22;

export function PersonalCalendar({viewerId,defaultMemberIds,saveDefaultMembers,preview=false,month,day,items,members,loading=false,setMonth,setDay,create,edit}:MemberPreferenceProps&{month:string;day:string;items:WorkspaceItem[];members:WorkspaceMember[];loading?:boolean;setMonth:(v:string)=>void;setDay:(v:string)=>void;create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void}){
 const holidays=useHolidays(month),[detail,setDetail]=useState<string|null>(null);
 const weather=useCalendarWeather();
 const [view,setView]=useState<CalendarView>('month'),selection=useMemberPreference(members,{viewerId,defaultMemberIds,saveDefaultMembers}),member=selection.memberIds;
 const selectDay=(date:string)=>{setDay(date);setMonth(date.slice(0,7));};
 const today=koreaToday();
 const weekStart=timetableWeekDates(day)[0];
 const shown=items.filter(i=>i.kind==='EVENT'&&matchesMember(i,member));
 const untimed=view==='week'?shown.filter(item=>item.data.allDay||!item.data.startTime||!item.data.endTime):[];
 const openDay=(date:string)=>{selectDay(date);setDetail(date);};
 const editOnDay=(item:WorkspaceItem,date:string)=>{setDay(date);edit(item);};
 const move=(delta:number)=>{if(view!=='month'){selectDay(addDays(day,delta*(view==='week'?7:1)));}else{const date=new Date(Number(month.slice(0,4)),Number(month.slice(5))-1+delta,1),m=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');setMonth(m);setDay(m+'-01');}};
 const renderDateWeather=(dates:string[])=>dates.some(weather.hasDate)
  ?(date:string)=><WeatherDateButton weather={weather} date={date}/>
  :undefined;
 const minimumWeekHeight=(dates:string[],layout:ReturnType<typeof calendarWeekLayout>,withWeather:boolean)=>{
  const dateHeight=dates.some(date=>calendarDayBadge(date,holidays.name(date)))?62:44;
  const eventRows=layout.runs.length?layout.rows:0;
  return dateHeight+eventRows*28+(layout.hidden.some(Boolean)?28:4)+(withWeather?weatherRowHeight:0);
 };
 const renderPage=(offset:number)=>{
  if(view==='day')return <PersonalTimetable calendar={{view:'day'}} day={addDays(day,offset)} items={shown}
   members={members} loading={loading} setDay={selectDay} create={create} edit={edit}/>;
  if(view==='week'){
   const date=addDays(day,offset*7),dates=timetableWeekDates(date);
   const dateWeather=renderDateWeather(dates);
   const layout=calendarWeekLayout(untimed,dates);
   const header=<div className="calendar-week-header">
    {layout.runs.length>0&&<span>종일</span>}
    <CalendarGrid weekly weekCount={1} rowMinimum={minimumWeekHeight(dates,layout,!!dateWeather)}>
     <CalendarWeekRow dates={dates} layout={layout} members={members} month={date.slice(0,7)} day={date}
      today={today} holidayName={holidays.name} openDay={openDay} edit={editOnDay} dateWeather={dateWeather}/>
    </CalendarGrid>
   </div>;
   return <PersonalTimetable calendar={{view:'week',header}} day={date} items={shown} members={members} loading={loading}
    setDay={selectDay} create={create} edit={editOnDay}/>;
  }
  const pageMonth=shiftMonth(month,offset);
  const weeks=monthWeeks(pageMonth).map(dates=>({dates,layout:calendarWeekLayout(shown,dates),dateWeather:renderDateWeather(dates)}));
  // Keep rows even and reserve enough space for the week with the most content.
  const rowMinimum=Math.max(68,...weeks.map(({dates,layout,dateWeather})=>minimumWeekHeight(dates,layout,!!dateWeather)));
  return <CalendarGrid key={weeks[0].dates[0]} weekCount={weeks.length} rowMinimum={rowMinimum}>
   {weeks.map(week=><CalendarWeekRow key={week.dates[0]} dates={week.dates} layout={week.layout} members={members} month={pageMonth} day={day} today={today} holidayName={holidays.name} openDay={openDay} edit={editOnDay} dateWeather={week.dateWeather}/>)}
  </CalendarGrid>;
 };
 return <section className="direct-calendar" aria-label="일정 달력">
 <WorkspaceToolbar title="달력" navigation={<DateNavigator type={view==='day'?'date':'month'} value={view==='day'?day:month} inputLabel={view==='day'?'달력 날짜 선택':'달력 월 선택'} onChange={value=>selectDay(view==='day'?value:value+'-01')}/>}>
  <WeatherToolbar weather={weather} date={day}/>
 </WorkspaceToolbar>
 {!!members.length&&<CalendarMemberPreferenceFilter preview={preview} members={members} selection={selection} label="달력 구성원 필터"/>}
 <WorkspaceTopBarSlot slot="groupTrailing">
  <WorkspaceViewPicker label="달력 보기" value={view} options={calendarViews} onSelect={setView}/>
 </WorkspaceTopBarSlot>
 <PeriodPager period={view==='month'?month:view==='week'?weekStart:day} view={view} onMove={move} renderPage={renderPage}/>
 {holidays.unavailable&&<p className="holiday-status" role="status">이 연도의 공휴일 정보를 확인하지 못했어요.</p>}
 {detail&&<CalendarDaySheet date={detail} holiday={holidays.name(detail)} items={dailySchedules(shown,detail)} members={members} loading={loading} close={()=>setDetail(null)} create={()=>{setDetail(null);create(detail);}} edit={item=>{setDetail(null);edit(item);}}/>}
 <WeatherDialog weather={weather}/>
 </section>;
}
