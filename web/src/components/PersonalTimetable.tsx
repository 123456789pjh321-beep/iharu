import {useHolidays} from './useHolidays';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {addDays,koreaToday} from '../../../shared/schedules';
import {dailySchedules,scheduleAssignee,schedulePhase,timetableLayout,timeLabel,timeMinutes} from '../../../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {eventColor} from './scheduleColors';
import {Icon} from './Icon';
import {MemberFilter} from './MemberFilter';
import {DateNavigator,WorkspaceToolbar} from './WorkspaceToolbar';
import {useCalendarSlide} from './useCalendarSlide';
import {useDaySwipe} from './useDaySwipe';

const weekday=['일','월','화','수','목','금','토'];
const minuteHeight=.8;
const hourLabel=(hour:number)=>`${hour<12||hour===24?'오전':'오후'} ${hour%12||12}`;
const koreaTime=()=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
export function PersonalTimetable({day,items,members,loading,embedded=false,setDay,create,edit}:{day:string;items:WorkspaceItem[];members:WorkspaceMember[];loading:boolean;embedded?:boolean;setDay:(date:string)=>void;create:(date:string,time?:string)=>void;edit:(item:WorkspaceItem)=>void}){
 const holidays=useHolidays(day.slice(0,7));
 const [member,setMember]=useState('all'),[now,setNow]=useState(koreaTime),[slot,setSlot]=useState(36),page=useRef<HTMLDivElement>(null),scroller=useRef<HTMLDivElement>(null),scrolledDay=useRef(''),week=useRef<HTMLDivElement>(null);
 useEffect(()=>{const update=()=>setNow(koreaTime()),timer=setInterval(update,30000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update);};},[]);
 useEffect(()=>{if(member!=='all'&&!members.some(m=>m.id===member))setMember('all');},[members,member]);
 useCalendarSlide(page,day,'day');
 const moveDay=(delta:number)=>setDay(addDays(day,delta));
 const daySwipe=useDaySwipe(page,moveDay),weekSwipe=useDaySwipe(week,moveDay,target=>{
  const button=target instanceof Element?target.closest<HTMLButtonElement>('button[data-timetable-date]'):null;
  if(!button||!week.current?.contains(button))return false;
  setDay(button.dataset.timetableDate!);return true;
 });
 const today=koreaToday(),dates=Array.from({length:embedded?1:3},(_,n)=>addDays(day,n));
 const lanes=dates.map(date=>{const events=dailySchedules(items,date,member);return {date,events,allDay:events.filter(i=>i.data.allDay),layout:timetableLayout(events)};});
 const events=lanes.flatMap(lane=>lane.events),showToday=dates.includes(today),currentEvents=dailySchedules(items,today,member).filter(i=>!i.data.allDay&&schedulePhase(i,today,today,now)==='current');
 const firstStart=Math.min(...lanes.flatMap(lane=>lane.layout.map(event=>event.start)),1440);
 const startMinute=firstStart<1440?Math.floor(firstStart/60)*60:0;
 const firstSlot=startMinute/15;
 const scrollToNow=()=>{const node=scroller.current;if(node)node.scrollTop=Math.max(0,(timeMinutes(koreaTime())-startMinute)*minuteHeight-node.clientHeight*.3);};
 useLayoutEffect(()=>{
  if(loading||scrolledDay.current===`${day}:${member}:${startMinute}`||!scroller.current)return;
  scrolledDay.current=`${day}:${member}:${startMinute}`;
  const target=showToday?timeMinutes(now):(firstStart<1440?firstStart:540);
  scroller.current.scrollTop=Math.max(0,(target-startMinute)*minuteHeight-scroller.current.clientHeight*.3);
 },[day,member,loading,firstStart,startMinute,now,showToday]);
 const content=(item:WorkspaceItem)=><><strong className="timetable-title">{item.data.title}</strong><span className="timetable-range">{item.data.allDay?'종일':`${item.data.startTime} – ${item.data.endTime}`}</span></>;
 const label=(item:WorkspaceItem)=>`${item.data.title} · ${scheduleAssignee(item,members)} · ${item.data.allDay?'종일':item.data.startTime+' – '+item.data.endTime} · ${item.mine?'수정':'상세'}`;
 return <section className={'personal-timetable'+(embedded?' calendar-daily':' timetable-three-day')} aria-label={embedded?'일간 일정':'3일 시간표'}>
  {!embedded&&<><WorkspaceToolbar showCreate={false} title="시간표" createLabel="일정 등록" onCreate={()=>create(day)} navigation={<DateNavigator type="date" value={day} inputLabel="시간표 날짜 선택" onChange={setDay}/>}/>
  <MemberFilter className="timetable-filters" members={members} value={member} onChange={setMember} label="시간표 구성원 필터"/></>}
  <div className="timetable-summary"><span>{loading?'불러오는 중':`${embedded?'':'3일 · '}${events.length}개 일정`}{showToday&&<button type="button" className="timetable-now-jump" onClick={scrollToNow} aria-label="현재 시간으로 이동"><Icon name="clock"/>현재 {now}</button>}</span>
   {showToday&&!loading&&<div className={'timetable-current-summary'+(currentEvents.length?'':' empty')} aria-label="현재 진행 중인 일정"><strong>지금</strong><span>{currentEvents.length?currentEvents.map(i=>`${scheduleAssignee(i,members)} · ${i.data.title}`).join(' / '):'등록된 일정이 없는 시간이에요'}</span></div>}
  </div>
  {!embedded&&<div ref={week} className="timetable-week" aria-label="날짜 선택" {...weekSwipe}>{dates.map(date=>{const dow=new Date(date+'T12:00:00Z').getUTCDay(),holiday=holidays.name(date);return <button type="button" key={date} data-timetable-date={date} aria-label={`${date} 시간표${holiday?' · '+holiday:''}`} aria-pressed={date===day} className={(date===today?'is-today ':'')+(holiday||dow===0?'holiday-date':dow===6?'saturday-date':'')} onClick={()=>setDay(date)}><span>{weekday[dow]}</span><strong>{Number(date.slice(8))}</strong>{holiday&&<small className="calendar-holiday" title={holiday}>{holiday}</small>}</button>;})}</div>}
  {holidays.name(day)&&<p className={'timetable-holiday holiday-label'+(embedded?'':' sr-only')}>{holidays.name(day)}</p>}
  <div className="calendar-viewport timetable-viewport"><div ref={page} className="timetable-day" aria-busy={loading} {...daySwipe}>
   {lanes.some(lane=>lane.allDay.length>0)&&<div className="timetable-all-day"><span>종일</span><div className="timetable-all-day-columns" style={{gridTemplateColumns:`repeat(${dates.length},minmax(0,1fr))`}}>{lanes.map(lane=><div key={lane.date}>{lane.allDay.map(item=><button type="button" key={item.id} className="timetable-card timetable-all-day-card" style={{'--event-color':eventColor(item,members)} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} title={label(item)} data-timetable-item={item.id}>{content(item)}</button>)}</div>)}</div></div>}
   <div className="timetable-scroll" ref={scroller} data-calendar-scroll aria-label="하루 시간 눈금">
    <div className="timetable-grid" data-start-minute={startMinute} style={{height:(1440-startMinute)*minuteHeight}}>
     <div className="timetable-time-axis" aria-hidden="true">{Array.from({length:25-startMinute/60},(_,n)=>n+startMinute/60).map(hour=><span key={hour} className={showToday&&Math.floor(timeMinutes(now)/60)===hour?'current-hour':''} style={{top:(hour*60-startMinute)*minuteHeight}}>{hourLabel(hour)}</span>)}</div>
     <div className="timetable-event-area" style={{gridTemplateColumns:`repeat(${dates.length},minmax(0,1fr))`}}>
      {lanes.map(({date,layout})=><div key={date} className={'timetable-day-column'+(date===today?' today-column':'')} data-date={date}>
       <div className="timetable-slots" role="group" aria-label={`${date} 15분 단위 일정 등록`}>{Array.from({length:96-firstSlot},(_,n)=>{
        const index=n+firstSlot;
        const time=timeLabel(index*15);
        return <button type="button" key={time} data-slot={index} data-time={time} tabIndex={date===day&&Math.max(firstSlot,slot)===index?0:-1} className="timetable-slot" aria-label={`${date} ${time} 일정 등록`} style={{top:(index*15-startMinute)*minuteHeight,height:15*minuteHeight}} onFocus={()=>setSlot(index)} onClick={()=>create(date,time)} onKeyDown={e=>{
         const target=e.key==='ArrowDown'?Math.min(95,index+1):e.key==='ArrowUp'?Math.max(firstSlot,index-1):e.key==='Home'?firstSlot:e.key==='End'?95:null;
         if(target!==null){e.preventDefault();setSlot(target);e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-slot="${target}"]`)?.focus();}
         const lane=e.key==='ArrowRight'?dates.indexOf(date)+1:e.key==='ArrowLeft'?dates.indexOf(date)-1:-1;
         if(lane>=0&&lane<dates.length){e.preventDefault();scroller.current?.querySelector<HTMLButtonElement>(`[data-date="${dates[lane]}"] [data-slot="${index}"]`)?.focus();}
        }}/>;
       })}</div>
       {layout.map(({item,start,end,column,columns})=>{
        const duration=end-start;
        return <button type="button" key={item.id} className={'timetable-card timetable-event '+(schedulePhase(item,date,today,now)==='current'?'current-event ':'')+(duration<30?'short-event ':duration<60?'compact-event ':'')+(columns>1?'overlap-event':'')} style={{'--event-color':eventColor(item,members),top:(start-startMinute)*minuteHeight,height:duration*minuteHeight,left:`calc(${column/columns*100}% + 2px)`,width:`calc(${100/columns}% - 4px)`} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} title={label(item)+(item.data.place?' · '+item.data.place:'')+(item.kind==='REPEAT'?' · 매주 반복':'')} data-timetable-item={item.id} data-start-minute={start} data-end-minute={end}>{content(item)}</button>;
       })}
       {date===today&&timeMinutes(now)>=startMinute&&<div className="timetable-now" style={{top:(timeMinutes(now)-startMinute)*minuteHeight}} aria-label={'현재 시간 '+now}><span/><strong>현재 {now}</strong></div>}
      </div>)}
     </div>
    </div>
   </div>
  </div></div>
 </section>;
}
