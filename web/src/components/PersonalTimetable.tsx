import {useHolidays} from './useHolidays';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {addDays,koreaToday} from '../../../shared/schedules';
import {dailySchedules,scheduleAssignee,schedulePhase,timetableLayout,timeLabel,timeMinutes,visibleOn} from '../../../shared/workspace-schedules';
import type {WorkspaceItem,WorkspaceMember} from '../../../shared/workspace';
import {eventColor} from './scheduleColors';
import {Icon} from './Icon';
import {MemberFilter} from './MemberFilter';
import {DateNavigator,WorkspaceToolbar} from './WorkspaceToolbar';
import {useCalendarSlide} from './useCalendarSlide';
import {useDaySwipe} from './useDaySwipe';

const weekday=['일','월','화','수','목','금','토'];
const minuteHeight=1.2;
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
 const today=koreaToday(),weekStart=addDays(day,-new Date(day+'T12:00:00Z').getUTCDay()),dates=Array.from({length:7},(_,n)=>addDays(weekStart,n)),events=dailySchedules(items,day,member),allDay=events.filter(i=>i.data.allDay),layout=timetableLayout(events),next=layout.find(({item})=>schedulePhase(item,day,today,now)==='upcoming')?.start;
 const currentEvents=events.filter(i=>!i.data.allDay&&schedulePhase(i,day,today,now)==='current');
 const scrollToNow=()=>{const node=scroller.current;if(node)node.scrollTop=Math.max(0,timeMinutes(koreaTime())*minuteHeight-node.clientHeight*.3);};
 useLayoutEffect(()=>{
  if(loading||scrolledDay.current===day||!scroller.current)return;
  scrolledDay.current=day;
  const target=day===today?timeMinutes(now):(layout[0]?.start??540);
  scroller.current.scrollTop=Math.max(0,target*minuteHeight-scroller.current.clientHeight*.3);
 },[day,loading,layout,now,today]);
 const content=(item:WorkspaceItem)=>{
  const who=scheduleAssignee(item,members),phase=schedulePhase(item,day,today,now),upNext=phase==='upcoming'&&timeMinutes(item.data.startTime!)===next;
  return <><span className="timetable-card-top"><span className="timetable-person"><Icon name={item.data.allMembers?'users':'sun'}/>{who}</span>{phase==='current'?<span className="timetable-status">진행 중</span>:upNext?<span className="timetable-status next">다음 일정</span>:null}</span><strong className="timetable-title">{item.data.title}</strong><span className="timetable-range">{item.data.allDay?'종일':`${item.data.startTime} – ${item.data.endTime}`}{item.kind==='REPEAT'&&<><Icon name="repeat"/><span>매주 반복</span></>}</span>{item.data.place&&<span className="timetable-place"><Icon name="pin"/>{item.data.place}</span>}</>;
 };
 const label=(item:WorkspaceItem)=>`${item.data.title} · ${scheduleAssignee(item,members)} · ${item.data.allDay?'종일':item.data.startTime+' – '+item.data.endTime} · ${item.mine?'수정':'상세'}`;
 return <section className={'personal-timetable'+(embedded?' calendar-daily':'')} aria-label={embedded?'일간 일정':'일별 시간표'}>
  {!embedded&&<><WorkspaceToolbar title="시간표" createLabel="일정 등록" onCreate={()=>create(day)} navigation={<DateNavigator type="date" value={day} inputLabel="시간표 날짜 선택" onChange={setDay}/>}/>
  <MemberFilter className="timetable-filters" members={members} value={member} onChange={setMember} label="시간표 구성원 필터"/>
  <div ref={week} className="timetable-week" aria-label="날짜 선택" {...weekSwipe}>{dates.map((date,n)=><button type="button" key={date} data-timetable-date={date} aria-label={`${date} 시간표${holidays.name(date)?' · '+holidays.name(date):''}`} aria-pressed={date===day} className={(date===today?'is-today ':'')+(holidays.name(date)||n===0?'holiday-date':n===6?'saturday-date':'')} onClick={()=>setDay(date)}><span>{weekday[n]}</span><strong>{Number(date.slice(8))}</strong><i className={items.some(i=>visibleOn(i,date))?'has-events':''} aria-hidden="true"/></button>)}</div></>}
  <div className="timetable-summary"><span>{loading?'불러오는 중':`${events.length}개 일정`}{day===today&&<button type="button" className="timetable-now-jump" onClick={scrollToNow} aria-label="현재 시간으로 이동"><Icon name="clock"/>현재 {now}</button>}</span></div>
  {holidays.name(day)&&<p className="timetable-holiday holiday-label">{holidays.name(day)}</p>}
  {day===today&&!loading&&<div className="timetable-current-summary" aria-label="현재 진행 중인 일정"><strong>지금</strong><span>{currentEvents.length?currentEvents.map(i=>`${scheduleAssignee(i,members)} · ${i.data.title}`).join(' / '):'등록된 일정이 없는 시간이에요'}</span></div>}
  <div className="calendar-viewport timetable-viewport"><div ref={page} className="timetable-day" aria-busy={loading} {...daySwipe}>
   {allDay.length>0&&<div className="timetable-all-day"><span>종일</span><div>{allDay.map(item=><button type="button" key={item.id} className="timetable-card timetable-all-day-card" style={{'--event-color':eventColor(item,members)} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} data-timetable-item={item.id}>{content(item)}</button>)}</div></div>}
   <div className="timetable-scroll" ref={scroller} data-calendar-scroll aria-label="하루 시간 눈금">
    <div className="timetable-grid" style={{height:1440*minuteHeight}}>
     <div className="timetable-time-axis" aria-hidden="true">{Array.from({length:49},(_,tick)=><span key={tick} className={(tick%2?'minor-tick ':'')+(day===today&&Math.floor(timeMinutes(now)/60)===tick/2?'current-hour':'')} style={{top:tick*30*minuteHeight}}>{timeLabel(tick*30)}</span>)}</div>
     <div className="timetable-event-area">
      <div className="timetable-slots" role="group" aria-label="15분 단위 일정 등록">{Array.from({length:96},(_,index)=>{
       const time=timeLabel(index*15);
       return <button type="button" key={time} data-slot={index} data-time={time} tabIndex={slot===index?0:-1} className="timetable-slot" aria-label={`${day} ${time} 일정 등록`} style={{top:index*15*minuteHeight,height:15*minuteHeight}} onFocus={()=>setSlot(index)} onClick={()=>create(day,time)} onKeyDown={e=>{
        const target=e.key==='ArrowDown'?Math.min(95,index+1):e.key==='ArrowUp'?Math.max(0,index-1):e.key==='Home'?0:e.key==='End'?95:null;
        if(target!==null){e.preventDefault();setSlot(target);scroller.current?.querySelector<HTMLButtonElement>(`[data-slot="${target}"]`)?.focus();}
       }}/>;
      })}</div>
      {layout.map(({item,start,end,column,columns})=>{
       const duration=end-start;
       return <button type="button" key={item.id} className={'timetable-card timetable-event '+(schedulePhase(item,day,today,now)==='current'?'current-event ':'')+(duration<30?'short-event ':duration<60?'compact-event ':'')+(columns>1?'overlap-event':'')} style={{'--event-color':eventColor(item,members),top:start*minuteHeight,height:duration*minuteHeight,left:`calc(${column/columns*100}% + 2px)`,width:`calc(${100/columns}% - 5px)`} as CSSProperties} onClick={()=>edit(item)} aria-label={label(item)} title={label(item)} data-timetable-item={item.id} data-start-minute={start} data-end-minute={end}>
        {content(item)}
       </button>;
      })}
      {day===today&&<div className="timetable-now" style={{top:timeMinutes(now)*minuteHeight}} aria-label={'현재 시간 '+now}><span/><strong>현재 {now}</strong></div>}
     </div>
    </div>
   </div>
  </div></div>
 </section>;
}
