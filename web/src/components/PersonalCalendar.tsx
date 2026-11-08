import {CalendarWeekRow} from './CalendarWeekRow';
import {CalendarDaySheet} from './CalendarDaySheet';
import {useHolidays} from './useHolidays';
import {useState,useRef,useEffect} from 'react';
import {MemberFilter} from './MemberFilter';
import {DateNavigator,WorkspaceToolbar} from './WorkspaceToolbar';
import {PersonalTimetable} from './PersonalTimetable';
import {calendarColors} from './scheduleColors';
export {calendarColors,eventColor} from './scheduleColors';
import {addDays,koreaToday} from '../../../shared/schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {dailySchedules,matchesMember} from '../../../shared/workspace-schedules';
export {visibleOn} from '../../../shared/workspace-schedules';
import {useCalendarSlide} from './useCalendarSlide';
const weekdays=['일','월','화','수','목','금','토'];
export function PersonalCalendar({month,day,items,members,loading=false,setMonth,setDay,create,edit}:{month:string;day:string;items:WorkspaceItem[];members:WorkspaceMember[];loading?:boolean;setMonth:(v:string)=>void;setDay:(v:string)=>void;create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void}){
 const holidays=useHolidays(month),[detail,setDetail]=useState<string|null>(null);
 const [view,setView]=useState<'month'|'week'|'day'>('month'),[member,setMember]=useState('all');
 const grid=useRef<HTMLDivElement>(null),gesture=useRef<{x:number;y:number}|null>(null),suppressClick=useRef(0),moveRef=useRef<(delta:number)=>void>(()=>{});
 useEffect(()=>{const node=grid.current;if(!node)return;let accumulated=0,last=0;const wheel=(event:WheelEvent)=>{if(Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;event.preventDefault();if(Date.now()-last<500)return;accumulated+=event.deltaX;if(Math.abs(accumulated)>80){moveRef.current(accumulated>0?1:-1);accumulated=0;last=Date.now();}};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[view]);
 useEffect(()=>{if(member!=='all'&&!members.some(m=>m.id===member))setMember('all');},[member,members]);
 const selectDay=(date:string)=>{setDay(date);setMonth(date.slice(0,7));};
 const today=koreaToday(),first=month+'-01',count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate(),offset=new Date(first+'T12:00:00Z').getUTCDay();
 const weekStart=addDays(day,-new Date(day+'T12:00:00Z').getUTCDay());
 useCalendarSlide(grid,view==='month'?month:view==='day'?day:weekStart,view);
 const dates=view==='week'?Array.from({length:7},(_,n)=>addDays(weekStart,n)):Array.from({length:Math.ceil((offset+count)/7)*7},(_,n)=>addDays(first,n-offset));
 const shown=items.filter(i=>matchesMember(i,member));
 const move=(delta:number)=>{if(view!=='month'){selectDay(addDays(day,delta*(view==='week'?7:1)));}else{const date=new Date(Number(month.slice(0,4)),Number(month.slice(5))-1+delta,1),m=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');setMonth(m);setDay(m+'-01');}};
 moveRef.current=move;
 return <section className="direct-calendar" aria-label="일정 달력">
 <WorkspaceToolbar title="달력" navigation={<DateNavigator type={view==='day'?'date':'month'} value={view==='day'?day:month} inputLabel={view==='day'?'달력 날짜 선택':'달력 월 선택'} onChange={value=>selectDay(view==='day'?value:value+'-01')}/> }>
  <div className="calendar-view-switch" role="group" aria-label="달력 보기">{([['month','월간'],['week','주간'],['day','일간']] as const).map(([key,label])=><button type="button" key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>
 </WorkspaceToolbar>
 <MemberFilter members={members} value={member} onChange={setMember} label="달력 구성원 필터"/>
 {view==='day'?<PersonalTimetable embedded day={day} items={shown} members={members} loading={loading} setDay={selectDay} create={create} edit={edit}/>:<><div className="calendar-weekdays">{weekdays.map(d=><span key={d}>{d}</span>)}</div><div className="calendar-viewport"><div ref={grid} className={'calendar-grid '+(view==='week'?'week-view':'')} onPointerDown={e=>{if(e.button===0&&e.isPrimary)gesture.current={x:e.clientX,y:e.clientY};}} onPointerMove={e=>{const g=gesture.current;if(g&&Math.abs(e.clientX-g.x)>20&&Math.abs(e.clientX-g.x)>Math.abs(e.clientY-g.y)*1.5)e.currentTarget.setPointerCapture(e.pointerId);}} onPointerCancel={()=>{gesture.current=null;}} onPointerUp={e=>{const g=gesture.current;gesture.current=null;if(g&&Math.abs(e.clientX-g.x)>60&&Math.abs(e.clientX-g.x)>Math.abs(e.clientY-g.y)*1.5){suppressClick.current=Date.now()+350;move(e.clientX<g.x?1:-1);}}} onClickCapture={e=>{if(Date.now()<suppressClick.current){e.preventDefault();e.stopPropagation();}}}>
 {Array.from({length:dates.length/7},(_,index)=><CalendarWeekRow key={dates[index*7]} dates={dates.slice(index*7,index*7+7)} items={shown} members={members} month={month} day={day} today={today} weekView={view==='week'} holidayName={holidays.name} openDay={date=>{setDay(date);if(date.slice(0,7)!==month)setMonth(date.slice(0,7));setDetail(date);}} edit={(item,date)=>{setDay(date);edit(item);}}/>)}
 </div></div></>}<div className="calendar-legend">{members.map((m,n)=><span key={m.id}><i style={{background:calendarColors[n%calendarColors.length]}}/>{m.name}</span>)}</div>
 {holidays.unavailable&&<p className="holiday-status" role="status">이 연도의 공휴일 정보를 확인하지 못했어요.</p>}
 {detail&&<CalendarDaySheet date={detail} holiday={holidays.name(detail)} items={dailySchedules(shown,detail)} members={members} loading={loading} close={()=>setDetail(null)} create={()=>{setDetail(null);create(detail);}} edit={item=>{setDetail(null);edit(item);}}/>}
 </section>;
}
